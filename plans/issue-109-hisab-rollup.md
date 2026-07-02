# Implementation Plan — Issue #109: Weekly/Monthly Hisab Rollup + Non-Event Operational Expenses

Branch: `feature/109-hisab-rollup` (from latest `main`).

## Goal

Mirror the workbook `HISAB WEEKLY MONTHLY` structure as a first-class finance module:
weekly/monthly period rollups combining (a) per-event approved expense category breakdowns +
income + profit pulled from existing `events`/`expenses` data, and (b) a new non-event
operational expense ledger with CRUD, approval/locking, search, filters, audit, export/print.

## Design Decisions

1. **Live rollup, no snapshot/period tables.** The issue *suggests* `finance_periods` +
   `finance_hisab_snapshots`, but the existing profit-reports module computes financial math
   live from approved rows (single source of truth, zero duplicate-counting risk). Periods
   are derived buckets (`date_trunc('week'|'month', date)`), so a periods table adds sync
   burden without value. Only one new table is required.
2. **New table `finance_operational_expenses`** (soft-delete, status Pending/Approved/Rejected
   mirroring `expenses`), RLS-enabled + anon/authenticated revoked per project pattern.
3. **Category buckets.** Workbook event categories: transport, rental, labour, other.
   Mapping from `expenses.category`: `Transportation`+`Fuel` → transport, `Equipment Rental`
   → rental, `Labor` → labour, `Consumables`/`Other` → other. Non-event operational categories
   (validated in Zod, not DB CHECK, so the list is configurable without migration):
   `Office Lunch`, `Lunch`, `Transport`, `Rental`, `Labour`, `Utilities`, `Supplies`,
   `Maintenance`, `Other`.
4. **Approved-only math.** Rollups sum only `status = 'Approved'` rows (both event expenses
   and operational expenses). Pending exposure is reported separately, never in totals.
5. **Locking.** `Approved` rows are immutable (no edit/delete). `Rejected` rows may be edited,
   which resubmits them as `Pending`. Approve/reject requires a dedicated permission.
6. **No payroll/labor double count.** Event labour comes only from `expenses` rows
   (`category='Labor'`), which are already guarded by the unique auto-labor index; the module
   introduces no second labour source.

## Permissions (new slugs in `backend/src/lib/permissions.ts`)

- `finance:hisab:read` — view Hisab rollups + operational expense ledger + export.
- `finance:opex:write` — create/edit/delete non-event operational expenses.
- `finance:opex:approve` — approve/reject (lock) operational expenses.

Seeds: `accountant` gets all three; `owner`/`admin`/`super_admin`/`system_manager` via `*`.
No other role gains access (finance redaction requirement).

## Backend

- **Migration** `backend/src/db/migrations/finance_hisab.sql` + runner
  `backend/src/db/migrate-finance-hisab.ts` (appended to `db:migrate`), applied to the
  remote Supabase DB during implementation. Also appended to `schema.sql` for parity.
  Indexes: `(expense_date)`, `(status, expense_date)` partial `WHERE deleted_at IS NULL`.
- **Routes** — new `backend/src/routes/finance.ts` mounted at `/finance` (requireAuth):
  - `GET /finance/operational-expenses` — paginated (default 20, max 100), filters:
    `status`, `category`, `start_date`, `end_date`, `search`; needs `finance:hisab:read`
    or `finance:opex:write`.
  - `POST /finance/operational-expenses` — `finance:opex:write`; Zod-validated; audit log.
  - `PATCH /finance/operational-expenses/:id` — `finance:opex:write`; blocked when Approved;
    Rejected→Pending on edit; audit log with field diffs.
  - `DELETE /finance/operational-expenses/:id` — soft delete; blocked when Approved; audit.
  - `POST /finance/operational-expenses/:id/approve` | `/reject` — `finance:opex:approve`;
    reject requires reason; transactional row lock (`FOR UPDATE`) to kill double-submit
    races; audit log.
  - `GET /finance/hisab` — `finance:hisab:read`; params `period_type=week|month`,
    `start_date`, `end_date` (range capped at 400 days by Zod). Returns period buckets:
    per-event rows (income, transport/rental/labour/other, total, profit), event totals,
    non-event totals by category, and `net = event profit − non-event operational spend`.
    Single SQL pass per source (2 queries total), grouped in JS — no queries in loops.
  - `GET /finance/hisab/export` — CSV/XLSX via existing `exceljs`/`csv-stringify` pattern,
    `maxRows` cap + blocked-export audit log, export audit log.
- **Audit** — `ActivityService.logActivity` with `entity_type: 'finance_operational_expense'`
  (create/update/delete/approve/reject) and export events.
- **Validation** — Zod schemas in `backend/src/lib/validation.ts`.

## Frontend

- **Page** `frontend/src/app/hr/finance/hisab/page.tsx`:
  - Permission gate: `finance:hisab:read` (ForbiddenState otherwise).
  - Segmented Weekly/Monthly toggle, date range (DatePicker), KPI strip (event income,
    event expenses, event profit, operational spend, net) with tabular-nums metric-first
    hierarchy per design skill.
  - Rollup view: period blocks — events table (category columns) + operational summary + net.
  - Ledger tab: operational expense table with CRUD (bottom sheet form on mobile),
    approve/reject actions gated by `finance:opex:approve`, filters, search, pagination.
  - Export CSV/XLSX + Print (window.print + `no-print`/`print-only` pattern).
  - Full EN/AM translations via `useLanguage`.
- **Sidebar** — add "Hisab" link to the Finance group gated by `finance:hisab:read`;
  add slug to `showHRGroup` list.
- **API client** — `frontend/src/lib/api.ts` helpers.

## Tests

- Backend (`backend/src/__tests__/finance.test.ts`, bun test + supertest + mocked pool):
  RBAC denial (driver/no-permission 403), pagination caps, create/validation, approved-row
  lock (edit/delete → 409), approve/reject flow + audit insert assertions, rollup math from
  mocked rows, export row-cap block.
- Frontend (vitest): hisab page unit tests — renders rollup, totals, forbidden state,
  ledger actions visibility by permission.
- E2E (`frontend/e2e/issue109-hisab.spec.ts`, mocked API per helpers pattern):
  Accountant creates operational expense → appears Pending; approver approves → net updates;
  non-finance user sees Forbidden.

## Verification Pipeline

`bun run lint` (root), `cd backend && bun test && bun run build`,
`cd frontend && bun test && bun run build`, targeted Playwright spec.
Senior review against `docs/SENIOR_ISSUE_REVIEW_PROMPT.md` before PR.
Migration applied to remote Supabase + verified before closing.
