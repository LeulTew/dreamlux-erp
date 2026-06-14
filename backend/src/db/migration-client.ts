import { Client } from "pg";

const LOCAL_DB_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function shouldUseSsl(connectionString: string): boolean {
  try {
    const parsed = new URL(connectionString);
    const sslMode = parsed.searchParams.get("sslmode")?.toLowerCase();

    if (sslMode === "disable") {
      return false;
    }

    if (sslMode === "require" || sslMode === "verify-ca" || sslMode === "verify-full") {
      return true;
    }

    return !LOCAL_DB_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    // If parsing fails, default to secure mode for safety on unknown hosts.
    return true;
  }
}

export function createMigrationClient(connectionString: string): Client {
  const useSsl = shouldUseSsl(connectionString);
  
  try {
    const parsed = new URL(connectionString);
    const maskedUrl = `${parsed.protocol}//${parsed.username}:****@${parsed.host}${parsed.pathname}${parsed.search}`;
    console.log(`[MigrationClient] Initializing with ${maskedUrl} (SSL: ${useSsl})`);
  } catch {
    console.log(`[MigrationClient] Initializing with raw string (SSL: ${useSsl})`);
  }

  return new Client({
    connectionString,
    ssl: useSsl
      ? {
          rejectUnauthorized: false,
        }
      : false,
  });
}

export function migrationConnectionLabel(connectionString: string): string {
  return shouldUseSsl(connectionString) ? "SSL" : "non-SSL";
}
