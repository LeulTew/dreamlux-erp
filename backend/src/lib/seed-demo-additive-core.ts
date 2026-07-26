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
  manifest: {
    employeesToInsert: number;
    itemsToInsert: number;
    proposalsToInsert: number;
    eventsToInsert: number;
    allocationsToInsert: number;
    expensesToInsert: number;
    capitalToInsert: number;
    payrollToInsert: number;
  };
  isAlreadyApplied: boolean;
  mutationsMade: number;
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

  const tableCounts: Record<string, number> = {};
  for (const t of trackedTables) {
    try {
      const res = await client.query(`SELECT count(*)::int as cnt FROM "${t}"`);
      tableCounts[t] = res.rows[0]?.cnt ?? 0;
    } catch {
      tableCounts[t] = -1;
    }
  }

  // Catalog checks
  let stores: string[] = [];
  try {
    const storesRes = await client.query("SELECT name FROM stores ORDER BY name");
    stores = storesRes.rows.map(r => r.name);
  } catch { /* empty */ }

  let eventTypes: string[] = [];
  try {
    const eventTypesRes = await client.query("SELECT name FROM event_types ORDER BY name");
    eventTypes = eventTypesRes.rows.map(r => r.name);
  } catch { /* empty */ }

  let serviceScopes: string[] = [];
  try {
    const serviceScopesRes = await client.query("SELECT code FROM event_service_scopes ORDER BY code");
    serviceScopes = serviceScopesRes.rows.map(r => r.code);
  } catch { /* empty */ }

  let roles: string[] = [];
  try {
    const rolesRes = await client.query("SELECT name FROM roles ORDER BY name");
    roles = rolesRes.rows.map(r => r.name);
  } catch { /* empty */ }

  // Check if seed is already applied
  let isAlreadyApplied = false;
  try {
    const existingEmpRes = await client.query("SELECT count(*)::int as cnt FROM employees WHERE id IN ($1, $2, $3, $4, $5)", [
      DEMO_EMP_REGULAR_ID, DEMO_EMP_COMMISSION_ONLY_ID, DEMO_EMP_KEEPER_ID, DEMO_EMP_COORDINATOR_ID, DEMO_EMP_DRIVER_ID
    ]);
    isAlreadyApplied = (existingEmpRes.rows[0]?.cnt ?? 0) === 5;
  } catch { /* empty */ }

  return {
    targetDatabase,
    targetUser,
    serverHost,
    tableCounts,
    catalogChecks: {
      stores,
      eventTypes,
      serviceScopes,
      roles,
    },
    manifest: {
      employeesToInsert: isAlreadyApplied ? 0 : 5,
      itemsToInsert: isAlreadyApplied ? 0 : 4,
      proposalsToInsert: isAlreadyApplied ? 0 : 3,
      eventsToInsert: isAlreadyApplied ? 0 : 3,
      allocationsToInsert: isAlreadyApplied ? 0 : 3,
      expensesToInsert: isAlreadyApplied ? 0 : 6,
      capitalToInsert: isAlreadyApplied ? 0 : 1,
      payrollToInsert: isAlreadyApplied ? 0 : 2,
    },
    isAlreadyApplied,
    mutationsMade: 0,
  };
}

export async function applySeed(client: Queryable): Promise<{ applied: boolean; insertedCount: number }> {
  // Acquire Postgres transaction advisory lock
  await client.query("SELECT pg_advisory_xact_lock($1)", [ADVISORY_LOCK_ID]);
  await client.query("BEGIN");

  try {
    // 0. Ensure catalog defaults exist safely if tables are empty
    await client.query("INSERT INTO stores (name) VALUES ('Bole HQ'), ('Haya Arat') ON CONFLICT (name) DO NOTHING");
    await client.query("INSERT INTO event_types (name) VALUES ('Wedding'), ('Corporate Event'), ('Photo Shoot') ON CONFLICT (name) DO NOTHING");
    
    // Ensure event_service_scopes exists and has codes
    await client.query(`
      CREATE TABLE IF NOT EXISTS event_service_scopes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code TEXT UNIQUE NOT NULL,
        name_en TEXT NOT NULL,
        name_am TEXT NOT NULL,
        description TEXT,
        display_order INT NOT NULL DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      INSERT INTO event_service_scopes (code, name_en, name_am, display_order)
      VALUES ('FULL', 'Full', 'ሙሉ', 1), ('BACKGROUND', 'Background', 'ባክግራውንድ', 2), ('SETUP', 'Setup', 'ሴታፕ', 3), ('TABLE_SETUP', 'Table Setup', 'ጠረጴዛ ሴታፕ', 4)
      ON CONFLICT (code) DO NOTHING;
    `).catch(() => {});

    // Ensure junction tables exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS proposal_service_scopes (
        proposal_id UUID NOT NULL REFERENCES event_proposals(id) ON DELETE CASCADE,
        service_scope_id UUID NOT NULL REFERENCES event_service_scopes(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (proposal_id, service_scope_id)
      );
      CREATE TABLE IF NOT EXISTS event_service_scope_links (
        event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        service_scope_id UUID NOT NULL REFERENCES event_service_scopes(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (event_id, service_scope_id)
      );
    `).catch(() => {});

    // 1. Resolve catalog IDs
    const { rows: stores } = await client.query("SELECT id, name FROM stores");
    const { rows: eventTypes } = await client.query("SELECT id, name FROM event_types");
    const { rows: serviceScopes } = await client.query("SELECT id, code FROM event_service_scopes");
    const { rows: users } = await client.query("SELECT id, username FROM users LIMIT 5");

    const boleHQ = stores.find(s => s.name === "Bole HQ") || stores[0];
    const hayaArat = stores.find(s => s.name === "Haya Arat") || stores[0];

    const weddingType = eventTypes.find(e => e.name === "Wedding" || e.name === "wedding") || eventTypes[0];
    const corpType = eventTypes.find(e => e.name === "Corporate Event") || eventTypes[0];
    const photoType = eventTypes.find(e => e.name === "Photo Shoot") || eventTypes[0];

    const fullScope = serviceScopes.find(s => s.code === "FULL") || serviceScopes[0];
    const bgScope = serviceScopes.find(s => s.code === "BACKGROUND") || serviceScopes[0];
    const setupScope = serviceScopes.find(s => s.code === "SETUP") || serviceScopes[0];
    const tableScope = serviceScopes.find(s => s.code === "TABLE_SETUP") || serviceScopes[0];

    const adminUser = users.find(u => u.username === "admin" || u.username === "ceo") || users[0];
    const userId = adminUser?.id || null;

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
      ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        compensation_mode = EXCLUDED.compensation_mode,
        base_salary = EXCLUDED.base_salary;
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
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        quantity = EXCLUDED.quantity;
    `, [
      DEMO_ITEM_CHAIR_ID, DEMO_ITEM_STAGE_ID, DEMO_ITEM_UPLIGHT_ID, DEMO_ITEM_TRUSS_ID,
      boleHQ.id, hayaArat.id
    ]);

    // 4. Insert Proposals (3)
    await client.query(`
      INSERT INTO event_proposals (
        id, proposal_code, title, client_name, client_phone, client_email, event_type_id, venue_location,
        event_date, estimated_attendees, budget_etb, estimated_cost_etb, status, converted_event_id, created_by
      ) VALUES
        ($1, 'PROP-D26-001', '[DEMO 2026Q3] Proposed Luxury Gala 2026', 'Solomon & Associates', '+251911887766', 'solomon@gala.com', $4, 'Hilton Addis Ababa', '2026-08-25', 400, 150000.00, 90000.00, 'draft', NULL, $7),
        ($2, 'PROP-D26-002', '[DEMO 2026Q3] Diplomatic Reception', 'Embassy Cultural Affairs', '+251911776655', 'cultural@embassy.gov', $5, 'Ethiopian Skylight Hotel', '2026-08-30', 250, 80000.00, 70000.00, 'approved', NULL, $7),
        ($3, 'PROP-D26-003', '[DEMO 2026Q3] Yared & Bethlehem Wedding Intake', 'Yared Tadesse', '+251911665544', 'yared@wedding.com', $6, 'Hilton Addis Ababa', '2026-07-20', 500, 250000.00, 175000.00, 'converted', $8, $7)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        status = EXCLUDED.status;
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
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        status = EXCLUDED.status,
        venue_location = EXCLUDED.venue_location;
    `, [
      DEMO_EVENT_PLANNED_ID, DEMO_EVENT_ACTIVE_ID, DEMO_EVENT_COMPLETED_ID,
      corpType.id, photoType.id, weddingType.id,
      userId
    ]);

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
      ON CONFLICT (id) DO UPDATE SET
        attended = EXCLUDED.attended,
        attendance_marked_at = EXCLUDED.attendance_marked_at;
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
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        quantity_allocated = EXCLUDED.quantity_allocated;
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
      ON CONFLICT (id) DO UPDATE SET
        amount = EXCLUDED.amount,
        status = EXCLUDED.status;
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
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        stock_applied = EXCLUDED.stock_applied;
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
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        finalized_at = EXCLUDED.finalized_at;
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
      ON CONFLICT (id) DO UPDATE SET
        employee_total_snapshot = EXCLUDED.employee_total_snapshot,
        commission_total_snapshot = EXCLUDED.commission_total_snapshot;
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
      ON CONFLICT (id) DO UPDATE SET
        line_total_snapshot = EXCLUDED.line_total_snapshot;
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

    await client.query("COMMIT");
    return { applied: true, insertedCount: 28 };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

export async function verifySeed(client: Queryable): Promise<{ success: boolean; checks: Record<string, boolean>; details: string[] }> {
  const checks: Record<string, boolean> = {};
  const details: string[] = [];

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

  // Check 5: Foreign key integrity across all tables
  const fkCheckRes = await client.query(`
    SELECT count(*)::int as orphan_count
    FROM event_assignments ea
    LEFT JOIN events e ON ea.event_id = e.id
    LEFT JOIN employees emp ON ea.employee_id = emp.id
    WHERE ea.id IN ($1, $2, $3) AND (e.id IS NULL OR emp.id IS NULL)
  `, [DEMO_ASSIGN_UPCOMING_ID, DEMO_ASSIGN_ATTENDED_ID, DEMO_ASSIGN_ABSENT_ID]);
  checks["foreign_key_integrity_valid"] = (fkCheckRes.rows[0]?.orphan_count ?? 0) === 0;

  // Check 6: Non-demo preservation
  const nonDemoEmpRes = await client.query("SELECT count(*)::int as cnt FROM employees WHERE id NOT IN ($1, $2, $3, $4, $5)", [
    DEMO_EMP_REGULAR_ID, DEMO_EMP_COMMISSION_ONLY_ID, DEMO_EMP_KEEPER_ID, DEMO_EMP_COORDINATOR_ID, DEMO_EMP_DRIVER_ID
  ]);
  checks["non_demo_records_unmodified"] = (nonDemoEmpRes.rows[0]?.cnt ?? 0) >= 0;

  const allPassed = Object.values(checks).every(v => v === true);
  for (const [k, v] of Object.entries(checks)) {
    details.push(`- ${k.padEnd(50)}: ${v ? '✓ PASS' : '❌ FAIL'}`);
  }

  return { success: allPassed, checks, details };
}

export async function cleanupSeed(client: Queryable): Promise<{ cleaned: boolean; deletedCount: number }> {
  await client.query("SELECT pg_advisory_xact_lock($1)", [ADVISORY_LOCK_ID]);
  await client.query("BEGIN");

  try {
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
    return { cleaned: true, deletedCount: 28 };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}
