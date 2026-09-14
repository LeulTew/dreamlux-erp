import { expect, test as base } from "@playwright/test";
import { fulfillJson } from "./helpers";
import { proposalCloneSource } from "../src/__tests__/fixtures/proposal-clone";

type ProposalCreatePayload = {
  name: string;
  client_name: string;
  requested_budget: number;
  cost_breakdown: {
    team: Array<{
      label: string;
      amount: number;
      people_count: number;
      commission_per_person: number;
    }>;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isProposalCreatePayload(value: unknown): value is ProposalCreatePayload {
  return isRecord(value) && typeof value.name === "string" && typeof value.client_name === "string"
    && typeof value.requested_budget === "number" && Number.isFinite(value.requested_budget)
    && isRecord(value.cost_breakdown) && Array.isArray(value.cost_breakdown.team)
    && value.cost_breakdown.team.every((line: unknown) => isRecord(line)
      && typeof line.label === "string"
      && typeof line.amount === "number" && Number.isFinite(line.amount)
      && typeof line.people_count === "number" && Number.isFinite(line.people_count)
      && typeof line.commission_per_person === "number" && Number.isFinite(line.commission_per_person));
}

const test = base.extend<{
  proposalContract: { permissions: string[]; savedPayloads: ProposalCreatePayload[] };
}>({
  proposalContract: [async ({ context, page, baseURL }, use, testInfo) => {
    if (!baseURL || !["127.0.0.1", "localhost"].includes(new URL(baseURL).hostname)) {
      throw new Error("Proposal browser fixtures require a loopback baseURL");
    }
    const origin = new URL(baseURL).origin;
    const fixture: { permissions: string[]; savedPayloads: ProposalCreatePayload[] } = {
      permissions: ["events:proposals:write", "events:write", "reports:profit:read"],
      savedPayloads: [],
    };
    const errors: string[] = [];
    const unexpected: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    let proposal = proposalCloneSource({
      id: "proposal-e2e-107", name: "E2E Proposal 107", client_name: "Client 107",
      requested_budget: 50000, status: "Draft", service_scope_ids: [], service_scopes: [],
      requested_start_date: null, requested_end_date: null, requested_start_time: null, requested_end_time: null,
      package_design_notes: null, notes: null, approved_at: null, approved_by: null, submitted_at: null,
      cost_breakdown: {
        design: [], team: [{ label: "Waitstaff", amount: 12000, people_count: 4, commission_per_person: 3000 }], trip: [], other: [],
      },
      estimated_design_cost: 0, estimated_team_cost: 12000, estimated_trip_cost: 0, estimated_other_cost: 0,
      estimated_total_cost: 12000, estimated_net_profit: 38000, estimated_margin_percentage: 76,
    });
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
      if (request.method() === "POST" && path === "/events/proposals") {
        const payload: unknown = request.postDataJSON();
        if (!isProposalCreatePayload(payload)) {
          unexpected.push("Invalid proposal create payload");
          await route.abort("blockedbyclient");
          return;
        }
        fixture.savedPayloads.push(payload);
        proposal = { ...proposal, ...payload };
        await fulfillJson(route, { proposal });
        return;
      }
      if (request.method() === "POST" && path === "/events/proposals/proposal-e2e-107/submit") {
        await fulfillJson(route, { success: true });
        return;
      }
      const user = { id: "user-e2e", username: "phase5-e2e", full_name: "Phase 5 Reviewer", role: "REVIEWER", role_name: "Reviewer", roles: ["Reviewer"], is_active: true };
      const responses: Record<string, unknown> = {
        "/auth/me": { user },
        "/auth/permissions": { user_id: user.id, role: user.role, roles: user.roles, permission_slugs: fixture.permissions, is_superuser: false, catalog: [] },
        "/events/proposals/proposal-e2e-107": { proposal, logs: [] },
        "/event-types": [],
        "/service-scopes": { service_scopes: [] },
        "/employees": { employees: [], total: 0, page: 1, limit: 5 },
        "/assets": { items: [], total: 0, page: 1, limit: 5 },
        "/events": { events: [], total: 0, page: 1, limit: 5 },
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
      localStorage.setItem("dreamlux_pwa_install_dismissed", "1");
    });
    await use(fixture);
    await testInfo.attach("proposal-contract", { body: JSON.stringify({ errors, unexpected, savedPayloads: fixture.savedPayloads }), contentType: "application/json" });
    expect(errors, "Proposal browser runtime errors").toEqual([]);
    expect(unexpected, "Unexpected API or non-local HTTP/WebSocket requests").toEqual([]);
  }, { auto: true }],
});

test.use({ serviceWorkers: "block" });

test.describe("Issue 107 proposal commission and team totals flow", () => {
  test("creates proposal with 4 x 3000 team lines and asserts read-only amount total of 12000", async ({ page, proposalContract }) => {

    // Go to proposal intake page
    await page.goto("/events/proposals/new");
    await expect(page.locator(".animate-spin")).toHaveCount(0);

    // Fill Step 1: Basics
    await page.getByPlaceholder("e.g. Annual Charity Gala").fill("E2E Proposal 107");
    await page.getByPlaceholder("e.g. Acme Corporation").fill("Client 107");
    await page.getByPlaceholder("0.00").fill("50000");
    await page.getByPlaceholder("e.g. Grand Hyatt, Addis Ababa").fill("Addis Hall");
    await page.getByRole("button", { name: "Next", exact: true }).click();

    // Verify Estimates Page header is visible
    await expect(page.getByText("Cost Estimator")).toBeVisible();

    // Click "Add Row" for Team & Labor Estimate
    const teamSection = page.locator("div.space-y-3").filter({ has: page.locator("h4").getByText("Team & Labor Estimate") });
    await teamSection.getByRole("button", { name: "Add Row" }).click();

    // Fill People Count and Commission per Person
    const teamRow = teamSection.locator("div.grid").first();
    await teamRow.locator("input[placeholder='Label']").fill("Waitstaff");
    await teamRow.locator("input[placeholder='People Count']").fill("4");
    await teamRow.locator("input[placeholder='Commission per Person']").fill("3000");

    // Verify Amount field is read-only and displays 12000
    const amountInput = teamRow.locator("input[placeholder='Amount']");
    await expect(amountInput).toHaveValue("12000");
    await expect(amountInput).toHaveAttribute("readonly", "");

    // Verify financial summary matches calculations on desktop only
    const isMobile = (page.viewportSize()?.width || 0) < 768;
    if (!isMobile) {
      await expect(page.getByText("Live Financial Summary")).toBeVisible();
      // Budget: 50,000, Cost: 12,000, Profit: 38,000, Margin: 76%
      await expect(page.locator("span:has-text('ETB 12,000')").first()).toBeVisible();
      await expect(page.locator("span:has-text('ETB 38,000')").first()).toBeVisible();
    }

    // Go to Step 3: Review
    await page.getByRole("button", { name: "Next", exact: true }).click();

    // Verify totals in review step
    await expect(page.getByText("Review Details")).toBeVisible();

    // Click "Create Draft"
    await page.getByRole("button", { name: /create draft/i }).click();

    // Verify redirected to detail page and calculated total remains correct
    await expect(page.getByText("Proposal Details")).toBeVisible();
    await expect(page.getByText("E2E Proposal 107")).toBeVisible();
    await expect(page.getByText("Waitstaff")).toBeVisible();
    await expect(page.getByText("4 people × ETB 3000 commission")).toBeVisible();
    await expect(page.locator("span:has-text('ETB 12,000')")).toHaveCount(2); // In summary and card details

    // Verify that the payload sent to the backend has amount = 12000
    expect(proposalContract.savedPayloads).toHaveLength(1);
    const proposalSavedPayload = proposalContract.savedPayloads[0];
    if (!proposalSavedPayload) throw new Error("Expected one captured proposal create request");
    expect(proposalSavedPayload).not.toBeNull();
    expect(proposalSavedPayload.cost_breakdown.team[0].amount).toBe(12000);
    expect(proposalSavedPayload.cost_breakdown.team[0].people_count).toBe(4);
    expect(proposalSavedPayload.cost_breakdown.team[0].commission_per_person).toBe(3000);
  });

  test("keeps proposal intake and scopes available without exposing profit to a writer lacking the profit grant", async ({ page, proposalContract }) => {
    proposalContract.permissions = ["events:proposals:write", "events:write"];
    await page.goto("/events/proposals/new");
    await expect(page.getByRole("heading", { name: "New Proposal Intake", exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Service Scopes", exact: true })).toBeVisible();
    await expect(page.getByText("Live Financial Summary", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Net Profit", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Margin Risk Warning", { exact: true })).toHaveCount(0);
    expect(proposalContract.savedPayloads).toEqual([]);
  });
});
