import { describe, expect, it } from "vitest";
import { buildEventEditPayload, type EventEditValues } from "./event-edit-payload";

const values: EventEditValues = {
  name: "Synthetic event", client_name: "Synthetic client", client_phone: "",
  event_type_id: "", service_scope_ids: [], start_date: "2026-10-01",
  end_date: "2026-10-02", start_time: "", end_time: "", venue_location: "Venue",
  contract_price: 0, status: "Planned",
};

describe("event edit payload intent", () => {
  it("does not invent writes for untouched fields, including an empty edit", () => {
    expect(buildEventEditPayload(values, new Set(["name"]))).toEqual({ name: values.name });
    expect(buildEventEditPayload(values, new Set())).toEqual({});
  });

  it("preserves intentional zero and nullable clears", () => {
    expect(buildEventEditPayload(values, new Set(["contract_price", "client_phone", "start_time"])))
      .toEqual({ contract_price: 0, client_phone: null, start_time: null });
  });

  it("distinguishes omitted scopes from an explicit empty reset", () => {
    expect(buildEventEditPayload(values, new Set(["name"]))).not.toHaveProperty("service_scope_ids");
    expect(buildEventEditPayload(values, new Set(["service_scope_ids"])))
      .toEqual({ service_scope_ids: [] });
  });

  it("retains the complete normalized creation and duplication payload", () => {
    const copy = { ...values, service_scope_ids: ["scope-full"] };
    expect(buildEventEditPayload(copy)).toEqual({
      ...copy, event_type_id: null, client_phone: null, start_time: null, end_time: null,
    });
  });
});
