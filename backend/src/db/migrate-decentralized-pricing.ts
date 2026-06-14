import { getEnv } from "../lib/env";
import fs from "fs";
import path from "path";
import { createMigrationClient, migrationConnectionLabel } from "./migration-client";
import { createClient } from "@supabase/supabase-js";

const migrationPath = path.join(__dirname, "migrations", "decentralized_event_pricing.sql");

function withSslMode(url: string): string {
  const separator = url.includes("?") ? "&" : "?";
  let finalUrl = url.includes("sslmode=") ? url : `${url}${separator}sslmode=require`;
  if (!finalUrl.includes("uselibpqcompat=")) {
    finalUrl = `${finalUrl}${finalUrl.includes("?") ? "&" : "?"}uselibpqcompat=true`;
  }
  return finalUrl;
}

function buildConnectionVariants(connectionString: string): string[] {
  const variants = new Set<string>([withSslMode(connectionString)]);
  try {
    const parsed = new URL(connectionString);
    const password = decodeURIComponent(parsed.password);
    const normalizedPassword = encodeURIComponent(password);
    const username = parsed.username;
    let projectRef: string | null = null;
    const userMatch = username.match(/^postgres\.([a-z0-9]+)/i);
    if (userMatch?.[1]) projectRef = userMatch[1];
    const hostMatch = parsed.hostname.match(/db\.([a-z0-9]+)\.supabase\.co/i);
    if (!projectRef && hostMatch?.[1]) projectRef = hostMatch[1];
    if (projectRef) {
      variants.add(withSslMode(`postgresql://postgres:${normalizedPassword}@db.${projectRef}.supabase.co:5432/postgres`));
      variants.add(withSslMode(`postgresql://postgres:${normalizedPassword}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`));
      variants.add(withSslMode(`postgresql://postgres:${normalizedPassword}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`));
    }
  } catch {
    // Ignore URL parsing errors
  }
  return [...variants];
}

async function runMigration() {
  const candidates = [getEnv("DATABASE_BACKUP_URL"), getEnv("DATABASE_URL")]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0);

  if (candidates.length === 0) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const migrationSql = fs.readFileSync(migrationPath, "utf-8");
  const variants = [...new Set(candidates.flatMap(buildConnectionVariants))];

  for (const url of variants) {
    const client = createMigrationClient(url);
    try {
      await client.connect();
      console.log(`Applying migration to ${migrationConnectionLabel(url)}...`);
      await client.query(migrationSql);
      console.log("Migration successful!");
      await client.end();
      return;
    } catch (err: any) {
      console.log(`Failed: ${err.message}`);
      try { await client.end(); } catch { /* already closed */ }
    }
  }

  // Final check via API
  const supabaseUrl = getEnv("SUPABASE_URL");
  const supabaseServiceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (supabaseUrl && supabaseServiceRoleKey) {
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { error } = await supabase.from("employees").select("id, event_prices").limit(1);
    if (!error) {
      console.log("Schema already present via API check.");
      return;
    }
  }
  process.exit(1);
}

runMigration();
