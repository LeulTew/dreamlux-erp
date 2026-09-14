import { describe, expect, it } from "vitest";
import { hydrateProposalClone } from "@/lib/proposal-clone";
import { CLONE_SOURCE_ID, proposalCloneSource } from "./fixtures/proposal-clone";

describe("canonical Dream Lux proposal clone hydration", () => {
  it("preserves the canonical schedule, package notes, all estimate metadata and existing controls", () => {
    const source = proposalCloneSource();
    expect(hydrateProposalClone({ proposal: source, logs: [] }, source.id)).toEqual({
      name: `${source.name} (Copy)`,
      clientName: source.client_name,
      clientPhone: source.client_phone,
      eventTypeId: source.event_type_id,
      requestedBudget: source.requested_budget,
      startDate: "2026-10-10",
      endDate: "2026-10-11",
      startTime: "00:00",
      endTime: "23:45",
      venueLocation: source.venue_location,
      notes: source.notes,
      designNotes: source.package_design_notes,
      serviceScopeIds: source.service_scope_ids,
      designLines: source.cost_breakdown.design,
      teamLines: source.cost_breakdown.team,
      tripLines: source.cost_breakdown.trip,
      otherLines: source.cost_breakdown.other,
    });
  });

  it("never uses obsolete aliases or copies workflow, ownership or approval metadata", () => {
    const source = {
      ...proposalCloneSource(),
      start_date: "1999-01-01", end_date: "1999-01-02", start_time: "01:00", end_time: "02:00",
      design_notes: "Wrong legacy value",
      design_estimate: [], team_estimate: [], trip_estimate: [], other_estimate: [],
      converted_event_id: "do-not-copy",
    };
    const values = hydrateProposalClone({ proposal: source }, source.id);
    expect(values.startDate).toBe("2026-10-10");
    expect(values.designNotes).toBe("Gold fabric and warm lighting");
    expect(values.designLines).toHaveLength(2);
    expect(values.teamLines).toHaveLength(1);
    expect(values.tripLines).toHaveLength(1);
    expect(values.otherLines).toHaveLength(1);
    for (const key of ["id", "status", "approved_by", "approved_at", "submitted_at", "created_by", "converted_event_id"]) {
      expect(values).not.toHaveProperty(key);
    }
  });

  it("produces independent editable arrays and line objects", () => {
    const source = proposalCloneSource();
    const snapshot = structuredClone(source);
    const values = hydrateProposalClone({ proposal: source }, source.id);
    values.designLines[0].label = "Edited backdrop";
    values.teamLines[0].people_count = 5;
    values.tripLines[0].notes = "Edited transport";
    values.otherLines.push({ label: "Extra", amount: 0, notes: "" });
    values.serviceScopeIds.push("new-scope");
    expect(source).toEqual(snapshot);
  });

  it("normalizes nullable fields and missing optional arrays without inventing data", () => {
    const source = proposalCloneSource({
      client_phone: null, event_type_id: null, requested_budget: 0,
      requested_start_date: null, requested_end_date: null,
      requested_start_time: null, requested_end_time: null,
      venue_location: null, notes: null, package_design_notes: null,
      service_scope_ids: [], cost_breakdown: {},
    });
    const values = hydrateProposalClone({ proposal: source }, source.id);
    expect(values).toMatchObject({
      clientPhone: "", eventTypeId: "", requestedBudget: 0,
      startDate: "", endDate: "", startTime: "", endTime: "",
      venueLocation: "", notes: "", designNotes: "",
      serviceScopeIds: [], designLines: [], teamLines: [], tripLines: [], otherLines: [],
    });
  });

  it("retains zeros, optional estimate values and nullable notes", () => {
    const source = proposalCloneSource({
      cost_breakdown: {
        design: [{ label: "Existing decor", amount: 0, notes: null }],
        team: [{ label: "Crew", amount: 0, people_count: 1, commission_per_person: 0 }],
        trip: [{ label: "No trip", amount: 0, km: 0, fuel_price: 0, notes: null }],
        other: [{ label: "None", amount: 0 }],
      },
    });
    const values = hydrateProposalClone({ proposal: source }, source.id);
    expect(values.designLines[0]).toEqual({ label: "Existing decor", amount: 0, notes: "" });
    expect(values.teamLines[0]).toEqual({ label: "Crew", amount: 0, people_count: 1, commission_per_person: 0, notes: "" });
    expect(values.tripLines[0]).toEqual({ label: "No trip", amount: 0, km: 0, fuel_price: 0, notes: "" });
    expect(values.otherLines[0]).toEqual({ label: "None", amount: 0, notes: "" });
  });

  it("supports service scope objects when IDs are absent, but respects explicit empty IDs", () => {
    const source = proposalCloneSource();
    delete source.service_scope_ids;
    expect(hydrateProposalClone({ proposal: source }, source.id).serviceScopeIds).toEqual(["scope-decoration", "scope-lighting"]);
    source.service_scope_ids = [];
    expect(hydrateProposalClone({ proposal: source }, source.id).serviceScopeIds).toEqual([]);
  });

  it.each(["2024-02-29", "2026-10-10T23:30:00-03:00", "2026-10-10T00:00:00+03:00"])(
    "preserves the API calendar date without a timezone shift: %s", (date) => {
      const source = proposalCloneSource({ requested_start_date: date });
      expect(hydrateProposalClone({ proposal: source }, source.id).startDate).toBe(date.slice(0, 10));
    },
  );

  it.each([
    ["response", null],
    ["proposal", {}],
    ["proposal", { proposal: [] }],
    ["id", { proposal: proposalCloneSource({ id: "wrong-source" }) }],
    ["requested_start_date", { proposal: { ...proposalCloneSource(), requested_start_date: undefined } }],
    ["requested_end_date", { proposal: proposalCloneSource({ requested_end_date: "2026-02-30" }) }],
    ["requested_start_time", { proposal: proposalCloneSource({ requested_start_time: "24:00" }) }],
    ["requested_end_time", { proposal: proposalCloneSource({ requested_end_time: "18:99" }) }],
    ["package_design_notes", { proposal: { ...proposalCloneSource(), package_design_notes: undefined } }],
    ["requested_budget", { proposal: { ...proposalCloneSource(), requested_budget: "50000" } }],
    ["cost_breakdown", { proposal: { ...proposalCloneSource(), cost_breakdown: null } }],
    ["cost_breakdown.team", { proposal: { ...proposalCloneSource(), cost_breakdown: { team: null } } }],
    ["service_scope_ids", { proposal: { ...proposalCloneSource(), service_scope_ids: [123] } }],
  ])("rejects malformed canonical %s instead of silently creating an empty draft", (field, response) => {
    expect(() => hydrateProposalClone(response, CLONE_SOURCE_ID)).toThrow(`Invalid proposal clone source: ${field}`);
  });

  it.each([undefined, "100", -1, Infinity, NaN])("rejects invalid estimate amounts: %s", (amount) => {
    const response = { proposal: { ...proposalCloneSource(), cost_breakdown: { design: [{ label: "Decor", amount }] } } };
    expect(() => hydrateProposalClone(response, CLONE_SOURCE_ID)).toThrow("cost_breakdown.design[0].amount");
  });

  it("rejects invalid line shapes and prevents partial hydration", () => {
    const response = { proposal: { ...proposalCloneSource(), cost_breakdown: { trip: [null] } } };
    expect(() => hydrateProposalClone(response, CLONE_SOURCE_ID)).toThrow("cost_breakdown.trip[0]");
  });

  it("uses the API's 50-line-per-category bound", () => {
    const design = Array.from({ length: 50 }, (_, index) => ({ label: `Decor ${index}`, amount: 0 }));
    const source = proposalCloneSource({ cost_breakdown: { design } });
    expect(hydrateProposalClone({ proposal: source }, source.id).designLines).toHaveLength(50);
    design.push({ label: "Too many", amount: 0 });
    expect(() => hydrateProposalClone({ proposal: source }, source.id)).toThrow("cost_breakdown.design");
  });
});
