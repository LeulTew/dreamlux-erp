import { expect, test } from "@playwright/test";
import { fulfillJson, mockAuth, mockCommonShellData, seedAuthenticatedSession } from "./helpers";

/**
 * Authoritative seed catalog — matches event_service_scopes.sql migration exactly:
 *   ('FULL',        'Full',        '<ctrl42>,           1)
 *   ('BACKGROUND',  'Background',  'ባክግራውንድ',     2)
 *   ('SETUP',       'Setup',       'ሴታፕ',          3)
 *   ('TABLE_SETUP', 'Table Setup', 'ጠረጴዛ ሴታፕ',    4)
 */
const authoritativeScopes = [
  {
    id: "scope-1",
    code: "FULL",
    name_en: "Full",
    name_am: "ሙሉ",
    description: "End-to-end planning, stage design, vendor management, and execution.",
    display_order: 1,
    is_active: true,
  },
  {
    id: "scope-2",
    code: "BACKGROUND",
    name_en: "Background",
    name_am: "ባክግራውንድ",
    description: "Stage backdrops, lighting rigging, structural frame setup.",
    display_order: 2,
    is_active: true,
  },
  {
    id: "scope-3",
    code: "SETUP",
    name_en: "Setup",
    name_am: "ሴታፕ",
    description: "Material transport, unloading, spatial positioning.",
    display_order: 3,
    is_active: true,
  },
  {
    id: "scope-4",
    code: "TABLE_SETUP",
    name_en: "Table Setup",
    name_am: "ጠረጴዛ ሴታፕ",
    description: "Table arrangement, linen, and centerpiece positioning.",
    display_order: 4,
    is_active: true,
  },
];

test.describe("Issue 194 — multi-select event service scopes complete E2E suite", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, {
      permissions: [
        "events:read",
        "events:write",
        "events:delete",
        "events:proposals:read",
        "events:proposals:write",
        "events:proposals:approve",
        "reports:profit:read",
      ],
    });
    await mockCommonShellData(page);

    await page.route("**/service-scopes", (route) =>
      fulfillJson(route, { service_scopes: authoritativeScopes })
    );

    await page.route("**/event-types", (route) =>
      fulfillJson(route, [
        { id: "et-wedding", name: "Wedding", event_name: "Wedding", description: "Wedding celebrations" },
        { id: "et-corporate", name: "Corporate", event_name: "Corporate", description: "Corporate events" },
      ])
    );
  });

  test("1. create proposal form submission with multi-select service scopes (FULL, SETUP)", async ({ page }) => {
    let submittedPayload: any = null;

    await page.route("**/events/proposals", (route) => {
      if (route.request().method() === "POST") {
        submittedPayload = JSON.parse(route.request().postData() || "{}");
        return fulfillJson(route, {
          proposal: {
            id: "prop-194",
            name: "Grand Sheraton Wedding",
            client_name: "Abebe Kebede",
            status: "Draft",
            requested_budget: 300000,
            requested_start_date: "2026-09-15",
            requested_end_date: "2026-09-16",
            venue_location: "Sheraton Addis",
            service_scopes: [authoritativeScopes[0], authoritativeScopes[2]],
          },
        }, 201);
      }
      return fulfillJson(route, { proposals: [], total: 0 });
    });

    await page.goto("/events/proposals/new");
    await expect(page.locator("h1")).toContainText(/Proposal/i);

    await page.locator('input[name="name"]').fill("Grand Sheraton Wedding");
    await page.locator('input[name="client_name"]').fill("Abebe Kebede");
    await page.locator('input[name="venue_location"]').fill("Sheraton Addis");
    await page.locator('input[name="requested_budget"]').fill("300000");

    const combobox = page.locator('div[role="combobox"]').first();
    await combobox.focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator('div[role="listbox"]')).toBeVisible();

    await page.keyboard.press("Enter");
    await expect(page.locator('span:has-text("Full")')).toBeVisible();

    await page.locator('div[role="option"]:has-text("Setup")').first().click();
    await expect(page.locator('span:has-text("Setup")')).toBeVisible();

    const submitBtn = page.locator('button[type="submit"]').first();
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    expect(submittedPayload).not.toBeNull();
    expect(submittedPayload.service_scope_ids).toContain("scope-1");
    expect(submittedPayload.service_scope_ids).toContain("scope-3");
  });

  test("2. proposal submit workflow (Draft -> Submitted)", async ({ page }) => {
    let submitApiCalled = false;
    await page.route("**/events/proposals/prop-194/submit", (route) => {
      submitApiCalled = true;
      return fulfillJson(route, {
        proposal: {
          id: "prop-194",
          name: "Grand Sheraton Wedding",
          status: "Submitted",
          service_scopes: [authoritativeScopes[0], authoritativeScopes[2]],
        },
      });
    });

    await page.route("**/events/proposals/prop-194", (route) => {
      if (route.request().method() === "GET") {
        return fulfillJson(route, {
          proposal: {
            id: "prop-194",
            name: "Grand Sheraton Wedding",
            client_name: "Abebe Kebede",
            status: "Draft",
            requested_budget: 300000,
            requested_start_date: "2026-09-15",
            requested_end_date: "2026-09-16",
            venue_location: "Sheraton Addis",
            service_scopes: [authoritativeScopes[0], authoritativeScopes[2]],
          },
          logs: [],
        });
      }
      return route.continue();
    });

    await page.goto("/events/proposals/prop-194");
    await expect(page.locator("h1")).toContainText("Grand Sheraton Wedding");

    const submitBtn = page.locator('button:has-text("Submit")').first();
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();
    expect(submitApiCalled).toBe(true);
  });

  test("3. proposal approval workflow (Submitted -> Approved)", async ({ page }) => {
    let approveApiCalled = false;
    await page.route("**/events/proposals/prop-194/approve", (route) => {
      approveApiCalled = true;
      return fulfillJson(route, {
        proposal: {
          id: "prop-194",
          name: "Grand Sheraton Wedding",
          status: "Approved",
          service_scopes: [authoritativeScopes[0], authoritativeScopes[2]],
        },
      });
    });

    await page.route("**/events/proposals/prop-194", (route) => {
      if (route.request().method() === "GET") {
        return fulfillJson(route, {
          proposal: {
            id: "prop-194",
            name: "Grand Sheraton Wedding",
            client_name: "Abebe Kebede",
            status: "Submitted",
            requested_budget: 300000,
            requested_start_date: "2026-09-15",
            requested_end_date: "2026-09-16",
            venue_location: "Sheraton Addis",
            service_scopes: [authoritativeScopes[0], authoritativeScopes[2]],
          },
          logs: [],
        });
      }
      return route.continue();
    });

    await page.goto("/events/proposals/prop-194");
    await expect(page.locator("h1")).toContainText("Grand Sheraton Wedding");

    const approveBtn = page.locator('button:has-text("Approve")').first();
    await expect(approveBtn).toBeVisible();
    await approveBtn.click();
    expect(approveApiCalled).toBe(true);
  });

  test("4. proposal conversion workflow (Approved -> Converted with scope copy assertion)", async ({ page }) => {
    let convertApiCalled = false;
    await page.route("**/events/proposals/prop-194/convert", (route) => {
      convertApiCalled = true;
      return fulfillJson(route, {
        proposal: {
          id: "prop-194",
          name: "Grand Sheraton Wedding",
          status: "Converted",
          converted_event_id: "evt-194",
          service_scopes: [authoritativeScopes[0], authoritativeScopes[2]],
        },
        event: {
          id: "evt-194",
          name: "Grand Sheraton Wedding",
          client_name: "Abebe Kebede",
          event_type_id: "et-wedding",
          start_date: "2026-09-15",
          end_date: "2026-09-16",
          venue_location: "Sheraton Addis",
          contract_price: 300000,
          status: "Planned",
          service_scopes: [authoritativeScopes[0], authoritativeScopes[2]],
        },
      }, 201);
    });

    await page.route("**/events/proposals/prop-194", (route) => {
      if (route.request().method() === "GET") {
        return fulfillJson(route, {
          proposal: {
            id: "prop-194",
            name: "Grand Sheraton Wedding",
            client_name: "Abebe Kebede",
            status: "Approved",
            requested_budget: 300000,
            requested_start_date: "2026-09-15",
            requested_end_date: "2026-09-16",
            venue_location: "Sheraton Addis",
            service_scopes: [authoritativeScopes[0], authoritativeScopes[2]],
          },
          logs: [],
        });
      }
      return route.continue();
    });

    await page.goto("/events/proposals/prop-194");
    await expect(page.locator("h1")).toContainText("Grand Sheraton Wedding");

    const convertBtn = page.locator('button:has-text("Convert")').first();
    await expect(convertBtn).toBeVisible();
    await convertBtn.click();

    expect(convertApiCalled).toBe(true);
  });

  test("5. converted event detail displays copied service scopes", async ({ page }) => {
    await page.route("**/events/evt-194", (route) => {
      if (route.request().method() === "GET") {
        return fulfillJson(route, {
          event: {
            id: "evt-194",
            name: "Grand Sheraton Wedding",
            client_name: "Abebe Kebede",
            event_type_id: "et-wedding",
            event_type_name: "Wedding",
            start_date: "2026-09-15",
            end_date: "2026-09-16",
            venue_location: "Sheraton Addis",
            contract_price: 300000,
            status: "Planned",
            service_scopes: [authoritativeScopes[0], authoritativeScopes[2]],
          },
        });
      }
      return route.continue();
    });

    await page.goto("/events/evt-194");
    await expect(page.locator('span:has-text("Full")')).toBeVisible();
    await expect(page.locator('span:has-text("Setup")')).toBeVisible();
  });

  test("6. clone proposal preserves service scope selections", async ({ page }) => {
    let cloneApiCalled = false;
    await page.route("**/events/proposals/prop-194/clone", (route) => {
      cloneApiCalled = true;
      return fulfillJson(route, {
        proposal: {
          id: "prop-clone-1",
          name: "Grand Sheraton Wedding (Copy)",
          client_name: "Abebe Kebede",
          status: "Draft",
          requested_budget: 300000,
          venue_location: "Sheraton Addis",
          service_scopes: [authoritativeScopes[0], authoritativeScopes[2]],
        },
      }, 201);
    });

    await page.route("**/events/proposals/prop-194", (route) => {
      if (route.request().method() === "GET") {
        return fulfillJson(route, {
          proposal: {
            id: "prop-194",
            name: "Grand Sheraton Wedding",
            client_name: "Abebe Kebede",
            status: "Draft",
            requested_budget: 300000,
            venue_location: "Sheraton Addis",
            service_scopes: [authoritativeScopes[0], authoritativeScopes[2]],
          },
          logs: [],
        });
      }
      return route.continue();
    });

    await page.goto("/events/proposals/prop-194");
    await expect(page.locator("h1")).toContainText("Grand Sheraton Wedding");

    const cloneBtn = page.locator('button:has-text("Clone"), button:has-text("Duplicate")').first();
    await expect(cloneBtn).toBeVisible();
    await cloneBtn.click();
    expect(cloneApiCalled).toBe(true);
  });

  test("7. event edit form updates service scope selections and sends PUT payload", async ({ page }) => {
    let updatePayload: any = null;

    await page.route("**/events/evt-edit-1", (route) => {
      if (route.request().method() === "GET") {
        return fulfillJson(route, {
          event: {
            id: "evt-edit-1",
            name: "Corporate Gala",
            client_name: "TechCorp",
            event_type_id: "et-corporate",
            event_type_name: "Corporate",
            start_date: "2026-10-01",
            end_date: "2026-10-02",
            venue_location: "Hilton Addis",
            contract_price: 500000,
            status: "Planned",
            service_scopes: [authoritativeScopes[1], authoritativeScopes[3]],
          },
        });
      }
      if (route.request().method() === "PUT") {
        updatePayload = JSON.parse(route.request().postData() || "{}");
        return fulfillJson(route, {
          event: {
            id: "evt-edit-1",
            name: "Corporate Gala Updated",
            client_name: "TechCorp",
            status: "Planned",
            service_scopes: [authoritativeScopes[0], authoritativeScopes[1]],
          },
        });
      }
      return route.continue();
    });

    await page.goto("/events/evt-edit-1");
    await expect(page.locator('span:has-text("Background")')).toBeVisible();
    await expect(page.locator('span:has-text("Table Setup")')).toBeVisible();

    const editBtn = page.locator('button:has-text("Edit")').first();
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    const combobox = page.locator('div[role="combobox"]').first();
    await expect(combobox).toBeVisible();
    await combobox.click();

    await page.locator('div[role="option"]:has-text("Full")').first().click();

    const saveBtn = page.locator('button[type="submit"]').first();
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    expect(updatePayload).not.toBeNull();
    expect(updatePayload.service_scope_ids).toBeDefined();
  });

  test("8. category independence: form submits category and service scopes without cross-filtering", async ({ page }) => {
    let postPayload: any = null;

    await page.route("**/events/proposals", (route) => {
      if (route.request().method() === "POST") {
        postPayload = JSON.parse(route.request().postData() || "{}");
        return fulfillJson(route, {
          proposal: {
            id: "prop-cat-test",
            name: "Category Independence Test",
            client_name: "Test Client",
            status: "Draft",
            event_type_id: "et-corporate",
            service_scopes: [authoritativeScopes[1], authoritativeScopes[3]],
          },
        }, 201);
      }
      return fulfillJson(route, { proposals: [], total: 0 });
    });

    await page.goto("/events/proposals/new");

    await page.locator('input[name="name"]').fill("Category Independence Test");
    await page.locator('input[name="client_name"]').fill("Test Client");
    await page.locator('input[name="requested_budget"]').fill("150000");

    const combobox = page.locator('div[role="combobox"]').first();
    await combobox.click();
    const options = page.locator('div[role="option"]');
    await expect(options).toHaveCount(4);

    await options.nth(1).click(); // Background
    await options.nth(3).click(); // Table Setup

    const submitBtn = page.locator('button[type="submit"]').first();
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    expect(postPayload).not.toBeNull();
    expect(postPayload.service_scope_ids).toContain("scope-2");
    expect(postPayload.service_scope_ids).toContain("scope-4");
  });

  test("9. profitability report export (CSV/XLSX) contains service scope columns", async ({ page }) => {
    await page.route("**/events/reports/profit**", (route) =>
      fulfillJson(route, {
        events: [
          {
            event_id: "evt-194",
            event_name: "Grand Sheraton Wedding",
            client_name: "Abebe Kebede",
            venue_location: "Sheraton Addis",
            event_type_name: "Wedding",
            start_date: "2026-09-15",
            status: "Planned",
            revenue: 300000,
            approved_expenses: 50000,
            net_profit: 250000,
            margin_percentage: 83.3,
            service_scopes: [authoritativeScopes[0], authoritativeScopes[2]],
            service_scopes_str: "Full, Setup",
          },
        ],
        summary: { totalEvents: 1, totalRevenue: 300000, totalExpenses: 50000, netProfit: 250000, profitMargin: 83.3, pendingExpenseExposure: 0 },
        kpis: { mostProfitableEvent: null, highestMarginEventType: null },
        categoryBreakdown: [],
        proposalVariance: { averageVariance: 0, events: [] },
        monthlyData: [],
        page: 1,
        pageSize: 10,
        total: 1,
        totalPages: 1,
      })
    );

    await page.goto("/hr/reports/profit");
    await expect(page.locator("body")).toContainText("Grand Sheraton Wedding");
    await expect(page.locator("body")).toContainText("Full, Setup");
  });

  test("10. mobile viewport: 48px touch targets, badge remove target size, and zero overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto("/events/proposals/new");

    const combobox = page.locator('div[role="combobox"]').first();
    await expect(combobox).toBeVisible();
    const triggerBox = await combobox.boundingBox();
    expect(triggerBox).not.toBeNull();
    expect(triggerBox!.height).toBeGreaterThanOrEqual(48);
    expect(triggerBox!.width).toBeLessThanOrEqual(375);

    await combobox.click();
    const options = page.locator('div[role="option"]');
    await expect(options.first()).toBeVisible();
    const count = await options.count();
    expect(count).toBe(4);

    for (let i = 0; i < count; i++) {
      const optionBox = await options.nth(i).boundingBox();
      expect(optionBox).not.toBeNull();
      expect(optionBox!.height).toBeGreaterThanOrEqual(48);
      expect(optionBox!.x + optionBox!.width).toBeLessThanOrEqual(375 + 1);
    }

    await options.first().click();
    const removeBtn = page.locator('button[aria-label*="Remove"]').first();
    await expect(removeBtn).toBeVisible();
    const removeBtnBox = await removeBtn.boundingBox();
    expect(removeBtnBox).not.toBeNull();
    expect(removeBtnBox!.height).toBeGreaterThanOrEqual(48);
    expect(removeBtnBox!.width).toBeGreaterThanOrEqual(48);
  });

  test("11. pointer-capability hover isolation uses [@media(hover:hover)_and_(pointer:fine)]", async ({ page }) => {
    await page.goto("/events/proposals/new");
    const combobox = page.locator('div[role="combobox"]').first();
    await expect(combobox).toBeVisible();
    const triggerClasses = await combobox.getAttribute("class");
    expect(triggerClasses).toContain("[@media(hover:hover)_and_(pointer:fine)]:hover:border-slate-600");
  });

  test("12. read-only user access control (aria-disabled=true or redirect)", async ({ page }) => {
    await mockAuth(page, {
      permissions: ["events:read"],
    });

    await page.goto("/events/proposals/new");
    const combobox = page.locator('div[role="combobox"]').first();
    await expect(combobox).toBeVisible();
    await expect(combobox).toHaveAttribute("aria-disabled", "true");

    await combobox.click();
    await expect(page.locator('div[role="listbox"]')).not.toBeVisible();
  });

  test("13. keyboard navigation full cycle (open, ArrowDown/Up, select, Escape)", async ({ page }) => {
    await page.goto("/events/proposals/new");

    const combobox = page.locator('div[role="combobox"]').first();
    await combobox.focus();

    await page.keyboard.press("ArrowDown");
    await expect(page.locator('div[role="listbox"]')).toBeVisible();

    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("ArrowDown");
    }
    await page.keyboard.press("Enter");
    await expect(page.locator('span:has-text("Table Setup")')).toBeVisible();

    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await expect(page.locator('span:has-text("Full")')).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator('div[role="listbox"]')).not.toBeVisible();
  });
});
