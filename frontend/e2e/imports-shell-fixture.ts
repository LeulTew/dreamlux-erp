import type { Page } from "@playwright/test";
import { fulfillJson, mockCommonShellData } from "./helpers";
import { installSyntheticRealtime } from "./payroll-native-fixture";

export async function mockImportShellData(page: Page, origin: string | undefined, unexpected: string[]) {
  if (!origin) throw new Error("The import shell fixture requires its owned app origin");
  await installSyntheticRealtime(page.context(), origin, unexpected);
  await mockCommonShellData(page, `${origin}/api`);
  await page.route((url) => url.pathname === "/api/api/notifications/unread-count", (route) =>
    route.request().method() === "GET"
      ? fulfillJson(route, { unread_count: 0 })
      : route.fallback());
}
