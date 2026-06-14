import { createClient } from "@supabase/supabase-js";
import { getEnv } from "./src/lib/env";

const supabaseUrl = getEnv("SUPABASE_URL");
const supabaseKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from("stores").select("name");
  if (error) {
    console.error("Supabase Error:", error);
  } else {
    console.log("Stores in DB:", data);
  }
}

check();
