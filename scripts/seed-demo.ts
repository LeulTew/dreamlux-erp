/**
 * EL ERP Demo Seed Script
 * Seeds 10+ records for every major entity for demo/testing purposes.
 * Run: bun run scripts/seed-demo.ts
 */

import { Client } from "pg";
import * as bcrypt from "bcryptjs";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set in environment variables");
  process.exit(1);
}

const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function seed() {
  await client.connect();
  console.log("✓ Connected to database");

  try {
    // ── 1. Seed Departments ──────────────────────────────────────────
    console.log("\n── Seeding departments...");
    await client.query(`
      INSERT INTO departments (name) VALUES
        ('Events Operations'),
        ('Human Resources'),
        ('Finance & Payroll'),
        ('Logistics & Inventory'),
        ('Photography'),
        ('Catering'),
        ('Security'),
        ('Marketing'),
        ('IT & Systems'),
        ('Client Relations')
      ON CONFLICT (name) DO NOTHING;
    `);
    console.log("  ✓ 10 departments");

    // ── 2. Seed Salary Levels ────────────────────────────────────────
    console.log("── Seeding salary levels...");
    await client.query(`
      INSERT INTO salary_levels (code, amount_etb, description, sort_order) VALUES
        ('L1', 5000.00,  'Entry Level',         1),
        ('L2', 7000.00,  'Junior',               2),
        ('L3', 9000.00,  'Mid-Level',            3),
        ('L4', 12000.00, 'Senior',               4),
        ('L5', 16000.00, 'Lead',                 5),
        ('L6', 20000.00, 'Manager',              6),
        ('L7', 25000.00, 'Senior Manager',       7),
        ('L8', 30000.00, 'Director',             8),
        ('L9', 40000.00, 'VP',                   9),
        ('L10', 55000.00,'Executive / Partner', 10)
      ON CONFLICT (code) DO NOTHING;
    `);
    console.log("  ✓ 10 salary levels");

    // ── 3. Seed Event Types ──────────────────────────────────────────
    console.log("── Seeding event types...");
    await client.query(`
      INSERT INTO event_types (name, description) VALUES
        ('Wedding',          'Full wedding event coverage'),
        ('Mels',             'Traditional Ethiopian ceremony'),
        ('Birthday',         'Birthday celebration event'),
        ('Corporate Event',  'Business and corporate functions'),
        ('Photo Shoot',      'Professional photography session'),
        ('Graduation',       'Academic graduation ceremony'),
        ('Funeral/Memorial', 'Memorial and farewell services'),
        ('Engagement',       'Engagement party and celebration'),
        ('Conference',       'Multi-day business conference'),
        ('Concert',          'Live performance and concert')
      ON CONFLICT (name) DO NOTHING;
    `);
    console.log("  ✓ 10 event types");

    // ── 4. Seed Stores (Offices) ─────────────────────────────────────
    console.log("── Seeding stores/offices...");
    await client.query(`
      INSERT INTO stores (name) VALUES
        ('Bulbula Coka'),
        ('Bulbula 2'),
        ('Haya Arat'),
        ('Bole HQ'),
        ('CMC Branch'),
        ('Megenagna'),
        ('Lebu'),
        ('Sarbet'),
        ('Gotera'),
        ('Piassa')
      ON CONFLICT (name) DO NOTHING;
    `);
    console.log("  ✓ 10 stores/offices");

    // ── 5. Get IDs for references ────────────────────────────────────
    const { rows: stores } = await client.query("SELECT id, name FROM stores ORDER BY name");
    const { rows: salaryLevels } = await client.query("SELECT id, code, amount_etb FROM salary_levels ORDER BY sort_order");
    const { rows: eventTypes } = await client.query("SELECT id, name FROM event_types ORDER BY name");

    const storeByName = Object.fromEntries(stores.map((s) => [s.name, s.id]));
    const levelByCode = Object.fromEntries(salaryLevels.map((l) => [l.code, { id: l.id, amount: l.amount_etb }]));
    const eventByName = Object.fromEntries(eventTypes.map((e) => [e.name, e.id]));

    // Build event_prices JSON for employees (wedding + corporate + photo shoot)
    const buildEventPrices = (wedding: number, corp: number, photo: number) => JSON.stringify({
      [eventByName["Wedding"]]: wedding,
      [eventByName["Corporate Event"]]: corp,
      [eventByName["Photo Shoot"]]: photo,
    });

    // ── 6. Seed Employees ─────────────────────────────────────────────
    console.log("── Seeding employees...");
    const employees = [
      { full_name: "Abebe Girma",     id: "EL-001", dept: "Events Operations", pos: "Manager",             salary_code: "L6", store: "Bole HQ",     phone: "+251911000001", email: "abebe@el-erp.com", gender: "Male", employment_type: "full-time", group_name: "Office", bank_name: "CBE", bank_account: "1000301109559", hire_date: "2026-06-01", contract_status: "Active" },
      { full_name: "Selam Bekele",    id: "EL-002", dept: "Human Resources",   pos: "HR Specialist",        salary_code: "L4", store: "Bole HQ",     phone: "+251911000002", email: "selam@el-erp.com", gender: "Female", employment_type: "full-time", group_name: "Office", bank_name: "Abyssinia", bank_account: "99887766", hire_date: "2025-01-15", contract_status: "Active" },
      { full_name: "Dawit Tesfaye",   id: "EL-003", dept: "Finance & Payroll", pos: "Accountant",           salary_code: "L5", store: "Bulbula Coka", phone: "+251911000003", email: "dawit@el-erp.com", gender: "Male", employment_type: "full-time", group_name: "Office", bank_name: "CBE", bank_account: "100011223344", hire_date: "2025-03-20", contract_status: "Active" },
      { full_name: "Tigist Haile",    id: "EL-004", dept: "Photography",       pos: "Senior Photographer",  salary_code: "L4", store: "Megenagna",   phone: "+251911000004", email: "tigist@el-erp.com", gender: "Female", employment_type: "full-time", group_name: "Office", bank_name: "Zemen Bank", bank_account: "11223344", hire_date: "2025-05-10", contract_status: "Active" },
      { full_name: "Yohannes Alemu",  id: "EL-005", dept: "Logistics & Inventory", pos: "Inventory Lead",  salary_code: "L5", store: "CMC Branch",   phone: "+251911000005", email: "yohannes@el-erp.com", gender: "Male", employment_type: "full-time", group_name: "Office", bank_name: "Dashen", bank_account: "55443322", hire_date: "2024-11-01", contract_status: "Active" },
      { full_name: "Meron Tadesse",   id: "EL-006", dept: "Catering",          pos: "Catering Supervisor",  salary_code: "L3", store: "Haya Arat",   phone: "+251911000006", email: "meron@el-erp.com", gender: "Female", employment_type: "full-time", group_name: "Office", bank_name: "CBE", bank_account: "100022334455", hire_date: "2026-02-14", contract_status: "Active" },
      { full_name: "Biruk Mengistu",  id: "EL-007", dept: "Events Operations", pos: "Event Coordinator",    salary_code: "L3", store: "Bole HQ",     phone: "+251911000007", email: "biruk@el-erp.com", gender: "Male", employment_type: "part-time", group_name: "Redat", bank_name: "CBE", bank_account: "100099887766", hire_date: "2026-04-01", contract_status: "Active" },
      { full_name: "Feven Assefa",    id: "EL-008", dept: "Marketing",         pos: "Marketing Specialist", salary_code: "L4", store: "Sarbet",      phone: "+251911000008", email: "feven@el-erp.com", gender: "Female", employment_type: "full-time", group_name: "Office", bank_name: "Awash", bank_account: "44332211", hire_date: "2025-08-01", contract_status: "Active" },
      { full_name: "Naol Lemma",      id: "EL-009", dept: "IT & Systems",      pos: "System Administrator", salary_code: "L5", store: "Bole HQ",     phone: "+251911000009", email: "naol@el-erp.com", gender: "Male", employment_type: "full-time", group_name: "Office", bank_name: "Zemen Bank", bank_account: "88776655", hire_date: "2025-10-15", contract_status: "Active" },
      { full_name: "Hana Worku",      id: "EL-010", dept: "Client Relations",  pos: "Senior Manager",       salary_code: "L7", store: "Bole HQ",     phone: "+251911000010", email: "hana@el-erp.com", gender: "Female", employment_type: "full-time", group_name: "Office", bank_name: "CBE", bank_account: "100055443322", hire_date: "2024-05-01", contract_status: "Active" },
      { full_name: "Ermias Fekadu",   id: "EL-011", dept: "Photography",       pos: "Photographer",         salary_code: "L3", store: "Piassa",      phone: "+251911000011", email: "ermias@el-erp.com", gender: "Male", employment_type: "part-time", group_name: "Balemoya", bank_name: "Abyssinia", bank_account: "22334455", hire_date: "2026-03-01", contract_status: "Active" },
      { full_name: "Liya Solomon",    id: "EL-012", dept: "Security",          pos: "Security Lead",        salary_code: "L3", store: "Gotera",      phone: "+251911000012", email: "liya@el-erp.com", gender: "Female", employment_type: "full-time", group_name: "Office", bank_name: "CBE", bank_account: "100077665544", hire_date: "2025-12-01", contract_status: "Active" },
    ];

    for (const emp of employees) {
      const level = levelByCode[emp.salary_code];
      const eventPrices = buildEventPrices(
        Math.round(level.amount * 0.1),
        Math.round(level.amount * 0.08),
        Math.round(level.amount * 0.06)
      );
      await client.query(`
        INSERT INTO employees
          (full_name, employee_id, department, position, phone, email, salary_level, base_salary, salary_level_id, office_id, event_prices,
           gender, employment_type, group_name, bank_name, bank_account, hire_date, contract_status)
        SELECT $1, $2, $3, $4, $5, $6, $7, $8, sl.id, st.id, $9::jsonb, $12, $13, $14, $15, $16, $17::date, $18
        FROM salary_levels sl, stores st
        WHERE sl.code = $10 AND st.name = $11
        ON CONFLICT (employee_id) DO NOTHING;
      `, [
        emp.full_name, emp.id, emp.dept, emp.pos, emp.phone, emp.email,
        emp.salary_code, level.amount, eventPrices, emp.salary_code, emp.store,
        emp.gender, emp.employment_type, emp.group_name, emp.bank_name, emp.bank_account, emp.hire_date, emp.contract_status
      ]);
    }
    console.log(`  ✓ ${employees.length} employees`);

    // ── 7. Seed Inventory Items ───────────────────────────────────────
    console.log("── Seeding inventory items...");
    const items = [
      { name: "Sound System — Main Stage",     qty: 3,  store: "Bole HQ",     desc: "High-output PA sound system for main events", type: "Audio", color: "Black", unit: "set", date: "2025-06-01", cost: 120000.00, condition: "Good" },
      { name: "Microphone Set (Wireless)",      qty: 12, store: "Bole HQ",     desc: "Shure SLX wireless mic set", type: "Audio", color: "Silver", unit: "pcs", date: "2025-08-15", cost: 8500.00, condition: "Good" },
      { name: "LED Lighting Rig",               qty: 6,  store: "Bulbula Coka",desc: "Full LED stage lighting rig, RGB", type: "Lighting", color: "RGB", unit: "set", date: "2025-09-10", cost: 45000.00, condition: "Good" },
      { name: "Round Table (Banquet)",          qty: 40, store: "Haya Arat",   desc: "1.5m diameter banquet round tables", type: "Furniture", color: "White", unit: "pcs", date: "2026-01-20", cost: 2200.00, condition: "Good" },
      { name: "Banquet Chair (Gold)",           qty: 300,store: "Haya Arat",   desc: "Gold Tiffany banquet chairs", type: "Furniture", color: "Gold", unit: "pcs", date: "2026-01-20", cost: 950.00, condition: "Good" },
      { name: "Photography Backdrop Stand",     qty: 5,  store: "Megenagna",   desc: "Adjustable 3x4m backdrop stands", type: "Props", color: "Black", unit: "pcs", date: "2025-11-05", cost: 3800.00, condition: "Good" },
      { name: "Professional Camera (Sony A7)",  qty: 4,  store: "Megenagna",   desc: "Sony A7 IV mirrorless cameras", type: "Camera", color: "Black", unit: "pcs", date: "2025-10-10", cost: 165000.00, condition: "Good" },
      { name: "Extension Cord 20m",             qty: 25, store: "CMC Branch",  desc: "Heavy-duty 20m extension cords", type: "Electrical", color: "Orange", unit: "pcs", date: "2026-02-15", cost: 450.00, condition: "Good" },
      { name: "Projector (4K)",                 qty: 3,  store: "Bole HQ",     desc: "4K event projectors, 5000 lumens", type: "Video", color: "White", unit: "pcs", date: "2025-07-20", cost: 95000.00, condition: "Good" },
      { name: "Projection Screen 10ft",         qty: 4,  store: "Bole HQ",     desc: "10ft motorized projection screens", type: "Video", color: "White", unit: "pcs", date: "2025-07-20", cost: 18000.00, condition: "Good" },
      { name: "Generator (15 KVA)",             qty: 2,  store: "Sarbet",      desc: "Backup diesel generator 15KVA", type: "Power", color: "Yellow", unit: "pcs", date: "2025-05-12", cost: 350000.00, condition: "Good" },
      { name: "Wedding Arch (Floral)",          qty: 8,  store: "Bulbula 2",   desc: "Metal arch frame for floral arrangement", type: "Props", color: "Gold", unit: "pcs", date: "2026-03-01", cost: 5000.00, condition: "Good" },
    ];

    for (const item of items) {
      await client.query(`
        INSERT INTO items (name, quantity, description, store_id, type, color, unit_of_measurement, purchase_date, purchase_cost, condition_status)
        SELECT $1, $2, $3, s.id, $5, $6, $7, $8::date, $9, $10 FROM stores s WHERE s.name = $4
        ON CONFLICT DO NOTHING;
      `, [item.name, item.qty, item.desc, item.store, item.type, item.color, item.unit, item.date, item.cost, item.condition]);
    }
    console.log(`  ✓ ${items.length} inventory items`);

    // ── 8. Seed Users (app login accounts) ───────────────────────────
    console.log("── Seeding app users...");
    const adminHash = await bcrypt.hash("admin123", 10);
    const managerHash = await bcrypt.hash("manager123", 10);
    const viewerHash = await bcrypt.hash("viewer123", 10);

    // Let's seed OWNER/CEO, OPS_MANAGER, ACCOUNTANT, EVENT_MANAGER, INVENTORY_OFFICER roles matching seeds_dreamlux
    await client.query(`
      INSERT INTO users (username, password_hash, full_name, email, role_id)
      SELECT 'admin', $1, 'System Administrator', 'admin@dreamlux.com', r.id
      FROM roles r WHERE r.name = 'SUPER_ADMIN'
      ON CONFLICT (username) DO NOTHING;
    `, [adminHash]);

    await client.query(`
      INSERT INTO users (username, password_hash, full_name, email, role_id)
      SELECT 'ceo', $1, 'Dream Lux CEO', 'owner@dreamlux.com', r.id
      FROM roles r WHERE r.name = 'OWNER'
      ON CONFLICT (username) DO NOTHING;
    `, [adminHash]);

    await client.query(`
      INSERT INTO users (username, password_hash, full_name, email, role_id)
      SELECT 'ops', $1, 'Operations Manager', 'ops@dreamlux.com', r.id
      FROM roles r WHERE r.name = 'OPS_MANAGER'
      ON CONFLICT (username) DO NOTHING;
    `, [adminHash]);

    await client.query(`
      INSERT INTO users (username, password_hash, full_name, email, role_id)
      SELECT 'acc', $1, 'Senior Accountant', 'accountant@dreamlux.com', r.id
      FROM roles r WHERE r.name = 'ACCOUNTANT'
      ON CONFLICT (username) DO NOTHING;
    `, [adminHash]);

    await client.query(`
      INSERT INTO users (username, password_hash, full_name, email, role_id)
      SELECT 'eventmgr', $1, 'Event Manager', 'events@dreamlux.com', r.id
      FROM roles r WHERE r.name = 'EVENT_MANAGER'
      ON CONFLICT (username) DO NOTHING;
    `, [adminHash]);

    await client.query(`
      INSERT INTO users (username, password_hash, full_name, email, role_id)
      SELECT 'inv', $1, 'Inventory Officer', 'store@dreamlux.com', r.id
      FROM roles r WHERE r.name = 'INVENTORY_OFFICER'
      ON CONFLICT (username) DO NOTHING;
    `, [adminHash]);

    console.log("  ✓ 6 app users (admin, ceo, ops, acc, eventmgr, inv)");

    // ── 8.1. Seed Vehicles ───────────────────────────────────────────
    console.log("── Seeding vehicles...");
    await client.query(`
      INSERT INTO vehicles (plate_number, vehicle_type, fuel_type, fuel_consumption_rate, driver_license_details, is_active) VALUES
        ('AA-3-A12345', 'Toyota Hilux Pickup', 'Diesel', 0.12, 'Class 3, Exp: 2029', true),
        ('AA-3-B98765', 'Isuzu FSR Medium Truck', 'Diesel', 0.22, 'Class 4, Exp: 2028', true)
      ON CONFLICT (plate_number) DO NOTHING;
    `);
    console.log("  ✓ 2 vehicles");

    // ── 8.5. Seed Payroll Runs (Past Times & Draft) ──────────────────
    console.log("── Seeding payroll runs and lines...");
    const { rows: seededUsers } = await client.query("SELECT id, username FROM users");
    const { rows: seededEmployees } = await client.query("SELECT id, employee_id, full_name, base_salary, department, position, salary_level, office_id, event_prices FROM employees");
    const { rows: seededEventTypes } = await client.query("SELECT id, name FROM event_types");

    const adminUser = seededUsers.find((u) => u.username === "ceo") || seededUsers[0];
    const weddingEvent = seededEventTypes.find((e) => e.name === "Wedding" || e.name === "Wedding (Sereg)") || seededEventTypes[0];
    const corpEvent = seededEventTypes.find((e) => e.name === "Corporate Event") || seededEventTypes[0];
    const photoshootEvent = seededEventTypes.find((e) => e.name === "Photo Shoot") || seededEventTypes[0];

    // Clear existing payroll runs to allow clean re-seeding
    await client.query("TRUNCATE payroll_runs CASCADE");

    const pastMonths = [
      { name: "March 2026", start: "2026-03-01", end: "2026-03-31", status: "finalized" },
      { name: "April 2026", start: "2026-04-01", end: "2026-04-30", status: "finalized" },
      { name: "May 2026",   start: "2026-05-01", end: "2026-05-31", status: "draft" },
    ];

    for (const month of pastMonths) {
      // 1. Insert Payroll Run
      const runResult = await client.query(`
        INSERT INTO payroll_runs (title, period_kind, period_start, period_end, status, finalized_at, created_by, approved_by, notes)
        VALUES ($1, 'month', $2, $3, $4, $5, $6, $7, $8)
        RETURNING id;
      `, [
        `Payroll Run — ${month.name}`,
        month.start,
        month.end,
        month.status,
        month.status === "finalized" ? `${month.end}T17:00:00.000Z` : null,
        adminUser.id,
        month.status === "finalized" ? adminUser.id : null,
        `Demo pre-seeded ${month.status} payroll run for ${month.name}.`
      ]);

      const runId = runResult.rows[0].id;

      // 2. Insert Employee Lines for this run
      for (const emp of seededEmployees) {
        // Base Salary
        const baseVal = parseFloat(emp.base_salary);
        
        // Random events commission calculation
        let commissionTotal = 0;
        const lineEvents = [];

        if (month.status === "finalized" || Math.random() > 0.3) {
          // Photographers, Event Coordinators and Operations get more commissions
          const role = (emp.position || "").toLowerCase();
          const isOps = role.includes("photographer") || role.includes("coordinator") || role.includes("operations") || role.includes("manager") || role.includes("planner");
          
          if (isOps) {
            // Wedding
            const weddingCount = Math.floor(Math.random() * 3) + 1;
            const weddingPrice = emp.event_prices?.[weddingEvent.id] || Math.round(baseVal * 0.1);
            const weddingTotal = weddingCount * weddingPrice;
            commissionTotal += weddingTotal;
            lineEvents.push({ event: weddingEvent, name: weddingEvent.name, count: weddingCount, price: weddingPrice, total: weddingTotal });

            // Corporate
            if (Math.random() > 0.4) {
              const corpCount = Math.floor(Math.random() * 2) + 1;
              const corpPrice = emp.event_prices?.[corpEvent.id] || Math.round(baseVal * 0.08);
              const corpTotal = corpCount * corpPrice;
              commissionTotal += corpTotal;
              lineEvents.push({ event: corpEvent, name: corpEvent.name, count: corpCount, price: corpPrice, total: corpTotal });
            }
          }
        }

        const employeeTotal = baseVal + commissionTotal;

        // Insert Line
        const lineResult = await client.query(`
          INSERT INTO payroll_run_employee_lines (
            run_id, employee_id, employee_code_snapshot, employee_name_snapshot,
            salary_level_snapshot, base_salary_snapshot, commission_total_snapshot,
            employee_total_snapshot, office_snapshot, department_snapshot
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING id;
        `, [
          runId,
          emp.id,
          emp.employee_id,
          emp.full_name,
          emp.salary_level || "L1",
          baseVal,
          commissionTotal,
          employeeTotal,
          emp.office_id || null,
          emp.department || "Events Operations"
        ]);

        const lineId = lineResult.rows[0].id;

        // Insert Line Events
        for (const ev of lineEvents) {
          await client.query(`
            INSERT INTO payroll_run_line_events (
              employee_line_id, event_type_id, event_name_snapshot,
              unit_price_snapshot, quantity, line_total_snapshot
            )
            VALUES ($1, $2, $3, $4, $5, $6);
          `, [
            lineId,
            ev.event.id,
            ev.name,
            ev.price,
            ev.count,
            ev.total
          ]);
        }
      }
    }
    console.log("  ✓ 3 payroll runs with fully detailed employee lines and commission event items");

    // ── 8.6. Seed Sample Events and Assignments ───────────────────────
    console.log("── Seeding events and scheduling assignments...");
    await client.query("TRUNCATE events CASCADE");
    
    // Hana & Daniel Wedding
    const eventResult = await client.query(`
      INSERT INTO events (name, client_name, client_phone, event_type_id, start_date, end_date, start_time, end_time, venue_location, contract_price, status, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id;
    `, [
      'Hana & Daniel Wedding', 'Hana Mohammed', '0911223344',
      weddingEvent.id, '2026-07-15', '2026-07-15', '10:00:00', '18:00:00',
      'Friendship International Hotel, Addis Ababa', 85000.00, 'Planned',
      adminUser.id
    ]);
    const eventId = eventResult.rows[0].id;

    // Retrieve references
    const { rows: seededVehicles } = await client.query("SELECT id, plate_number FROM vehicles");
    const abebeEmp = seededEmployees.find(e => e.full_name === "Abebe Girma") || seededEmployees[0];
    const selamEmp = seededEmployees.find(e => e.full_name === "Selam Bekele") || seededEmployees[1];
    const hiluxVehicle = seededVehicles.find(v => v.plate_number === "AA-3-A12345") || seededVehicles[0];

    // Event Employee Assignment
    await client.query(`
      INSERT INTO event_assignments (event_id, employee_id, role, commission_amount, attended)
      VALUES ($1, $2, $3, $4, $5)
    `, [eventId, abebeEmp.id, 'Team Leader', 2000.00, true]);

    // Vehicle Assignment
    const vehicleAssignResult = await client.query(`
      INSERT INTO vehicle_assignments (event_id, vehicle_id, driver_id, is_night_shift)
      VALUES ($1, $2, $3, $4)
      RETURNING id;
    `, [eventId, hiluxVehicle.id, selamEmp.id, false]);
    const vAssignId = vehicleAssignResult.rows[0].id;

    // Log Trip
    await client.query(`
      INSERT INTO trips (vehicle_assignment_id, destination, distance_km, fuel_liters_used, fuel_cost_etb)
      VALUES ($1, $2, $3, $4, $5)
    `, [vAssignId, 'Central Warehouse to Friendship Hotel', 25.0, 3.0, 320.00]);

    // Log Expenses
    await client.query(`
      INSERT INTO expenses (event_id, category, amount, description, status, created_by) VALUES
        ($1, 'Fuel', 3200.00, 'Fuel consumption auto-logged', 'Approved', $2),
        ($1, 'Labor', 18000.00, 'Event crew commission', 'Pending', $2),
        ($1, 'Equipment Rental', 5000.00, 'Extra floral pillars rental', 'Pending', $2),
        ($1, 'Consumables', 1500.00, 'Water and daily event materials', 'Pending', $2),
        ($1, 'Transportation', 2000.00, 'Extra loading taxi hire', 'Pending', $2)
    `, [eventId, adminUser.id]);

    console.log("  ✓ Hana & Daniel Wedding fully pre-scheduled with driver, trips, and expenses");

    // ── 9. Summary ────────────────────────────────────────────────────
    console.log("\n✅ Demo seed complete!");
    console.log("\nLogin credentials:");
    console.log("  ceo / admin123        (Owner / CEO)");
    console.log("  ops / admin123        (Operations Manager)");
    console.log("  acc / admin123        (Accountant)");
    console.log("  eventmgr / admin123   (Event Manager)");
    console.log("  inv / admin123        (Inventory Officer)");

  } catch (err) {
    console.error("❌ Seed failed:", err);
    throw err;
  } finally {
    await client.end();
  }
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
