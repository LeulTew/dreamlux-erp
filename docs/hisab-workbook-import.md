# Hisab workbook imports

Use **Finance > Hisab > Import** with `finance:imports:write`. Upload an `.xlsx`
workbook, inspect its preview, resolve unmatched events/categories, and review
subtotal mismatches before committing. New financial rows remain **Pending**
with import provenance; importing does not approve expenses or create stock.

Global search's **Hisab Import** result opens the same workflow at
`/hr/finance/hisab/imports`; **Net Profit** opens
`/hr/finance/hisab/net-profit`. Their existing permission checks and
English/Amharic labels apply. They remain Hisab subpages, not extra sidebar items.

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

Supported SUM ranges read existing populated rows in worksheet order and use
non-creating cell lookups. Empty referenced positions contribute zero without
materializing rows or cells, even when a small workbook references Excel's
last row. This does not change cached values, range boundaries or rounding.

## Historical safety and parity

The fingerprint remains a hash of the original uploaded bytes. Previously
committed workbooks remain duplicate-protected, including old partial imports.
This change does not replay, delete or rewrite historical batches. Reconcile
missing historical transactions through a separately reviewed, audited
correction; do not bypass duplicate protection by modifying/reimporting a file.

The shared parser behavior matches LeulTew/koti-catering#346 and the bounded
SUM verification in LeulTew/koti-catering#363. DreamLux keeps its
own authentication, schema, configuration, data and deployments. No Koti
environment, migration baseline or provider connection is copied.

## Commit acknowledgement

Committing a workbook, like every operational-expense, overhead, month-closure
and capital-investment write, runs through one shared finance transaction
(`backend/src/lib/finance-transaction.ts`). Each business insert, update or
soft-delete must acknowledge exactly the rows it targets, and the required
`activity_logs` audit row must acknowledge exactly one row; a suppressed or
failed write rolls the whole commit back and returns `outcome_uncertain: false`.

If the `COMMIT` acknowledgement itself is lost, the API returns `503` with
`code: "FINANCE_OUTCOME_UNCERTAIN"` and `outcome_uncertain: true`, discards the
connection and never retries. The finance pages refresh their registers on
that response instead of resubmitting. For imports, retrying is still safe:
the workbook fingerprint makes an already-committed batch return `409`. This
matches LeulTew/koti-catering#404.

## Closed overhead months

Closing an overhead month freezes that month's overhead register only;
operational expenses, investments, payroll and event expenses dated in the same
month stay writable. A workbook whose overhead rows fall in a closed month is
refused as a whole with `409`, naming the months, so a mixed-month import never
commits partially. Preview reports the same closed months as blocking errors,
which disables Commit until the month is reopened or those rows are removed.

Every overhead writer (create, edit or move, review, delete, workbook import)
takes a shared per-month advisory lock before checking closure, and close/reopen
take it exclusively. A close therefore waits for in-flight writes to finish,
and a write that starts during a close sees the committed closure. Writers take
any overhead row lock first and then the month locks in ascending order, so
moves and multi-month imports cannot deadlock each other. Stored `DATE` months
are read by their calendar day, so the lock and closure keys stay correct when
the backend runs east of UTC (for example Africa/Addis_Ababa).
This matches LeulTew/koti-catering#405.

## Verification

- `hisab-formula-transactions.test.ts` verifies real synthetic workbook parsing,
  all four layouts, cached metadata, shared formulas, subtotals and 5,000 rows.
- `hisab-formula-ranges.test.ts` verifies actual worksheet allocation, sparse
  range boundaries, cached numbers and rounding without an unbounded test load.
- `bun run verify:imports:native` requires the existing explicit
  `DREAMLUX_NATIVE_TEST_ADMIN_URL`, validated by `attestDreamluxNativeTarget`.
  Its preload refuses missing or invalid targets before loading application
  test dependencies; it cannot pass by skipping a missing target. The test creates its own
  disposable database using DreamLux's reviewed, version-controlled DDL and
  existing native fixture boundary, not a production dump. Real login cookies,
  routes and PostgreSQL verify amounts/status/provenance, mapping gates,
  historical duplicates, permission denial and audit rollback. All other
  network destinations are refused.
  A second isolated process, `finance-audit-acknowledgement.integration.test.ts`,
  uses the same boundary to suppress audit and business rows across every
  finance mutation family, lose `BEGIN`/`COMMIT`/`ROLLBACK` acknowledgements,
  fail connection acquisition, and race concurrent writes and month closures,
  checking the complete persisted finance, stock and audit state each time.
  Its month-closure cases hold a rival close or write open until the API is
  observed waiting on the month lock, covering create, move, review, delete,
  mixed-month import and close-behind-write interleavings.
  The local CI receipt requires all 12 native import cases, including the
  wide sparse subtotal, then all 28 finance audit and month-closure cases, in that order, with
  no skips, failures or unhandled runner errors.
- `bun run verify:payroll:build -- --checks --output .qa-payroll-build` produces
  the existing source-isolated, credential-free frontend artifact.
- `bun run verify:imports:browser -- --frontend-build .qa-payroll-build` reuses
  that exact validated production artifact, reserves its own UI port 3261,
  runs 30 import/navigation desktop/mobile cases, and removes its owned UI/private snapshot.
  It denies network access to the separate payroll API/REST ports. Browser
  transport is explicitly mocked; this is caller proof, separate from
  native persistence proof. Unexpected requests, malformed/partial receipts,
  skipped tests, retries and occupied ports fail rather than become success.
  Search-result viewport checks use the existing 7.5-second assertion budget
  to verify actual rendered bounds during the dialog entrance. The 48px height
  and viewport-containment requirements remain exact; persistent undersize or
  offscreen controls must fail. No animation or CI deadline is changed.
- `bun run verify:imports:infra` checks the fixture/runner contracts. Import
  verification is appended to the existing CI native job without another build,
  job or increased job timeout. No hosted CI rerun is implied by local execution.
  The missing-target check gives its 15-second subprocess guard and owned cleanup
  a 20-second parent-test budget; CI job deadlines remain unchanged.

No production schema migration, new runtime configuration or historical
backfill is required by this parser correction.
