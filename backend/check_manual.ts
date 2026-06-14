import fs from "fs";
import { createClient } from "@supabase/supabase-js";

function getEnvManual(name: string) {
  const env = fs.readFileSync(".env", "utf-8");
  const lines = env.split("\n");
  for (const line of lines) {
    if (line.startsWith(name + "=")) {
      let val = line.split("=")[1].trim();
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      }
      return val;
    }
  }
  return null;
}

async function check() {
  const supabaseUrl = getEnvManual("SUPABASE_URL");
  const supabaseKey = getEnvManual("SUPABASE_SERVICE_ROLE_KEY");

  console.log("Supabase URL:", supabaseUrl);
  
  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing keys!");
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase.from("stores").select("name");
  
  if (error) {
    console.error("Supabase Error:", error);
  } else {
    console.log("Stores:", data);
  }
}

check();
