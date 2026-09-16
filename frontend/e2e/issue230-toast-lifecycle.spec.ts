import { expect, test, type Page } from "@playwright/test";

const productionBuild = process.env.PLAYWRIGHT_USE_BUILD === "1";

async function advanceClock(page: Page, milliseconds: number): Promise<void> {
  // Let Sonner's two RAFs and React's passive effect schedule the 200ms exit between steps.
  for (let elapsed = 0; elapsed < milliseconds;) {
    const step = Math.min(20, milliseconds - elapsed);
    await page.clock.runFor(step);
    await page.evaluate(() => undefined);
    elapsed += step;
  }
}

test.describe("Issue 230 notification lifetime", () => {
  if (productionBuild) {
    test("production build excludes the development-only toast support route", async ({ page }) => {
      const response = await page.goto("/test-support/toast");
      expect(response?.status()).toBe(404);
      await expect(page.getByRole("button", { name: "Show toast" })).toHaveCount(0);
    });
  } else {
    test.beforeEach(async ({ page }) => {
      await page.clock.install({ time: new Date("2026-09-15T08:00:00Z") });
      await page.goto("/test-support/toast");
      await expect(page.getByRole("button", { name: "Show toast", exact: true })).toBeVisible();
      await page.clock.pauseAt(new Date("2026-09-15T09:00:00Z"));
    });

    test("keyboard pause survives outside focus, resumes remaining time, and preserves Review", async ({ page }) => {
      const showToast = page.getByRole("button", { name: "Show toast", exact: true });
      await showToast.focus();
      await page.keyboard.press("Enter");
      await advanceClock(page, 100);
      await expect(page.getByText("Inventory saved")).toBeVisible();
      const pause = page.getByRole("button", { name: "Pause notification countdown" });
      await expect(pause).toContainText("This message will close in 4 seconds.");
      await advanceClock(page, 1_000);
      await expect(pause).toContainText("This message will close in 3 seconds.");

      await pause.focus();
      await page.keyboard.press("Enter");
      const resume = page.getByRole("button", { name: "Resume notification countdown" });
      await expect(resume).toBeVisible();
      await showToast.focus();
      await advanceClock(page, 5_000);
      await expect(page.getByText("Inventory saved")).toBeVisible();
      await expect(resume).toBeVisible();

      await resume.focus();
      await page.keyboard.press("Enter");
      await expect(pause).toContainText("This message will close in 3 seconds.");
      await advanceClock(page, 1_000);
      await expect(pause).toContainText("This message will close in 2 seconds.");
      await page.getByRole("button", { name: "Review", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect.poll(() => page.evaluate(() => localStorage.getItem("toast-e2e-action"))).toBe("reviewed");
      await advanceClock(page, 1_000);
      await expect(page.getByText("Inventory saved")).toHaveCount(0);
    });

    test("ordinary expiry and keyboard manual dismissal both remove the notification", async ({ page }) => {
      const showToast = page.getByRole("button", { name: "Show toast", exact: true });
      await showToast.focus();
      await page.keyboard.press("Enter");
      await advanceClock(page, 100);
      await expect(page.getByText("Inventory saved")).toBeVisible();
      await advanceClock(page, 4_500);
      await expect(page.getByText("Inventory saved")).toHaveCount(0);

      await showToast.focus();
      await page.keyboard.press("Enter");
      await advanceClock(page, 100);
      await page.getByRole("button", { name: "Dismiss notification", exact: true }).focus();
      await page.keyboard.press("Enter");
      await advanceClock(page, 500);
      await expect(page.getByText("Inventory saved")).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => localStorage.getItem("toast-e2e-action"))).toBeNull();
    });

    test("resumed expiry uses the remaining budget rather than another full duration", async ({ page }) => {
      const showToast = page.getByRole("button", { name: "Show toast", exact: true });
      await showToast.focus();
      await page.keyboard.press("Enter");
      await advanceClock(page, 1_100);
      const pause = page.getByRole("button", { name: "Pause notification countdown" });
      await expect(pause).toContainText("This message will close in 3 seconds.");
      await pause.focus();
      await page.keyboard.press("Enter");
      await showToast.focus();
      await advanceClock(page, 5_000);
      await expect(page.getByText("Inventory saved")).toBeVisible();
      await page.getByRole("button", { name: "Resume notification countdown" }).focus();
      await page.keyboard.press("Enter");
      await showToast.focus();
      await advanceClock(page, 2_000);
      await expect(pause).toContainText("This message will close in 1 seconds.");
      await advanceClock(page, 1_400);
      await expect(page.getByText("Inventory saved")).toHaveCount(0);
    });

    test.describe("Touch input", () => {
      test.skip(({ hasTouch }) => !hasTouch, "Requires a touch-capable browser context.");

      test("touch pause survives an outside tap, resumes remaining time, and preserves Review", async ({ page, hasTouch }) => {
        expect(hasTouch).toBe(true);
        expect(await page.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(0);

        await page.getByRole("button", { name: "Show toast", exact: true }).tap();
        await advanceClock(page, 100);
        const title = page.getByText("Inventory saved");
        const pause = page.getByRole("button", { name: "Pause notification countdown" });
        await expect(title).toBeVisible();
        await expect(pause).toContainText("This message will close in 4 seconds.");
        await advanceClock(page, 1_000);
        await expect(pause).toContainText("This message will close in 3 seconds.");

        await pause.tap();
        const resume = page.getByRole("button", { name: "Resume notification countdown" });
        await expect(resume).toBeVisible();
        const outside = page.getByRole("main");
        expect(await outside.evaluate((main) => {
          const bounds = main.getBoundingClientRect();
          return document.elementFromPoint(bounds.left + 16, bounds.top + 140) === main;
        })).toBe(true);
        await outside.tap({ position: { x: 16, y: 140 } });
        await expect.poll(() => page.locator("[data-sonner-toaster]").evaluate((toaster) => ({
          focused: toaster.contains(document.activeElement),
          hovered: toaster.matches(":hover"),
        }))).toEqual({ focused: false, hovered: false });
        await advanceClock(page, 5_000);
        await expect(title).toHaveCount(1);
        await expect(title).toBeVisible();
        await expect(resume).toBeVisible();

        await resume.tap();
        await expect(pause).toContainText("This message will close in 3 seconds.");
        await advanceClock(page, 1_000);
        await expect(pause).toContainText("This message will close in 2 seconds.");
        await page.getByRole("button", { name: "Review", exact: true }).tap();
        await expect.poll(() => page.evaluate(() => localStorage.getItem("toast-e2e-action"))).toBe("reviewed");
        await advanceClock(page, 1_000);
        await expect(title).toHaveCount(0);
      });
    });
  }
});
