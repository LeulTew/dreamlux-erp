import { Client, PoolClient } from "pg";

export const DEMO_SEED_KEY = "dreamlux-demo-2026q3-v1";
export const DEMO_PREFIX = "[DEMO 2026Q3]";
export const ADVISORY_LOCK_ID = 202607261;

// Deterministic UUID constants
export const DEMO_EMP_REGULAR_ID = "d2600000-0000-4000-8000-000000000001";
export const DEMO_EMP_COMMISSION_ONLY_ID = "d2600000-0000-4000-8000-000000000002";
export const DEMO_EMP_KEEPER_ID = "d2600000-0000-4000-8000-000000000003";
export const DEMO_EMP_COORDINATOR_ID = "d2600000-0000-4000-8000-000000000004";
export const DEMO_EMP_DRIVER_ID = "d2600000-0000-4000-8000-000000000005";

export const DEMO_ITEM_CHAIR_ID = "d2600000-0000-4000-8000-000000000010";
export const DEMO_ITEM_STAGE_ID = "d2600000-0000-4000-8000-000000000011";
export const DEMO_ITEM_UPLIGHT_ID = "d2600000-0000-4000-8000-000000000012";
export const DEMO_ITEM_TRUSS_ID = "d2600000-0000-4000-8000-000000000013";

export const DEMO_PROP_DRAFT_ID = "d2600000-0000-4000-8000-000000000020";
export const DEMO_PROP_APPROVED_ID = "d2600000-0000-4000-8000-000000000021";
export const DEMO_PROP_CONVERTED_ID = "d2600000-0000-4000-8000-000000000022";

export const DEMO_EVENT_PLANNED_ID = "d2600000-0000-4000-8000-000000000030";
export const DEMO_EVENT_ACTIVE_ID = "d2600000-0000-4000-8000-000000000031";
export const DEMO_EVENT_COMPLETED_ID = "d2600000-0000-4000-8000-000000000032";

export const DEMO_ASSIGN_UPCOMING_ID = "d2600000-0000-4000-8000-000000000040";
export const DEMO_ASSIGN_ATTENDED_ID = "d2600000-0000-4000-8000-000000000041";
export const DEMO_ASSIGN_ABSENT_ID = "d2600000-0000-4000-8000-000000000042";

export const DEMO_ALLOC_ACTIVE_ID = "d2600000-0000-4000-8000-000000000050";
export const DEMO_ALLOC_DISPATCHED_ID = "d2600000-0000-4000-8000-000000000051";
export const DEMO_ALLOC_RETURNED_ID = "d2600000-0000-4000-8000-000000000052";

export const DEMO_EXP_LABOR_ID = "d2600000-0000-4000-8000-000000000060";
export const DEMO_EXP_FUEL_ID = "d2600000-0000-4000-8000-000000000061";
export const DEMO_EXP_CONSUMABLES_ID = "d2600000-0000-4000-8000-000000000062";
export const DEMO_EXP_RENTAL_ID = "d2600000-0000-4000-8000-000000000063";
export const DEMO_EXP_TRANS_ID = "d2600000-0000-4000-8000-000000000064";
export const DEMO_EXP_OTHER_ID = "d2600000-0000-4000-8000-000000000065";

export const DEMO_CAPITAL_ID = "d2600000-0000-4000-8000-000000000070";
export const DEMO_MOVEMENT_CAPITAL_ID = "d2600000-0000-4000-8000-000000000071";

export const DEMO_PAYROLL_FINALIZED_ID = "d2600000-0000-4000-8000-000000000080";
export const DEMO_PAYROLL_DRAFT_ID = "d2600000-0000-4000-8000-000000000081";

export const DEMO_PAYROLL_LINE_REG_FIN_ID = "d2600000-0000-4000-8000-000000000082";
export const DEMO_PAYROLL_LINE_COMM_FIN_ID = "d2600000-0000-4000-8000-000000000083";
export const DEMO_PAYROLL_LINE_REG_DRAFT_ID = "d2600000-0000-4000-8000-000000000084";
export const DEMO_PAYROLL_LINE_COMM_DRAFT_ID = "d2600000-0000-4000-8000-000000000085";

export const DEMO_PAYROLL_EVENT_1_ID = "d2600000-0000-4000-8000-000000000086";

export const DEMO_LOG_1_ID = "d2600000-0000-4000-8000-000000000090";
export const DEMO_LOG_2_ID = "d2600000-0000-4000-8000-000000000091";
export const DEMO_LOG_3_ID = "d2600000-0000-4000-8000-000000000092";
export const DEMO_LOG_4_ID = "d2600000-0000-4000-8000-000000000093";

type Queryable = Client | PoolClient;

export interface DryRunReport {
  targetDatabase: string;
  targetUser: string;
  serverHost: string;
  tableCounts: Record<string, number>;
  catalogChecks: {
    stores: string[];
    eventTypes: string[];
    serviceScopes: string[];
    roles: string[];
  };
  manifest: Record<SeedEntity, { expected: number; present: number; missing: number }>;
  isAlreadyApplied: boolean;
  mutationsMade: number;
}

const SEED_EXPECTED = {
  employees: 5, items: 4, proposals: 3, proposalScopes: 5, events: 3,
  eventScopes: 5, assignments: 3, allocations: 3, expenses: 6,
  capitalInvestments: 1, inventoryMovements: 1, payrollRuns: 2,
  payrollLines: 4, payrollLineEvents: 1, eventLogs: 4,
} as const;
type SeedEntity = keyof typeof SEED_EXPECTED;

async function getSeedPresence(client: Queryable): Promise<Record<SeedEntity, number>> {
  const result = await client.query(`
    SELECT
      (SELECT count(*)::int FROM employees WHERE id = ANY($1::uuid[])) AS employees,
      (SELECT count(*)::int FROM items WHERE id = ANY($2::uuid[])) AS items,
      (SELECT count(*)::int FROM event_proposals WHERE id = ANY($3::uuid[])) AS proposals,
      (SELECT count(*)::int FROM proposal_service_scopes WHERE proposal_id = ANY($3::uuid[])) AS "proposalScopes",
      (SELECT count(*)::int FROM events WHERE id = ANY($4::uuid[])) AS events,
      (SELECT count(*)::int FROM event_service_scope_links WHERE event_id = ANY($4::uuid[])) AS "eventScopes",
      (SELECT count(*)::int FROM event_assignments WHERE id = ANY($5::uuid[])) AS assignments,
      (SELECT count(*)::int FROM event_allocations WHERE id = ANY($6::uuid[])) AS allocations,
      (SELECT count(*)::int FROM expenses WHERE id = ANY($7::uuid[])) AS expenses,
      (SELECT count(*)::int FROM capital_investments WHERE id = $8) AS "capitalInvestments",
      (SELECT count(*)::int FROM inventory_movements WHERE id = $9) AS "inventoryMovements",
      (SELECT count(*)::int FROM payroll_runs WHERE id = ANY($10::uuid[])) AS "payrollRuns",
      (SELECT count(*)::int FROM payroll_run_employee_lines WHERE id = ANY($11::uuid[])) AS "payrollLines",
      (SELECT count(*)::int FROM payroll_run_line_events WHERE id = $12) AS "payrollLineEvents",
      (SELECT count(*)::int FROM event_logs WHERE id = ANY($13::uuid[])) AS "eventLogs"
  `, [
    [DEMO_EMP_REGULAR_ID, DEMO_EMP_COMMISSION_ONLY_ID, DEMO_EMP_KEEPER_ID, DEMO_EMP_COORDINATOR_ID, DEMO_EMP_DRIVER_ID],
    [DEMO_ITEM_CHAIR_ID, DEMO_ITEM_STAGE_ID, DEMO_ITEM_UPLIGHT_ID, DEMO_ITEM_TRUSS_ID],
    [DEMO_PROP_DRAFT_ID, DEMO_PROP_APPROVED_ID, DEMO_PROP_CONVERTED_ID],
    [DEMO_EVENT_PLANNED_ID, DEMO_EVENT_ACTIVE_ID, DEMO_EVENT_COMPLETED_ID],
    [DEMO_ASSIGN_UPCOMING_ID, DEMO_ASSIGN_ATTENDED_ID, DEMO_ASSIGN_ABSENT_ID],
    [DEMO_ALLOC_ACTIVE_ID, DEMO_ALLOC_DISPATCHED_ID, DEMO_ALLOC_RETURNED_ID],
    [DEMO_EXP_LABOR_ID, DEMO_EXP_FUEL_ID, DEMO_EXP_CONSUMABLES_ID, DEMO_EXP_RENTAL_ID, DEMO_EXP_TRANS_ID, DEMO_EXP_OTHER_ID],
    DEMO_CAPITAL_ID, DEMO_MOVEMENT_CAPITAL_ID,
    [DEMO_PAYROLL_FINALIZED_ID, DEMO_PAYROLL_DRAFT_ID],
    [DEMO_PAYROLL_LINE_REG_FIN_ID, DEMO_PAYROLL_LINE_COMM_FIN_ID, DEMO_PAYROLL_LINE_REG_DRAFT_ID, DEMO_PAYROLL_LINE_COMM_DRAFT_ID],
    DEMO_PAYROLL_EVENT_1_ID,
    [DEMO_LOG_1_ID, DEMO_LOG_2_ID, DEMO_LOG_3_ID, DEMO_LOG_4_ID],
  ]);
  const row = result.rows[0] ?? {};
  return Object.fromEntries(Object.keys(SEED_EXPECTED).map((key) => [key, Number(row[key] ?? 0)])) as Record<SeedEntity, number>;
}

export async function runDryRun(client: Queryable): Promise<DryRunReport> {
  const hostRes = await client.query("SELECT current_database() as db, current_user as usr, inet_server_addr() as host, inet_server_port() as port");
  const target = hostRes.rows[0] || {};
  const targetDatabase = target.db || "postgres";
  const targetUser = target.usr || "postgres";
  const serverHost = `${target.host || 'Supabase Direct Host'}:${target.port || 5432}`;

  const trackedTables = [
    "users", "stores", "employees", "items", "categories", "event_types",
    "event_service_scopes", "event_proposals", "events", "event_assignments",
    "event_allocations", "expenses", "capital_investments", "inventory_movements",
    "payroll_runs", "payroll_run_employee_lines", "payroll_run_line_events", "event_logs"
  ];

  const countResult = await client.query(`SELECT ${trackedTables.map((t) => `(SELECT count(*)::int FROM "${t}") AS "${t}"`).join(", ")}`);
  const tableCounts = Object.fromEntries(trackedTables.map((t) => [t, Number(countResult.rows[0]?.[t] ?? 0)]));

  // Catalog checks
  const [storesRes, eventTypesRes, serviceScopesRes, rolesRes] = await Promise.all([
    client.query("SELECT name FROM stores ORDER BY name"),
    client.query("SELECT name FROM event_types ORDER BY name"),
    client.query("SELECT code FROM event_service_scopes ORDER BY code"),
    client.query("SELECT name FROM roles ORDER BY name"),
  ]);
  const presence = await getSeedPresence(client);
  const manifest = Object.fromEntries(Object.entries(SEED_EXPECTED).map(([key, expected]) => {
    const present = presence[key as SeedEntity];
    return [key, { expected, present, missing: Math.max(0, expected - present) }];
  })) as DryRunReport["manifest"];
  const isAlreadyApplied = Object.values(manifest).every(({ missing }) => missing === 0);

  return {
    targetDatabase,
    targetUser,
    serverHost,
    tableCounts,
    catalogChecks: {
      stores: storesRes.rows.map(r => r.name),
      eventTypes: eventTypesRes.rows.map(r => r.name),
      serviceScopes: serviceScopesRes.rows.map(r => r.code),
      roles: rolesRes.rows.map(r => r.name),
    },
    manifest,
    isAlreadyApplied,
    mutationsMade: 0,
  };
}

export async function applySeed(client: Queryable): Promise<{ applied: boolean; insertedCount: number }> {
  await client.query("BEGIN");

  try {
    // Transaction-scoped locks only remain held when acquired after BEGIN.
    await client.query("SELECT pg_advisory_xact_lock($1)", [ADVISORY_LOCK_ID]);
    const before = await getSeedPresence(client);

    // 1. Resolve catalog IDs
    const { rows: stores } = await client.query("SELECT id, name FROM stores");
    const { rows: eventTypes } = await client.query("SELECT id, name FROM event_types");
    const { rows: serviceScopes } = await client.query("SELECT id, code FROM event_service_scopes");
    const { rows: users } = await client.query(
      "SELECT id, username FROM users WHERE username IN ('admin', 'ceo') ORDER BY CASE username WHEN 'admin' THEN 0 ELSE 1 END",
    );

    const boleHQ = stores.find(s => s.name === "Bole HQ");
    const hayaArat = stores.find(s => s.name === "Haya Arat");

    const weddingType = eventTypes.find(e => e.name === "Wedding" || e.name === "wedding");
    const corpType = eventTypes.find(e => e.name === "Corporate Event");
    const photoType = eventTypes.find(e => e.name === "Photo Shoot");

    const fullScope = serviceScopes.find(s => s.code === "FULL");
    const bgScope = serviceScopes.find(s => s.code === "BACKGROUND");
    const setupScope = serviceScopes.find(s => s.code === "SETUP");
    const tableScope = serviceScopes.find(s => s.code === "TABLE_SETUP");

    const adminUser = users.find(u => u.username === "admin" || u.username === "ceo") || users[0];
    const userId = adminUser?.id || null;

    const missingDependencies = [
      !boleHQ && "store:Bole HQ",
      !hayaArat && "store:Haya Arat",
      !weddingType && "event_type:Wedding",
      !corpType && "event_type:Corporate Event",
      !photoType && "event_type:Photo Shoot",
      !fullScope && "service_scope:FULL",
      !bgScope && "service_scope:BACKGROUND",
      !setupScope && "service_scope:SETUP",
      !tableScope && "service_scope:TABLE_SETUP",
      !adminUser && "user:admin-or-ceo",
    ].filter(Boolean);
    if (missingDependencies.length > 0) {
      throw new Error(`Missing authoritative seed dependencies: ${missingDependencies.join(", ")}`);
    }
    if (!boleHQ || !hayaArat || !weddingType || !corpType || !photoType
      || !fullScope || !bgScope || !setupScope || !tableScope || !adminUser) {
      throw new Error("Seed dependency validation failed");
    }

    // 2. Insert Employees (5)
    await client.query(`
      INSERT INTO employees (
        id, full_name, employee_id, department, position, phone, email, salary_level, base_salary,
        office_id, gender, employment_type, group_name, bank_name, bank_account, hire_date, contract_status, compensation_mode
      ) VALUES
        ($1, '[DEMO 2026Q3] Abebe Demissie', 'D26-001', 'Events Operations', 'Senior Coordinator', '+251911990001', 'abebe.demo@dreamlux.com', 'L4', 12000.00, $6, 'Male', 'full-time', 'Office', 'CBE', '100099881122', '2026-01-10', 'Active', 'regular'),
        ($2, '[DEMO 2026Q3] Tigist Alemu', 'D26-002', 'Events Operations', 'Stage Decorator', '+251911990002', 'tigist.demo@dreamlux.com', 'L3', 0.00, $6, 'Female', 'part-time', 'Balemoya', 'Abyssinia', '9988776655', '2026-02-01', 'Active', 'commission_only'),
        ($3, '[DEMO 2026Q3] Dawit Haile', 'D26-003', 'Logistics & Inventory', 'Inventory Storekeeper', '+251911990003', 'dawit.demo@dreamlux.com', 'L3', 9000.00, $6, 'Male', 'full-time', 'Office', 'Dashen', '5544332211', '2026-01-15', 'Active', 'regular'),
        ($4, '[DEMO 2026Q3] Mesfin Tadesse', 'D26-004', 'Events Operations', 'OPS Manager', '+251911990004', 'mesfin.demo@dreamlux.com', 'L5', 16000.00, $7, 'Male', 'full-time', 'Office', 'Zemen Bank', '1122334455', '2025-11-01', 'Active', 'regular'),
        ($5, '[DEMO 2026Q3] Kassahun Bekele', 'D26-005', 'Logistics & Inventory', 'Lead Driver', '+251911990005', 'kassahun.demo@dreamlux.com', 'L2', 7000.00, $7, 'Male', 'full-time', 'Redat', 'CBE', '100088776655', '2026-03-01', 'Active', 'regular')
      ON CONFLICT (id) DO NOTHING;
    `, [
      DEMO_EMP_REGULAR_ID, DEMO_EMP_COMMISSION_ONLY_ID, DEMO_EMP_KEEPER_ID, DEMO_EMP_COORDINATOR_ID, DEMO_EMP_DRIVER_ID,
      boleHQ.id, hayaArat.id
    ]);

    // 3. Insert Inventory Items (4)
    await client.query(`
      INSERT INTO items (
        id, name, quantity, description, store_id, type, color, unit_of_measurement, purchase_date, purchase_cost, condition_status
      ) VALUES
        ($1, '[DEMO 2026Q3] Gold Banquet Chairs', 200, 'Premium gold tiffany banquet chairs for luxury receptions', $5, 'Furniture', 'Gold', 'pcs', '2026-05-10', 950.00, 'Good'),
        ($2, '[DEMO 2026Q3] Velvet Backdrop Stage', 5, 'Heavy velvet modular backdrop frame set', $5, 'Props', 'Royal Blue', 'set', '2026-04-15', 8500.00, 'Good'),
        ($3, '[DEMO 2026Q3] Wireless LED Uplights', 30, 'Rechargeable RGBW ambient stage lights', $6, 'Lighting', 'RGBW', 'pcs', '2026-06-01', 3200.00, 'Good'),
        ($4, '[DEMO 2026Q3] Aluminum Stage Trusses', 10, 'Heavy-duty 3m square aluminum lighting trusses', $6, 'Props', 'Silver', 'pcs', '2026-07-01', 4500.00, 'Good')
      ON CONFLICT (id) DO NOTHING;
    `, [
      DEMO_ITEM_CHAIR_ID, DEMO_ITEM_STAGE_ID, DEMO_ITEM_UPLIGHT_ID, DEMO_ITEM_TRUSS_ID,
      boleHQ.id, hayaArat.id
    ]);

    // 4. Insert Proposals (3)
    await client.query(`
      INSERT INTO event_proposals (
        id, name, client_name, client_phone, event_type_id, venue_location,
        requested_start_date, requested_end_date, requested_budget,
        estimated_design_cost, estimated_team_cost, estimated_trip_cost, estimated_other_cost,
        estimated_total_cost, estimated_net_profit, estimated_margin_percentage,
        status, converted_event_id, created_by
      ) VALUES
        ($1, '[DEMO 2026Q3] Proposed Luxury Gala 2026', 'Solomon & Associates', '+251911887766', $4, 'Hilton Addis Ababa', '2026-08-25', '2026-08-25', 150000.00, 50000.00, 25000.00, 10000.00, 5000.00, 90000.00, 60000.00, 40.00, 'Draft', NULL, $7),
        ($2, '[DEMO 2026Q3] Diplomatic Reception', 'Embassy Cultural Affairs', '+251911776655', $5, 'Ethiopian Skylight Hotel', '2026-08-30', '2026-08-30', 80000.00, 40000.00, 20000.00, 5000.00, 5000.00, 70000.00, 10000.00, 12.50, 'Approved', NULL, $7),
        ($3, '[DEMO 2026Q3] Yared & Bethlehem Wedding Intake', 'Yared Tadesse', '+251911665544', $6, 'Hilton Addis Ababa', '2026-07-20', '2026-07-20', 250000.00, 100000.00, 50000.00, 15000.00, 10000.00, 175000.00, 75000.00, 30.00, 'Converted', $8, $7)
      ON CONFLICT (id) DO NOTHING;
    `, [
      DEMO_PROP_DRAFT_ID, DEMO_PROP_APPROVED_ID, DEMO_PROP_CONVERTED_ID,
      corpType.id, photoType.id, weddingType.id,
      userId, DEMO_EVENT_COMPLETED_ID
    ]);

    // 4b. Proposal Service Scopes
    if (setupScope && tableScope) {
      await client.query(`
        INSERT INTO proposal_service_scopes (proposal_id, service_scope_id) VALUES
          ($1, $4), ($1, $5),
          ($2, $4),
          ($3, $4), ($3, $5)
        ON CONFLICT DO NOTHING;
      `, [DEMO_PROP_DRAFT_ID, DEMO_PROP_APPROVED_ID, DEMO_PROP_CONVERTED_ID, setupScope.id, tableScope.id]);
    }

    // 5. Insert Events (3)
    await client.query(`
      INSERT INTO events (
        id, event_code, name, client_name, client_phone, event_type_id, start_date, end_date, start_time, end_time,
        venue_location, contract_price, status, created_by
      ) VALUES
        ($1, 'EVT-D26-001', '[DEMO 2026Q3] Annual Tech Summit', 'TechEthio Forum', '+251911554433', $4, '2026-08-15', '2026-08-15', '09:00:00', '17:00:00', 'Hilton Addis Ababa', 120000.00, 'Planned', $7),
        ($2, 'EVT-D26-002', '[DEMO 2026Q3] Commercial Launch Gala', 'Ethio Telecom Agency', '+251911443322', $5, '2026-08-01', '2026-08-01', '18:00:00', '23:00:00', 'Ethiopian Skylight Hotel', 95000.00, 'In Progress', $7),
        ($3, 'EVT-D26-003', '[DEMO 2026Q3] Yared & Bethlehem Wedding', 'Yared Tadesse', '+251911665544', $6, '2026-07-20', '2026-07-20', '10:00:00', '22:00:00', NULL, 250000.00, 'Completed', $7)
      ON CONFLICT (id) DO NOTHING;
    `, [
      DEMO_EVENT_PLANNED_ID, DEMO_EVENT_ACTIVE_ID, DEMO_EVENT_COMPLETED_ID,
      corpType.id, photoType.id, weddingType.id,
      userId
    ]);

    await client.query(
      "UPDATE event_proposals SET converted_event_id = $1 WHERE id = $2 AND converted_event_id IS NULL",
      [DEMO_EVENT_COMPLETED_ID, DEMO_PROP_CONVERTED_ID],
    );

    // 5b. Event Service Scopes Links
    if (fullScope && bgScope && setupScope && tableScope) {
      await client.query(`
        INSERT INTO event_service_scope_links (event_id, service_scope_id) VALUES
          ($1, $4),
          ($2, $5), ($2, $6),
          ($3, $6), ($3, $7)
        ON CONFLICT DO NOTHING;
      `, [
        DEMO_EVENT_PLANNED_ID, DEMO_EVENT_ACTIVE_ID, DEMO_EVENT_COMPLETED_ID,
        fullScope.id, bgScope.id, setupScope.id, tableScope.id
      ]);
    }

    // 6. Insert Event Assignments (3) demonstrating 3-state attendance model
    await client.query(`
      INSERT INTO event_assignments (
        id, event_id, employee_id, role, commission_amount, attended, attendance_marked_at, attendance_marked_by
      ) VALUES
        ($1, $4, $7, 'Lead Coordinator', 2000.00, FALSE, NULL, NULL),
        ($2, $6, $7, 'Lead Coordinator', 2500.00, TRUE, '2026-07-20 10:00:00', $9),
        ($3, $6, $8, 'Stage Assistant', 1500.00, FALSE, '2026-07-20 10:00:00', $9)
      ON CONFLICT (id) DO NOTHING;
    `, [
      DEMO_ASSIGN_UPCOMING_ID, DEMO_ASSIGN_ATTENDED_ID, DEMO_ASSIGN_ABSENT_ID,
      DEMO_EVENT_PLANNED_ID, DEMO_EVENT_ACTIVE_ID, DEMO_EVENT_COMPLETED_ID,
      DEMO_EMP_REGULAR_ID, DEMO_EMP_COMMISSION_ONLY_ID,
      userId
    ]);

    // 7. Insert Event Allocations (3)
    await client.query(`
      INSERT INTO event_allocations (
        id, event_id, item_id, quantity_allocated, status, departed_at, returned_at, notes, created_by
      ) VALUES
        ($1, $4, $7, 50, 'Active', NULL, NULL, '[DEMO 2026Q3] Reserved for tech summit banquet', $10),
        ($2, $5, $8, 20, 'Dispatched', '2026-08-01 08:00:00', NULL, '[DEMO 2026Q3] Dispatched for launch gala', $10),
        ($3, $6, $9, 2, 'Returned', '2026-07-20 07:00:00', '2026-07-21 18:00:00', '[DEMO 2026Q3] Returned safely post-wedding', $10)
      ON CONFLICT (id) DO NOTHING;
    `, [
      DEMO_ALLOC_ACTIVE_ID, DEMO_ALLOC_DISPATCHED_ID, DEMO_ALLOC_RETURNED_ID,
      DEMO_EVENT_PLANNED_ID, DEMO_EVENT_ACTIVE_ID, DEMO_EVENT_COMPLETED_ID,
      DEMO_ITEM_CHAIR_ID, DEMO_ITEM_UPLIGHT_ID, DEMO_ITEM_STAGE_ID,
      userId
    ]);

    // 8. Insert Expenses (6)
    await client.query(`
      INSERT INTO expenses (
        id, event_id, category, amount, description, status, created_by
      ) VALUES
        ($1, $8, 'Labor', 2500.00, 'Auto-generated labor expense for 1 attended employee', 'Approved', $9),
        ($2, $8, 'Fuel', 1200.00, '[DEMO 2026Q3] Transport fuel log', 'Approved', $9),
        ($3, $8, 'Consumables', 3500.00, '[DEMO 2026Q3] Fresh floral supplies & ribbons', 'Approved', $9),
        ($4, $8, 'Equipment Rental', 4000.00, '[DEMO 2026Q3] Heavy rigging crane hire', 'Approved', $9),
        ($5, $7, 'Transportation', 2000.00, '[DEMO 2026Q3] Extra truck hire for lighting rig', 'Pending', $9),
        ($6, $6, 'Other', 1500.00, '[DEMO 2026Q3] Site clearance fee', 'Approved', $9)
      ON CONFLICT (id) DO NOTHING;
    `, [
      DEMO_EXP_LABOR_ID, DEMO_EXP_FUEL_ID, DEMO_EXP_CONSUMABLES_ID, DEMO_EXP_RENTAL_ID, DEMO_EXP_TRANS_ID, DEMO_EXP_OTHER_ID,
      DEMO_EVENT_PLANNED_ID, DEMO_EVENT_ACTIVE_ID, DEMO_EVENT_COMPLETED_ID,
      userId
    ]);

    // 9. Capital Investment & Inventory Movement
    await client.query(`
      INSERT INTO capital_investments (
        id, asset_name, amount, category, funding_source, investor_name, investment_date, notes, status, linked_inventory_item_id, stock_applied, created_by
      ) VALUES
        ($1, '[DEMO 2026Q3] Stage Trusses Acquisition', 45000.00, 'Equipment', 'Company Reserve', 'Dream Lux PLC', '2026-07-01', '[DEMO 2026Q3] Acquired 10 aluminum stage trusses', 'Approved', $2, TRUE, $3)
      ON CONFLICT (id) DO NOTHING;
    `, [DEMO_CAPITAL_ID, DEMO_ITEM_TRUSS_ID, userId]);

    await client.query(`
      INSERT INTO inventory_movements (
        id, item_id, movement_type, quantity, reference_id, reference_type, notes, created_by
      ) VALUES
        ($1, $2, 'CAPITAL_INVESTMENT', 10, $3, 'capital_investment', '[DEMO 2026Q3] Initial stock from capital acquisition', $4)
      ON CONFLICT (id) DO NOTHING;
    `, [DEMO_MOVEMENT_CAPITAL_ID, DEMO_ITEM_TRUSS_ID, DEMO_CAPITAL_ID, userId]);

    // 10. Insert Payroll Runs (2)
    await client.query(`
      INSERT INTO payroll_runs (
        id, title, period_kind, period_start, period_end, status, finalized_at, created_by, approved_by, notes
      ) VALUES
        ($1, 'Payroll Run — July 2026 [DEMO 2026Q3]', 'month', '2026-07-01', '2026-07-31', 'finalized', '2026-07-31 17:00:00', $3, $3, 'Demonstrates regular vs commission-only compensation.'),
        ($2, 'Payroll Run — August 2026 [DEMO 2026Q3]', 'month', '2026-08-01', '2026-08-31', 'draft', NULL, $3, NULL, 'Draft payroll period for August 2026.')
      ON CONFLICT (id) DO NOTHING;
    `, [DEMO_PAYROLL_FINALIZED_ID, DEMO_PAYROLL_DRAFT_ID, userId]);

    // 10b. Payroll Employee Lines (4)
    await client.query(`
      INSERT INTO payroll_run_employee_lines (
        id, run_id, employee_id, employee_code_snapshot, employee_name_snapshot, salary_level_snapshot,
        base_salary_snapshot, commission_total_snapshot, employee_total_snapshot, office_snapshot, department_snapshot, compensation_mode_snapshot
      ) VALUES
        ($1, $5, $7, 'D26-001', '[DEMO 2026Q3] Abebe Demissie', 'L4', 12000.00, 2500.00, 14500.00, $9, 'Events Operations', 'regular'),
        ($2, $5, $8, 'D26-002', '[DEMO 2026Q3] Tigist Alemu', 'L3', 0.00, 0.00, 0.00, $9, 'Events Operations', 'commission_only'),
        ($3, $6, $7, 'D26-001', '[DEMO 2026Q3] Abebe Demissie', 'L4', 12000.00, 0.00, 12000.00, $9, 'Events Operations', 'regular'),
        ($4, $6, $8, 'D26-002', '[DEMO 2026Q3] Tigist Alemu', 'L3', 0.00, 0.00, 0.00, $9, 'Events Operations', 'commission_only')
      ON CONFLICT (id) DO NOTHING;
    `, [
      DEMO_PAYROLL_LINE_REG_FIN_ID, DEMO_PAYROLL_LINE_COMM_FIN_ID, DEMO_PAYROLL_LINE_REG_DRAFT_ID, DEMO_PAYROLL_LINE_COMM_DRAFT_ID,
      DEMO_PAYROLL_FINALIZED_ID, DEMO_PAYROLL_DRAFT_ID,
      DEMO_EMP_REGULAR_ID, DEMO_EMP_COMMISSION_ONLY_ID,
      boleHQ.id
    ]);

    // 10c. Payroll Line Event Item (1)
    await client.query(`
      INSERT INTO payroll_run_line_events (
        id, employee_line_id, event_type_id, event_name_snapshot, unit_price_snapshot, quantity, line_total_snapshot
      ) VALUES
        ($1, $2, $3, '[DEMO 2026Q3] Yared & Bethlehem Wedding', 2500.00, 1, 2500.00)
      ON CONFLICT (id) DO NOTHING;
    `, [DEMO_PAYROLL_EVENT_1_ID, DEMO_PAYROLL_LINE_REG_FIN_ID, weddingType.id]);

    // 11. Insert Audit Event Logs (4)
    await client.query(`
      INSERT INTO event_logs (
        id, event_id, action, user_id, old_data, new_data
      ) VALUES
        ($1, $5, 'allocation_update', $9, '{"items": 0}', '{"allocated": 50, "item": "Gold Banquet Chairs"}'),
        ($2, $6, 'dispatch_departure', $9, '{"status": "Active"}', '{"status": "Dispatched", "departed_at": "2026-08-01 08:00:00"}'),
        ($3, $7, 'attendance_verification', $9, '{"attended": false}', '{"attended": true, "employee": "Abebe Demissie"}'),
        ($4, $7, 'event_completion', $9, '{"status": "In Progress"}', '{"status": "Completed", "auto_labor_generated": 2500.00}')
      ON CONFLICT (id) DO NOTHING;
    `, [
      DEMO_LOG_1_ID, DEMO_LOG_2_ID, DEMO_LOG_3_ID, DEMO_LOG_4_ID,
      DEMO_EVENT_PLANNED_ID, DEMO_EVENT_ACTIVE_ID, DEMO_EVENT_COMPLETED_ID,
      userId
    ]);

    const verification = await verifySeed(client);
    if (!verification.success) {
      throw new Error(`Seed verification failed before commit: ${verification.details.join("; ")}`);
    }
    await client.query("COMMIT");
    const insertedCount = Object.keys(SEED_EXPECTED).reduce((sum, key) => sum + Math.max(0, SEED_EXPECTED[key as SeedEntity] - before[key as SeedEntity]), 0);
    return { applied: true, insertedCount };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

export async function verifySeed(client: Queryable): Promise<{ success: boolean; checks: Record<string, boolean>; details: string[] }> {
  const checks: Record<string, boolean> = {};
  const details: string[] = [];

  const presence = await getSeedPresence(client);
  for (const [entity, expected] of Object.entries(SEED_EXPECTED)) {
    checks[`${entity}_complete`] = presence[entity as SeedEntity] === expected;
  }

  // Check 1: Employees inserted correctly
  const empRes = await client.query("SELECT id, full_name, compensation_mode, base_salary FROM employees WHERE id IN ($1, $2, $3, $4, $5)", [
    DEMO_EMP_REGULAR_ID, DEMO_EMP_COMMISSION_ONLY_ID, DEMO_EMP_KEEPER_ID, DEMO_EMP_COORDINATOR_ID, DEMO_EMP_DRIVER_ID
  ]);
  checks["5_demo_employees_present"] = empRes.rows.length === 5;

  const regularEmp = empRes.rows.find(e => e.id === DEMO_EMP_REGULAR_ID);
  const commOnlyEmp = empRes.rows.find(e => e.id === DEMO_EMP_COMMISSION_ONLY_ID);
  checks["regular_employee_mode_and_salary"] = regularEmp?.compensation_mode === "regular" && parseFloat(regularEmp?.base_salary) === 12000;
  checks["commission_only_mode_and_zero_salary"] = commOnlyEmp?.compensation_mode === "commission_only" && parseFloat(commOnlyEmp?.base_salary) === 0;

  // Check 2: Attendance 3-State resolution model
  const assignRes = await client.query("SELECT id, attended, attendance_marked_at FROM event_assignments WHERE id IN ($1, $2, $3)", [
    DEMO_ASSIGN_UPCOMING_ID, DEMO_ASSIGN_ATTENDED_ID, DEMO_ASSIGN_ABSENT_ID
  ]);
  const upcomingAssign = assignRes.rows.find(a => a.id === DEMO_ASSIGN_UPCOMING_ID);
  const attendedAssign = assignRes.rows.find(a => a.id === DEMO_ASSIGN_ATTENDED_ID);
  const absentAssign = assignRes.rows.find(a => a.id === DEMO_ASSIGN_ABSENT_ID);

  checks["upcoming_assignment_unresolved"] = upcomingAssign?.attended === false && upcomingAssign?.attendance_marked_at === null;
  checks["attended_assignment_resolved_true"] = attendedAssign?.attended === true && attendedAssign?.attendance_marked_at !== null;
  checks["absent_assignment_resolved_false"] = absentAssign?.attended === false && absentAssign?.attendance_marked_at !== null;

  // Check 3: Labor math (attended staff only, absent staff 0)
  const laborExpRes = await client.query("SELECT amount FROM expenses WHERE id = $1", [DEMO_EXP_LABOR_ID]);
  checks["labor_expense_equals_attended_commission"] = parseFloat(laborExpRes.rows[0]?.amount ?? "0") === 2500.00;

  // Check 4: Capital investment stock increment
  const capitalRes = await client.query("SELECT stock_applied FROM capital_investments WHERE id = $1", [DEMO_CAPITAL_ID]);
  const itemRes = await client.query("SELECT quantity FROM items WHERE id = $1", [DEMO_ITEM_TRUSS_ID]);
  checks["capital_investment_applied_and_stock_incremented"] = capitalRes.rows[0]?.stock_applied === true && itemRes.rows[0]?.quantity === 10;

  const movementRes = await client.query(
    "SELECT item_id, quantity, reference_id, reference_type FROM inventory_movements WHERE id = $1",
    [DEMO_MOVEMENT_CAPITAL_ID],
  );
  const movement = movementRes.rows[0];
  checks["capital_movement_matches_owned_item_without_double_counting"] = movement?.item_id === DEMO_ITEM_TRUSS_ID
    && Number(movement?.quantity) === 10
    && movement?.reference_id === DEMO_CAPITAL_ID
    && movement?.reference_type === "capital_investment"
    && Number(itemRes.rows[0]?.quantity) === 10;

  const convertedRes = await client.query(
    "SELECT converted_event_id FROM event_proposals WHERE id = $1",
    [DEMO_PROP_CONVERTED_ID],
  );
  checks["converted_proposal_links_to_completed_event"] = convertedRes.rows[0]?.converted_event_id === DEMO_EVENT_COMPLETED_ID;

  const reportMathRes = await client.query(`
    SELECT e.contract_price,
      COALESCE((SELECT sum(x.amount) FROM expenses x WHERE x.event_id = e.id AND x.status = 'Approved'), 0) AS approved_expenses
    FROM events e WHERE e.id = $1
  `, [DEMO_EVENT_COMPLETED_ID]);
  const revenue = Number(reportMathRes.rows[0]?.contract_price);
  const approvedExpenses = Number(reportMathRes.rows[0]?.approved_expenses);
  checks["completed_event_report_math"] = revenue === 250000 && approvedExpenses === 11200 && revenue - approvedExpenses === 238800;

  // Check 5: Foreign key integrity across all tables
  const fkCheckRes = await client.query(`
    SELECT count(*)::int as orphan_count
    FROM event_assignments ea
    LEFT JOIN events e ON ea.event_id = e.id
    LEFT JOIN employees emp ON ea.employee_id = emp.id
    WHERE ea.id IN ($1, $2, $3) AND (e.id IS NULL OR emp.id IS NULL)
  `, [DEMO_ASSIGN_UPCOMING_ID, DEMO_ASSIGN_ATTENDED_ID, DEMO_ASSIGN_ABSENT_ID]);
  checks["foreign_key_integrity_valid"] = (fkCheckRes.rows[0]?.orphan_count ?? 0) === 0;

  const allPassed = Object.values(checks).every(v => v === true);
  for (const [k, v] of Object.entries(checks)) {
    details.push(`- ${k.padEnd(50)}: ${v ? '✓ PASS' : '❌ FAIL'}`);
  }

  return { success: allPassed, checks, details };
}

export async function cleanupSeed(client: Queryable): Promise<{ cleaned: boolean; deletedCount: number }> {
  await client.query("BEGIN");

  try {
    await client.query("SELECT pg_advisory_xact_lock($1)", [ADVISORY_LOCK_ID]);
    const before = await getSeedPresence(client);
    // Delete in reverse foreign-key order
    await client.query("DELETE FROM event_logs WHERE id IN ($1, $2, $3, $4)", [DEMO_LOG_1_ID, DEMO_LOG_2_ID, DEMO_LOG_3_ID, DEMO_LOG_4_ID]);
    await client.query("DELETE FROM payroll_run_line_events WHERE id = $1", [DEMO_PAYROLL_EVENT_1_ID]);
    await client.query("DELETE FROM payroll_run_employee_lines WHERE id IN ($1, $2, $3, $4)", [
      DEMO_PAYROLL_LINE_REG_FIN_ID, DEMO_PAYROLL_LINE_COMM_FIN_ID, DEMO_PAYROLL_LINE_REG_DRAFT_ID, DEMO_PAYROLL_LINE_COMM_DRAFT_ID
    ]);
    await client.query("DELETE FROM payroll_runs WHERE id IN ($1, $2)", [DEMO_PAYROLL_FINALIZED_ID, DEMO_PAYROLL_DRAFT_ID]);
    await client.query("DELETE FROM inventory_movements WHERE id = $1", [DEMO_MOVEMENT_CAPITAL_ID]);
    await client.query("DELETE FROM capital_investments WHERE id = $1", [DEMO_CAPITAL_ID]);
    await client.query("DELETE FROM expenses WHERE id IN ($1, $2, $3, $4, $5, $6)", [
      DEMO_EXP_LABOR_ID, DEMO_EXP_FUEL_ID, DEMO_EXP_CONSUMABLES_ID, DEMO_EXP_RENTAL_ID, DEMO_EXP_TRANS_ID, DEMO_EXP_OTHER_ID
    ]);
    await client.query("DELETE FROM event_allocations WHERE id IN ($1, $2, $3)", [DEMO_ALLOC_ACTIVE_ID, DEMO_ALLOC_DISPATCHED_ID, DEMO_ALLOC_RETURNED_ID]);
    await client.query("DELETE FROM event_assignments WHERE id IN ($1, $2, $3)", [DEMO_ASSIGN_UPCOMING_ID, DEMO_ASSIGN_ATTENDED_ID, DEMO_ASSIGN_ABSENT_ID]);
    await client.query("DELETE FROM event_service_scope_links WHERE event_id IN ($1, $2, $3)", [DEMO_EVENT_PLANNED_ID, DEMO_EVENT_ACTIVE_ID, DEMO_EVENT_COMPLETED_ID]);
    await client.query("DELETE FROM events WHERE id IN ($1, $2, $3)", [DEMO_EVENT_PLANNED_ID, DEMO_EVENT_ACTIVE_ID, DEMO_EVENT_COMPLETED_ID]);
    await client.query("DELETE FROM proposal_service_scopes WHERE proposal_id IN ($1, $2, $3)", [DEMO_PROP_DRAFT_ID, DEMO_PROP_APPROVED_ID, DEMO_PROP_CONVERTED_ID]);
    await client.query("DELETE FROM event_proposals WHERE id IN ($1, $2, $3)", [DEMO_PROP_DRAFT_ID, DEMO_PROP_APPROVED_ID, DEMO_PROP_CONVERTED_ID]);
    await client.query("DELETE FROM items WHERE id IN ($1, $2, $3, $4)", [DEMO_ITEM_CHAIR_ID, DEMO_ITEM_STAGE_ID, DEMO_ITEM_UPLIGHT_ID, DEMO_ITEM_TRUSS_ID]);
    await client.query("DELETE FROM employees WHERE id IN ($1, $2, $3, $4, $5)", [
      DEMO_EMP_REGULAR_ID, DEMO_EMP_COMMISSION_ONLY_ID, DEMO_EMP_KEEPER_ID, DEMO_EMP_COORDINATOR_ID, DEMO_EMP_DRIVER_ID
    ]);

    await client.query("COMMIT");
    return { cleaned: true, deletedCount: Object.values(before).reduce((sum, count) => sum + count, 0) };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}
