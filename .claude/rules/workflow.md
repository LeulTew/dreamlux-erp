# General Development & Task Workflow Rules

These rules dictate general software development workflow patterns, tasks management, and repository hygiene.

---

## 1. Context & Task Onboarding
- **Read First**: Always read existing files in the domain you are editing before writing new code.
- **Check Project Context**: Always inspect and read `project-context.md` at the start of every session/task to align on architectural boundaries, active issues, dependencies, and ongoing integrations.

---

## 2. Coding Principles & Scope
- **Small Commits**: Keep changes small, vertical, and testable.
- **Project Consistency**: Prefer established project patterns over introducing new abstractions.
- **Preserve Behavior**: Never silently remove existing behavior or features to make your implementation easier.
- **Clean Split**: Always separate user/unrelated dirty work from your own changes. Do not revert, overwrite, or reformat unrelated files.

---

## 3. Development Execution Pipeline
For any code-changing task, you MUST follow this structured pipeline:
1. **Plan**: Clarify the intended changes and trace architectural implications. If it's a major change, save a durable implementation plan in `plans/` or a temporary external note when requested.
2. **Issue**: Ensure a GitHub issue exists and is set to "In Progress" on the Scrum board before starting (use `wsl fish -c "gh issue view ..."` or `wsl fish -c "gh issue edit ..."`).
3. **Branch**: Branch from the latest `main` (the integration and production target) unless another branch is explicitly designated.
4. **Implement**: Code the changes incrementally.
5. **Secrets Check**: Review the diff and unstaged files before staging. Never stage local `.env` files, credentials, private keys, API keys, or build outputs.
6. **Verify**: Run tests (unit/integration/E2E), linting, and compile checks.
7. **Commit & PR**: Commit using standard prefixes and open a draft PR referencing the issue via `wsl fish -c "gh pr create --draft ..."`.

8. **Review & Merge**: Do not merge any PR unless the user explicitly authorizes it.
9. **Deploy & Smoke Test**: If a deployment/release is required, deploy and perform production smoke testing.

---

## 4. Continuing vs. Unrelated Work
- **Continuing Work**: For follow-up tasks on an existing issue or scope, continue on the existing branch. If a branch was merged but needs a quick fix, create a new issue-scoped branch from latest `main`.
- **Unrelated Work**: Treat unrelated work as new work. Create or identify a new GitHub issue and switch to a separate feature branch.
- **Ambiguities**: If the task boundary is ambiguous, state your judgment and ask the user to clarify before coding.

---

## 5. Checklist Synchronization
- Keep issue checklists and PR descriptions synchronized with the actual implementation state. Only tick boxes as complete when the code, verification tests, and senior reviews support it.
