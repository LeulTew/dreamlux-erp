import { describe, expect, test } from "bun:test";
import { postgresToolConnection, redactPostgresOutput, runPostgresTool } from "./postgres-tool";

function syntheticUrl() {
  const url = new URL("postgresql://127.0.0.1:55434/dreamlux_ephemeral_backup_unit");
  url.username = "synthetic_role";
  url.password = "non-auth:fixture\\value";
  return url;
}

describe("native database backup transport", () => {
  test("removes argv passwords and escapes private password-file fields", () => {
    const result = postgresToolConnection(syntheticUrl().href);
    expect(new URL(result.connectionString).password).toBe("");
    expect(result.passwordFileContents).toBe("127.0.0.1:55434:dreamlux_ephemeral_backup_unit:synthetic_role:non-auth\\:fixture\\\\value\n");
  });

  test("keeps URI brackets but uses the unbracketed IPv6 password-file host", () => {
    const url = syntheticUrl();
    url.hostname = "[::1]";
    const result = postgresToolConnection(url.href);
    expect(new URL(result.connectionString).hostname).toBe("[::1]");
    expect(result.passwordFileContents.startsWith("\\:\\:1:55434:")).toBe(true);
  });

  test("preserves reviewed TLS while bounding long and unlimited URI timeouts", () => {
    const url = syntheticUrl();
    url.searchParams.set("sslmode", "verify-full");
    url.searchParams.set("sslrootcert", "/synthetic/trust.pem");
    for (const [requested, effective] of [["0", "10"], ["3600", "10"], ["2", "2"]]) {
      url.searchParams.set("connect_timeout", requested);
      const result = new URL(postgresToolConnection(url.href).connectionString);
      expect(result.searchParams.get("connect_timeout")).toBe(effective);
      expect(result.searchParams.get("sslmode")).toBe("verify-full");
      expect(result.searchParams.get("sslrootcert")).toBe("/synthetic/trust.pem");
    }
  });

  test.each(["host", "hostaddr", "port", "user", "password", "database", "dbname", "service", "servicefile", "passfile", "sslpassword"])(
    "rejects the %s connection override", (key) => {
      const url = syntheticUrl();
      url.searchParams.set(key, "unapproved");
      expect(() => postgresToolConnection(url.href)).toThrow("routing or credential override");
    },
  );

  test.each(["\n", "\r", "\0", ""])("rejects malformed password-file values", (value) => {
    const url = syntheticUrl();
    url.password = value;
    expect(() => postgresToolConnection(url.href)).toThrow();
  });

  test.each(["1.5", "invalid", "9007199254740992"])("rejects invalid connection timeout", (value) => {
    const url = syntheticUrl();
    url.searchParams.set("connect_timeout", value);
    expect(() => postgresToolConnection(url.href)).toThrow("safe non-negative integer");
  });

  test("redacts raw, encoded and connection-shaped failures", () => {
    const url = syntheticUrl();
    const password = decodeURIComponent(url.password);
    const output = redactPostgresOutput(`failed ${url.href} ${password} ${url.password}`, [url.href, password, url.password]);
    expect(output).not.toContain(password);
    expect(output).not.toContain(url.password);
    expect(output).not.toContain(url.href);
    expect(redactPostgresOutput("failed postgresql://unowned.invalid/db")).toBe("failed [redacted database URL]");
    expect(() => postgresToolConnection("not-a-url")).toThrow("valid connection URL");
  });

  test.each([0, -1, 120001, 1.5, NaN])("rejects invalid process timeouts before spawning", async (timeout) => {
    await expect(runPostgresTool("pg_dump", ["--version"], undefined, timeout)).rejects.toThrow("120-second execution budget");
  });
});
