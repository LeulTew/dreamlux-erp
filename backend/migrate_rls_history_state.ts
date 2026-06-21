/// <reference types="node" />
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
  console.log("Enabling RLS on inventory_reconciliation_history_state...");
  const sql = `ALTER TABLE public.inventory_reconciliation_history_state ENABLE ROW LEVEL SECURITY;`;
  try {
    const { error } = await supabase.rpc("exec_sql", { sql_query: sql });
    if (error) {
      console.warn(`Migration query failed via RPC: ${error.message}`);
      console.log(`Please run manually in Supabase Dashboard:\n\n${sql}\n`);
    } else {
      console.log("RLS enabled successfully.");
    }
  } catch (e) {
    console.error("Error executing query:", e);
  }
}

migrate();
