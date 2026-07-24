import { describe, expect, test, mock, beforeEach } from "bun:test";
import {
  validateAndResolveServiceScopes,
  fetchProposalServiceScopes,
  fetchEventServiceScopes,
  setProposalServiceScopes,
  setEventServiceScopes,
  copyProposalServiceScopesToEvent,
} from "../lib/service-scopes";

describe("Service Scopes Unit & Integration Tests (Issue #194)", () => {
  /**
   * Authoritative catalog matching event_service_scopes.sql migration:
   *   ('FULL',        'Full',        'ሙሉ',           1)
   *   ('BACKGROUND',  'Background',  'ባክግራውንድ',     2)
   *   ('SETUP',       'Setup',       'ሴታፕ',          3)
   *   ('TABLE_SETUP', 'Table Setup', 'ጠረጴዛ ሴታፕ',    4)
   */
  const authoritativeCatalog = [
    { id: "scope-full-uuid", code: "FULL", name_en: "Full", name_am: "ሙሉ", description: "End-to-end event management", display_order: 1, is_active: true },
    { id: "scope-bg-uuid", code: "BACKGROUND", name_en: "Background", name_am: "ባክግራውንድ", description: "Stage & backdrop installation", display_order: 2, is_active: true },
    { id: "scope-setup-uuid", code: "SETUP", name_en: "Setup", name_am: "ሴታፕ", description: "Equipment setup", display_order: 3, is_active: true },
    { id: "scope-table-uuid", code: "TABLE_SETUP", name_en: "Table Setup", name_am: "ጠረጴዛ ሴታፕ", description: "Tableware & seating arrangement", display_order: 4, is_active: true },
  ];

  function createMockClient() {
    const executedQueries: Array<{ sql: string; params?: any[] }> = [];

    const client = {
      executedQueries,
      query: mock(async (sql: string, params?: any[]) => {
        executedQueries.push({ sql, params });

        if (sql.includes("FROM event_service_scopes")) {
          return { rows: authoritativeCatalog, rowCount: authoritativeCatalog.length };
        }
        if (sql.includes("FROM proposal_service_scopes")) {
          return {
            rows: [
              { proposal_id: "prop-1", service_scope_id: "scope-full-uuid", code: "FULL", name_en: "Full", name_am: "ሙሉ", description: "", display_order: 1 },
              { proposal_id: "prop-1", service_scope_id: "scope-setup-uuid", code: "SETUP", name_en: "Setup", name_am: "ሴታፕ", description: "", display_order: 3 },
            ],
            rowCount: 2,
          };
        }
        if (sql.includes("FROM event_service_scope_links")) {
          return {
            rows: [
              { event_id: "event-1", service_scope_id: "scope-bg-uuid", code: "BACKGROUND", name_en: "Background", name_am: "ባክግራውንድ", description: "", display_order: 2 },
              { event_id: "event-1", service_scope_id: "scope-table-uuid", code: "TABLE_SETUP", name_en: "Table Setup", name_am: "ጠረጴዛ ሴታፕ", description: "", display_order: 4 },
            ],
            rowCount: 2,
          };
        }
        if (sql.includes("DELETE FROM proposal_service_scopes") ||
            sql.includes("INSERT INTO proposal_service_scopes") ||
            sql.includes("DELETE FROM event_service_scope_links") ||
            sql.includes("INSERT INTO event_service_scope_links")) {
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
    };

    return client;
  }

  test("authoritative catalog returns exact codes and English/Amharic names", async () => {
    const client = createMockClient();
    const res = await client.query("SELECT * FROM event_service_scopes");
    expect(res.rows).toHaveLength(4);
    expect(res.rows[0]).toEqual({
      id: "scope-full-uuid",
      code: "FULL",
      name_en: "Full",
      name_am: "ሙሉ",
      description: "End-to-end event management",
      display_order: 1,
      is_active: true,
    });
    expect(res.rows[3]).toEqual({
      id: "scope-table-uuid",
      code: "TABLE_SETUP",
      name_en: "Table Setup",
      name_am: "ጠረጴዛ ሴታፕ",
      description: "Tableware & seating arrangement",
      display_order: 4,
      is_active: true,
    });
  });

  test("validateAndResolveServiceScopes resolves valid scope UUIDs and codes", async () => {
    const client = createMockClient() as any;
    const resolved = await validateAndResolveServiceScopes(client, ["FULL", "scope-bg-uuid"]);
    expect(resolved).toEqual(["scope-full-uuid", "scope-bg-uuid"]);
  });

  test("validateAndResolveServiceScopes handles string inputs split by commas or semicolons", async () => {
    const client = createMockClient() as any;
    const resolved = await validateAndResolveServiceScopes(client, "FULL, BACKGROUND; TABLE_SETUP");
    expect(resolved).toEqual(["scope-full-uuid", "scope-bg-uuid", "scope-table-uuid"]);
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
    expect(scopes[0].name_en).toBe("Full");
    expect(scopes[1].code).toBe("SETUP");
    expect(scopes[1].name_en).toBe("Setup");
  });

  test("fetchEventServiceScopes batch fetches scopes for events", async () => {
    const client = createMockClient() as any;
    const map = await fetchEventServiceScopes(client, ["event-1"]);
    expect(map.has("event-1")).toBe(true);
    const scopes = map.get("event-1")!;
    expect(scopes.length).toBe(2);
    expect(scopes[0].code).toBe("BACKGROUND");
    expect(scopes[1].code).toBe("TABLE_SETUP");
  });

  test("setProposalServiceScopes replaces proposal service scope links atomically", async () => {
    const client = createMockClient() as any;
    await setProposalServiceScopes(client, "prop-1", ["scope-full-uuid", "scope-setup-uuid"]);
    expect(client.executedQueries[0].sql).toContain("DELETE FROM proposal_service_scopes WHERE proposal_id = $1");
    expect(client.executedQueries[0].params).toEqual(["prop-1"]);
    expect(client.executedQueries[1].sql).toContain("INSERT INTO proposal_service_scopes");
  });

  test("setEventServiceScopes replaces event service scope links atomically", async () => {
    const client = createMockClient() as any;
    await setEventServiceScopes(client, "event-1", ["scope-bg-uuid", "scope-table-uuid"]);
    expect(client.executedQueries[0].sql).toContain("DELETE FROM event_service_scope_links WHERE event_id = $1");
    expect(client.executedQueries[0].params).toEqual(["event-1"]);
    expect(client.executedQueries[1].sql).toContain("INSERT INTO event_service_scope_links");
  });

  test("copyProposalServiceScopesToEvent copies proposal scope links directly to event in DB", async () => {
    const client = createMockClient() as any;
    await copyProposalServiceScopesToEvent(client, "prop-100", "evt-200");
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO event_service_scope_links (event_id, service_scope_id)"),
      ["evt-200", "prop-100"],
    );
  });

  test("export verification: formats service scopes into comma-separated string for CSV/XLSX export", async () => {
    const client = createMockClient() as any;
    const scopesMap = await fetchEventServiceScopes(client, ["event-1"]);
    const scopes = scopesMap.get("event-1") || [];
    const formattedScopesStr = scopes.map((s) => s.name_en).join(", ");
    expect(formattedScopesStr).toBe("Background, Table Setup");
  });

  test("import verification: resolves imported CSV/XLSX scope names or codes into valid DB IDs", async () => {
    const client = createMockClient() as any;
    const rawImportScopes = "FULL, TABLE_SETUP";
    const resolvedIds = await validateAndResolveServiceScopes(client, rawImportScopes);
    expect(resolvedIds).toEqual(["scope-full-uuid", "scope-table-uuid"]);
  });
});
