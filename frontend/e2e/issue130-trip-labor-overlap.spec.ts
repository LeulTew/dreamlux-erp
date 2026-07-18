import { expect, test } from "@playwright/test";
import { fulfillJson, mockAuth, mockCommonShellData, seedAuthenticatedSession } from "./helpers";

const eventId = "event-130-e2e";

test.describe("Issue 130 trip visibility, driver ownership, opex labor prereqs, and date overlap blocks", () => {
  test("Driver sees their assigned truck and logs trip with redacted cost view", async ({ page }) => {
    await seedAuthenticatedSession(page);
    // Authenticated user has full name 'Selam Bekele' and role 'DRIVER'
    await mockAuth(page, {
      permission_slugs: ["events:read", "trips:create"],
      user: {
        id: "verify-db-driver-id",
        username: "driver",
        full_name: "Selam Bekele",
        email: "selam@dreamlux.com",
        role: "DRIVER",
        role_name: "Driver",
        roles: ["DRIVER"],
      }
    });
    await mockCommonShellData(page);

    const workspace = {
      event: {
        id: eventId,
        name: "Logistics Fleet Gala",
        venue_location: "Hilton Addis",
        status: "Ongoing",
        start_date: "2026-07-10",
        end_date: "2026-07-10",
      },
      allocations: [],
      checklist: [],
      assignments: [],
      vehicleAssignments: [
        {
          id: "va-driver-selam",
          event_id: eventId,
          vehicle_id: "vehicle-1",
          plate_number: "AA-3-A11111",
          vehicle_type: "Truck",
          fuel_type: "Diesel",
          fuel_consumption_rate: 0.20,
          driver_id: "emp-2026-0002",
          driver_name: "Selam Bekele",
          is_night_shift: false,
          created_at: "2026-07-01T10:00:00.000Z",
        },
        {
          id: "va-driver-other",
          event_id: eventId,
          vehicle_id: "vehicle-2",
          plate_number: "AA-3-B22222",
          vehicle_type: "Van",
          fuel_type: "Regular",
          fuel_consumption_rate: 0.15,
          driver_id: "emp-2026-9999",
          driver_name: "Other Driver",
          is_night_shift: false,
          created_at: "2026-07-01T10:00:00.000Z",
        },
      ],
      expenses: [],
      trips: [
        {
          id: "trip-redacted",
          vehicle_assignment_id: "va-driver-selam",
          destination: "Bole Airport",
          distance_km: 15,
          fuel_liters_used: 3.0,
          plate_number: "AA-3-A11111",
          fuel_consumption_rate: 0.20,
          created_at: "2026-07-01T11:00:00.000Z",
          // fuel_cost_etb is omitted (redacted) because the driver does not have event financials read permission
        },
      ],
    };

    await page.route(`**/events/${eventId}/workspace`, (route) => fulfillJson(route, workspace));

    await page.goto(`/events/${eventId}`);
    await page.getByRole("button", { name: /Expenses & Trips/i }).click();

    // Verify driver sees only their assigned truck (wait dynamically for options to filter)
    const vehicleDropdown = page.getByRole("combobox");
    await expect(vehicleDropdown).toBeVisible();

    const optionSelam = vehicleDropdown.locator("option", { hasText: "AA-3-A11111 - Selam Bekele" });
    await expect(optionSelam).toBeAttached();

    const optionOther = vehicleDropdown.locator("option", { hasText: "AA-3-B22222 - Other Driver" });
    await expect(optionOther).not.toBeAttached();

    // Verify trip logged displays but without cost info (since cost is redacted)
    await expect(page.getByText("Bole Airport")).toBeVisible();
    await expect(page.getByText(/AA-3-A11111 \| 15 km \| 3 L/)).toBeVisible();
    await expect(page.getByText(/ETB/)).not.toBeVisible(); // Cost is hidden/redacted
  });

  test("Accountant sees clear labor generation prerequisite states", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, {
      permission_slugs: ["events:read", "expenses:write", "expenses:labor_generate"],
      user: {
        role: "ACCOUNTANT",
        role_name: "Accountant",
        roles: ["Accountant"],
      }
    });
    await mockCommonShellData(page);

    const workspace = {
      event: {
        id: eventId,
        name: "Completed Expo Gala",
        status: "Ongoing", // Starts as Ongoing
        start_date: "2026-07-10",
        end_date: "2026-07-10",
      },
      allocations: [],
      checklist: [],
      assignments: [
        {
          id: "asg-1",
          event_id: eventId,
          employee_id: "emp-1",
          employee_name: "Daniel Kebede",
          role: "Decorator",
          commission_amount: 1000,
          attended: false, // Not attended yet
        },
      ],
      vehicleAssignments: [],
      expenses: [],
      trips: [],
    };

    await page.route(`**/events/${eventId}/workspace`, (route) => fulfillJson(route, workspace));

    await page.goto(`/events/${eventId}`);
    await page.getByRole("button", { name: /Expenses & Trips/i }).click();

    // 1. Prerequisite: Event status must be Completed warning
    await expect(page.getByText("Prerequisite: Event status must be Completed to generate labor expense.")).toBeVisible();
    const generateBtn1 = page.getByRole("button", { name: /Generate Labor Expense/i });
    await expect(generateBtn1).toBeDisabled();

    // Update workspace to set event Completed, but still no attendance
    workspace.event.status = "Completed";
    await page.route(`**/events/${eventId}/workspace`, (route) => fulfillJson(route, workspace));
    await page.goto(`/events/${eventId}`);
    await page.getByRole("button", { name: /Expenses & Trips/i }).click();

    // 2. Prerequisite: No employee is marked as Attended warning
    await expect(page.getByText("Prerequisite: No employee is marked as Attended. Mark attendance in the Scheduling tab first.")).toBeVisible();
    const generateBtn2 = page.getByRole("button", { name: /Generate Labor Expense/i });
    await expect(generateBtn2).toBeDisabled();

    // Update workspace to set employee attended = true
    workspace.assignments[0].attended = true;
    await page.route(`**/events/${eventId}/workspace`, (route) => fulfillJson(route, workspace));
    await page.goto(`/events/${eventId}`);
    await page.getByRole("button", { name: /Expenses & Trips/i }).click();

    // 3. Ready state warning
    await expect(page.getByText("Ready to generate labor expense for attended employees (Total: ETB 1,000)")).toBeVisible();
    const generateBtn3 = page.getByRole("button", { name: /Generate Labor Expense/i });
    await expect(generateBtn3).toBeEnabled();
  });
});
