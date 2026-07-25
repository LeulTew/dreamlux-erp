import { expect, test } from "@playwright/test";
import { fulfillJson, mockAuth, mockCommonShellData, seedAuthenticatedSession } from "./helpers";

const EVENT_ID = "event-attendance-e2e";

// Issue #197: assigning staff schedules them. It must never assert that they showed up,
// because attendance is what creates labor expense and payroll commission liability.
function buildWorkspace(overrides: {
  status?: string;
  attended?: boolean | null;
} = {}) {
  return {
    event: {
      id: EVENT_ID,
      name: "Attendance Gala",
      client_name: "Dream Lux Client",
      venue_location: "Sheraton Addis",
      status: overrides.status ?? "Ongoing",
      start_date: "2026-07-10",
      end_date: "2026-07-10",
      contract_price: 150000,
      estimated_design_cost: 20000,
    },
    allocations: [],
    checklist: [],
    assignments: [
      {
        id: "asg-1",
        event_id: EVENT_ID,
        employee_id: "emp-1",
        employee_name: "Daniel Kebede",
        role: "Decorator",
        commission_amount: 1000,
        attended: overrides.attended ?? false,
      },
    ],
    vehicleAssignments: [],
    expenses: [],
    trips: [],
  };
}

test.describe("Issue 197 staff assignments start attendance-unverified", () => {
  test("scheduled staff show unverified, then explicit verification unlocks labor", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, {
      permissions: ["events:read", "event_assignments:write", "expenses:write", "expenses:labor_generate"],
    });
    await mockCommonShellData(page);

    // Authoritative server state. Attendance only flips when the PATCH is actually called.
    // The event starts Ongoing on purpose: completed events lock attendance for anyone
    // without events:override_completed, so the real workflow is verify-then-complete.
    let attended = false;
    let eventStatus = "Ongoing";
    let attendancePatchBody: Record<string, unknown> | null = null;

    await page.route((url) => url.pathname.endsWith(`/events/${EVENT_ID}/workspace`), (route) =>
      fulfillJson(route, buildWorkspace({ status: eventStatus, attended })),
    );

    await page.route(
      (url) => url.pathname.endsWith(`/events/${EVENT_ID}/assignments/employees/emp-1/attendance`),
      async (route) => {
        expect(route.request().method()).toBe("PATCH");
        attendancePatchBody = route.request().postDataJSON();
        attended = attendancePatchBody!.attended === true;
        await fulfillJson(route, { id: "asg-1", employee_id: "emp-1", attended });
      },
    );

    await page.goto(`/events/${EVENT_ID}`);

    // 1-3. The freshly scheduled assignment reads as unverified and the box is NOT checked.
    await page.getByRole("button", { name: /Team & Vehicles/i }).click();
    await expect(page.getByText("Daniel Kebede")).toBeVisible();
    await expect(page.getByText("Attendance unverified")).toBeVisible();
    const attendanceBox = page.getByRole("checkbox", { name: /Verify attendance Daniel Kebede/i });
    await expect(attendanceBox).not.toBeChecked();

    // 4. Verify attendance explicitly. This is the only path that sets attended = true.
    // Uses click() rather than check(): the box is fully controlled by the workspace query,
    // so its checked state only flips once the server round-trip and refetch land. That is
    // the point - the UI never optimistically shows attendance the server has not confirmed.
    await attendanceBox.click();
    await expect.poll(() => attendancePatchBody).toEqual({ attended: true });

    // 5. The row now reports verified attendance.
    await expect(page.getByText("Attended", { exact: true })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /Verify attendance Daniel Kebede/i })).toBeChecked();

    // 6. Completing the event is what makes labor generation eligible; it is now priced
    // from the verified assignment only.
    eventStatus = "Completed";
    await page.goto(`/events/${EVENT_ID}`);
    await page.getByRole("button", { name: /Expenses & Trips/i }).click();
    await expect(page.getByText("Ready to generate labor expense for attended employees (Total: ETB 1,000)")).toBeVisible();
    await expect(page.getByRole("button", { name: /Generate Labor Expense/i })).toBeEnabled();
  });

  test("labor stays blocked with an explicit reason when attendance was never verified", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, {
      permissions: ["events:read", "event_assignments:write", "expenses:write", "expenses:labor_generate"],
    });
    await mockCommonShellData(page);

    await page.route((url) => url.pathname.endsWith(`/events/${EVENT_ID}/workspace`), (route) =>
      fulfillJson(route, buildWorkspace({ status: "Completed", attended: false })),
    );

    await page.goto(`/events/${EVENT_ID}`);
    await page.getByRole("button", { name: /Expenses & Trips/i }).click();

    await expect(
      page.getByText("Prerequisite: No employee is marked as Attended. Mark attendance in the Scheduling tab first."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Generate Labor Expense/i })).toBeDisabled();
  });

  test("a read-only user sees attendance state but cannot change it", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: ["events:read"] });
    await mockCommonShellData(page);

    let attendancePatchCalls = 0;
    await page.route((url) => url.pathname.endsWith(`/events/${EVENT_ID}/workspace`), (route) =>
      fulfillJson(route, buildWorkspace()),
    );
    await page.route(
      (url) => url.pathname.endsWith(`/events/${EVENT_ID}/assignments/employees/emp-1/attendance`),
      async (route) => {
        attendancePatchCalls += 1;
        await fulfillJson(route, {});
      },
    );

    await page.goto(`/events/${EVENT_ID}`);
    await page.getByRole("button", { name: /Team & Vehicles/i }).click();

    await expect(page.getByText("Attendance unverified")).toBeVisible();
    const attendanceBox = page.getByRole("checkbox", { name: /Verify attendance Daniel Kebede/i });
    await expect(attendanceBox).toBeDisabled();
    await expect(attendanceBox).not.toBeChecked();
    expect(attendancePatchCalls).toBe(0);
  });

  test("attendance is locked once the event is completed", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: ["events:read", "event_assignments:write"] });
    await mockCommonShellData(page);

    await page.route((url) => url.pathname.endsWith(`/events/${EVENT_ID}/workspace`), (route) =>
      fulfillJson(route, buildWorkspace({ status: "Completed" })),
    );

    await page.goto(`/events/${EVENT_ID}`);
    await page.getByRole("button", { name: /Team & Vehicles/i }).click();

    await expect(page.getByRole("checkbox", { name: /Verify attendance Daniel Kebede/i })).toBeDisabled();
    await expect(page.getByText("Attendance is locked after the event is completed.")).toBeVisible();
  });
});
