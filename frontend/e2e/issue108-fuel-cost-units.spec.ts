import { expect, test } from "@playwright/test";
import { fulfillJson, mockAuth, mockCommonShellData, seedAuthenticatedSession } from "./helpers";

const eventId = "event-fuel-e2e";

test.describe("Issue 108 fuel cost unit flow", () => {
  test("logs a trip with 12 km, 0.22 L/km, and 169 ETB/L as ETB 446.16", async ({ page }) => {
    page.on("console", (msg) => console.log("BROWSER CONSOLE:", msg.text()));
    page.on("requestfailed", (request) => console.log("REQUEST FAILED:", request.url(), request.failure()?.errorText));

    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: ["events:read", "trips:create", "expenses:approve", "reports:profit:read"] });
    await mockCommonShellData(page);

    let tripLogged = false;
    let postedPayload: Record<string, unknown> | null = null;

    const workspace = () => ({
      event: {
        id: eventId,
        name: "Fuel Unit Gala",
        client_name: "Dream Lux Client",
        venue_location: "Sheraton Addis",
        status: "Ongoing",
        start_date: "2026-07-10",
        end_date: "2026-07-10",
        contract_price: 150000,
        estimated_design_cost: 20000,
      },
      allocations: [],
      checklist: [],
      assignments: [],
      vehicleAssignments: [
        {
          id: "va-fuel",
          event_id: eventId,
          vehicle_id: "vehicle-fuel",
          plate_number: "AA-3-B98765",
          vehicle_type: "Truck",
          fuel_type: "Diesel",
          fuel_consumption_rate: 0.22,
          driver_id: "driver-1",
          driver_name: "Driver Joe",
          is_night_shift: false,
          created_at: "2026-07-01T10:00:00.000Z",
        },
      ],
      expenses: tripLogged
        ? [
            {
              id: "expense-fuel",
              event_id: eventId,
              category: "Fuel",
              amount: 446.16,
              description: "Fuel for Friendship Hotel (12 km, 0.22 L/km, 169 ETB/L)",
              status: "Pending",
              created_at: "2026-07-01T11:00:00.000Z",
            },
          ]
        : [],
      trips: tripLogged
        ? [
            {
              id: "trip-fuel",
              vehicle_assignment_id: "va-fuel",
              destination: "Friendship Hotel",
              distance_km: 12,
              fuel_liters_used: 2.64,
              fuel_cost_etb: 446.16,
              plate_number: "AA-3-B98765",
              fuel_consumption_rate: 0.22,
              created_at: "2026-07-01T11:00:00.000Z",
            },
          ]
        : [],
    });

    await page.route(`http://localhost:4000/events/${eventId}/workspace`, (route) => fulfillJson(route, workspace()));
    await page.route(`http://localhost:4000/events/${eventId}/trips`, async (route) => {
      postedPayload = route.request().postDataJSON() as Record<string, unknown>;
      tripLogged = true;
      await fulfillJson(route, {
        trip: workspace().trips[0],
        expense: workspace().expenses[0],
        fuel_liters_used: 2.64,
        fuel_cost_etb: 446.16,
        fuel_consumption_unit: "L/km",
      }, 201);
    });
    await page.route("http://localhost:4000/events/expenses/pending**", (route) =>
      fulfillJson(route, {
        data: workspace().expenses.map((expense) => ({
          ...expense,
          event_name: "Fuel Unit Gala",
          submitted_by_name: "Driver Joe",
        })),
        page: 1,
        pageSize: 10,
        total: workspace().expenses.length,
        totalPages: 1,
      }),
    );

    await page.goto(`/events/${eventId}`);
    await expect(page.locator(".animate-spin")).toHaveCount(0);
    await page.getByRole("button", { name: /Expenses & Trips/i }).click();
    await page.getByRole("combobox").selectOption("va-fuel");
    await page.getByPlaceholder("Destination").fill("Friendship Hotel");
    await page.getByPlaceholder("Distance (km)").fill("12");
    await page.getByPlaceholder("Fuel Price").fill("169");

    await expect(page.getByText("ETB 446.16", { exact: true })).toBeVisible();
    await expect(page.getByText("0.22 L/km", { exact: true })).toBeVisible();
    await expect(page.getByText(/12 km x 0.22 L\/km = 2.64 L; 2.64 L x 169 ETB\/L = ETB 446.16/)).toBeVisible();

    await page.getByRole("button", { name: /Log Trip/i }).click();
    await expect(page.getByText("Fuel for Friendship Hotel (12 km, 0.22 L/km, 169 ETB/L)")).toBeVisible();
    await expect(page.getByText(/AA-3-B98765 \| 12 km \| 2.64 L \| ETB 446.16/)).toBeVisible();

    expect(postedPayload).toEqual({
      vehicle_assignment_id: "va-fuel",
      destination: "Friendship Hotel",
      distance_km: 12,
      fuel_price_etb: 169,
    });

    await page.goto("/hr/expenses/approve");
    await expect(page.getByText("Fuel for Friendship Hotel (12 km, 0.22 L/km, 169 ETB/L)")).toBeVisible();
    await expect(page.getByText("ETB 446.16", { exact: true })).toBeVisible();
  });
});
