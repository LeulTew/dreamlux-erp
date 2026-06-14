/// <reference types="node" />
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
  console.log("Running migration v3 (Departments and Schema Improvements)...");

  const queries = [
    // 1. Create departments table
    `CREATE TABLE IF NOT EXISTS departments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );`,

    // 2. Add department_id to employees
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id);`,

    // 3. Ensure other columns exist (idempotent)
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS profile_photo_key TEXT;`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS base_salary NUMERIC(15,2) DEFAULT 0;`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS commission NUMERIC(15,2) DEFAULT 0;`
  ];

  for (const sql of queries) {
    try {
      const { error } = await supabase.rpc("exec_sql", { sql_query: sql });
      if (error) {
        console.warn(`Migration query failed via RPC: ${error.message}`);
        console.log(`Please run manually in Supabase Dashboard:\n\n${sql}\n`);
      } else {
        console.log("Query executed successfully.");
      }
    } catch (e) {
      console.error("Error executing query:", e);
    }
  }

  console.log("Migration finished.");
}

migrate();
