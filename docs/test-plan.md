# DreamLux ERP — Non-Technical QA Blackbox Test Plan

Welcome to the QA Test Plan. This guide is written for non-technical QA testers to verify the DreamLux ERP application through the user interface. It covers step-by-step guidance across all core system modules.

---

## 1. Test Credentials

Use these default credentials to log in and verify permission boundaries:
- **CEO / Owner**: `ceo` (Password: `Password123`) — Has access to all reports, payroll, and settings.
- **Accountant**: `acc` (Password: `Password123`) — Handles expense reviews and payroll runs.
- **Inventory Manager**: `inv` (Password: `Password123`) — Manages items and location stock.
- **Operations Manager**: `ops` (Password: `Password123`) — Coordinates events, proposals, and staff assignments.
- **Driver**: `driver` (Password: `Password123`) — Can only view assigned trips and basic event workspaces.

---

## 2. Test Suites (Verification Tables)

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

### Test Suite B: Event Lifecycle & Scheduling
*Verify event proposals, creation, workflows, and resource assignments.*

| Step | Page / URL | Actions | Expected Outcome | Pass / Fail |
| :--- | :--- | :--- | :--- | :--- |
| B1 | **Create Event** | Go to `/events` (as `ops`). Click **Create Event**. Choose a customer and input event date parameters. | The event is created in `Draft` state. | |
| B2 | **Event Proposal** | Go to `/events/proposals`. Create a proposal. Link it to the event. Set the proposed budget and terms. | The proposal shows up in the proposal queue. The creator is displayed as "Proposed by [your user]". | |
| B3 | **Staff Assignment** | Open the event workspace. Locate the **Employees** assignment tab. Assign a staff member to a role. | The staff member is assigned. Try to assign the same employee to an overlapping event date; **the system blocks it**. | |
| B4 | **Trip Logistics** | Locate the **Vehicles & Trips** assignment tab. Assign a driver and vehicle. | The trip maps the driver and calculates the expected fuel expense. | |
| B5 | **Checklist** | In the workspace, add items to the event setup checklist and check them off. | The checklist tracks completion progress dynamically. | |

---

### Test Suite C: Inventory & Assets
*Verify assets storage, stock counts, low-stock alerts, and location reconciliation.*

| Step | Page / URL | Actions | Expected Outcome | Pass / Fail |
| :--- | :--- | :--- | :--- | :--- |
| C1 | **Asset Entry** | Go to `/assets`. Click **Add Item**. Fill out asset type, serial, quantity, and assign to a warehouse store location. | The asset joins the master inventory register. | |
| C2 | **Low-Stock Alert** | Locate the **Low-Stock** page. Edit an item to drop its quantity below the threshold. | The item immediately highlights in yellow with a warning badge on the Low-Stock screen. | |
| C3 | **Reconciliation** | Go to `/assets/reconcile`. Select a warehouse store location. Input a manual counted count. | The system audits physical count discrepancies and generates a log. | |

---

### Test Suite D: Finance & Payroll
*Verify salary levels, expense review, auto-labor generation, and profit calculations.*

| Step | Page / URL | Actions | Expected Outcome | Pass / Fail |
| :--- | :--- | :--- | :--- | :--- |
| D1 | **Salary Levels** | Go to `/hr/salary-levels`. Add a base level salary rate. | The rate is added. | |
| D2 | **Generate Labor** | Log in as `acc`. Open an event that has completed with verified staff attendance checks. Click **Generate Labor Expense**. | The system aggregates employee hours and records auto-calculated labor expenses. | |
| D3 | **Expense Review** | Go to `/hr/expenses/approve`. Review pending generated or manual expenses. Approve or Reject. | Approved expenses are locked. Rejections require a reason and update status. | |
| D4 | **Profit Reports** | Go to `/hr/reports/profit`. View the event metrics dashboard. | The page renders financial KPIs, proposal variances, and tracks overall net profit. | |

---

## 3. UI Aesthetics & Responsiveness Checklist

Verify these premium design rules on any device or viewport:
1. **High Contrast**: Text must be easily readable on dark and light backdrops. Accents use elegant luxury gold (`#D4AF37`).
2. **Monospace Metrics**: Large numbers and financial figures use clean monospace fonts to prevent shifting layout jitter.
3. **No Overlaps**: Shrink the browser width down to **320px** (mobile layout). The layout must collapse cleanly into a single vertical column. The sidebar must hide under a hamburger drawer or float button.
4. **Amharic Translation**: Toggle language to Amharic. Confirm labels for Reference Data sections update correctly.
