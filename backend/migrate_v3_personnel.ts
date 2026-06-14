import { Pool } from "pg";
import * as dotenv from "dotenv";
import { resolve } from "path";

// Load .env relative to this file
dotenv.config({ path: resolve(__dirname, ".env") });

const databaseUrl = process.env.DATABASE_URL || "";

if (!databaseUrl) {
  console.error("Error: DATABASE_URL is required in .env");
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: {
    rejectUnauthorized: false
  }
});

async function migrate() {
  console.log("Starting Phase 3 Admin & Personnel Migration...");

  try {
    // 1. Ensure extension for crypt is available
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

    // 2. Ensure Roles exist
    await pool.query(`
      INSERT INTO roles (name, description, permissions)
      VALUES 
        ('SUPER_ADMIN', 'Full system access', '{"all": true}'),
        ('MANAGER', 'Branch management access', '{"view_assets": true, "edit_assets": true, "view_employees": true, "edit_employees": true}'),
        ('RECIPIENT', 'Read-only log access', '{"view_assets": true, "view_employees": true}')
      ON CONFLICT (name) DO UPDATE SET 
        description = EXCLUDED.description,
        permissions = EXCLUDED.permissions;
    `);

    // 3. Get Role IDs
    const { rows: roles } = await pool.query("SELECT id, name FROM roles");
    const superAdminId = roles.find((r: any) => r.name === 'SUPER_ADMIN')?.id;
    const managerId = roles.find((r: any) => r.name === 'MANAGER')?.id;

    if (!superAdminId || !managerId) {
      throw new Error("Roles not found after insertion");
    }

    // 4. Create Personnel
    // Note: 'crypt' with blowfish salt is used for password hashing
    await pool.query(`
      -- Admin User
      INSERT INTO users (username, password_hash, full_name, email, role_id, is_active)
      VALUES ('admin', crypt('admin123', gen_salt('bf')), 'System Administrator', 'admin@el-erp.com', $1, true)
      ON CONFLICT (username) DO UPDATE SET 
        password_hash = crypt('admin123', gen_salt('bf')),
        role_id = $1;

      -- Manager User
      INSERT INTO users (username, password_hash, full_name, email, role_id, is_active)
      VALUES ('manager', crypt('manager123', gen_salt('bf')), 'Branch Manager', 'manager@el-erp.com', $2, true)
      ON CONFLICT (username) DO UPDATE SET 
        password_hash = crypt('manager123', gen_salt('bf')),
        role_id = $2;
    `, [superAdminId, managerId]);

    console.log("✅ Phase 3 Migration Complete: Users and Roles initialized.");
    console.log("Credentials:");
    console.log("- Admin: admin / admin123");
    console.log("- Manager: manager / manager123");

  } catch (err) {
    console.error("❌ Migration failed:", err);
  } finally {
    await pool.end();
  }
}

migrate();
