import { expect, test as base, type Locator, type Page } from "@playwright/test";
import { sidebarPreferencesKey } from "../src/lib/sidebar-preferences";
import { fulfillJson } from "./helpers";

const userId = "navigation-e2e";
const storageKey = sidebarPreferencesKey(userId);
const english = {
  navigation: "Navigation", close: "Close navigation", done: "Done",
  expand: "Expand all sections", collapse: "Collapse all sections", finance: "Finance",
  reference: "Reference Data", crumb: "Departments",
};
const amharic = {
  navigation: "ምናሌ", close: "ምናሌውን ዝጋ", done: "ተጠናቋል",
  expand: "ሁሉንም ክፍሎች ክፈት", collapse: "ሁሉንም ክፍሎች ዝጋ", finance: "ፋይናንስ",
  reference: "መሠረታዊ መረጃዎች", crumb: "የሥራ ክፍሎች",
};

const test = base.extend<{ navigationRuntime: { warnings: string[] } }>({
  navigationRuntime: [async ({ context, page, baseURL }, use) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const unexpected: string[] = [];
    const observe = (target: Page) => {
      target.on("pageerror", (error) => errors.push(error.message));
      target.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
        if (message.type() === "warning") warnings.push(message.text());
      });
    };
    observe(page);
    context.on("page", observe);

    await context.routeWebSocket("**/*", (socket) => {
      const url = new URL(socket.url());
      if (url.origin === baseURL?.replace("http:", "ws:") && url.pathname === "/_next/webpack-hmr") {
        socket.connectToServer();
        return;
      }
      if (url.origin !== "ws://127.0.0.1:54321" || url.pathname !== "/realtime/v1/websocket") {
        unexpected.push(`WebSocket ${url.origin}${url.pathname}`);
        void socket.close();
        return;
      }
      socket.onMessage((message) => {
        const [joinRef, ref, topic, event, payload] = JSON.parse(message.toString()) as [
          string | null, string, string, string,
          { config?: { postgres_changes?: Record<string, unknown>[] } },
        ];
        if (!["phx_join", "phx_leave", "heartbeat", "access_token"].includes(event)) {
          unexpected.push(`Realtime event ${event}`);
          return;
        }
        const response = event === "phx_join"
          ? { postgres_changes: (payload.config?.postgres_changes ?? []).map((change, id) => ({ ...change, id })) }
          : {};
        socket.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response }]));
      });
    });
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== baseURL) {
        unexpected.push(`${request.method()} ${url.origin}${url.pathname}`);
        await route.abort("blockedbyclient");
        return;
      }
      if (!url.pathname.startsWith("/api/")) {
        await route.continue();
        return;
      }
      const path = url.pathname.slice("/api".length);
      const user = {
        id: userId, username: "navigation-reviewer", full_name: "Navigation Reviewer",
        role: "OWNER", role_name: "Owner", roles: ["OWNER"], is_active: true,
      };
      const fixtures: Record<string, unknown> = {
        "/auth/me": { user },
        "/auth/permissions": { user_id: userId, role: "OWNER", roles: ["OWNER"], permission_slugs: ["*"], is_superuser: true, catalog: [] },
        "/departments": [],
        "/positions": [],
        "/offices/all": [],
        "/employees": { employees: [], total: 0, page: 1, limit: 5 },
        "/assets": { items: [], total: 0, page: 1, limit: 5 },
        "/events": { events: [], total: 0, page: 1, limit: 5 },
        "/salary-levels": [],
        "/payroll/runs": [],
        "/api/notifications": { notifications: [], total: 0 },
        "/api/notifications/unread-count": { count: 0 },
      };
      if (request.method() === "GET" && Object.prototype.hasOwnProperty.call(fixtures, path)) {
        await fulfillJson(route, fixtures[path]);
        return;
      }
      unexpected.push(`${request.method()} ${path}`);
      await route.abort("blockedbyclient");
    });
    await use({ warnings });
    expect(unexpected, "Unmocked API or non-local browser requests").toEqual([]);
    expect(errors, "Browser runtime and console errors").toEqual([]);
  }, { auto: true }],
});

async function initialize(page: Page, options: { lang?: "en" | "am"; dark?: boolean; collapsed?: boolean } = {}) {
  await page.addInitScript(({ lang, dark, collapsed }) => {
    localStorage.setItem("lang", lang);
    localStorage.setItem("theme", dark ? "dark" : "light");
    localStorage.setItem("dreamlux_pwa_install_dismissed", "1");
    if (!document.cookie.includes("sidebar_state=")) document.cookie = `sidebar_state=${!collapsed}; path=/`;
  }, { lang: options.lang ?? "en", dark: options.dark ?? false, collapsed: options.collapsed ?? false });
  await page.goto("/settings/departments");
  await expect(page.locator('[data-slot="sidebar-inset"]')).toBeVisible();
}

function section(page: Page, id: string) {
  return page.locator(`[data-nav-section="${id}"]`);
}

async function contained(locator: Locator, width: number, height: number, padding = 0) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(padding - 0.5);
  expect(box!.y).toBeGreaterThanOrEqual(padding - 0.5);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width - padding + 0.5);
  expect(box!.y + box!.height).toBeLessThanOrEqual(height - padding + 0.5);
}

test("remounts and reloads preserve choices, including collapse of active Reference Data", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await initialize(page);
  await section(page, "finance").click();
  await page.locator('[data-sidebar="content"]').getByRole("link", { name: "Positions", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/positions$/);
  await expect(section(page, "finance")).toHaveAttribute("aria-expanded", "false");
  await section(page, "reference-data").click();
  await expect(section(page, "reference-data")).toHaveAttribute("aria-expanded", "false");
  await page.reload();
  await expect(section(page, "finance")).toHaveAttribute("aria-expanded", "false");
  await expect(section(page, "reference-data")).toHaveAttribute("aria-expanded", "false");
  await page.goBack();
  await expect(page).toHaveURL(/\/settings\/departments$/);
  await expect(section(page, "reference-data")).toHaveAttribute("aria-expanded", "false");
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey);
  expect(stored).toEqual({ version: 1, sections: { finance: false, "reference-data": false } });
});

test("role preview bulk updates preserve hidden parent-guarded sections under the real user ID", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await initialize(page);
  await page.getByRole("button", { name: english.collapse }).click();
  await page.evaluate(({ key, otherKey }) => {
    localStorage.setItem(otherKey, JSON.stringify({ version: 1, sections: { finance: true } }));
    localStorage.setItem("previewRole", "Navigation preview");
    localStorage.setItem("previewPermissionSlugs", JSON.stringify(["departments:read", "positions:read", "vehicles:read"]));
    if (!localStorage.getItem(key)) throw new Error("Expected real-user navigation preferences");
  }, { key: storageKey, otherKey: sidebarPreferencesKey("other-user") });
  await page.reload();
  await expect(section(page, "reference-data")).toHaveCount(0);
  await expect(section(page, "employees")).toHaveCount(0);
  await page.getByRole("button", { name: english.expand }).click();
  const saved = await page.evaluate(({ key, otherKey }) => ({
    current: JSON.parse(localStorage.getItem(key)!),
    other: JSON.parse(localStorage.getItem(otherKey)!),
  }), { key: storageKey, otherKey: sidebarPreferencesKey("other-user") });
  expect(saved.current.sections).toEqual({
    employees: false, events: false, finance: false, "reference-data": false, inventory: true,
  });
  expect(saved.other.sections).toEqual({ finance: true });
});

test("matching-key cross-tab updates synchronize without modifying another user's choices", async ({ page, context }) => {
  await initialize(page);
  const second = await context.newPage();
  await initialize(second);
  await section(second, "finance").click();
  await expect(section(page, "finance")).toHaveAttribute("aria-expanded", "false");
  await second.evaluate((key) => localStorage.setItem(key, JSON.stringify({ version: 1, sections: { finance: true } })), sidebarPreferencesKey("other-user"));
  await expect(section(page, "finance")).toHaveAttribute("aria-expanded", "false");
  await second.evaluate((key) => localStorage.removeItem(key), storageKey);
  await expect(section(page, "finance")).toHaveAttribute("aria-expanded", "true");
  await second.close();
});

test("malformed preferences are diagnosed and remain usable across a page remount", async ({ page, navigationRuntime }) => {
  await page.addInitScript((key) => localStorage.setItem(key, "{broken"), storageKey);
  await initialize(page);
  await expect(page.getByRole("status")).toHaveText(/session only/);
  await section(page, "finance").click();
  await page.locator('[data-sidebar="content"]').getByRole("link", { name: "Positions", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/positions$/);
  await expect(section(page, "finance")).toHaveAttribute("aria-expanded", "false");
  expect(navigationRuntime.warnings.some((warning) => warning.includes("session-only"))).toBe(true);
});

test("blocked navigation storage writes preserve in-memory choices and expose diagnostics", async ({ page, navigationRuntime }) => {
  await page.addInitScript((key) => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException("Synthetic quota failure", "QuotaExceededError");
      write.call(this, name, value);
    };
  }, storageKey);
  await initialize(page);
  await section(page, "finance").click();
  await expect(page.getByRole("status")).toHaveText(/session only/);
  await page.locator('[data-sidebar="content"]').getByRole("link", { name: "Positions", exact: true }).click();
  await expect(section(page, "finance")).toHaveAttribute("aria-expanded", "false");
  expect(navigationRuntime.warnings.some((warning) => warning.includes("session-only"))).toBe(true);
});

test("desktop popovers support Enter, link-only focus entry, Tab, Escape, hover and outside dismissal", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await initialize(page, { collapsed: true });
  const trigger = page.getByRole("button", { name: "Finance", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const popover = page.getByRole("dialog", { name: "Finance", exact: true });
  await expect(popover).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(trigger).toHaveAttribute("aria-controls", (await popover.getAttribute("id"))!);
  await page.keyboard.press("Tab");
  await expect(popover.getByRole("link", { name: "Payroll", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  await expect(trigger).toBeFocused();

  const outside = page.getByTitle("Search (Ctrl+K)", { exact: true });
  await outside.focus();
  await trigger.hover();
  await expect(popover).toBeVisible();
  await expect(outside).toBeFocused();
  await popover.hover();
  await expect(popover).toBeVisible();
  await page.mouse.click(900, 150);
  await expect(popover).toBeHidden();

  await trigger.click();
  await expect(popover).toBeVisible();
  await outside.focus();
  await expect(popover).toBeHidden();
  const settings = page.locator('[data-sidebar="footer"]').getByRole("link", { name: "Settings", exact: true });
  await settings.focus();
  await expect(page.getByRole("tooltip")).toHaveText("Settings");
  await page.keyboard.press("Escape");
  await expect(settings).toBeFocused();
});

test("collapsed scrolling and popover collisions remain bounded in short desktop windows", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 240 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await initialize(page, { collapsed: true });
  const trigger = page.getByRole("button", { name: "Finance", exact: true });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.focus();
  await page.keyboard.press("Enter");
  const popover = page.getByRole("dialog", { name: "Finance", exact: true });
  await expect(popover).toBeVisible();
  await contained(popover, 1280, 240, 8);
  expect(await popover.evaluate((element) => element.closest('[data-sidebar="content"]'))).toBeNull();
  await popover.getByRole("link").last().scrollIntoViewIfNeeded();
  await contained(popover.getByRole("link").last(), 1280, 240, 8);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(page.locator('[data-slot="sidebar-mobile-entry"]')).toBeHidden();
});

for (const preference of ["reduce", "no-preference"] as const) {
  test(`mobile navigation computes open and close motion for ${preference}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.emulateMedia({ reducedMotion: preference });
    await initialize(page, { collapsed: true });
    const entry = page.locator('[data-slot="sidebar-mobile-entry"] button');
    await entry.click();
    const sheet = page.getByRole("dialog", { name: "Dream Lux", exact: true });
    await expect(sheet).toBeVisible();
    const opened = await sheet.evaluate((element) => {
      const sample = () => {
        const style = getComputedStyle(element);
        return {
          connected: element.isConnected,
          state: element.getAttribute("data-state"),
          animationName: style.animationName,
          animationDuration: style.animationDuration,
          transitionProperty: style.transitionProperty,
          transitionDuration: style.transitionDuration,
          transform: style.transform,
          opacity: style.opacity,
          runningAnimations: element.getAnimations().filter((animation) => animation.playState === "running").length,
        };
      };
      const result = sample();
      const setAttribute = element.setAttribute;
      // Sample the actual close commit before Radix immediately unmounts a nonanimated sheet.
      element.setAttribute = function (name, value) {
        setAttribute.call(this, name, value);
        if (name === "data-state" && value === "closed") {
          document.body.dataset.sidebarCloseMotion = JSON.stringify(sample());
          element.setAttribute = setAttribute;
        }
      };
      return result;
    });
    await sheet.getByRole("button", { name: english.done, exact: true }).click();
    const closed = await page.evaluate(() => {
      const recorded = document.body.dataset.sidebarCloseMotion;
      if (!recorded) throw new Error("The mobile sheet's actual close state was not sampled");
      delete document.body.dataset.sidebarCloseMotion;
      return JSON.parse(recorded);
    });
    await testInfo.attach("navigation-motion", { body: JSON.stringify({ preference, opened, closed }), contentType: "application/json" });
    expect(opened).toMatchObject({ connected: true, state: "open" });
    expect(closed).toMatchObject({ connected: true, state: "closed" });
    if (preference === "reduce") {
      for (const sample of [opened, closed]) {
        expect(sample).toMatchObject({
          animationName: "none",
          animationDuration: "0s",
          transitionProperty: "none",
          transform: "none",
          opacity: "1",
          runningAnimations: 0,
        });
      }
    } else {
      expect(opened).toMatchObject({ animationName: "enter", animationDuration: "0.2s", transitionDuration: "0.2s" });
      expect(closed).toMatchObject({ animationName: "exit", animationDuration: "0.2s", transitionDuration: "0.2s" });
    }
    await expect(sheet).toBeHidden();
    await expect(entry).toBeFocused();
    expect(await page.evaluate(() => document.cookie)).toContain("sidebar_state=false");
  });
}

test.describe("mobile navigation geometry", () => {
  test.use({ hasTouch: true });
  for (const viewport of [
    { width: 320, height: 640 },
    { width: 375, height: 812 },
    { width: 767, height: 600 },
    { width: 767, height: 320 },
  ]) {
    for (const lang of ["en", "am"] as const) {
      for (const dark of [false, true]) {
        test(`${viewport.width}x${viewport.height}, ${lang}, ${dark ? "dark" : "light"}: bounded sheet, full labels, targets and gaps`, async ({ page }, testInfo) => {
          const labels = lang === "am" ? amharic : english;
          await page.setViewportSize(viewport);
          await page.emulateMedia({ reducedMotion: "reduce", colorScheme: dark ? "dark" : "light" });
          await initialize(page, { lang, dark, collapsed: true });
          if (dark) await expect(page.locator("html")).toHaveClass(/dark/);
          else await expect(page.locator("html")).not.toHaveClass(/dark/);
          const entry = page.locator('[data-slot="sidebar-mobile-entry"]').getByRole("button", { name: labels.navigation, exact: true });
          await expect(entry).toBeVisible();
          await contained(entry, viewport.width, viewport.height);
          const lowerBox = (await entry.boundingBox())!;
          expect(lowerBox.height).toBeGreaterThanOrEqual(48);
          expect(lowerBox.y).toBeGreaterThan(viewport.height * 0.6);
          const entryBox = (await page.locator('[data-slot="sidebar-mobile-entry"]').boundingBox())!;
          const contentBox = (await page.locator('[data-slot="sidebar-inset"] > main').boundingBox())!;
          expect(contentBox.y + contentBox.height).toBeLessThanOrEqual(entryBox.y + 0.5);
          const headerTrigger = page.locator('header [data-sidebar="trigger"]');
          expect((await headerTrigger.boundingBox())!.height).toBeGreaterThanOrEqual(48);
          expect((await headerTrigger.boundingBox())!.width).toBeGreaterThanOrEqual(48);
          const breadcrumbs = page.getByRole("navigation", { name: "Breadcrumb" });
          await expect(breadcrumbs.locator("> span:visible")).toHaveCount(1);
          await expect(breadcrumbs.locator('[aria-current="page"]')).toHaveText(labels.crumb);
          await contained(breadcrumbs, viewport.width, viewport.height);

          await entry.tap();
          const sheet = page.getByRole("dialog", { name: "Dream Lux", exact: true });
          await expect(sheet).toBeVisible();
          await sheet.getByRole("button", { name: labels.expand, exact: true }).tap();
          await expect(sheet.getByRole("button", { name: labels.finance, exact: true })).toHaveAttribute("aria-expanded", "true");
          await expect(sheet.getByRole("button", { name: labels.reference, exact: true })).toHaveAttribute("aria-expanded", "true");
          await contained(sheet, viewport.width, viewport.height);
          expect(await sheet.getByRole("link").count()).toBe(26);
          const metrics = await sheet.evaluate((element) => {
            const actions = Array.from(element.querySelectorAll<HTMLElement>("button, a[href]"))
              .filter((action) => action.getClientRects().length > 0)
              .map((action) => {
                const rect = action.getBoundingClientRect();
                let fullyVisible = true;
                for (let parent = action.parentElement; parent && parent !== element; parent = parent.parentElement) {
                  const overflow = getComputedStyle(parent).overflowY;
                  if (["auto", "scroll", "hidden"].includes(overflow)) {
                    const clip = parent.getBoundingClientRect();
                    if (rect.top < clip.top || rect.bottom > clip.bottom) fullyVisible = false;
                  }
                }
                return {
                  name: action.getAttribute("aria-label") || action.textContent?.trim(),
                  x: rect.x, y: rect.y, width: rect.width, height: rect.height, fullyVisible,
                  scrolling: Boolean(action.closest('[data-sidebar="content"]')),
                };
              });
            const closePairs: string[] = [];
            for (let i = 0; i < actions.length; i++) {
              for (const next of actions.slice(i + 1)) {
                const current = actions[i];
                if (!(current.scrolling && next.scrolling) && !(current.fullyVisible && next.fullyVisible)) continue;
                const xGap = Math.max(next.x - current.x - current.width, current.x - next.x - next.width);
                const yGap = Math.max(next.y - current.y - current.height, current.y - next.y - next.height);
                if ((xGap < 0 && yGap < 7.5) || (yGap < 0 && xGap < 7.5)) closePairs.push(`${current.name} / ${next.name}`);
              }
            }
            return {
              actions, closePairs, sheet: element.getBoundingClientRect().toJSON(),
              scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
            };
          });
          await testInfo.attach("navigation-geometry", { body: JSON.stringify(metrics), contentType: "application/json" });
          expect(metrics.actions.filter((action) => action.width < 47.5 || action.height < 47.5)).toEqual([]);
          expect(metrics.closePairs, "Visible adjacent actions must have at least 8px separation").toEqual([]);
          expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight + 1);
          await contained(sheet.getByRole("button", { name: labels.close, exact: true }), viewport.width, viewport.height);
          await contained(sheet.getByRole("button", { name: labels.done, exact: true }), viewport.width, viewport.height);
          if (viewport.width === 375 || (viewport.height === 320 && lang === "am" && dark)) {
            await testInfo.attach("navigation-sheet", { body: await page.screenshot(), contentType: "image/png" });
          }
          await sheet.getByRole("button", { name: labels.done, exact: true }).tap();
          await expect(sheet).toBeHidden();
          await expect(entry).toBeFocused();
          expect(await page.evaluate(() => document.cookie)).toContain("sidebar_state=false");
        });
      }
    }
  }
});

test("mobile restores header/shortcut focus, dismisses on Escape/backdrop, and reserves dragging for the handle", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await initialize(page, { collapsed: true });
  await expect(page.getByRole("button", { name: "Finance", exact: true })).toHaveAttribute("aria-expanded", "false");
  await page.setViewportSize({ width: 375, height: 812 });
  const header = page.locator('header [data-sidebar="trigger"]');
  const entry = page.locator('[data-slot="sidebar-mobile-entry"] button');
  const outside = page.getByTitle("Search (Ctrl+K)", { exact: true });
  const sheet = page.getByRole("dialog", { name: "Dream Lux", exact: true });
  await header.click();
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: english.close, exact: true }).click();
  await expect(header).toBeFocused();
  await outside.focus();
  await page.keyboard.press("Control+b");
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(outside).toBeFocused();

  await entry.click();
  await expect(sheet).toBeVisible();
  await page.locator('[data-slot="sheet-overlay"]').click({ position: { x: 4, y: 4 } });
  await expect(sheet).toBeHidden();
  await expect(entry).toBeFocused();
  await entry.click();
  await expect(sheet).toBeVisible();
  const content = (await sheet.locator('[data-sidebar="content"]').boundingBox())!;
  await page.mouse.move(content.x + content.width - 3, content.y + 70);
  await page.mouse.down();
  await page.mouse.move(content.x + content.width - 3, content.y + 170, { steps: 5 });
  await page.mouse.up();
  await expect(sheet).toBeVisible();
  const handle = sheet.locator('[data-sidebar="drag-handle"]');
  await expect(handle).toHaveCSS("touch-action", "none");
  const grip = (await handle.boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 + 90, { steps: 6 });
  await page.mouse.up();
  await expect(sheet).toBeHidden();
  await expect(entry).toBeFocused();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole("button", { name: "Finance", exact: true })).toHaveAttribute("aria-expanded", "false");
  expect(await page.evaluate(() => document.cookie)).toContain("sidebar_state=false");
});
