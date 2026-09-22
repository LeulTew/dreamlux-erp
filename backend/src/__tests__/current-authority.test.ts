import "./setup";
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import express from "express";
import jwt from "jsonwebtoken";
import { TEST_JWT_SECRET } from "./auth-test-config";
import request from "supertest";
import * as permissionDb from "../lib/permissions-db";
import { getEffectivePermissionSlugsFromUser, requireAuth, type AuthRequest } from "../middleware/auth";
import { hasPermissionSlug } from "../lib/permissions";
import {
  getCachedUserPermissions, invalidateAllCache, invalidateUserCache, setCachedUserPermissions,
  INVALIDATION_PRUNE_THRESHOLD, INVALIDATION_RETENTION_MS, _invalidationTimestampCount,
} from "../lib/permissions-cache";

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
  }, TEST_JWT_SECRET, { expiresIn: "1h" });
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

  test.each([
    { scope: "user", allowed: false }, { scope: "all", allowed: false },
    { scope: "user", allowed: true }, { scope: "all", allowed: true },
  ])("uses a fresh same-clock lookup after $scope invalidation (allowed=$allowed)", async ({ scope, allowed }) => {
    const now = Date.now();
    const clock = spyOn(Date, "now").mockReturnValue(now);
    const slugs = allowed ? ["payroll:read"] : ["payroll:write"];
    lookup.mockResolvedValue(current(slugs));
    try {
      if (scope === "all") invalidateAllCache(now);
      else invalidateUserCache(id, now);
      const result = await request(app).get("/protected").set("Authorization", `Bearer ${token()}`);
      expect(result.status).toBe(allowed ? 200 : 403);
      expect(result.body.slugs).toEqual(slugs);
      expect(getCachedUserPermissions(id)).toMatchObject({ permissionSlugs: slugs });
      expect(lookup).toHaveBeenCalledTimes(1);
    } finally { clock.mockRestore(); }
  });

  test.each(["user", "all", "unrelated"] as const)(
    "distinguishes $scope invalidation during a same-clock permission lookup",
    async (scope) => {
      const now = Date.now();
      const clock = spyOn(Date, "now").mockReturnValue(now);
      let release!: (value: Context) => void;
      let started!: () => void;
      const pending = new Promise<Context>((resolve) => { release = resolve; });
      const fetching = new Promise<void>((resolve) => { started = resolve; });
      lookup.mockImplementation(async () => { started(); return pending; });
      try {
        const response = request(app).get("/protected").set("Authorization", `Bearer ${token()}`).then((result) => result);
        await fetching;
        if (scope === "all") invalidateAllCache(now);
        else invalidateUserCache(scope === "user" ? id : "unrelated-account", now);
        release(current(["payroll:read"]));
        const result = await response;
        expect(result.status).toBe(scope === "unrelated" ? 200 : 503);
        if (scope === "unrelated") {
          expect(result.body.slugs).toEqual(["payroll:read"]);
          expect(getCachedUserPermissions(id)).toMatchObject({ permissionSlugs: ["payroll:read"] });
        } else {
          expect(result.body).toMatchObject({ error: "Permission lookup unavailable", outcome_uncertain: false });
          expect(result.body.slugs).toBeUndefined();
          expect(getCachedUserPermissions(id)).toBeNull();
        }
      } finally { release(current([])); clock.mockRestore(); }
    },
  );

  test.each(["age", "size"] as const)(
    "does not revive an invalidated lookup when its marker is pruned by %s",
    async (mode) => {
      const now = Date.now();
      const clock = spyOn(Date, "now").mockReturnValue(now);
      let release!: (value: Context) => void;
      let started!: () => void;
      const pending = new Promise<Context>((resolve) => { release = resolve; });
      const fetching = new Promise<void>((resolve) => { started = resolve; });
      lookup.mockImplementation(async () => { started(); return pending; });
      try {
        const response = request(app).get("/protected").set("Authorization", `Bearer ${token()}`).then((result) => result);
        await fetching;
        invalidateUserCache(id, now);
        for (let index = 0; index <= INVALIDATION_PRUNE_THRESHOLD; index += 1) {
          invalidateUserCache(`synthetic-prune-${index}`, mode === "age" ? now + INVALIDATION_RETENTION_MS + 1 : now);
        }
        release(current(["payroll:read"]));
        const result = await response;
        expect(result.status).toBe(503);
        expect(result.body.outcome_uncertain).toBe(false);
        expect(result.body.slugs).toBeUndefined();
        expect(getCachedUserPermissions(id)).toBeNull();
        expect(_invalidationTimestampCount()).toBeLessThanOrEqual(INVALIDATION_PRUNE_THRESHOLD + 1);
      } finally { release(current([])); clock.mockRestore(); }
    },
  );

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
