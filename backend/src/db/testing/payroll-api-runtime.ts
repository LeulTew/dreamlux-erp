import type { Router, RequestHandler } from "express";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import type { NotificationsService } from "../../services/notifications-service";

type NotificationEmitter = Pick<typeof NotificationsService, "emitNotificationToRoleOrPermission">;
type PayrollRuntime = {
  authRouter: Router;
  payrollRouter: Router;
  requireAuth: RequestHandler;
  pool: Pool;
  NotificationsService: NotificationEmitter;
  invalidatePermissionCache: () => void;
};

function isRouter(value: unknown): value is Router {
  return typeof value === "function" && typeof Reflect.get(value, "use") === "function";
}

function isHandler(value: unknown): value is RequestHandler {
  return typeof value === "function";
}

function isCallback(value: unknown): value is () => void {
  return typeof value === "function";
}

function isEmitter(value: unknown): value is NotificationEmitter {
  return (typeof value === "function" || (typeof value === "object" && value !== null))
    && typeof Reflect.get(value, "emitNotificationToRoleOrPermission") === "function";
}

export async function loadPayrollApiRuntime(): Promise<PayrollRuntime> {
  if (process.env.DREAMLUX_NATIVE_USE_BASELINE === "1") {
    const path = join(__dirname, "..", "..", "..", "dist", "dreamlux-239-baseline.mjs");
    const source: unknown = await import(pathToFileURL(path).href);
    if (
      !source || typeof source !== "object"
      || !("authRouter" in source) || !isRouter(source.authRouter)
      || !("payrollRouter" in source) || !isRouter(source.payrollRouter)
      || !("requireAuth" in source) || !isHandler(source.requireAuth)
      || !("NotificationsService" in source) || !isEmitter(source.NotificationsService)
      || !("invalidatePermissionCache" in source) || !isCallback(source.invalidatePermissionCache)
      || !("pool" in source) || !(source.pool instanceof Pool)
    ) {
      throw new Error("The immutable payroll baseline has an unexpected runtime contract");
    }
    return {
      authRouter: source.authRouter,
      payrollRouter: source.payrollRouter,
      requireAuth: source.requireAuth,
      NotificationsService: source.NotificationsService,
      pool: source.pool,
      invalidatePermissionCache: source.invalidatePermissionCache,
    };
  }
  const [auth, payroll, middleware, database, notices, cache] = await Promise.all([
    import("../../routes/auth"), import("../../routes/payroll"), import("../../middleware/auth"),
    import("../pool"), import("../../services/notifications-service"), import("../../lib/permissions-cache"),
  ]);
  return {
    authRouter: auth.default, payrollRouter: payroll.default, requireAuth: middleware.requireAuth,
    pool: database.pool, NotificationsService: notices.NotificationsService,
    invalidatePermissionCache: cache.invalidateAllCache,
  };
}
