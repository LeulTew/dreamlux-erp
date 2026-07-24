# Git, Branching, Commit Standards, and Code Review Rules

These rules apply when staging, committing, pushing, creating pull requests, or reviewing diffs.

---

## 1. Branching Strategy
- **Target Branch**: The default integration branch is `main`. All feature branches are derived from the latest `main`.
- **Branch Naming**: Feature branches must follow the convention:
  `feature/<issue-number>-short-name` (e.g., `feature/106-storekeeper-dispatch`).
- **Post-Merge Hygiene**: Immediately after a pull request is merged, switch back to `main`, pull the fast-forward changes, check for a clean worktree, and delete the stale local feature branch.

---

## 2. Commit Message Standards
All commits must be prefix-based to maintain clean changelogs. Use the format `<prefix>(<scope>): <description>`:
- `feat(...)` for new features or user-facing enhancements.
- `fix(...)` for bug fixes.
- `docs(...)` for documentation updates.
- `refactor(...)` for code restructuring without changing functionality.
- `test(...)` for adding or modifying unit, integration, or E2E tests.

---

## 3. GitHub & CLI Tooling (WSL Fish Mandate)
- **Mandatory WSL Fish Execution**: GitHub CLI (`gh`) credentials, active tokens (`LeulTew`), and SSH keys reside exclusively inside the WSL Fish shell environment (`Ubuntu 24.04` / `fish`). Host Windows `pwsh` is NOT authenticated.
- **`gh` Command Prefix**: AI agents MUST ALWAYS execute all `gh` commands (managing issues, labels, assignments, PRs, comments, status checks) via WSL Fish using `wsl fish -c "gh <command>"` (e.g. `wsl fish -c "gh issue list"` or `wsl fish -c "gh pr view 106"`).
- **Checklist Maintenance**: Before closing an issue or declaring it complete, you MUST fetch the GitHub issue description via `wsl fish -c "gh issue view <number>"`, systematically go through the task checklist items one by one to verify and test them, and tick them off (`[x]`) in the GitHub issue description. This ensures no features or requirements are missed and prevents automation pipelines from failing or reopening issues.


---

## 4. Pull Request & Verification Readiness
PR descriptions must include:
- **High-Level Overview (Plain English)**: A concise, day-to-day English summary of what the problem is and how we are solving it (for human review, not for AI; keep it as short as possible, bullet points if necessary).
- A link/reference to the resolved GitHub issue.
- A list of verification commands executed and their outcomes (e.g., test suites, lint checks).
- Separate sections for local QA, CI results, deployment targets, and production smoke tests where applicable.

---

## 5. Senior Review & Merge Discipline
- **Senior Audit Mandate**: Before finalizing your changes or creating a Pull Request, you MUST review the code against [SENIOR_ISSUE_REVIEW_PROMPT.md](file:///docs/SENIOR_ISSUE_REVIEW_PROMPT.md) to verify requirement coverage, data integrity, performance, and security constraints.
- **DO NOT MERGE**: Never merge a PR or proceed to subsequent deployment stages unless you receive explicit user authorization. Leave PRs open as drafts or marked "Ready for Review".
- **Senior Diff Audit**: Before declaring a task finished, inspect the actual git diff. Review it for:
  - Scope hygiene (ensure no unrelated files are modified).
  - Performance regressions.
  - Security constraints (BOLA/BFLA).
  - Correctness of unit/E2E test coverage.
- **Destructive Command Ban**: Never run destructive git commands like `git reset --hard` or `git checkout --` on modified files unless the user explicitly commands it after being warned.

