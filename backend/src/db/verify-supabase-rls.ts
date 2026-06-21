import { getEnv } from "../lib/env";

const protectedTables = [
  "employees",
  "payroll_runs",
  "salary_levels",
  "expenses",
  "trips",
  "users",
  "roles",
  "permissions",
  "event_assignments",
  "vehicle_assignments",
  "event_allocations",
  "event_logs",
  "event_proposals",
  "event_proposal_logs",
];

function isDenied(status: number): boolean {
  return status === 401 || status === 403 || status === 404;
}

async function assertProtectedTableDenied(supabaseUrl: string, key: string, table: string) {
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/${table}?select=id&limit=1`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });

  if (!isDenied(response.status)) {
    const body = await response.text();
    throw new Error(`Expected direct REST access to ${table} to be denied, got HTTP ${response.status}: ${body}`);
  }

  console.log(`[Issue31] ${table}: denied with HTTP ${response.status}`);
}

async function main() {
  const supabaseUrl = getEnv("SUPABASE_URL");
  const anonKey = getEnv("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !anonKey) {
    console.log("[Issue31] Skipping live Supabase RLS verification: SUPABASE_URL or SUPABASE_ANON_KEY is not set.");
    return;
  }

  for (const table of protectedTables) {
    await assertProtectedTableDenied(supabaseUrl, anonKey, table);
  }

  console.log("[Issue31] Live Supabase direct Data API denial verification passed.");
}

main().catch((error) => {
  console.error("[Issue31] Live Supabase RLS verification failed:", error);
  process.exit(1);
});
