import { expect, test } from "@playwright/test";
import { fulfillJson, mockAuth, mockCommonShellData, seedAuthenticatedSession } from "./helpers";

const EVENT_ID = "event-attendance-e2e";

// Issue #197: assigning staff schedules them. It must never assert that they showed up,
// because attendance is what creates labor expense and payroll commission liability.
// Issue #203: attendance is three-state - unresolved, attended, or explicitly absent.
type AssignmentOverride = {
  id?: string;
  employee_id?: string;
  employee_name?: string;
  commission_amount?: number;
  attended?: boolean | null;
  attendance_marked_at?: string | null;
};

function assignment(over: AssignmentOverride = {}) {
  return {
    id: over.id ?? "asg-1",
    event_id: EVENT_ID,
    employee_id: over.employee_id ?? "emp-1",
    employee_name: over.employee_name ?? "Daniel Kebede",
    role: "Decorator",
    commission_amount: over.commission_amount ?? 1000,
    attended: over.attended ?? false,
    attendance_marked_at: over.attendance_marked_at ?? null,
  };
}

function buildWorkspace(overrides: { status?: string; assignments?: ReturnType<typeof assignment>[] } = {}) {
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
    assignments: overrides.assignments ?? [assignment()],
    vehicleAssignments: [],
    expenses: [],
    trips: [],
  };
}

test.describe("Issue 197/203 staff attendance must be explicitly resolved", () => {
  test("scheduled staff show unresolved, then explicit verification unlocks labor", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, {
      permissions: ["events:read", "event_assignments:write", "expenses:write", "expenses:labor_generate"],
    });
    await mockCommonShellData(page);

    // Authoritative server state. Attendance only changes when the PATCH is actually called.
    // The event starts Ongoing on purpose: completed events lock attendance for anyone
    // without events:override_completed, so the real workflow is resolve-then-complete.
    let attended = false;
    let markedAt: string | null = null;
    let eventStatus = "Ongoing";
    let attendancePatchBody: Record<string, unknown> | null = null;

    await page.route((url) => url.pathname.endsWith(`/events/${EVENT_ID}/workspace`), (route) =>
      fulfillJson(route, buildWorkspace({
        status: eventStatus,
        assignments: [assignment({ attended, attendance_marked_at: markedAt })],
      })),
    );

    await page.route(
      (url) => url.pathname.endsWith(`/events/${EVENT_ID}/assignments/employees/emp-1/attendance`),
      async (route) => {
        expect(route.request().method()).toBe("PATCH");
        attendancePatchBody = route.request().postDataJSON();
        attended = attendancePatchBody!.attended === true;
        markedAt = "2026-07-10T10:00:00.000Z";
        await fulfillJson(route, { id: "asg-1", employee_id: "emp-1", attended });
      },
    );

    await page.goto(`/events/${EVENT_ID}`);

    // 1-3. The freshly scheduled assignment is unresolved: neither option is selected.
    await page.getByRole("button", { name: /Team & Vehicles/i }).click();
    await expect(page.getByText("Daniel Kebede")).toBeVisible();
    await expect(page.getByText("Attendance unverified")).toBeVisible();
    const attendedOption = page.getByRole("radio", { name: /^Attended Daniel Kebede$/i });
    const absentOption = page.getByRole("radio", { name: /^Absent Daniel Kebede$/i });
    await expect(attendedOption).toHaveAttribute("aria-checked", "false");
    await expect(absentOption).toHaveAttribute("aria-checked", "false");

    // 4. Resolve as attended. This is the only path that sets attended = true.
    // The control is server-driven, so its state only flips once the refetch lands - the UI
    // never optimistically shows attendance the server has not confirmed.
    await attendedOption.click();
    await expect.poll(() => attendancePatchBody).toEqual({ attended: true });

    // 5. The row now reports verified attendance.
    // StatusBadge renders an outer span wrapping an inner one, so scope to the badge root.
    // assertion is about the rendered state, not the control label.
    await expect(page.locator("span").filter({ hasText: /^Attended$/ }).first()).toBeVisible();
    await expect(page.getByRole("radio", { name: /^Attended Daniel Kebede$/i })).toHaveAttribute("aria-checked", "true");

    // 6. Completing the event makes labor generation eligible at the verified total.
    eventStatus = "Completed";
    await page.goto(`/events/${EVENT_ID}`);
    await page.getByRole("button", { name: /Expenses & Trips/i }).click();
    await expect(page.getByText("Ready to generate labor expense for attended employees (Total: ETB 1,000)")).toBeVisible();
    await expect(page.getByRole("button", { name: /Generate Labor Expense/i })).toBeEnabled();
  });

  // Issue #203 regression: a genuine no-show previously left the row indistinguishable from
  // "not decided yet", which blocked event completion and labor forever.
  test("a recorded no-show resolves the row and still unlocks labor for those who attended", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, {
      permissions: ["events:read", "event_assignments:write", "expenses:write", "expenses:labor_generate"],
    });
    await mockCommonShellData(page);

    let noShowResolved = false;
    let eventStatus = "Ongoing";
    let absentPatchBody: Record<string, unknown> | null = null;

    await page.route((url) => url.pathname.endsWith(`/events/${EVENT_ID}/workspace`), (route) =>
      fulfillJson(route, buildWorkspace({
        status: eventStatus,
        assignments: [
          assignment({ attended: true, attendance_marked_at: "2026-07-10T10:00:00.000Z" }),
          assignment({
            id: "asg-2",
            employee_id: "emp-2",
            employee_name: "Sara Bekele",
            commission_amount: 400,
            attended: false,
            attendance_marked_at: noShowResolved ? "2026-07-10T10:05:00.000Z" : null,
          }),
        ],
      })),
    );

    await page.route(
      (url) => url.pathname.endsWith(`/events/${EVENT_ID}/assignments/employees/emp-2/attendance`),
      async (route) => {
        absentPatchBody = route.request().postDataJSON();
        noShowResolved = true;
        await fulfillJson(route, { id: "asg-2", employee_id: "emp-2", attended: false });
      },
    );

    await page.goto(`/events/${EVENT_ID}`);

    // Record the honest outcome while the event is still open: Sara did not show up.
    await page.getByRole("button", { name: /Team & Vehicles/i }).click();
    await expect(page.getByText("Attendance unverified")).toBeVisible();
    await page.getByRole("radio", { name: /^Absent Sara Bekele$/i }).click();
    await expect.poll(() => absentPatchBody).toEqual({ attended: false });
    await expect(page.locator("span").filter({ hasText: /^Absent$/ }).first()).toBeVisible();

    // Completing is now permitted, and labor bills only the employee who actually attended.
    eventStatus = "Completed";
    await page.goto(`/events/${EVENT_ID}`);
    await page.getByRole("button", { name: /Expenses & Trips/i }).click();
    await expect(page.getByText("Ready to generate labor expense for attended employees (Total: ETB 1,000)")).toBeVisible();
    await expect(page.getByRole("button", { name: /Generate Labor Expense/i })).toBeEnabled();
  });

  test("labor stays blocked with an explicit reason while attendance is unresolved", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, {
      permissions: ["events:read", "event_assignments:write", "expenses:write", "expenses:labor_generate"],
    });
    await mockCommonShellData(page);

    await page.route((url) => url.pathname.endsWith(`/events/${EVENT_ID}/workspace`), (route) =>
      fulfillJson(route, buildWorkspace({ status: "Completed" })),
    );

    await page.goto(`/events/${EVENT_ID}`);
    await page.getByRole("button", { name: /Expenses & Trips/i }).click();

    await expect(
      page.getByText("Prerequisite: Mark every assigned employee attended or absent before generating labor."),
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
    await expect(page.getByRole("radio", { name: /^Attended Daniel Kebede$/i })).toBeDisabled();
    await expect(page.getByRole("radio", { name: /^Absent Daniel Kebede$/i })).toBeDisabled();
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

    await expect(page.getByRole("radio", { name: /^Attended Daniel Kebede$/i })).toBeDisabled();
    await expect(page.getByRole("radio", { name: /^Absent Daniel Kebede$/i })).toBeDisabled();
    await expect(page.getByText("Attendance is locked after the event is completed.")).toBeVisible();
  });
});
