import { createClient } from "@supabase/supabase-js";
import { getEnv } from "../lib/env";

const supabaseUrl = getEnv("SUPABASE_URL", "https://test.supabase.co");
const supabaseServiceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");

if (process.env.NODE_ENV !== "test" && (!supabaseUrl || !supabaseServiceRoleKey)) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = (globalThis as any).__mockSupabase || createClient(
  supabaseUrl,
  supabaseServiceRoleKey
);

