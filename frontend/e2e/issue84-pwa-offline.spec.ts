import { expect, test } from "@playwright/test";
import { fulfillJson, mockAuth, mockCommonShellData, seedAuthenticatedSession } from "./helpers";

test.describe("Issue 84 PWA and offline shell", () => {
  test("manifest is exposed and the install pre-prompt appears after browser event", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: ["events:read"] });
    await mockCommonShellData(page);

    const manifestResponse = await page.request.get("http://localhost:3101/manifest.webmanifest");
    expect(manifestResponse.ok()).toBeTruthy();
    const manifest = await manifestResponse.json();
    expect(manifest.name).toBe("Dream Lux ERP");
    expect(manifest.display).toBe("standalone");

    await page.goto("/events");
    await page.evaluate(() => {
      const installEvent = new Event("beforeinstallprompt") as Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ outcome: "dismissed"; platform: string }>;
      };
      installEvent.prompt = async () => {};
      installEvent.userChoice = Promise.resolve({ outcome: "dismissed", platform: "web" });
      window.dispatchEvent(installEvent);
    });

    await expect(page.getByText("Install Dream Lux ERP")).toBeVisible();
  });

  test("offline fallback page renders when opened directly", async ({ page }) => {
    await page.goto("/offline");
    await expect(page.getByText("Dream Lux ERP is unavailable offline")).toBeVisible();
    await expect(page.getByText(/queued changes will sync automatically/i)).toBeVisible();
  });

  test("payroll reminders do not auto-request notification permission on shell mount", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: ["payroll:read"] });
    await mockCommonShellData(page);
    await page.route("http://localhost:4000/payroll/runs**", (route) => fulfillJson(route, []));

    await page.addInitScript(() => {
      const requestPermission = () => Promise.resolve("granted");
      Object.defineProperty(window, "Notification", {
        configurable: true,
        value: {
          permission: "default",
          requestPermission,
        },
      });
      (window as typeof window & { __pwaPermissionCalls?: number }).__pwaPermissionCalls = 0;
      const original = requestPermission;
      (window as typeof window & { Notification: Notification & { requestPermission: () => Promise<NotificationPermission> } }).Notification.requestPermission =
        () => {
          (window as typeof window & { __pwaPermissionCalls?: number }).__pwaPermissionCalls =
            ((window as typeof window & { __pwaPermissionCalls?: number }).__pwaPermissionCalls || 0) + 1;
          return original();
        };
    });

    await page.goto("/hr/payments");
    await expect(page.getByText(/notification center/i).first()).toHaveCount(0);

    const calls = await page.evaluate(() => (window as typeof window & { __pwaPermissionCalls?: number }).__pwaPermissionCalls || 0);
    expect(calls).toBe(0);
  });
});
