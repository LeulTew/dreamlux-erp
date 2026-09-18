import { describe, expect, mock, test } from "bun:test";
import { backupStorage } from "./backup-storage";
import { assertStorageServiceCredential } from "./storage-backup-credentials";

const configuration = {
  supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
  serviceKey: `sb_secret_${"x".repeat(40)}`,
  bucket: "inventory-images",
};

describe("DreamLux backup configuration", () => {
  test.each([
    { supabaseUrl: "" },
    { supabaseUrl: "http://unowned.invalid" },
    { supabaseUrl: "https://operator@abcdefghijklmnopqrst.supabase.co" },
    { supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co?route=other" },
    { supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co#fragment" },
    { serviceKey: "" },
    { serviceKey: `sb_publishable_${"x".repeat(40)}` },
    { serviceKey: `e30.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.non-authenticating-signature` },
  ])("rejects unsafe server configuration before constructing a client", async (change) => {
    const factory = mock(() => { throw new Error("Unexpected Storage client"); });
    await expect(backupStorage({ ...configuration, ...change }, "unused-rejected-output", factory)).rejects.toThrow();
    expect(factory).not.toHaveBeenCalled();
  });

  test("preserves an explicitly configured HTTPS proxy path", async () => {
    const factory = mock(() => { throw new Error("Configured client boundary reached"); });
    await expect(backupStorage({ ...configuration, supabaseUrl: "https://approved-proxy.invalid/supabase/" }, "unused", factory)).rejects.toThrow("Configured client boundary reached");
    expect(factory).toHaveBeenCalledWith("https://approved-proxy.invalid/supabase/", configuration.serviceKey);
  });

  test("classifies legacy server credentials without treating decoded claims as authentication", () => {
    const token = (role: string, ref: string) => `e30.${Buffer.from(JSON.stringify({ role, ref })).toString("base64url")}.non-authenticating-signature`;
    expect(() => assertStorageServiceCredential(token("service_role", "abcdefghijklmnopqrst"), "abcdefghijklmnopqrst")).not.toThrow();
    expect(() => assertStorageServiceCredential(token("service_role", "anotherprojectabcdef"), "abcdefghijklmnopqrst")).toThrow();
    expect(() => assertStorageServiceCredential(token("authenticated", "abcdefghijklmnopqrst"), "abcdefghijklmnopqrst")).toThrow();
  });
});
