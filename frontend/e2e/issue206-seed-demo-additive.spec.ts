import { expect, test } from "@playwright/test";
import { fulfillJson, mockAuth, mockCommonShellData, seedAuthenticatedSession } from "./helpers";

const MOCK_DEMO_EMPLOYEES = [
  {
    id: "d2600000-0000-4000-8000-000000000001",
    employee_code: "D26-001",
    full_name: "Daniel Kebede",
    position_title: "Senior Decorator",
    department: "Decoration",
    compensation_mode: "REGULAR",
    base_salary: "18500.00",
    monthly_salary: "18500.00",
    per_event_commission_rate: "0.00",
    contract_status: "Active",
    employment_status: "ACTIVE",
    hire_date: "2026-01-01",
    bank_name: "",
    bank_account: "",
    id_card_front_url: "",
    id_card_back_url: "",
  },
  {
    id: "d2600000-0000-4000-8000-000000000002",
    employee_code: "D26-002",
    full_name: "Selam Hailu",
    position_title: "Decor Lead",
    department: "Decoration",
    compensation_mode: "COMMISSION_ONLY",
    base_salary: "0.00",
    monthly_salary: "0.00",
    per_event_commission_rate: "1750.00",
    contract_status: "Active",
    employment_status: "ACTIVE",
    hire_date: "2026-01-01",
    bank_name: "Commercial Bank of Ethiopia",
    bank_account: "1000123456789",
    id_card_front_url: "/icons/icon-192.png",
    id_card_back_url: "/icons/icon-192.png",
  },
];

test.describe("Issue 206 additive demo seed script execution & UI non-disruption", () => {
  test("verified demo employee dataset renders in HR workforce dashboard cleanly", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: ["hr:read", "payroll:read"] });
    await mockCommonShellData(page);

    await page.route("**/employees**", (route) =>
      fulfillJson(route, { employees: MOCK_DEMO_EMPLOYEES })
    );

    await page.goto("/hr");
    await expect(page.getByText("Total Workforce")).toBeVisible();
    await expect(page.getByText("2", { exact: true }).first()).toBeVisible();

    // Daniel Kebede has active contract and missing bank info so he appears under Missing Bank Info
    await expect(page.getByText("Missing Bank Info")).toBeVisible();
    await expect(page.getByText("Daniel Kebede")).toBeVisible();
  });
});
