# DreamLux ERP Blackbox QA Failure Triage

Source document: `C:\Users\USER-PC\Downloads\DreamLux_ERP_QA_Blackbox_Test_Plan (1) (1).docx`

Extracted evidence:
- `docs/qa/blackbox-test-plan-extracted.md`
- `docs/qa/blackbox-test-plan-extracted.json`

Scope: only rows with a tester-entered error or partial error were triaged. Blank story walkthrough rows and incomplete rows were skipped because they do not contain an observed result.

## Summary

The tested failures cluster into three production cleanup areas:

1. Auth/session and RBAC first-paint behavior: unauthorized content or navigation can flash before client-side permission hydration, and browser back after logout may expose cached protected screens.
2. Reference/inventory data integrity and role parity: delete impact messaging needs end-to-end verification, inventory/storekeeper dispatch permissions do not match the expected role behavior, the asset office picker uses a filtered office endpoint, and `inventory_user` credential parity should be revalidated against deployment seed state.
3. Event operations and payroll workflow correctness: scheduling conflict checks exist in the backend, but UI flows still failed for staff/vehicle assignment; payroll is hard-coded to half-month periods while QA expects weekly calculation; labor expense generation depends on attendance assignments that testers could not create.

## Skipped Items

Skipped because the QA table was blank or not executed:
- C7, C8, C9, C10, C11 dispatch/recount follow-ups.
- D11, D12 import commit/mapping follow-ups.
- Story tables 14 through 27 where `Error / Done` was empty.
- QA sign-off table.

## Detailed Findings

### S5 / D5 / E5: Protected content flashes before permissions settle; back after logout can show protected pages

Reported:
- Driver initially sees employees/admin/financial content, then restrictions apply after reload.
- Non-financial users briefly see sensitive financial data before reload hides it.
- Browser back after logout leaves protected pages usable.

Code verification:
- `frontend/src/components/AuthLayout.tsx` treats any `localStorage` token as authenticated and renders layout/sidebar while `useAuth()` is still resolving `/auth/me` and effective permissions.
- `frontend/src/hooks/useAuth.ts` initially has no token until the first effect runs, then separately resolves user and permissions. Some pages use `authLoading`, but common layout/search/sidebar state can render from local storage or static page lists before permissions are settled.
- `HeaderUserMenu` reads `localStorage.user` directly for display and logout only removes `token` and `user`; it does not clear React Query caches or force a hard cache boundary.
- The Axios 401 interceptor in `frontend/src/lib/api.ts` redirects to `/login`, but this does not by itself prevent a browser bfcache/back-button display of the old page shell.

Assessment: confirmed architecture risk. This is a security/UX bug even if APIs reject unauthorized calls server-side.

Required fix direction:
- Introduce an auth bootstrap gate used by `AuthLayout`, sidebar, global search, and protected pages so no protected navigation/content renders until `/auth/me` and effective permissions are resolved or denied.
- On logout, clear React Query cache, preview role state, sensitive persisted UI state if scoped to the user, and replace history to `/login`.
- Add Playwright coverage for driver first-paint, non-financial financial-page first-paint, and browser back after logout.

Severity: High.

### A5: Department delete impact reported as deleting active-use departments

Reported:
- Deleting a department assigned to an active employee deletes it instead of blocking.

Code verification:
- `backend/src/routes/departments.ts` does check `employees.department_id = id` with `deleted_at IS NULL` before delete and returns `400`.
- The frontend confirmation modal text is generic and does not preflight impact or list employees before confirmation.

Assessment: partially confirmed. The backend guard exists in current code, so the reported production failure could be due to stale deployment, employee rows without `department_id`, a different reference page, or missing migration/seed parity. The UI still does not meet the exact expected behavior because it only warns generically before the API call and shows the employee list only if the backend error is returned.

Required fix direction:
- Add backend regression tests proving active employee references block department deletion and include employee names.
- Add an API/UI impact preview before delete so the modal can list dependent employees before the destructive action.
- Verify deployed schema/seed data uses `employees.department_id`, not only department snapshots or free-text department names.

Severity: High if deletion reproduces; Medium if limited to missing preflight UX.

### A6 / E2: Reference Data and permission-management UX for low-permission users

Reported:
- Driver direct navigation to `/settings/departments` or sidebar still exposes Reference Data behavior.
- `/settings/permissions` role detail is not readable enough / dangerous permissions not clear.

Code verification:
- Sidebar visibility is permission-driven, but `useAuth()` permission hydration can lag first render.
- `frontend/src/app/settings/departments/page.tsx` returns `ForbiddenState` when `hasReadAccess` is false, but initial auth state transitions can still produce inconsistent first-paint behavior.
- `frontend/src/app/settings/permissions/page.tsx` contains grouped permission display and preview behavior, but no triage reproduction was available for the tester's generic "ERROR".

Assessment: A6 is covered by the same auth bootstrap issue. E2 needs UX review/reproduction before implementation.

Required fix direction:
- Fold A6 into the auth/bootstrap issue.
- Create a UX acceptance checklist for the permissions page: searchable groups, dangerous permission indicators, role diff clarity, no jargon-only labels, mobile readability.

Severity: Medium.

### B6 / B7: Staff and vehicle assignment conflict behavior failed in QA

Reported:
- Staff assignment failed, including overlapping event date block.
- Vehicle/driver assignment failed, including overlapping use block.

Code verification:
- `backend/src/routes/events.ts` has transaction-backed checks:
  - Employee rows are locked with `FOR UPDATE`.
  - Vehicle rows are locked with `FOR UPDATE`.
  - `hasEmployeeConflict` and `hasVehicleConflict` are called before insert/update.
- Potential bug: `POST /events/:id/assignments/employees` checks `vehicle_assignments:write`, while `DELETE` and attendance use `event_assignments:write` or broader checks. This may block legitimate event assignment users or force the wrong permission slug.
- Vehicle assignment checks `event_assignments:write`, while separate `vehicle_assignments:write` exists.

Assessment: confirmed permission inconsistency and likely UI/API contract mismatch. Conflict logic exists but needs integration tests for permission matrix and overlapping date behavior.

Required fix direction:
- Normalize assignment endpoint permissions:
  - employee assignment: `event_assignments:write`
  - vehicle assignment: `vehicle_assignments:write` or documented combined role policy
- Add backend API tests for allowed roles, denied roles, overlapping employee conflicts, overlapping vehicle conflicts, and concurrent double-submit.
- Add Playwright flow that assigns staff and a truck, then verifies overlap blocking messaging.

Severity: High for operations.

### B11: Driver/ops could not find assigned truck for trip logging

Reported:
- Fuel calculation flow could not find the assigned truck.

Code verification:
- Trip creation backend validates `vehicle_assignment_id`, driver ownership, completed-event lock, and L/km formula.
- The UI failure likely happens before POST, in the event workspace vehicle/trips list or role-filtered assignment visibility.
- Driver ownership depends on matching `users.email` to `employees.email`; if seed/deployed data mismatches, assigned trucks can disappear or trip logging fails.

Assessment: plausible and needs end-to-end reproduction. Formula code is likely covered, but the selection/discoverability path is not sufficiently guaranteed.

Required fix direction:
- Add E2E fixture with a driver user linked to an employee by email, assigned vehicle, visible assigned truck row, and trip log preview.
- Add backend/API test for driver user email mismatch to produce a clear actionable error.
- Add UI empty state: "No assigned vehicles for this event" with reason hints instead of silent absence.

Severity: Medium-High.

### C1: Asset entry cannot select office

Reported:
- Tester could not select an office when adding an asset.

Code verification:
- `frontend/src/app/assets/insert/page.tsx` calls `getStores`.
- `getStores` maps `/offices` to `/stores` through alias fallback.
- `backend/src/routes/offices.ts` documents `GET /offices` as an associated-office fallback and filters stores to only those referenced by an item or employee.
- `GET /offices/all` exists for all offices, but asset insert does not use it.

Assessment: confirmed. New/unused offices can be omitted from the asset insertion picker.

Required fix direction:
- Asset creation and inventory location selection should use the all-offices/store-locations endpoint, not the associated-office filter.
- Add a frontend test where `/offices/all` contains an unused office and verify it is selectable.
- Consider renaming API helpers to avoid `getStores` using a filtered office endpoint accidentally.

Severity: High for inventory setup.

### C6 / E6: Inventory Officer / inventory_user cannot complete dispatch; credential alias failed

Reported:
- Inventory officer cannot complete dispatch from `/assets/dispatch`; CEO can.
- `inventory_user` login failed with "wrong username".

Code verification:
- `frontend/src/app/assets/dispatch/page.tsx` and backend dispatch routes require `event_allocations:write` or `assets:write`.
- `backend/src/db/schema.sql` grants `INVENTORY_OFFICER` only `assets:read`, `assets:write`, `assets:reconcile`, `exports:read`. It does not grant `event_allocations:write`.
- `INVENTORY_CONTROLLER` also lacks `event_allocations:write` in current schema despite the QA expectation for `inventory_user`.
- Seed SQL includes `inventory_user`, but login failure can still occur if production seed/migration did not run or auth uses a different seed set.

Assessment: confirmed permission mapping gap; seed parity needs deployment verification.

Required fix direction:
- Grant dispatch checklist/departure capability to inventory storekeeper roles explicitly, either by adding `event_allocations:write` or a narrower dispatch-specific permission.
- Add backend BFLA tests proving inventory officer/controller can check dispatch and depart but cannot perform unrelated event financial actions.
- Add seed parity check for `inventory_user` in deployment/bootstrap validation.

Severity: High.

### D2: Labor generation blocked because labor/attendance assignment could not be created

Reported:
- Accountant cannot generate labor because labor could not be allocated first.

Code verification:
- `generate-labor` requires `expenses:labor_generate` and only works after completion with attended assignments.
- Assignment creation has the permission inconsistency described in B6.
- Accountants have `expenses:labor_generate` but not event assignment permissions, so the intended workflow depends on operations/event roles creating attendance first.

Assessment: confirmed workflow fragility. The domain model may be correct, but the UX needs a clear prerequisite path and permission matrix.

Required fix direction:
- Fix assignment permissions and add a clear labor prerequisite state on completed events.
- Add backend tests for no-attended-labor, already-generated, and completed-event-only paths.
- Add Playwright flow from ops attendance -> acc generate labor -> expense approval queue.

Severity: Medium-High.

### D6: Payroll must be calculated weekly

Reported:
- Payroll run should be calculated every week.

Code verification:
- `backend/src/routes/payroll.ts` rejects anything except `period_kind === "half_month"` for draft and finalize.
- Payroll list/preview supports generic period fields, but persistence does not support weekly runs.

Assessment: confirmed requirement mismatch. This should be treated as a product decision before coding because existing code intentionally narrowed persistence to half-month.

Required fix direction:
- Decide supported payroll periods: weekly only, weekly plus half-month, or configurable payroll calendar.
- If weekly is required, extend validation, period bounds, duplicate guards, titles, UI period picker, reports, and net-profit/payroll rollups.
- Add unit tests for weekly bounds and integration tests for duplicate weekly run prevention.

Severity: High financial correctness/product fit.

### E6: `inventory_user` login parity failed

Reported:
- All documented users login except `inventory_user`.

Code verification:
- `backend/src/db/seeds_dreamlux.sql` contains `inventory_user` with `Password123`.
- `backend/src/__tests__/srd-seed-parity.test.ts` asserts the seed string exists.
- This only proves the seed file, not the deployed database state.

Assessment: deployment/seed parity risk, not fully confirmed in local code.

Required fix direction:
- Add a backend smoke endpoint/test or migration assertion for required test users in non-production seed environments.
- Update deployment checklist to run seed parity validation after migrations.
- Avoid logging passwords; only validate expected usernames and role mapping.

Severity: Medium.

## Recommended GitHub Issues

Create three issues rather than one giant issue:

1. Auth/session first-paint and logout cache hardening.
2. Reference data, inventory location, storekeeper dispatch, and seed parity cleanup.
3. Event assignment, trip visibility, labor generation, and weekly payroll correctness.

These should be implementation issues, not QA-only tickets, because multiple failures were confirmed against code.
