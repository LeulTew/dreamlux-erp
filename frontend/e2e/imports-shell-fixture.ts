import type { Page } from "@playwright/test";
import { fulfillJson } from "./helpers";
import { mockIdleRealtime } from "./idle-realtime-fixture";

export async function mockImportShellData(page: Page, origin: string | undefined, unexpected: string[]) {
  if (!origin) throw new Error("The import shell fixture requires its owned app origin");
  await mockIdleRealtime(page, origin, unexpected);
  const reads = new Map<string, unknown>([
    ["/api/employees", { employees: [], total: 0, page: 1, limit: 5 }],
    ["/api/assets", { items: [], total: 0, page: 1, limit: 5 }],
    ["/api/events", { events: [], total: 0, page: 1, limit: 100 }],
    ["/api/salary-levels", []],
    ["/api/payroll/runs", []],
    ["/api/api/notifications", { notifications: [], total: 0, totalPages: 0 }],
    ["/api/api/notifications/unread-count", { unread_count: 0 }],
  ]);
  await page.route((url) => reads.has(url.pathname), (route) =>
    route.request().method() === "GET"
      ? fulfillJson(route, reads.get(new URL(route.request().url()).pathname))
      : route.fallback());
}
