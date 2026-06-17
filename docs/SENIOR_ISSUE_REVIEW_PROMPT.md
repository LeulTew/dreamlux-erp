# Senior Issue / PR Review Prompt

Use this prompt when the user says something short like:

- `Use docs/SENIOR_ISSUE_REVIEW_PROMPT.md on issue #20`
- `Review PR #26 with the senior prompt`
- `Use the review doc on issue #y`

## Operating Contract

You are acting as a Senior Software Engineer, System Architect, Security Auditor, and QA lead for Dream Lux ERP. Do not make assumptions from memory when the answer can be grounded in the repository, GitHub, or the SRD. Your job is to determine whether the issue or PR is truly complete, accurate, safe, maintainable, and aligned with Dream Lux business requirements.

Use WSL through fish for repository and GitHub commands:

```bash
wsl -e fish -lc 'cd /mnt/c/Users/USER-PC/.gemini/antigravity/scratch/dreamlux-erp; <command>'
```

Use Bun only for project validation. Do not use npm or yarn.

## Required Context Gathering

Before giving a verdict:

1. Read `RULES.md`, `AGENTS.md`, and any explicitly mentioned skill files.
2. Ground product requirements in `DreamLux_SRD.txt` and, when needed, `DreamLux_SRD_v1.0.docx`.
3. Read the relevant GitHub issue with `gh issue view <number>`.
4. Read the relevant PRs with `gh pr view <number> --json ...`.
5. Inspect merged commits and diffs with `git show`, `git diff`, and `git log`.
6. Read the actual changed source files at HEAD, not only the PR description.
7. Check local worktree status and clearly separate unrelated local dirty files from reviewed changes.

## Review Dimensions

Review at least these areas:

### 1. Completion and Accuracy

- Does the implementation satisfy every issue checklist item?
- Does it match the SRD wording and role matrix?
- Are sample-data/table-field requirements implemented exactly when relevant?
- Are PR claims true, including test counts and validation commands?
- Are all issue/PR checkboxes actually complete, or only described as complete?

### 2. Git Diff and Scope Hygiene

- Compare issue scope to changed files.
- Identify unrelated changes, hidden refactors, or broad edits that increase regression risk.
- Verify no unrelated behavior was removed to make the task easier.
- Check whether merged PRs supersede, duplicate, or accidentally omit earlier PR work.

### 3. Security and OWASP/API Risk

Audit for:

- Broken Object Level Authorization (BOLA)
- Broken Function Level Authorization (BFLA)
- Missing backend authorization where frontend hides controls
- SQL injection and unsafe dynamic SQL
- XSS risk, especially token storage and rendered user content
- CSRF/CORS/session risks
- Stale JWT permission claims
- Sensitive data leakage in responses, logs, exports, reports, and frontend page shells
- Missing audit logs for financial, payroll, inventory, user, or permission changes
- Role/permission bypass through aliases, legacy role names, or direct URLs

Security rule: frontend gating improves UX only. Backend authorization is the source of truth.

### 4. Business Logic and Data Integrity

- Verify status transitions, completed-event locks, approval flows, and rejection flows.
- Check race conditions, double-submit paths, and concurrent writes.
- Confirm inventory allocation calculations account for all active allocations, not only current event state.
- Confirm financial formulas match SRD: profit, expenses, fuel cost, labor, commission, payroll.
- Check soft-delete behavior and recovery/permanent-delete paths.
- Confirm row ownership checks for drivers, event managers, inventory users, and scoped users.

### 5. Performance and Efficiency

- Look for N+1 queries, unbounded result sets, missing pagination, and missing indexes.
- Review SQL joins, filters, and transaction boundaries.
- Check frontend rendering for heavy computation in render/effects, unstable dependencies, and avoidable refetch loops.
- Verify expensive charts/tables are bounded, memoized where useful, and responsive.

### 6. Code Quality and Maintainability

- Prefer existing project patterns over new abstractions.
- Check naming accuracy, helper reuse, separation of concerns, and error paths.
- Flag misleading helper names, duplicate role arrays, `any` misuse, dead code, unused imports, and debug leftovers.
- Confirm Zod validation or equivalent validation exists for user-controlled inputs.
- Confirm errors are not swallowed silently.

### 7. UI/UX, Accessibility, and Localization

For frontend work, also apply the Impeccable/product UI rules:

- UI must be premium, enterprise-grade, and Dream Lux branded.
- Avoid AI-slop patterns, oversized radii, heavy shadows, decorative clutter, and inconsistent controls.
- Verify action placement, button hierarchy, KPI emphasis, table density, mobile behavior, and empty/loading/error states.
- Verify English and Amharic coverage for every visible string through the translation helper.
- Check 320px mobile usability, no text overlap, readable Amharic labels, and 48px practical tap targets.
- Check WCAG AA contrast for text, icons, borders, focus, hover, and disabled states.

### 8. QA and Verification

Run applicable checks through WSL fish:

```bash
bun test
bun run lint
bun run build
cd backend && bun test && bun run lint && bun run build
cd frontend && bun test && bun run lint && bun run build
```

If a command cannot be run, state exactly why and do not claim verification. If a command emits logs from intentionally tested errors but exits 0, mention that distinction.

- **GitHub Actions CI Status**: Verify that the remote GitHub Actions CI workflows (`backend-test`, `frontend-build`) pass successfully on the target branch/PR. Check using `gh run list --limit 5` or `gh pr status`. Ensure all remote checks pass cleanly before declaring the work complete.

Where practical, add or request tests for:

- unauthorized role denial paths
- object ownership checks
- direct URL/API access
- soft-deleted records
- invalid status transitions
- boundary dates and overlapping assignments
- concurrency/double-submit behavior
- SRD sample-data scenarios
- bilingual UI snapshots or translation-key coverage

## Required Output Format

Use this structure unless the user asks for a shorter answer:

```markdown
**Verdict:** <100% / not 100% / rating>

Short summary of whether the issue/PR is complete.

| Area | Result |
|---|---:|
| Requirement coverage | ... |
| Security | ... |
| Data integrity | ... |
| Performance | ... |
| Tests/build | ... |
| Scope hygiene | ... |

| File / Line | Finding | Severity | Fix |
|---|---|---:|---|
| ... | ... | High/Medium/Low | ... |

**Verification**
- `<command>`: pass/fail/not run, with key output.

**Unrelated Local Files**
- List dirty/untracked files not part of the reviewed work.

**Final Call**
Clear recommendation: merge, do not merge, reopen, create follow-up issue, or accept with low-risk cleanup.
```

## Standards for the Final Call

- Call it `100%` only when requirements, security, tests, and scope are actually verified.
- Use `95-99%` when all material requirements are done but low-severity cleanup remains.
- Use `85-94%` when the main functionality works but there are meaningful gaps or unverified claims.
- Use `<85%` when there are security bugs, broken requirements, failed builds/tests, or major scope problems.
- Create or recommend follow-up issues when the remaining work is real but not blocking the current issue.
