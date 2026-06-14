import { getEnv } from "../lib/env";
import fs from "fs";
import path from "path";
import { createMigrationClient, migrationConnectionLabel } from "./migration-client";
import { createClient } from "@supabase/supabase-js";

const migrationPath = path.join(__dirname, "migrations", "event_level_pricing.sql");

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
    if (userMatch?.[1]) {
      projectRef = userMatch[1];
    }

    const hostMatch = parsed.hostname.match(/db\.([a-z0-9]+)\.supabase\.co/i);
    if (!projectRef && hostMatch?.[1]) {
      projectRef = hostMatch[1];
    }

    if (projectRef) {
      variants.add(
        withSslMode(`postgresql://postgres:${normalizedPassword}@db.${projectRef}.supabase.co:5432/postgres`)
      );
      // eu-west-2 (London) pooler variants (Correct region for this project)
      variants.add(
        withSslMode(`postgresql://postgres.${projectRef}:${normalizedPassword}@aws-1-eu-west-2.pooler.supabase.com:5432/postgres`)
      );
      variants.add(
        withSslMode(`postgresql://postgres.${projectRef}:${normalizedPassword}@aws-1-eu-west-2.pooler.supabase.com:6543/postgres`)
      );
      variants.add(
        withSslMode(`postgresql://postgres.${projectRef}:${normalizedPassword}@aws-0-eu-west-2.pooler.supabase.com:5432/postgres`)
      );
      variants.add(
        withSslMode(`postgresql://postgres.${projectRef}:${normalizedPassword}@aws-0-eu-west-2.pooler.supabase.com:6543/postgres`)
      );
      // Legacy variants
      variants.add(
        withSslMode(`postgresql://postgres:${normalizedPassword}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`)
      );
      variants.add(
        withSslMode(`postgresql://postgres:${normalizedPassword}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`)
      );
      variants.add(
        withSslMode(`postgresql://postgres.${projectRef}:${normalizedPassword}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`)
      );
      variants.add(
        withSslMode(`postgresql://postgres.${projectRef}:${normalizedPassword}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`)
      );
    }
  } catch {
    // Keep the original value only if URL parsing fails.
  }

  return [...variants];
}

async function tryMigrations() {
  const candidates = [getEnv("DATABASE_BACKUP_URL"), getEnv("DATABASE_URL")]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  if (candidates.length === 0) {
    console.error("DATABASE_BACKUP_URL or DATABASE_URL is required");
    process.exit(1);
  }

  const migrationSql = fs.readFileSync(migrationPath, "utf-8");
  const variants = [...new Set(candidates.flatMap((candidate) => buildConnectionVariants(candidate)))];

  for (const url of variants) {
    const client = createMigrationClient(url);
    console.log(`Running robust migration (${migrationConnectionLabel(url)})...`);

    try {
      await client.connect();
      console.log("Connected. Applying event level pricing migration SQL...");
      await client.query(migrationSql);
      console.log("Migration successful!");
      await client.end();
      return;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown migration error";
      console.log(`Failed: ${message}`);
      try { await client.end(); } catch { /* ignored */ }
    }
  }

  // Fallback: if direct DB access is blocked in this environment but the schema is already updated,
  // allow deploy to continue instead of hard-failing.
  const supabaseUrl = getEnv("SUPABASE_URL");
  const supabaseServiceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (supabaseUrl && supabaseServiceRoleKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { error } = await supabase
        .from("event_types")
        .select("id, prices_by_level")
        .limit(1);

      if (!error) {
        console.warn(
          "Direct PG migration connections failed, but schema check via Supabase API confirms prices_by_level is accessible. Continuing."
        );
        return;
      }
    } catch {
      // keep hard-fail behavior below
    }
  }

  process.exit(1);
}

tryMigrations();
