# Hisab workbook imports

Use **Finance > Hisab > Import** with `finance:imports:write`. Upload an `.xlsx`
workbook, inspect its preview, resolve unmatched events/categories, and review
subtotal mismatches before committing. New financial rows remain **Pending**
with import provenance; importing does not approve expenses or create stock.

## Calculated transactions

The supported worksheets are `HISAB WEEKLY MONTHLY`, `MONTHLY WECHI`,
`INVESTMENT`, and `monthly total expense`. Ordinary and shared Excel formulas
use their saved, supported scalar results. The server does not evaluate
formulas, refresh external links or independently certify cached results.

Missing, error-valued or unsupported cached transaction results block import
and identify the worksheet/cell. A nonnumeric cached formula amount also blocks
import. Recalculate and save the workbook in a spreadsheet application, then
upload it again. Accepting a subtotal mismatch cannot override these blockers.

When `Date` or `Month` accompanies an `Amount` or `Amount ETB` header, that amount
column is authoritative; trailing numeric calculation inputs are not prices.
Headerless layouts retain their existing amount selection. Zero/negative
amounts and investment quantity/classification retain existing policies.

Labelled totals and formula-only SUM summaries stay out of the ledger. An
undated same-column SUM of preceding amount cells is also a summary, even when
its label resembles an expense category. Explicitly dated SUM-priced
transactions are retained. Existing supported same-column SUM mismatch checks
remain a separate review step, not a general formula evaluator.

## Historical safety and parity

The fingerprint remains a hash of the original uploaded bytes. Previously
committed workbooks remain duplicate-protected, including old partial imports.
This change does not replay, delete or rewrite historical batches. Reconcile
missing historical transactions through a separately reviewed, audited
correction; do not bypass duplicate protection by modifying/reimporting a file.

The shared parser behavior matches LeulTew/koti-catering#346. DreamLux keeps its
own authentication, schema, configuration, data and deployments. No Koti
environment, migration baseline or provider connection is copied.

## Verification

- `hisab-formula-transactions.test.ts` verifies real synthetic workbook parsing,
  all four layouts, cached metadata, shared formulas, subtotals and 5,000 rows.
- `bun run verify:imports:native` requires the existing explicit
  `DREAMLUX_NATIVE_TEST_ADMIN_URL`, validated by `attestDreamluxNativeTarget`.
  It cannot pass by skipping a missing target. The test creates its own
  disposable database using DreamLux's reviewed, version-controlled DDL and
  existing native fixture boundary, not a production dump. Real login cookies,
  routes and PostgreSQL verify amounts/status/provenance, mapping gates,
  historical duplicates, permission denial and audit rollback. All other
  network destinations are refused.
- `bun run verify:payroll:build -- --checks --output .qa-payroll-build` produces
  the existing source-isolated, credential-free frontend artifact.
- `bun run verify:imports:browser -- --frontend-build .qa-payroll-build` reuses
  that exact validated production artifact, reserves its own UI port 3261,
  runs 14 desktop/mobile cases, and removes its owned UI/private snapshot.
  It denies network access to the separate payroll API/REST ports. Browser
  transport is explicitly mocked; this is caller proof, separate from
  native persistence proof. Unexpected requests, malformed/partial receipts,
  skipped tests, retries and occupied ports fail rather than become success.
- `bun run verify:imports:infra` checks the fixture/runner contracts. Import
  verification is appended to the existing CI native job without another build,
  job or increased timeout. No hosted CI rerun is implied by local execution.

No production schema migration, new runtime configuration or historical
backfill is required by this parser correction.
