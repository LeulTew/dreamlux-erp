# Implementation Plan — Issue #110: Monthly Overhead & Shared Operating Expense Register

Branch: `feature/110-overhead-register` (from latest `main`, after #109 merged).

## Workbook Grounding (verified against `dream hisab sample format.xlsx`)

- `MONTHLY WECHI`: demoz (salary), nedaj (fuel), bet wechi, car rental, sticker, bet eid,
  bet supper, ahlam ekub → monthly total.
- `monthly total expense`: four blocks — Office monthly payment list (per person),
  Store monthly payment list, Shared with Koti monthly payment, Monthly rental and other
  (office rent, store rent, wifi, water and electric, bet wechi, boost) — with per-block
  totals, two grand totals, and `subtotal monthly` combining them.

## Design

1. **Table `finance_overhead_expenses`** (mirrors #109 lifecycle): id, `expense_month DATE`
   (normalized to first-of-month), `due_date DATE NULL`, `category TEXT`,
   `payee TEXT NULL` (vendor/person), `scope TEXT CHECK ('Office','Store','Shared','General')`,
   `shared_with TEXT NULL` (e.g. "Koti"), `payment_kind TEXT CHECK ('overhead','staff_payment')`,
   `employee_id UUID NULL REFERENCES employees(id)` (optional link for staff payments),
   `is_recurring BOOLEAN DEFAULT false`, amount, notes, status Pending/Approved/Rejected,
   rejected_reason, created_by/approved_by/timestamps, deleted_at. RLS + revokes.
   Indexes: `(expense_month)` and `(status, expense_month)` partial `WHERE deleted_at IS NULL`.
2. **Table `finance_overhead_month_closures`**: `month DATE PRIMARY KEY`, closed_by, closed_at.
   When a month is closed, all mutations (create/edit/delete/approve/reject) for that month
   return 409 until reopened. Close/reopen requires approve permission and is audit-logged.
3. **Payroll double-count guard**: staff payments are a distinct `payment_kind` (optionally
   linked to an employee) and the summary reports them separately from non-payroll overhead;
   actual payroll stays in `payroll_runs`. Tests assert the segregation.
4. **Categories** (Zod-validated, configurable without migration): Salary, Fuel, Car Rental,
   Office Rent, Store Rent, Wifi, Water & Electric, Marketing/Boost, Sticker, Seasonal/Ekub,
   Food, House Expense, Supplies, Other.
5. **Attachments**: deferred — the expenses upload pattern is event-specific; noted in PR.

## Permissions

`finance:overheads:read`, `finance:overheads:write`, `finance:overheads:approve` — seeded to
`accountant` (+ superusers via catalog inserts), added to permissions.ts, schema.sql, migration.

## Backend (`/finance/overheads` inside routes/finance.ts as a section or separate router file)

New file `backend/src/routes/finance-overheads.ts` mounted from index.ts at `/finance/overheads`:
- `GET /` — paginated (20/100 cap), filters: month, scope, category, status, payment_kind, search.
- `POST /` — create (write); month-closure guard; audit in-transaction.
- `PATCH /:id` — blocked on Approved and closed months; Rejected→Pending on edit; audit.
- `DELETE /:id` — soft delete; blocked on Approved/closed month; audit.
- `POST /:id/approve` | `/:id/reject` — approve permission; FOR UPDATE; closed-month guard; audit.
- `GET /summary?month=YYYY-MM` — workbook grouping: totals by scope block (Office staff,
  Store staff, Shared, Rental & Other/General), payroll-linked vs non-payroll segregation,
  approved-only totals + pending exposure, grand total + closure status.
- `POST /months/:month/close` | `/reopen` — approve permission; audit-logged.

## Frontend

`frontend/src/app/hr/finance/overheads/page.tsx`: month navigation, workbook-style summary
cards (Office / Store / Shared with Koti / Rental & Other, subtotal monthly with
staff-payment segregation), register table with CRUD, approve/reject, recurrence + scope
badges, closed-month banner + close/reopen (approver only), bottom-sheet form (scope,
payment kind, category token selectors), print, EN/AM, ForbiddenState. Sidebar "Overheads"
link gated by `finance:overheads:read`; slug added to `showHRGroup`.

## Tests

- Backend `finance-overheads.test.ts`: RBAC denial, pagination caps, create/validation,
  approved lock, closed-month lock (mutations 409), approve/reject + audit, summary math
  incl. staff/non-payroll segregation, close/reopen flow.
- Frontend vitest `overheads-ui.test.tsx`: forbidden state, summary render, role-based
  action visibility, Amharic labels, closed-month state.
- E2E `issue110-overheads.spec.ts`: accountant creates overhead → approves → closes month →
  edit blocked; unauthorized user denied. Desktop + mobile.

## Verification

Same pipeline as #109: backend bun test/lint/build, frontend vitest/lint/build, targeted
Playwright, remote Supabase migration applied + verified, senior review, PR, CI, merge,
tracking update.
