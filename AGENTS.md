# AI Collaboration & Style Rules for Dream Lux ERP

These rules apply to all AI agents working in this repository.

---

## 1. Operating Mode & Workflow

- Read existing files before editing.
- Always check and read `project-context.md` at the start of every session/task to align on architectural boundaries, active issues, and dependencies.
- Keep changes small, vertical, and testable.
- Prefer established project patterns over new abstractions.
- Never silently remove behavior to make implementation easier.
- Add verification notes to every PR.
- For any code-changing prompt, follow a plan-first flow: clarify the intended change, confirm or identify the GitHub issue, branch from the correct integration target, implement, run a secrets check, verify, then commit/PR only when the work is ready.
- Purely read-only or conversational prompts do not need an issue, branch, plan file, or commit.
- Treat follow-up work on an existing issue/branch as continuing work: reuse the existing issue and branch when the scope is the same, and avoid duplicate issues or PRs.
- Treat unrelated work as new work: create or identify a new GitHub issue before coding and use a separate feature branch.
- If the request is ambiguous between continuing and new work, state the judgment before proceeding so the user can correct it.
- Keep issue task checklists and "Files Touched" notes accurate as implementation proceeds; only mark boxes complete when the code, tests, and review evidence support it.
- Save durable implementation plans for substantial or multi-PR work in `plans/` or an explicitly temporary external note when the user asks for a non-committed plan trail.
- Before staging, inspect `git status`, the diff, and likely-sensitive file changes; do not stage secrets, local env files, credentials, tokens, private keys, or generated build output.
- If a secret or sensitive local artifact appears in the diff, stop, add or recommend the proper `.gitignore` protection, and ask how to proceed before committing.
- Never hardcode secrets, credentials, tokens, passwords, API keys, or connection strings. Use environment variables and keep `.env.example` placeholder-only.
- Confirm staging/commit and PR/push intent when the user has not already explicitly asked for those actions in the current task.

---

## 2. Technical Stack & Tooling

- **Package Manager**: Always use **Bun** (`bun`) only. Do not use npm or yarn. If pnpm is needed, use it only as a second-to-last resort.
- **Commands**: Run tasks like database migrations, tests, and linting through bun (e.g. `bun run db:migrate`, `bun run lint`).

---

## 3. UI/UX Design System Skills & Rules (Dream Lux Rebrand)

- **Color Theme (Elegant Gold & Slate/Purple)**:
  - **Light Mode**: Use clean warm-white backgrounds with polished elegant gold accents (`#D4AF37` or equivalent premium metallic gold HSL variations).
  - **Dark Mode**: Use deep charcoal, slate-gray, or dark-purple backdrops, contrasted cleanly with bright gold text/accents.
- **Gradients**: Use smooth, tasteful gradients for headers, main dashboard cards, and hero sections (e.g. `from-slate-900 to-indigo-950` with gold text overlay) to establish a premium luxury feel.
- **Visual Hygiene (No AI Slop / Spaceships / Games)**:
  - No cartoonish widgets, game terms, or sci-fi phrases.
  - Maintain a clean, professional, enterprise-grade tone tailored to a high-end events company.
- **Geometric Elements**:
  - **Border Radius**: Keep border radius minimal (e.g., `rounded-sm`, `rounded-md` or `6px`-`8px` max). Avoid overly pill-shaped or round shapes for structural containers unless explicitly requested.
  - **Shadows**: Keep shadows minimal or completely flat. Rely on clean high-contrast borders (`1px border-border` or `border-gold/20`) to separate components instead of large blurred shadows.
- **Contrast & Legibility**:
  - Always verify that all text colors, SVGs, and icon fills satisfy standard Web Content Accessibility Guidelines (WCAG) contrast ratios (min 4.5:1 for regular text).
  - Ensure that SVGs, text labels, and form borders maintain correct contrast ratios on active/focused/hover states.
  - **Hovers & Transitions**: Verify that interactive hover and focus states provide strong visual contrast indicators (e.g., darken gold buttons on hover, highlight row backgrounds on hover).

---

## 4. Architecture Cleanliness

- Keep infrastructure, data access, business logic, and UI rendering in separate modules.
- Put API clients, storage adapters, and external integrations behind explicit service boundaries.
- Do not add dependencies until the repository has no suitable existing option.
- Do not catch and swallow errors. Boundary errors must be logged with trace context and surfaced through a defined error path.

---

## 5. AI Development Workflow & Commits

- **Issue Assignment**: Do not start coding until a GitHub issue exists and is moved to "In Progress" on the Scrum board.
- **Feature Branching**:
  - Main branch: `main` (production and integration).
  - Feature branches: `feature/<issue-number>-short-name` (e.g. `feature/3-event-creation`).
- **Branch Source**: Branch from the latest `main` unless the user explicitly names another target. If imported generic rules mention `develop`, `main` takes precedence for this repository.
- **Continuing Branches**: For continuing work, stay on the existing branch. If it was merged and deleted but the issue is reopened for a focused fix, create a new issue-scoped branch from latest `main`.
- **Commit Messages**: Commits must be prefix-based:
  - `feat(<scope>): ...` for new features.
  - `fix(<scope>): ...` for bug fixes.
  - `docs(<scope>): ...` for documentation changes.
  - `refactor(<scope>): ...` for code restructures.
  - `test(<scope>): ...` for adding/updating tests.
- **GitHub Operations**: Prefer `gh` for issues, labels, assignment, PRs, checklist updates, status checks, comments, and merges. If `gh` is unavailable, use the connected GitHub tooling if present; otherwise provide exact manual commands and do not silently skip the workflow.
- **PR Readiness**: PR descriptions must reference the issue, list verification commands and outcomes, and separate local QA, CI, deployment, and production smoke evidence when relevant.
- **Merge Discipline**: Do not merge until local verification, senior diff review, and required GitHub checks are clean. After merge, return to `main`, pull fast-forward, verify a clean worktree, and deploy when the task requires production release.
- **Self-Verification Checklist**: Before completing a task, verify against:
  - [Codebase Structure Rules](file:///.github/ai_templates/agent_structure.md) for module organization.
  - Pull request template items (type-checks, lint, migration dry-runs).
  - Screen/UI checks on viewport widths down to 320px (mobile responsiveness check).

---

## 6. Rule Precedence & Safety

- Repository-specific DreamLux rules override generic imported constitutions when they conflict.
- User instructions for a specific task override default workflow only when they are explicit and do not weaken security, data protection, or production safety.
- Do not use destructive git commands such as `git reset --hard` or `git checkout --` to overwrite local work unless the user explicitly requests that exact operation after being warned.
- Always separate user/unrelated dirty work from your own changes. Do not revert, overwrite, or reformat unrelated files to make a task easier.
- When production, payroll, RBAC, finance, inventory integrity, or database migrations are involved, apply `docs/SENIOR_ISSUE_REVIEW_PROMPT.md` standards before declaring completion.
