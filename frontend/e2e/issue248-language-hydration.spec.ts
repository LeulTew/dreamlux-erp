import { expect, test, type Locator, type Request } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import type { RecordListPreference, RecordListPreferencePayload } from "../src/lib/api";
import { fulfillJson } from "./helpers";

const labels = {
  en: {
    forbidden: "Forbidden: Insufficient privileges",
    back: "Back to Dashboard",
    overheads: "Overhead Register",
    empty: "No data found for the selected filter criteria.",
    add: "Add Expense",
  },
  am: {
    forbidden: "ክልክል ነው: በቂ ፈቃድ የለዎትም",
    back: "ወደ ዳሽቦርድ ተመለስ",
    overheads: "የወጪ መዝገብ",
    empty: "ለተመረጡት ማጣሪያዎች ምንም ውሂብ አልተገኘም።",
    add: "ወጪ መዝግብ",
  },
};

const user = {
  id: "synthetic-language-248",
  username: "synthetic-language",
  full_name: "Synthetic Language Reviewer",
  role: "REVIEWER",
  role_name: "Reviewer",
  roles: ["Reviewer"],
  is_active: true,
};

for (const lang of ["am", "en"] as const) {
  test.describe(`Issue 248 cold saved ${lang}`, () => {
    test.use({
      serviceWorkers: "allow",
      storageState: async ({ baseURL }, provideState) => {
        if (!baseURL || !["127.0.0.1", "localhost"].includes(new URL(baseURL).hostname)) {
          throw new Error("Language hydration regression requires an owned loopback app");
        }
        await provideState({
          cookies: [],
          origins: [{
            origin: new URL(baseURL).origin,
            localStorage: [
              { name: "lang", value: lang },
              { name: "user", value: JSON.stringify(user) },
            ],
          }],
        });
      },
    });

    test("hydrates overheads, synchronizes toggles, and preserves permissions", async ({ page, context, baseURL, isMobile }, testInfo) => {
      if (!baseURL) throw new Error("The local app baseURL is required");
      const origin = new URL(baseURL).origin;
      const viewport = isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
      await page.setViewportSize(viewport);
      const text = labels[lang];
      const other = labels[lang === "am" ? "en" : "am"];
      const errors: string[] = [];
      const warnings: string[] = [];
      const unexpectedRequests: string[] = [];
      const financeReads: string[] = [];
      const preferenceWrites: string[] = [];
      const completedPhases: string[] = [];
      const sockets: string[] = [];
      let preference: RecordListPreference | null = null;
      const successfulRscRequests = new WeakSet<Request>();
      const failedRequests: Array<{
        url: string; error: string; method: string; resourceType: string;
        rsc: string | undefined; prefetch: string | undefined;
        receivedRsc: boolean; prefetchCancellation: boolean;
      }> = [];
      let permissionRequests = 0;
      let allowFinanceRead = true;
      const { promise: permissionsReady, resolve: releasePermissions } = Promise.withResolvers<void>();

      page.on("pageerror", (error) => errors.push(error.message));
      context.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
        if (message.type() === "warning") warnings.push(message.text());
      });
      context.on("requestfailed", (request) => {
        const url = new URL(request.url());
        const error = request.failure()?.errorText ?? "Unknown request failure";
        const headers = request.headers();
        const receivedRsc = successfulRscRequests.has(request);
        const prefetchCancellation = request.method() === "GET" && request.resourceType() === "fetch"
          && url.origin === origin && !url.pathname.startsWith("/api/")
          && headers.rsc === "1" && headers["next-router-prefetch"] === "1"
          && receivedRsc && error === "net::ERR_ABORTED";
        failedRequests.push({
          url: request.url(), error, method: request.method(), resourceType: request.resourceType(),
          rsc: headers.rsc, prefetch: headers["next-router-prefetch"], receivedRsc, prefetchCancellation,
        });
        // Retain successful, header-marked prefetch cancellations without hiding failures.
        if (!prefetchCancellation) errors.push(`${request.method()} ${request.url()}: ${error}`);
      });
      context.on("response", (response) => {
        if (response.status() === 200 && response.headers()["content-type"]?.startsWith("text/x-component")) {
          successfulRscRequests.add(response.request());
        }
        if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
      });
      await context.routeWebSocket("**/*", (socket) => {
        const url = new URL(socket.url());
        sockets.push(socket.url());
        if (url.origin === origin.replace("http:", "ws:") && url.pathname === "/_next/webpack-hmr") {
          socket.connectToServer();
          return;
        }
        if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/realtime/v1/websocket") {
          unexpectedRequests.push(`WebSocket ${url.origin}${url.pathname}`);
          void socket.close();
          return;
        }
        socket.onMessage((message) => {
          const [joinRef, ref, topic, event, payload] = JSON.parse(message.toString()) as [
            string | null, string, string, string,
            { config?: { postgres_changes?: Record<string, unknown>[] } },
          ];
          if (!["phx_join", "phx_leave", "heartbeat", "access_token"].includes(event)) {
            unexpectedRequests.push(`Realtime event ${event}`);
            return;
          }
          const response = event === "phx_join"
            ? { postgres_changes: (payload.config?.postgres_changes ?? []).map((change, id) => ({ ...change, id })) }
            : {};
          socket.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response }]));
        });
      });
      await context.route((url) => url.origin !== origin || url.pathname.startsWith("/api/"), async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin) {
          unexpectedRequests.push(`${request.method()} ${request.url()}`);
          await route.abort("blockedbyclient");
          return;
        }
        if (url.pathname === "/api/auth/permissions" && request.method() === "GET") {
          permissionRequests += 1;
          await permissionsReady;
          await fulfillJson(route, {
            user_id: user.id, role: user.role, roles: user.roles, is_superuser: false, catalog: [],
            permission_slugs: allowFinanceRead ? ["hr:read", "finance:overheads:read"] : ["hr:read"],
          });
          return;
        }
        if (url.pathname === "/api/finance/overheads" && request.method() === "GET") {
          financeReads.push("ledger");
          await fulfillJson(route, { overheads: [], total: 0, page: 1, limit: 25, totalPages: 1 });
          return;
        }
        if (url.pathname === "/api/finance/overheads/summary" && request.method() === "GET") {
          financeReads.push("summary");
          await fulfillJson(route, {
            month: url.searchParams.get("month"), closed: false, closure: null,
            blocks: { officeStaff: 0, storeStaff: 0, shared: 0, rentalAndOther: 0, grandOfficeStore: 0, grandSharedRental: 0 },
            totals: { subtotalMonthly: 0, staffPayments: 0, nonPayrollOverhead: 0, pendingExposure: 0, pendingCount: 0 },
            byCategory: [],
          });
          return;
        }
        if (url.pathname === "/api/api/preferences/record-list/overheads") {
          if (request.method() === "GET") {
            await fulfillJson(route, { preference });
            return;
          }
          if (request.method() === "PUT") {
            const payload: RecordListPreferencePayload = request.postDataJSON();
            preference = {
              record_type: "overheads", sort: payload.sort ?? null, filters: payload.filters ?? {},
              page_size: payload.pageSize ?? null, visible_columns: payload.visibleColumns ?? [],
              density: payload.density ?? null, active_tab: payload.activeTab ?? null,
              updated_at: "2026-09-17T00:00:00Z",
            };
            preferenceWrites.push("overheads");
            await fulfillJson(route, { preference });
            return;
          }
        }
        const fixtures: Record<string, unknown> = {
          "/api/auth/me": { user },
          "/api/settings/public": { company_name: "Dream Lux ERP" },
          "/api/api/notifications": { notifications: [], total: 0 },
          "/api/api/notifications/unread-count": { unread_count: 0 },
        };
        if (request.method() === "GET" && Object.prototype.hasOwnProperty.call(fixtures, url.pathname)) {
          await fulfillJson(route, fixtures[url.pathname]);
          return;
        }
        unexpectedRequests.push(`${request.method()} ${request.url()}`);
        await route.abort("blockedbyclient");
      });
      const capture = async (name: string) => {
        const path = testInfo.outputPath(`${name}.png`);
        await page.screenshot({ path });
        await testInfo.attach(name, { path, contentType: "image/png" });
      };
      const activate = (locator: Locator) => isMobile ? locator.tap() : locator.click();
      try {
        const storage = await context.storageState();
        expect(storage.origins.find((entry) => entry.origin === origin)?.localStorage)
          .toContainEqual({ name: "lang", value: lang });
        const response = await page.goto("/hr/finance/overheads", { waitUntil: "domcontentloaded" });
        if (!response) throw new Error("The cold app document did not respond");
        expect(response.status()).toBe(200);
        expect(response.headers()["content-type"]).toContain("text/html");
        const serverHeading = await page.evaluate((html) =>
          new DOMParser().parseFromString(html, "text/html").querySelector("h2")?.textContent,
        await response.text());
        expect(serverHeading).toBe(labels.en.forbidden);
        completedPhases.push("english-server-document");

        // Overheads renders the real ForbiddenState before permissions, not a Skeleton.
        await expect.poll(() => permissionRequests).toBeGreaterThan(0);
        await expect(page.getByRole("heading", { name: text.forbidden, exact: true })).toBeVisible();
        expect(await page.evaluate(() => localStorage.getItem("lang"))).toBe(lang);
        expect(financeReads).toEqual([]);
        await page.evaluate(() => document.fonts.ready);
        expect(await page.evaluate(() => document.documentElement.clientWidth)).toBe(viewport.width);
        await capture("cold-pre-permission");
        expect(errors, "Cold SSR hydration must not recover from a mismatch").toEqual([]);
        completedPhases.push("saved-locale-hydration");

        releasePermissions();
        const heading = page.getByRole("heading", { name: text.overheads, exact: true });
        await expect(heading).toBeVisible();
        await expect(page.getByText(text.empty, { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: text.add, exact: true })).toBeDisabled();
        expect(financeReads).toEqual(expect.arrayContaining(["ledger", "summary"]));
        await expect.poll(() => preferenceWrites).toContain("overheads");
        await capture("saved-locale-register");
        completedPhases.push("read-only-register");

        await activate(page.locator('header [aria-label="Synthetic Language Reviewer profile"]'));
        const languageButton = page.getByRole("button", { name: /^(EN Language English|አማ ቋንቋ አማርኛ)$/ });
        await activate(languageButton);
        await expect(page.getByRole("heading", { name: other.overheads, exact: true })).toBeVisible();
        expect(await page.evaluate(() => localStorage.getItem("lang"))).toBe(lang === "am" ? "en" : "am");
        await activate(languageButton);
        await expect(heading).toBeVisible();
        expect(await page.evaluate(() => localStorage.getItem("lang"))).toBe(lang);
        completedPhases.push("both-toggle-directions");

        await page.waitForLoadState("networkidle");
        allowFinanceRead = false;
        const readCount = financeReads.length;
        const deniedPermissions = page.waitForResponse((reply) =>
          new URL(reply.url()).pathname === "/api/auth/permissions" && reply.status() === 200);
        await page.reload({ waitUntil: "domcontentloaded" });
        await deniedPermissions;
        await expect(page.getByRole("heading", { name: text.forbidden, exact: true })).toBeVisible();
        await page.waitForLoadState("networkidle");
        await expect(page.getByRole("heading", { name: text.overheads, exact: true })).toHaveCount(0);
        expect(financeReads).toHaveLength(readCount);
        if (isMobile) await page.setViewportSize({ width: 320, height: 844 });
        const back = page.getByRole("button", { name: text.back, exact: true });
        await expect(back).toBeVisible();
        await expect(back).toBeEnabled();
        const box = await back.boundingBox();
        if (!box) throw new Error("The denied-state navigation action has no rendered bounds");
        expect(box.height).toBeGreaterThanOrEqual(48);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(isMobile ? 320 : viewport.width);
        await capture("denied-reload");
        expect(await page.evaluate(() => localStorage.getItem("lang"))).toBe(lang);
        completedPhases.push("denied-reload");
      } finally {
        releasePermissions();
        const diagnosticsPath = testInfo.outputPath("browser-diagnostics.json");
        await writeFile(diagnosticsPath, JSON.stringify({
          lang, viewport, completedPhases, permissionRequests, financeReads, preferenceWrites,
          errors, warnings, unexpectedRequests, failedRequests, sockets,
          serviceWorkers: context.serviceWorkers().map((worker) => worker.url()),
        }, null, 2));
        await testInfo.attach("browser-diagnostics", { path: diagnosticsPath, contentType: "application/json" });
        expect.soft(errors, "No framework, app, hydration, or network errors").toEqual([]);
        expect.soft(warnings, "Browser warnings must be investigated, not filtered").toEqual([]);
        expect.soft(unexpectedRequests, "Every API and realtime request must use an explicit local fixture").toEqual([]);
      }
    });
  });
}
