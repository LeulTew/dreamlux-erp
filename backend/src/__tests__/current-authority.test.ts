import "./setup";
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import * as permissionDb from "../lib/permissions-db";
import { getEffectivePermissionSlugsFromUser, requireAuth, type AuthRequest } from "../middleware/auth";
import { hasPermissionSlug } from "../lib/permissions";
import { getCachedUserPermissions, invalidateAllCache, invalidateUserCache, setCachedUserPermissions } from "../lib/permissions-cache";

type Context = Awaited<ReturnType<typeof permissionDb.fetchUserRoleContext>>;
const id = "verify-db-current-authority-242";
const current = (slugs: string[] = ["payroll:write"], names = ["SYNTHETIC_CURRENT_ROLE"]): Context => ({
  userExists: true, roleNames: names, permissionSlugs: slugs,
  permissions: { payroll: slugs.filter((slug) => slug.startsWith("payroll:")).map((slug) => slug.split(":")[1]) },
});
const app = express();
app.get("/protected", requireAuth, (req: AuthRequest, res) => {
  const slugs = getEffectivePermissionSlugsFromUser(req.user);
  res.status(hasPermissionSlug(slugs, "payroll:read") ? 200 : 403).json({ slugs, admin: req.admin });
});
app.get("/identity", requireAuth, (req: AuthRequest, res) => {
  res.json({ slugs: getEffectivePermissionSlugsFromUser(req.user), role: req.user?.role, roles: req.user?.roles });
});

let lookup: ReturnType<typeof spyOn<typeof permissionDb, "fetchUserRoleContext">>;
beforeEach(() => {
  invalidateAllCache(0);
  lookup = spyOn(permissionDb, "fetchUserRoleContext").mockResolvedValue(current());
});
afterEach(() => { lookup.mockRestore(); invalidateAllCache(0); });

function token() {
  return jwt.sign({
    id, username: "synthetic-authority", role: "OWNER", roles: ["OWNER"],
    permission_slugs: ["payroll:read", "payroll:write"], permissions: { payroll: ["read", "write"] },
  }, "test-secret", { expiresIn: "1h" });
}

describe("current authority replaces token snapshots", () => {
  test("removes a revoked permission from both a fresh lookup and its cache hit", async () => {
    const authorization = `Bearer ${token()}`;
    const first = await request(app).get("/protected").set("Authorization", authorization);
    expect(first.status).toBe(403);
    expect(first.body).toEqual({ slugs: ["payroll:write"], admin: false });
    const cached = await request(app).get("/protected").set("Authorization", authorization);
    expect(cached.status).toBe(403);
    expect(cached.body.slugs).toEqual(["payroll:write"]);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  test("honors an explicitly cached current grant rather than the token's map", async () => {
    setCachedUserPermissions(id, { permissionSlugs: ["payroll:write"], roleNames: ["SYNTHETIC_CURRENT_ROLE"] });
    expect((await request(app).get("/protected").set("Authorization", `Bearer ${token()}`)).status).toBe(403);
    expect(lookup).not.toHaveBeenCalled();
  });

  test.each([
    { label: "empty grants", names: ["SYNTHETIC_CURRENT_ROLE"] },
    { label: "no assigned roles", names: [] },
  ])("keeps $label authoritative without reviving an old owner identity", async ({ names }) => {
    lookup.mockResolvedValue(current([], [...names]));
    const result = await request(app).get("/identity").set("Authorization", `Bearer ${token()}`);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ slugs: [], role: names[0] ?? "", roles: names });
    expect(getCachedUserPermissions(id)).toMatchObject({ permissionSlugs: [], roleNames: names });
  });

  test("retains currently granted read access and secondary-role membership", async () => {
    lookup.mockResolvedValue(current(["payroll:read"], ["SYNTHETIC_PRIMARY", "SYNTHETIC_READER"]));
    const result = await request(app).get("/protected").set("Authorization", `Bearer ${token()}`);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ slugs: ["payroll:read"], admin: false });
  });

  test("retains a current owner grant without relying on stale token fields", async () => {
    lookup.mockResolvedValue(current(["*"], ["OWNER"]));
    const result = await request(app).get("/protected").set("Authorization", `Bearer ${token()}`);
    expect(result.status).toBe(200);
    expect(result.body.admin).toBe(true);
  });

  test("fails closed before custom route guards when a current lookup is unavailable", async () => {
    lookup.mockRejectedValue(new Error("Synthetic permission lookup unavailable"));
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await request(app).get("/protected").set("Authorization", `Bearer ${token()}`);
      expect(result.status).toBe(503);
      expect(result.body.error).toBe("Permission lookup unavailable");
      expect(result.body.outcome_uncertain).toBe(false);
      expect(result.body.slugs).toBeUndefined();
      expect(logged).toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });

  test("does not use or cache a permission fetch invalidated before its completion", async () => {
    let now = Date.now();
    const clock = spyOn(Date, "now").mockImplementation(() => now);
    let release!: (value: Context) => void;
    let started!: () => void;
    const pending = new Promise<Context>((resolve) => { release = resolve; });
    const fetching = new Promise<void>((resolve) => { started = resolve; });
    lookup.mockImplementation(async () => { started(); return pending; });
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = request(app).get("/protected").set("Authorization", `Bearer ${token()}`).then((result) => result);
      await fetching;
      now += 1;
      invalidateUserCache(id, now);
      release(current(["payroll:read"]));
      const rejected = await response;
      expect(rejected.status).toBe(503);
      expect(rejected.body.outcome_uncertain).toBe(false);
      expect(getCachedUserPermissions(id)).toBeNull();
    } finally {
      clock.mockRestore();
      logged.mockRestore();
    }
  });
});
