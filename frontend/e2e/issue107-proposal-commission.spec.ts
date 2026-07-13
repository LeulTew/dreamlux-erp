import { expect, test } from "@playwright/test";
import { fulfillJson, mockAuth, mockCommonShellData, seedAuthenticatedSession } from "./helpers";

type ProposalCreatePayload = {
  name: string;
  client_name: string;
  requested_budget: number;
  cost_breakdown: {
    team: Array<{
      amount: number;
      people_count: number;
      commission_per_person: number;
    }>;
  };
};

test.describe("Issue 107 proposal commission and team totals flow", () => {
  test("creates proposal with 4 x 3000 team lines and asserts read-only amount total of 12000", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: ["events:proposals:write", "events:write"] });
    await mockCommonShellData(page);

    let proposalSavedPayload: ProposalCreatePayload | null = null;

    // Mock proposal API calls
    await page.route("http://localhost:4000/events/proposals", async (route) => {
      if (route.request().method() === "POST") {
        proposalSavedPayload = route.request().postDataJSON() as ProposalCreatePayload;
        await fulfillJson(route, {
          proposal: {
            id: "proposal-e2e-107",
            name: proposalSavedPayload.name,
            client_name: proposalSavedPayload.client_name,
            requested_budget: proposalSavedPayload.requested_budget,
            status: "Draft",
            cost_breakdown: proposalSavedPayload.cost_breakdown,
            estimated_design_cost: 0,
            estimated_team_cost: 12000,
            estimated_trip_cost: 0,
            estimated_other_cost: 0,
            estimated_total_cost: 12000,
            estimated_net_profit: 38000,
            estimated_margin_percentage: 76,
          },
        });
        return;
      }

      await route.fallback();
    });

    await page.route("http://localhost:4000/events/proposals/proposal-e2e-107", (route) =>
      fulfillJson(route, {
        proposal: {
          id: "proposal-e2e-107",
          name: "E2E Proposal 107",
          client_name: "Client 107",
          requested_budget: 50000,
          status: "Draft",
          cost_breakdown: {
            design: [],
            team: [{ label: "Waitstaff", amount: 12000, people_count: 4, commission_per_person: 3000 }],
            trip: [],
            other: [],
          },
          estimated_design_cost: 0,
          estimated_team_cost: 12000,
          estimated_trip_cost: 0,
          estimated_other_cost: 0,
          estimated_total_cost: 12000,
          estimated_net_profit: 38000,
          estimated_margin_percentage: 76,
        },
        logs: [],
      }),
    );

    await page.route("http://localhost:4000/events/proposals/proposal-e2e-107/submit", (route) =>
      fulfillJson(route, { success: true }),
    );

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
    expect(proposalSavedPayload).not.toBeNull();
    expect(proposalSavedPayload.cost_breakdown.team[0].amount).toBe(12000);
    expect(proposalSavedPayload.cost_breakdown.team[0].people_count).toBe(4);
    expect(proposalSavedPayload.cost_breakdown.team[0].commission_per_person).toBe(3000);
  });
});
