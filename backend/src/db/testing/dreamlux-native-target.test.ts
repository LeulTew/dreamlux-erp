import { describe, expect, test } from "bun:test";
import { attestDreamluxNativeTarget, dreamluxFixtureTarget } from "./dreamlux-native-target";
import { parseIntoClientConfig } from "pg-connection-string";

const admin = `postgresql://dreamlux_parity:${"a".repeat(64)}@127.0.0.1:55434/postgres`;

describe("DreamLux native target attestation without clients", () => {
  test("accepts the dedicated local admin and distinctly named fixture", () => {
    expect(attestDreamluxNativeTarget(admin, "admin").port).toBe("55434");
    expect(dreamluxFixtureTarget(admin, "payroll_239").pathname).toBe("/dreamlux_ephemeral_payroll_239");
  });

  test("permits only the disposable loopback TLS-disable option and preserves it for the fixture", () => {
    const target = attestDreamluxNativeTarget(`${admin}?sslmode=disable`, "admin");
    const fixture = dreamluxFixtureTarget(target.href, "payroll_239");
    expect(fixture.search).toBe("?sslmode=disable");
    // pg merges parsed URI options after the explicit pool/client SSL setting.
    const effective = { ssl: { rejectUnauthorized: false }, ...parseIntoClientConfig(fixture.href) };
    expect(effective.ssl).toBe(false);
    expect(effective.host).toBe("127.0.0.1");
    expect(effective.port).toBe(55434);
    expect(effective.user).toBe("dreamlux_parity");
  });

  test.each([
    { query: "?sslmode=require" },
    { query: "?sslmode=disable&host=db.invalid" },
    { query: "?host=db.invalid&sslmode=disable" },
    { query: "?sslmode=disable&options=-csearch_path=private" },
    { query: "?sslmode=disable&port=5432" },
    { query: "?sslmode=disable&user=postgres" },
    { query: "?sslmode=disable&dbname=postgres" },
    { query: "?sslmode=disable&sslmode=disable" },
    { query: "?sslmode=disable&" },
    { query: "?sslmode=%64isable" },
  ])("does not allow connection overrides alongside the CI exception", ({ query }) => {
    expect(() => attestDreamluxNativeTarget(`${admin}${query}`, "admin")).toThrow();
  });

  test("the TLS-disable exception cannot authorize another host, user or database", () => {
    expect(() => attestDreamluxNativeTarget(`${admin.replace("127.0.0.1", "db.invalid")}?sslmode=disable`, "admin")).toThrow();
    expect(() => attestDreamluxNativeTarget(`${admin.replace("dreamlux_parity:", "postgres:")}?sslmode=disable`, "admin")).toThrow();
    expect(() => attestDreamluxNativeTarget(`${admin.replace("/postgres", "/other_database")}?sslmode=disable`, "fixture")).toThrow();
  });

  test.each([
    { value: "" },
    { value: admin.replace("127.0.0.1", "db.invalid") },
    { value: admin.replace(":55434", ":5432") },
    { value: admin.replace("dreamlux_parity:", "postgres:") },
    { value: admin.replace("a".repeat(64), "test-key") },
    { value: `${admin}?host=db.invalid` },
    { value: `${admin}#unexpected` },
    { value: admin.replace("postgresql:", "https:") },
  ])("rejects unapproved target $value", ({ value }) => {
    expect(() => attestDreamluxNativeTarget(value, "admin")).toThrow();
  });

  test.each([
    { suffix: "" },
    { suffix: "../postgres" },
    { suffix: 'payroll";drop database postgres;--' },
    { suffix: "payroll?host=db.invalid" },
  ])("rejects an unsafe fixture identifier", ({ suffix }) => {
    expect(() => dreamluxFixtureTarget(admin, suffix)).toThrow();
  });

  test("does not permit admin or another product database as a fixture", () => {
    expect(() => attestDreamluxNativeTarget(admin, "fixture")).toThrow();
    expect(() => attestDreamluxNativeTarget(admin.replace("/postgres", "/koti_ephemeral_payroll"), "fixture")).toThrow();
  });
});
