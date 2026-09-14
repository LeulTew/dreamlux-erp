import { expect, test as base } from "@playwright/test";
import { fulfillJson } from "./helpers";

const test = base.extend<{ pwaContract: { permissions: string[] } }>({
  pwaContract: [async ({ context, page, baseURL }, use, testInfo) => {
    if (!baseURL || !["127.0.0.1", "localhost"].includes(new URL(baseURL).hostname)) {
      throw new Error("PWA browser fixtures require a loopback baseURL");
    }
    const origin = new URL(baseURL).origin;
    const fixture = { permissions: ["events:read"] };
    const errors: string[] = [];
    const unexpected: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await context.routeWebSocket("**/*", (socket) => {
      const url = new URL(socket.url());
      if (url.origin === origin.replace(/^http/, "ws") && url.pathname === "/_next/webpack-hmr") {
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
          string | null, string, string, string, { config?: { postgres_changes?: Record<string, unknown>[] } },
        ];
        if (!["phx_join", "phx_leave", "heartbeat", "access_token"].includes(event)) {
          unexpected.push(`Realtime event ${event}`);
          return;
        }
        socket.send(JSON.stringify([joinRef, ref, topic, "phx_reply", {
          status: "ok",
          response: event === "phx_join"
            ? { postgres_changes: (payload.config?.postgres_changes ?? []).map((change, id) => ({ ...change, id })) }
            : {},
        }]));
      });
    });
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin) {
        unexpected.push(`${request.method()} ${url.origin}${url.pathname}`);
        await route.abort("blockedbyclient");
        return;
      }
      if (!url.pathname.startsWith("/api/")) return route.continue();
      const path = url.pathname.slice("/api".length);
      const user = { id: "user-e2e", username: "phase5-e2e", full_name: "Phase 5 Reviewer", role: "REVIEWER", role_name: "Reviewer", roles: ["Reviewer"], is_active: true };
      if (["/api/preferences/record-list/events", "/api/preferences/record-list/payroll"].includes(path)
        && ["GET", "PUT"].includes(request.method())) {
        await fulfillJson(route, { preference: {
          record_type: path.split("/").at(-1), sort: null, filters: {}, page_size: null,
          visible_columns: [], density: null, active_tab: null, updated_at: null,
        } });
        return;
      }
      const responses: Record<string, unknown> = {
        "/auth/me": { user },
        "/auth/permissions": { user_id: user.id, role: user.role, roles: user.roles, permission_slugs: fixture.permissions, is_superuser: false, catalog: [] },
        "/events": { events: [], total: 0, page: 1, limit: 5 },
        "/events/saved-views": { savedViews: [] },
        "/employees": { employees: [], total: 0, page: 1, limit: 5 },
        "/assets": { items: [], total: 0, page: 1, limit: 5 },
        "/salary-levels": [],
        "/payroll/runs": [],
        "/api/notifications": { notifications: [], total: 0 },
        "/api/notifications/unread-count": { count: 0 },
      };
      if (request.method() === "GET" && Object.prototype.hasOwnProperty.call(responses, path)) {
        await fulfillJson(route, responses[path]);
        return;
      }
      unexpected.push(`${request.method()} ${path}`);
      await route.abort("blockedbyclient");
    });
    await page.addInitScript(() => {
      localStorage.setItem("lang", "en");
      localStorage.setItem("theme", "light");
      localStorage.setItem("user", JSON.stringify({ full_name: "Phase 5 Reviewer", role_name: "Reviewer" }));
    });
    await use(fixture);
    await testInfo.attach("pwa-contract", { body: JSON.stringify({ errors, unexpected }), contentType: "application/json" });
    expect(errors, "PWA browser runtime errors").toEqual([]);
    expect(unexpected, "Unexpected API or non-local HTTP/WebSocket requests").toEqual([]);
  }, { auto: true }],
});

test.use({ serviceWorkers: "block" });

test.describe("Issue 84 PWA and offline shell", () => {
  test("manifest is exposed and the install pre-prompt appears after browser event", async ({ page }) => {
    const manifestResponse = await page.goto("/manifest.webmanifest");
    if (!manifestResponse) throw new Error("The manifest request did not return a response");
    expect(manifestResponse.ok()).toBeTruthy();
    const manifest = await manifestResponse.json();
    expect(manifest.name).toBe("Dream Lux ERP");
    expect(manifest.display).toBe("standalone");

    await page.goto("/events");
    await expect(page.locator('[data-slot="sidebar-inset"]')).toBeVisible();
    await expect(page.locator(".animate-spin")).toHaveCount(0);
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

  test("payroll reminders do not auto-request notification permission on shell mount", async ({ page, pwaContract }) => {
    pwaContract.permissions = ["payroll:read"];

    await page.addInitScript(() => {
      const requestPermission = (): Promise<NotificationPermission> => Promise.resolve("granted");
      const probe = window as typeof window & { __pwaPermissionCalls: number };
      probe.__pwaPermissionCalls = 0;
      Object.defineProperty(window, "Notification", {
        configurable: true,
        value: {
          permission: "default",
          requestPermission: () => {
            probe.__pwaPermissionCalls++;
            return requestPermission();
          },
        },
      });
    });

    await page.goto("/hr/payments");
    await expect(page.locator('[data-slot="sidebar-inset"]')).toBeVisible();
    await expect(page.locator(".animate-spin")).toHaveCount(0);
    await expect(page.getByText(/notification center/i).first()).toHaveCount(0);

    const calls = await page.evaluate(() => (window as typeof window & { __pwaPermissionCalls?: number }).__pwaPermissionCalls);
    expect(calls).toBe(0);
  });
});
