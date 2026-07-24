import { describe, expect, test, mock } from "bun:test";
import {
  validateAndResolveServiceScopes,
  fetchProposalServiceScopes,
  fetchEventServiceScopes,
  setProposalServiceScopes,
  setEventServiceScopes,
  copyProposalServiceScopesToEvent,
} from "../lib/service-scopes";

describe("Service Scopes Unit Tests", () => {
  const mockCatalog = [
    { id: "scope-full-uuid", code: "FULL", name_en: "Full Setup & Management", name_am: "ሙሉ ዝግጅት", description: "End-to-end event management", display_order: 10, is_active: true },
    { id: "scope-bg-uuid", code: "BACKGROUND", name_en: "Background Decor", name_am: "የጀርባ ጌጣጌጥ", description: "Stage & backdrop installation", display_order: 20, is_active: true },
    { id: "scope-setup-uuid", code: "SETUP", name_en: "General Setup", name_am: "ጠቅላላ ዝግጅት", description: "Equipment setup", display_order: 30, is_active: true },
    { id: "scope-table-uuid", code: "TABLE_SETUP", name_en: "Table & Guest Setup", name_am: "የጠረጴዛ ዝግጅት", description: "Tableware & seating arrangement", display_order: 40, is_active: true },
  ];

  function createMockClient() {
    return {
      query: mock(async (sql: string, params?: any[]) => {
        if (sql.includes("FROM event_service_scopes")) {
          return { rows: mockCatalog, rowCount: mockCatalog.length };
        }
        if (sql.includes("FROM proposal_service_scopes")) {
          return {
            rows: [
              { proposal_id: "prop-1", service_scope_id: "scope-full-uuid", code: "FULL", name_en: "Full Setup & Management", name_am: "ሙሉ ዝግጅት", description: "", display_order: 10 },
              { proposal_id: "prop-1", service_scope_id: "scope-bg-uuid", code: "BACKGROUND", name_en: "Background Decor", name_am: "የጀርባ ጌጣጌጥ", description: "", display_order: 20 },
            ],
            rowCount: 2,
          };
        }
        if (sql.includes("FROM event_service_scope_links")) {
          return {
            rows: [
              { event_id: "event-1", service_scope_id: "scope-setup-uuid", code: "SETUP", name_en: "General Setup", name_am: "ጠቅላላ ዝግጅት", description: "", display_order: 30 },
              { event_id: "event-1", service_scope_id: "scope-table-uuid", code: "TABLE_SETUP", name_en: "Table & Guest Setup", name_am: "የጠረጴዛ ዝግጅት", description: "", display_order: 40 },
            ],
            rowCount: 2,
          };
        }
        if (sql.includes("DELETE FROM proposal_service_scopes") || sql.includes("INSERT INTO proposal_service_scopes") ||
            sql.includes("DELETE FROM event_service_scope_links") || sql.includes("INSERT INTO event_service_scope_links")) {
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
    };
  }

  test("validateAndResolveServiceScopes resolves valid scope UUIDs and codes", async () => {
    const client = createMockClient() as any;
    const resolved = await validateAndResolveServiceScopes(client, ["FULL", "scope-bg-uuid"]);
    expect(resolved).toEqual(["scope-full-uuid", "scope-bg-uuid"]);
  });

  test("validateAndResolveServiceScopes handles string inputs split by commas or semicolons", async () => {
    const client = createMockClient() as any;
    const resolved = await validateAndResolveServiceScopes(client, "FULL, BACKGROUND; SETUP");
    expect(resolved).toEqual(["scope-full-uuid", "scope-bg-uuid", "scope-setup-uuid"]);
  });

  test("validateAndResolveServiceScopes throws actionable error on invalid scope code", async () => {
    const client = createMockClient() as any;
    expect(validateAndResolveServiceScopes(client, ["FULL", "INVALID_SCOPE_CODE"])).rejects.toThrow("Unknown or invalid service scope");
  });

  test("fetchProposalServiceScopes batch fetches scopes without N+1 queries", async () => {
    const client = createMockClient() as any;
    const map = await fetchProposalServiceScopes(client, ["prop-1"]);
    expect(map.has("prop-1")).toBe(true);
    const scopes = map.get("prop-1")!;
    expect(scopes.length).toBe(2);
    expect(scopes[0].code).toBe("FULL");
    expect(scopes[1].code).toBe("BACKGROUND");
  });

  test("fetchEventServiceScopes batch fetches scopes for events", async () => {
    const client = createMockClient() as any;
    const map = await fetchEventServiceScopes(client, ["event-1"]);
    expect(map.has("event-1")).toBe(true);
    const scopes = map.get("event-1")!;
    expect(scopes.length).toBe(2);
    expect(scopes[0].code).toBe("SETUP");
    expect(scopes[1].code).toBe("TABLE_SETUP");
  });

  test("setProposalServiceScopes replaces proposal service scope links", async () => {
    const client = createMockClient() as any;
    await setProposalServiceScopes(client, "prop-1", ["scope-full-uuid", "scope-bg-uuid"]);
    expect(client.query).toHaveBeenCalledWith("DELETE FROM proposal_service_scopes WHERE proposal_id = $1", ["prop-1"]);
  });

  test("setEventServiceScopes replaces event service scope links", async () => {
    const client = createMockClient() as any;
    await setEventServiceScopes(client, "event-1", ["scope-setup-uuid", "scope-table-uuid"]);
    expect(client.query).toHaveBeenCalledWith("DELETE FROM event_service_scope_links WHERE event_id = $1", ["event-1"]);
  });

  test("copyProposalServiceScopesToEvent copies proposal scope links to event", async () => {
    const client = createMockClient() as any;
    await copyProposalServiceScopesToEvent(client, "prop-1", "event-1");
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO event_service_scope_links"),
      ["event-1", "prop-1"],
    );
  });
});
