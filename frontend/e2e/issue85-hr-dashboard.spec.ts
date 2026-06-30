import { expect, test } from "@playwright/test";
import { fulfillJson, mockAuth, mockCommonShellData, seedAuthenticatedSession } from "./helpers";

const MOCK_EMPLOYEES = [
  {
    id: "emp-1",
    full_name: "Selam Bekele",
    employee_id: "EMP-001",
    position: "Driver",
    department: "Logistics",
    status: "active",
    contract_status: "Active",
    hire_date: "2024-01-01",
    contract_end_date: "2026-12-31",
    base_salary: 12500,
    bank_name: "CBE",
    bank_account: "1000123456789",
    profile_photo_url: "/icons/icon-192.png",
    id_card_front_url: "/icons/icon-192.png",
    id_card_back_url: "/icons/icon-192.png",
  },
  {
    id: "emp-2",
    full_name: "Almaz Tadesse",
    employee_id: "EMP-002",
    position: "Coordinator",
    department: "Operations",
    status: "active",
    contract_status: "Active",
    hire_date: "2025-06-01",
    contract_end_date: "2026-06-01",
    base_salary: 18000,
    bank_name: "",
    bank_account: "",
    profile_photo_url: "/icons/icon-192.png",
    id_card_front_url: "",
    id_card_back_url: "",
  },
  {
    id: "emp-3",
    full_name: "Yonas Alemu",
    employee_id: "EMP-003",
    position: "Helper",
    department: "Logistics",
    status: "active",
    contract_status: "Suspended",
    hire_date: "2024-01-01",
    contract_end_date: "2024-05-15",
    base_salary: 8500,
    bank_name: "Awash",
    bank_account: "987654321",
    profile_photo_url: "/icons/icon-192.png",
    id_card_front_url: "/icons/icon-192.png",
    id_card_back_url: "/icons/icon-192.png",
  }
];

test.describe("Issue 85 HR Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockCommonShellData(page);
    await page.route("http://localhost:4000/employees**", (route) => fulfillJson(route, { employees: MOCK_EMPLOYEES }));
  });

  test("dashboard displays metrics and diagnostic exceptions correctly with payroll access", async ({ page }) => {
    await mockAuth(page, { permissions: ["hr:read", "payroll:read"] });
    await page.goto("/hr");

    // Check Metrics Cards
    await expect(page.getByText("Total Workforce")).toBeVisible();
    await expect(page.getByText("3", { exact: true }).first()).toBeVisible(); // 3 employees total
    await expect(page.getByText("Staffing Readiness")).toBeVisible();
    await expect(page.getByText("Fully Documented Crew")).toBeVisible();

    // Check payroll visibility
    await expect(page.getByText("Monthly Payroll Base")).toBeVisible();
    // Default mode is Redacted, check placeholder is visible
    await expect(page.getByText("••••••").first()).toBeVisible();

    // Show/Toggle sensitive data
    await page.click("button:has-text('Show Sensitive Data')");
    await expect(page.getByText("30,500")).toBeVisible(); // Sum of active base salaries (12500+18000 = 30500)

    // Verify Exceptions Tables
    // Selam has bank info, Almaz has empty bank details
    await expect(page.getByText("Missing Bank Info")).toBeVisible();
    await expect(page.getByText("Almaz Tadesse")).toBeVisible();
    await expect(page.getByText("Upload Bank Details")).toBeVisible();

    // Almaz has no ID scan
    await page.click("button:has-text('Missing IDs')");
    await expect(page.getByText("Almaz Tadesse")).toBeVisible();
    await expect(page.getByText("Upload ID Scans")).toBeVisible();

    // Yonas has suspended contract and valid hire_date
    await page.click("button:has-text('Contract Warnings')");
    await expect(page.getByText("Yonas Alemu")).toBeVisible();
    await expect(page.getByText("Contract suspended")).toBeVisible();
  });

  test("sensitive payroll is completely redacted and lock toggling is restricted without payroll:read permission", async ({ page }) => {
    await mockAuth(page, { permissions: ["hr:read"] }); // lacks payroll:read
    await page.goto("/hr");

    await expect(page.getByText("Monthly Payroll Base")).toBeVisible();
    await expect(page.getByText("••••••").first()).toBeVisible();

    // The show button should either be disabled, hidden, or not trigger changes
    const toggleButton = page.locator("button:has-text('Show Sensitive Data'), button:has-text('Redact Sensitive Data')");
    await expect(toggleButton).toHaveCount(0); // Button is not rendered for non-payroll users
  });

  test("dashboard respects language switcher localizations", async ({ page }) => {
    await mockAuth(page, { permissions: ["hr:read", "payroll:read"] });
    await page.goto("/hr");

    // Open User Profile dropdown Menu first using the header-scoped avatar container
    await page.locator("header [aria-label='Phase 5 Reviewer profile']").click({ force: true });

    // Wait for dropdown menu options to slide and become stable
    await page.waitForTimeout(500);

    // Toggle to Amharic by clicking Language button in dropdown
    await page.locator("button:has-text('Language')").first().click({ force: true });

    // Verify translated dashboard headers
    await expect(page.getByText("የሰው ኃይል ዳሽቦርድ").first()).toBeVisible();
    await expect(page.getByText("ጠቅላላ የሰው ኃይል").first()).toBeVisible();
    await expect(page.getByText("የማስረጃ ጉድለቶች").first()).toBeVisible();
  });
});
