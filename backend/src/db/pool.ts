import { Pool } from "pg";
import { getEnv } from "../lib/env";

const connectionString = getEnv("DATABASE_BACKUP_URL", getEnv("DATABASE_URL"));

function normalizeConnectionString(raw: string): string {
  if (!raw) return raw;

  const hasSslMode = /(^|[?&])sslmode=/.test(raw);
  const hasCompat = /(^|[?&])uselibpqcompat=/.test(raw);

  if (hasSslMode && !hasCompat) {
    return `${raw}${raw.includes("?") ? "&" : "?"}uselibpqcompat=true`;
  }

  return raw;
}

const normalizedConnectionString = normalizeConnectionString(connectionString);

export const pool = new Pool({
  connectionString: normalizedConnectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});
