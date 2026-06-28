# DreamLux ERP — Non-Technical QA Blackbox Test Plan

Welcome to the QA Test Plan. This guide is written for non-technical QA testers to verify the DreamLux ERP application through the user interface. It covers the whole project at a blackbox level: log in, click through the app, and record whether the visible behavior matches the expected result.

---

## 1. Test Credentials

Use these default credentials to log in and verify permission boundaries:
- **System Administrator**: `admin` (Password: `Password123`) — Has full system administration and role configuration access in dev/test seed environments.
- **CEO / Owner**: `ceo` (Password: `Password123`) — Has access to all reports, payroll, and settings.
- **Accountant**: `acc` (Password: `Password123`) — Handles expense reviews and payroll runs.
- **Inventory Manager**: `inv` (Password: `Password123`) — Manages items and location stock.
- **Inventory Controller Alias**: `inventory_user` (Password: `Password123`) — Verifies compatibility access for inventory allocation and recount workflows.
- **Operations Manager**: `ops` (Password: `Password123`) — Coordinates events, proposals, and staff assignments.
- **Event Manager**: `eventmgr` (Password: `Password123`) — Verifies event lifecycle, checklist tasks, and general expense workflows.
- **Driver**: `driver` (Password: `Password123`) — Can only view assigned trips and basic event workspaces.

---

## 2. Smoke Test Before Any Release

| Step | Area | Actions | Expected Outcome | Pass / Fail |
| :--- | :--- | :--- | :--- | :--- |
| S1 | Login | Open the app, log in as `ceo`, then log out. | Login succeeds, dashboard/sidebar loads, logout returns to login page. | |
| S2 | Navigation | Open every visible sidebar section once. | No blank pages, broken links, or unexpected Forbidden pages for `ceo`. | |
| S3 | Mobile | Resize browser to about 390px wide or use a phone. Open dashboard, events, proposals, assets, and HR pages. | Content stacks cleanly, buttons are tappable, no text overlaps. | |
| S4 | Language | Toggle Amharic and English. Visit events, assets, HR, and settings. | Main labels update and layout remains readable. | |
| S5 | Permissions | Log in as `driver`. Try events, assets, payroll, settings, and reports. | Driver sees only allowed pages; blocked pages show a clean Forbidden message. | |

---

## 3. Release / PR Coverage Map

Use this table to decide which blackbox suites matter most after a release. A release can touch more than one area, so run the listed suites plus the smoke test.

| Release / PR | Main user-facing change | QA suites to run | Special things to watch | Pass / Fail |
| :--- | :--- | :--- | :--- | :--- |
| PR #61-#71 | Permission-aware UX polish, route guards, backend access hardening, Playwright portability. | Smoke, Users/Roles, Events, Finance, Mobile/Amharic. | Forbidden pages must be clean; hidden buttons must not flash; driver must not see finance/admin actions. | |
| PR #72 | Core event lifecycle closeout and read-permission reconciliation. | Events, Scheduling, Finance, Error Handling. | Event detail/workspace should open for allowed roles; completed/locked event behavior must remain intact. | |
| PR #74-#75 | Frontend RBAC audit across proposals, profit reports, payroll, event types, and trash screens. | Users/Roles, Finance, Events, Reports. | Read-only users may view allowed data but must not see write/delete/restore buttons. | |
| PR #88 | Reference Data setup pages and sidebar grouping. | Reference Data & Settings, Users/Roles, Mobile/Amharic. | Departments, Positions, and Offices must sit under Reference Data; delete impact warnings must block active-use records. | |
| PR #89 | Proposal creator attribution and test isolation fixes. | Events/Proposals, Search/Filters, Users/Roles. | Proposal queue and detail must show **Proposed By**; deleted/missing users must show `Unknown user`, not crash. | |
| PR #91 | Seeded admin and user credential parity. | Smoke, Users/Roles, Events, Inventory, Finance, Driver BOLA. | `admin`, `driver`, `eventmgr`, and `inventory_user` must log in with `Password123`; driver must remain mapped to Selam Bekele and blocked from unrelated driver actions. | |
| Whole project regression | Any deployment to production or release candidate. | Every suite in this document. | Record browser/device, user role, and exact page where any issue occurs. | |

---

## 4. Test Suites (Verification Tables)

### Test Suite A: Reference Data & Settings (New)
*Verify operational reference data CRUD features.*

| Step | Page / URL | Actions | Expected Outcome | Pass / Fail |
| :--- | :--- | :--- | :--- | :--- |
| A1 | **Sidebar Nav** | Log in as `ceo` or `admin`. Locate the **Reference Data** collapsible section on the sidebar. Expand it. | You should see sub-links for **Departments**, **Positions**, **Offices**, **Salary Levels**, and **Event Types**. | |
| A2 | **Departments** | Go to `/settings/departments`. Enter a new department name (e.g., "Quality Control") and click **Add Department**. | The department appears in the list. The field is automatically trimmed of stray spaces. | |
| A3 | **Positions** | Go to `/settings/positions`. Edit an existing position. Change its name and save. | The position updates in the list instantly without reloading the page. | |
| A4 | **Offices** | Go to `/settings/offices`. Add a new office (e.g., "Adama Branch"). Try to set it to **Inactive**. | The branch renders with a grey "Inactive" status badge. Active offices render with green "Active" badges. | |
| A5 | **Delete Impact** | Go to `/settings/departments`. Locate a department that is currently assigned to an active employee. Click **Delete**. | A pop-up warns you and **blocks the deletion**, displaying a message listing that active employees are using it. | |
| A6 | **RBAC Limits** | Log in as `driver`. Try to navigate to `/settings/departments` or check the sidebar. | The "Reference Data" menu is hidden from the sidebar. Navigating directly redirects you to a clean **Forbidden** page. | |

---

### Test Suite B: Event Lifecycle, Proposals & Scheduling
*Verify event proposals, creation, workflows, and resource assignments.*

| Step | Page / URL | Actions | Expected Outcome | Pass / Fail |
| :--- | :--- | :--- | :--- | :--- |
| B1 | **Create Event** | Go to `/events` (as `ops`). Click **Create Event**. Choose a customer and input event date parameters. | The event is created in `Draft` state. | |
| B2 | **Proposal Queue** | Go to `/events/proposals` as `ops` or `ceo`. Review the table/cards. | Each proposal shows its name, client, budget/margin, status, and **Proposed By**. Missing users show `Unknown user`. | |
| B3 | **Create Proposal** | Click **New Proposal**, fill client, budget, dates, venue, and estimate costs. Save it. | Proposal is created and appears in the queue. Detail page shows **Proposed By** near client/status details. | |
| B4 | **Approve Proposal** | Log in as a user with approval access. Open a submitted proposal, approve it. | Status changes to Approved; detail page shows the approver when available. | |
| B5 | **Convert Proposal** | Convert an approved proposal into an event. | A linked event is created, proposal status becomes Converted, and the linked event button opens the event workspace. | |
| B6 | **Staff Assignment** | Open the event workspace. Locate the **Employees** assignment tab. Assign a staff member to a role. | Staff member is assigned. Assigning the same employee to an overlapping event date is blocked. | |
| B7 | **Vehicle/Driver Assignment** | Locate the **Vehicles & Trips** area. Assign a driver and vehicle. | Trip/vehicle assignment saves; overlapping vehicle/driver use is blocked. | |
| B8 | **Checklist** | Add event checklist items and check them off. | Checklist progress updates and remains saved after refresh. | |
| B9 | **Trash/Soft Delete** | Delete an event if the UI allows it, then check trash/recovery area if available. | Deleted records disappear from normal lists and are only shown in trash/recovery views. | |

---

### Test Suite C: Inventory & Assets
*Verify assets storage, stock counts, low-stock alerts, and location reconciliation.*

| Step | Page / URL | Actions | Expected Outcome | Pass / Fail |
| :--- | :--- | :--- | :--- | :--- |
| C1 | **Asset Entry** | Go to `/assets`. Click **Add Item**. Fill out asset type, serial, quantity, and assign to a warehouse store location. | The asset joins the master inventory register. | |
| C2 | **Low-Stock Alert** | Locate the **Low-Stock** page. Edit an item to drop its quantity below the threshold. | The item immediately highlights in yellow with a warning badge on the Low-Stock screen. | |
| C3 | **Reconciliation** | Go to `/assets/reconcile`. Select a warehouse store location. Input a manual counted count. | The system audits physical count discrepancies and generates a log. | |
| C4 | **Asset Allocation** | From an event workspace, allocate inventory to the event. Try allocating more than available. | Valid allocation saves; over-allocation is blocked with a clear message. | |
| C5 | **Asset Trash** | Move an asset to trash if allowed by your role. | Item disappears from active lists; restore/permanent delete actions obey permissions. | |

---

### Test Suite D: Finance & Payroll
*Verify salary levels, expense review, auto-labor generation, and profit calculations.*

| Step | Page / URL | Actions | Expected Outcome | Pass / Fail |
| :--- | :--- | :--- | :--- | :--- |
| D1 | **Salary Levels** | Go to `/hr/salary-levels`. Add a base level salary rate. | The rate is added. | |
| D2 | **Generate Labor** | Log in as `acc`. Open an event that has completed with verified staff attendance checks. Click **Generate Labor Expense**. | The system aggregates employee hours and records auto-calculated labor expenses. | |
| D3 | **Expense Review** | Go to `/hr/expenses/approve`. Review pending generated or manual expenses. Approve or Reject. | Approved expenses are locked. Rejections require a reason and update status. | |
| D4 | **Profit Reports** | Go to `/hr/reports/profit`. View the event metrics dashboard. | The page renders financial KPIs, proposal variances, and tracks overall net profit. | |
| D5 | **Financial Redaction** | Log in as `driver` or another non-financial user and open event pages/reports. | Financial totals, profit, payroll, and sensitive cost data are hidden or Forbidden. | |
| D6 | **Payroll Run** | Log in as `acc` or `ceo`. Create or preview a payroll run. | Payroll lines show expected employees, attendance/commission data, totals, and status. | |
| D7 | **Payroll Locking** | Finalize a payroll run if available. Try to edit finalized values. | Finalized payroll cannot be casually changed; correction flow is required if available. | |

---

### Test Suite E: Users, Roles & Permissions
*Verify that access control is understandable and cannot be bypassed through the UI.*

| Step | Page / URL | Actions | Expected Outcome | Pass / Fail |
| :--- | :--- | :--- | :--- | :--- |
| E1 | **Users** | Log in as `ceo`. Go to `/settings/users`. View users and open one user detail/edit screen. | User list loads with clear active/inactive status and role information. | |
| E2 | **Role Permissions** | Go to `/settings/permissions`. Open a role. | Permission groups are readable; dangerous/high-access permissions are clearly shown. | |
| E3 | **Read-Only User** | Log in as a lower-permission user such as `driver`. Try direct URLs: `/settings/users`, `/settings/permissions`, `/hr/reports/profit`. | Access is denied; no hidden admin content flashes on screen. | |
| E4 | **Sidebar Filtering** | Compare sidebar links for `ceo`, `ops`, `acc`, `inv`, and `driver`. | Each role sees only the modules relevant to that role. | |
| E5 | **Session Behavior** | Log out, then use the browser back button. | Protected pages do not remain usable after logout. | |
| E6 | **Seeded Credential Parity** | Log out and log in one-by-one as `admin`, `ceo`, `ops`, `acc`, `eventmgr`, `inv`, `inventory_user`, and `driver`, all with `Password123`. | Every documented dev/test user can log in. Role-specific sidebar and page access still match the user's role. | |

---

### Test Suite F: Reports, Exports & Printing
*Verify pages that produce downloadable or printable business records.*

| Step | Page / URL | Actions | Expected Outcome | Pass / Fail |
| :--- | :--- | :--- | :--- | :--- |
| F1 | **Event Export** | On `/events`, apply a search/filter and export if the button is available. | Export respects filters and does not include financial columns for unauthorized roles. | |
| F2 | **Profit Export** | On `/hr/reports/profit`, export or print a report as `ceo`/`acc`. | File/report contains visible KPIs and event rows matching the screen. | |
| F3 | **Proposal Print** | Open a proposal detail and use **Print / PDF**. | Printable view is readable and excludes navigation/sidebar clutter. | |
| F4 | **Payroll Report** | Open payroll detail/report page. | Totals are readable and match the displayed payroll run. | |

---

### Test Suite G: Search, Filters & Pagination
*Verify list pages work at realistic business scale.*

| Step | Page / URL | Actions | Expected Outcome | Pass / Fail |
| :--- | :--- | :--- | :--- | :--- |
| G1 | **Events List** | Search by client/event name. Change page if pagination appears. | Search results match the term; pagination moves between result pages without losing filters. | |
| G2 | **Proposal List** | Filter by status and sort by budget/date/margin. | Filters and sorting change the visible rows but do not hide Proposed By. | |
| G3 | **Assets List** | Search item names and switch pages. | Results remain stable and page controls are easy to use. | |
| G4 | **Expense/Payroll Lists** | Open pending expense, history, and payroll list pages. | Large lists show page controls or clear limited results; no endless unbounded table freezes the browser. | |

---

### Test Suite H: Error Handling & Data Safety
*Verify common mistakes are handled clearly.*

| Step | Page / URL | Actions | Expected Outcome | Pass / Fail |
| :--- | :--- | :--- | :--- | :--- |
| H1 | **Required Fields** | Try saving forms with required fields empty. | Form shows clear errors and does not create partial records. | |
| H2 | **Invalid Dates** | Try an event/proposal end date before the start date. | Save is blocked with a clear date error. | |
| H3 | **Invalid Phone** | Enter an obviously invalid Ethiopian phone number. | Save is blocked or phone field shows a clear error. | |
| H4 | **Double Click Save** | Double-click a create/approve/convert button quickly. | Only one record/action is created; no duplicate conversion or duplicate expense appears. | |
| H5 | **Missing User Fallback** | Open proposal records created by a deleted/missing user if test data exists. | UI shows `Unknown user`, not a crash or blank broken field. | |

---

## 5. UI Aesthetics & Responsiveness Checklist

Verify these premium design rules on any device or viewport:
1. **High Contrast**: Text must be easily readable on dark and light backdrops. Accents use elegant luxury gold (`#D4AF37`).
2. **Monospace Metrics**: Large numbers and financial figures use clean monospace fonts to prevent shifting layout jitter.
3. **No Overlaps**: Shrink the browser width down to **320px** (mobile layout). The layout must collapse cleanly into a single vertical column. The sidebar must hide under a hamburger drawer or float button.
4. **Amharic Translation**: Toggle language to Amharic. Confirm labels for Reference Data sections update correctly.

---

## 6. QA Sign-Off Table

| QA Area | Tester Name | Date | Browser / Device | Result | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Smoke test | | | | | |
| Events and proposals | | | | | |
| Inventory and assets | | | | | |
| Finance and payroll | | | | | |
| Users and permissions | | | | | |
| Reports and exports | | | | | |
| Mobile and Amharic | | | | | |
