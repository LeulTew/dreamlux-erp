# DreamLux UX / Event Lifecycle Tracking

Local tracking note for agent continuity and zero-hallucination handoff context.

## Required Context For Every Session

| Source | Must use for |
| :--- | :--- |
| `project-context.md` | Architecture, modules, active issue map, known caveats, and DreamLux domain boundaries. |
| `RULES.md` | Bun-only workflow, GitHub issue/branch/PR rules, secrets checks, senior diff review, and merge discipline. |
| AGENTS prompt rules | Local safety, no destructive git, UI quality rules, and tracked/untracked work separation. |
| `.agents/skills/enforce_senior_frontend_engineering_and_anti_slop_design_systems/SKILL.md` | Required before frontend UI edits. |
| `docs/SENIOR_ISSUE_REVIEW_PROMPT.md` | Completion, security, performance, diff, and test review before claiming an issue is complete. |

## Current Status

| Item | Status | Evidence |
| :--- | :--- | :--- |
| Active branch at cleanup start | `main` | Clean and synced with `origin/main` before this final tracker-only cleanup branch. |
| #25 UX polish | Closed | PRs #61-#71 merged; final #25 comment records 100% E2E portability completion. |
| #2 Core Event Lifecycle | Closed | PR #72 merged; GitHub issue #2 body has all checklist items checked and state is closed. |
| #73 Frontend RBAC audit | Closed | PRs #74 and #75 merged; GitHub issue #73 state is closed. |
| Final tracker cleanup | Docs-only | This file was compacted after confirming no open #2/#73 implementation work remained. |

## Completed Issue Ledger

| Issue | Scope | Closure evidence | Final result |
| :--- | :--- | :--- | :--- |
| #25 | UX polish, route guard E2E, backend hardening, Playwright portability | PRs #61-#71 merged; `bun run test`, `bun run lint`, `bun run build`, and `bun run test:e2e` passed in the final phase evidence. | Complete. No remaining local tracking items. |
| #2 | Core event lifecycle reconciliation and closeout | PR #72 merged; event lifecycle checklist reconciled against merged child issues; issue #2 confirmed closed through GitHub. | Complete. Normalized CRM and DB-level immutability trigger remain future separate scope only if product opens a new issue. |
| #73 | Frontend RBAC audit and multi-role UX alignment | PR #74 aligned shared frontend permission matching and proposal/profit/event gates; PR #75 tightened payroll and event-type read/write/delete gating; issue #73 confirmed closed through GitHub. | Complete. Backend remains the RBAC source of truth; frontend gates mirror backend permission slugs for UX/access polish. |

## Issue #73 Final RBAC Audit Closure

| Area | Final state | Evidence |
| :--- | :--- | :--- |
| Shared frontend matcher | Complete | `frontend/src/lib/permission-matcher.ts` mirrors backend semantics for superuser, `*`, exact slugs, and module wildcards; covered by unit tests. |
| `useAuth`, sidebar, breadcrumbs | Complete | Shared matcher is used for permission checks; sidebar and breadcrumb tests cover wildcard and parent-link behavior. |
| Events list and event workspace | Complete | Route/action gates use permission slugs; read-only option fetch and finance redaction behavior are covered by frontend/E2E tests. |
| Proposals | Complete | Queue reads, create CTA, and new proposal access were aligned with backend proposal/event permissions; E2E covers approver and wildcard cases. |
| Profit reports | Complete | Report reader access supports explicit, global wildcard, and module wildcard permissions; tests cover authorized and denied states. |
| Payroll archive | Complete | Read users can view allowed payroll data; write-only actions such as new payout, draft edits, restore, trash, and permanent delete are hidden without `payroll:write`; E2E covers read-only behavior. |
| Event types and trash | Complete | Trash listing is read-gated; delete/restore/permanent-delete controls require `events:delete`; E2E covers read-only trash access. |
| Assets/settings/admin inventory | Complete | Audited as aligned with backend route middleware and existing permission slug gates; no source-backed mismatch remained after #74/#75. |
| `ForbiddenState` | Complete | Default copy is capability-based and localized; page-specific descriptions are allowed only where deliberately supplied by the page. |
| Sidebar/popout UI note | Complete | No #73 blocker remained after audit; broad hover/style refactors are outside the closed RBAC issue unless a new UI issue is opened. |

## Final Verification Evidence

| Phase | Commands / checks | Result |
| :--- | :--- | :--- |
| #25 final PR | `bun run test`, `bun run lint`, `bun run build`, `bun run test:e2e` | Passed before PR #71 merge; Playwright passed 10/10 on port 3101. |
| #2 final PR | Targeted event lifecycle, seed parity, lint/build/test checks recorded in PR #72 | Passed before PR #72 merge and issue close. |
| #73 PR 1 | `cd frontend; bun run test`, `bun run lint`, `bun run build`, `bun run test:e2e`; root `bun run test`, `bun run lint`, `bun run build`; `git diff --check` | Passed before PR #74 merge. |
| #73 PR 2 | `cd frontend; bun run test`, `bun run lint`, `bun run build`, targeted Playwright access tests; root `bun run test`, `bun run lint`, `bun run build`; `git diff --check` | Passed before PR #75 merge. |
| Final tracker cleanup | Confirmed GitHub #2 and #73 are closed; removed stale unresolved tracker language. | Docs-only cleanup covered by this final PR. |

## Final Cleanup Checklist

- [x] Re-read required context: `project-context.md`, AGENTS/RULES instructions, senior review prompt, and frontend design skill guidance.
- [x] Confirm GitHub issue #2 is closed.
- [x] Confirm GitHub issue #73 is closed.
- [x] Remove stale unresolved tracker markers such as audit-needed, improvement-candidate, and in-progress rows.
- [x] Compact completed phase detail into short issue and evidence ledgers.
- [x] Preserve future-scope caveats only where GitHub issue #2 explicitly records them as non-blocking.
