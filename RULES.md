# 🚀 Dream Lux ERP - Agent Development Rules & Workflow

This document details the mandatory workflow, tooling standards, build guidelines, and design quality practices that every developer agent (including Antigravity, ChatGPT, and Codex) must strictly follow in this repository.

---

## 1. 🛠️ Development & GitHub Workflow (`gh` CLI)

Always interact with GitHub using the `gh` tool to maintain project hygiene:

### 1.0 Spec-Driven Execution Pipeline

For every code-changing prompt, use this pipeline unless the user explicitly asks for read-only analysis:

`Plan → Issue → Branch → Implement → Secrets Check → Verify → Commit/PR → Review/Merge → Deploy/Smoke when required`

- Start with a short plan covering what will change, where, why, and any meaningful alternatives.
- Purely conversational, diagnostic, or read-only prompts are exempt from issue/branch/commit requirements.
- Continuing work on the same scope reuses the existing issue and branch when practical; unrelated work gets a separate issue and branch.
- If it is unclear whether a request is continuing work or new work, state the judgment before coding so the user can redirect.
- Keep issue checklists and PR checklists synchronized with reality. Mark an item complete only after implementation and verification are actually done.
- Keep a durable plan note in `plans/` for substantial or multi-PR work, or use an explicitly temporary external note when the user asks not to commit plan artifacts.
- Repository-specific DreamLux rules override generic imported constitutions. In this repo, `main` is the production/integration branch; do not switch to a generic `develop` flow unless the user explicitly changes the branch strategy.

1. **Issue Management**:
   - Every task or bug must correspond to an active GitHub issue.
   - Use `gh issue list` to inspect current work, or `gh issue create` to initialize a new issue if none exists.
   - Properly label the issue (e.g. `bug`, `enhancement`) and assign it to yourself (`assign @self`).
   - For new issues, prefer a user-story body with context, execution plan, task checklist, and expected files/areas touched.
   - For follow-up work on an existing issue, add a concise issue comment with the new execution plan and added checklist items instead of creating duplicates.

2. **Branching Strategy**:
   - Create a clean feature branch from `main` using a standard naming pattern: `feature/<issue-id>-short-name` (e.g. `feature/6-amharic-fix`).
   - Work must never be done directly on `main` unless it is a simple diagnostic/hotfix check.
   - After every PR merge, switch back to `main`, pull fast-forward, verify `git status --short --branch` is clean, then continue from the merged target.

3. **Pull Request (PR) Lifecycle**:
   - Use `gh pr create` to initiate a PR from your feature branch to the target integration branch.
   - Set titles prefixed by semantic tags: `feat(...)`, `fix(...)`, `chore(...)`, `docs(...)`.
   - Ensure the PR description matches the project template, references the solved issue number, and lists all completed tasks.
   - All checkmarks on the issue and PR checklists must be ticked (`[x]`) before merging.
   - Use `gh pr merge --merge` to merge once fully validated.
   - Assign the PR to yourself when possible.
   - Include exact verification evidence in the PR: commands run, pass/fail result, CI status, and deployment/prod-smoke URLs when applicable.
   - Do a senior diff review before merge: inspect `git diff`, scope hygiene, regressions, security, data integrity, performance, and test coverage instead of reviewing only the happy path.
   - If `gh` is unavailable, use connected GitHub tooling if present. If neither is available, provide exact manual issue/PR commands and do not silently skip GitHub hygiene.

### 1.1 Commit, Secrets, and Local Safety

- Before staging, inspect `git status`, the diff, and any new files for secrets or generated artifacts.
- Never stage or commit `.env`, `.env.*`, private keys, tokens, passwords, connection strings, local config, build output, or other sensitive files.
- Add or update `.gitignore` when introducing likely-sensitive or generated local artifacts; keep `.env.example` placeholder-only.
- Never hardcode secrets or credentials. Read them from environment variables or the existing configured secret store.
- If a secret is found in the working tree or diff, stop, do not stage it, explain what was found, and ask whether to move it to env/config and rotate it if already exposed.
- Confirm staging/commit and push/PR intent when the user has not already explicitly asked for those actions in the current task.
- Never use `git reset --hard`, destructive `git checkout --`, or any command that overwrites unrelated local work unless the user explicitly requests that exact destructive operation after being warned.
- Treat unrelated dirty files as user work. Do not revert, reformat, or overwrite them.

---

## 2. ⚠️ Shell Environment, Verification & Testing Commands

### 🐚 WSL Fish Shell Wildcard Expansion
- The developer's WSL environment runs the **fish shell** by default.
- Fish shell handles wildcards/globbing differently from bash (e.g. `*.sql` without quotes will cause expansion errors).
- **Rule**: When executing shell commands involving wildcards or file paths (like `find`, `grep`, `cp`), always wrap the wildcard arguments in single quotes, or wrap the entire execution via `bash -c` (e.g. `wsl bash -c "find . -name '*.sql'"`).

### 🧪 QA Testing & Verification Commands
Before submitting commits or creating pull requests, you must run quality assurance tests to ensure that everything is correct.

#### Within Backend Module:
```bash
cd backend
# Run test suite
bun test
# Run specific test file
bun test src/__tests__/events.test.ts
```

#### Within Frontend Module:
```bash
cd frontend
# Run frontend unit tests
bun test
```

#### From Repository Root (Outside both):
```bash
# Run all workspace test suites
bun run test
```

### 🧹 Linter, Typecheck & Compiler Verification
We enforce a strict **Zero-Warning and Zero-Error Policy**. All code must compile cleanly:

#### Backend Lint & Typecheck:
```bash
cd backend
bun run lint
eslint . && tsc --noEmit
bun run build
```

#### Frontend Lint & Typecheck:
```bash
cd frontend
bun run lint
next lint && tsc --noEmit
bun run build
```

#### Workspace-wide Validation:
```bash
bun run lint && bun run build
```

### 🗄️ Database Setup & QA Commands
When verifying schema adjustments or seeding the sample data for testing:
```bash
cd backend
# Run database migrations
bun run db:migrate
# Seed DreamLux SRD sample data
bun run db:seed
```

- **Warning Resolution**: Any ESLint warnings (such as missing react hook dependencies, unused variables, un-escaped HTML characters, or improper callback memoization) must be fixed before proceeding.
- **Dependency Wrapping**: When passing translation methods (like the inline helper `t`) or complex objects into `useMemo` or React component dependencies, wrap them in `useCallback` or ensure stable closures to prevent infinite warning logs and re-render cycles.

---

## 3. Design Aesthetics, Visual Quality & UI Engineering Standards

### 3.1 Mandatory Skill Load — Any New or Updated UI

**This rule fires unconditionally on every task that creates or modifies UI output.**

Triggers include (but are not limited to):
- Creating a new React or Next.js component, page, or layout
- Editing any existing component, page, or layout file
- Modifying CSS, Tailwind classes, design tokens, or `globals.css`
- Adding or changing iconography, typography, color usage, or spacing
- Building or refactoring a design system primitive (button, card, badge, table, input, modal, sheet)
- Touching any file under `components/`, `app/`, `pages/`, `styles/`, `tokens/`, or `theme/`

**Required action**: Before writing any UI code, read the full skill file:

```
.agents/skills/enforce_senior_frontend_engineering_and_anti_slop_design_systems/SKILL.md
```

Use the `view_file` tool to read it. It is non-optional. Proceeding without reading it is a policy violation.

The skill enforces six groups of standards that apply to all UI work in this project:

| Group | Topic | Core mandate |
|---|---|---|
| A | Typographic hierarchy | Metrics ≥ 2.5× label size; `tabular-nums` on all live data |
| B | Iconography & anti-slop | `lucide-react` for new code; no raw SVG dumps; no blur/gradient decorations |
| C | Color & redundancy | 90% neutrals / 10% gold accent; no double-labeling |
| D | Native mobile physics | Spring gestures, haptics, permission gates (RN/Expo only) |
| E | Responsive web | Hover isolation, CLS containment, fluid grid safety |
| F | Mobile touch UX | Lower-third primary actions; 48×48px targets; bottom sheets |

### 3.2 When to Also Use the `impeccable` Skill

The `impeccable` skill (`.agents/skills/impeccable/SKILL.md`) is a full craft system for major UI work. Use it **in addition to** the skill above (never instead of it) when:

- Building a **new feature surface from scratch** — run `$impeccable shape [feature]` before writing code
- Conducting a **formal quality audit** before shipping — run `$impeccable audit [target]`
- Doing a **final polish pass** — run `$impeccable polish [target]`

Do **not** invoke `impeccable` for small scoped changes (a label fix, a spacing tweak, a color token correction). Apply the senior skill's checklist directly and ship.

**Precedence**: if `impeccable` ever suggests a pattern that conflicts with the senior skill's hard bans (gradient text, blur > 8px shadows, floating gradient blobs, bare `hover:` utilities), the **senior skill wins**. DreamLux committed brand tokens in `globals.css` must never be overridden by `impeccable`'s palette generator.

### 3.3 Hard Bans — Refuse and Rewrite Without Exception

- `box-shadow` blur > 8px as the primary element separator
- `background-clip: text` gradient text on any value or heading
- Floating decorative background gradient blobs
- Raw multi-line SVG path dumps inside component files
- Bare `hover:` Tailwind utilities without `@media (hover: hover)` guard
- `Alert.alert()` or `window.confirm()` / `window.alert()` for any product UX
- Labels and metrics at equal visual weight on data surfaces
- More than 2 elements per viewport using the gold accent simultaneously
- `rounded-2xl` or higher on structural containers (cards, panels, inputs)
- `react-icons` imports in files that already use `lucide-react` (never mix packages in one file)

### 3.4 Anti-AI Slop & DreamLux Identity

- **Brand tokens** (do not invent new colors): gold `oklch(78% 0.12 82)` / `#D4AF37`, obsidian `#050506`, slate-gray neutrals. All defined in `globals.css`.
- **WCAG AA minimum**: 4.5:1 for body text, 3:1 for large text, 4.5:1 for placeholder text. Verify all new and modified text.
- **Radius ceiling**: `--radius-sm: 8px` / `--radius-md: 10px`. Never exceed `--radius-lg: 14px` on structural containers.
- **No AI tells**: no identical card grids, no eyebrow labels on every section, no numbered section markers as scaffolding, no hero-metric SaaS templates.
- **Viewport verification**: check every UI change at 320px, 390px, 768px, 1366px, 1920px. Document results in PR verification notes.

---

## 4. 🌍 Localization & Translation Sync

- **Reactivity**: Ensure the language switcher toggle immediately propagates language state updates across all page components and layouts without requiring a hard refresh.
- **Breadcrumbs**: All path routes must use localized labels inside [Breadcrumbs.tsx](file:///frontend/src/components/Breadcrumbs.tsx) dynamically synchronized through the language hook.
- **Clean Fallbacks**: Never leave hardcoded strings in layouts, buttons, form headers, or report sheets. Every text node must use the translation function `t(...)` with clean fallbacks.

---

## 5. 🚀 Deployment & Release

Once tests pass with **0 warnings**, deploy to Vercel production by running:

```bash
bun run deploy
```

This ensures that both the backend and frontend services are compiled, packaged, and published successfully. Always record the resulting production URLs in your final status report.

---

## 6. 🛡️ Dynamic RBAC & UI/UX Consistency Implementation Rules (#24 & #25)

When implementing the dynamic role-permission manager (#24) and permission-aware UI/UX access polish (#25), all developers and agent instances must strictly adhere to the following stack-aware guidelines:

- **Mindfulness of Stack & Existing Codebase**:
  - Reference the actual DreamLux backend/frontend architecture split.
  - Leverage and build upon the schema entities already present: `roles`, `permissions`, `role_permissions`, and `users.role_id` / `users.role_ids`.
  - Acknowledge and refactor existing hardcoded backend role checks (e.g. `canAccessProfitReports`, `canOverrideCompleted`, and `canLogTrips`) rather than assuming dynamic RBAC is pre-configured.
  - Conform to the existing Next.js frontend + Express backend route structure.
  - Maintain the rule that backend authorization must be real and secure; do not rely on frontend control hiding as a security barrier.
  - Include validation under Bun runtime and ensure both frontend/backend test expectations are explicitly verified.
  - Ground all UI features in our core design guidelines: premium aesthetics (warm gold accents, dark slate borders), bilingual English/Amharic switcher, 320px mobile responsiveness, and clean layout spacing.

- **Incremental Execution Strategy**:
  Because #24 and #25 are broad epic-level architectures, they must be developed and reviewed incrementally through smaller, focused PRs. Do not submit a single monolithic PR. Follow this sequence:
  1. **Phase 1**: RBAC database schema extension + seed canonical permissions.
  2. **Phase 2**: Backend permission middleware replacement (e.g., transition from role strings to permission slug guards).
  3. **Phase 3**: User/role administrative dashboard UI.
  4. **Phase 4**: Permission-aware sidebar filtering and Next.js route protection.
  5. **Phase 5**: UX consistency polish, Amharic spacing adjustments, and mobile QA pass.

---

## 7. 🔍 Senior Issue / PR Review Prompt

When the user says a short instruction such as `use docs/SENIOR_ISSUE_REVIEW_PROMPT.md on issue #20`, `review PR #26 with the review doc`, or `use the senior prompt on issue #y`, agents must load and follow:

[docs/SENIOR_ISSUE_REVIEW_PROMPT.md](file:///docs/SENIOR_ISSUE_REVIEW_PROMPT.md)

This prompt expands the short request into a full senior engineering, architecture, OWASP/API security, performance, QA, SRD-grounded, git-diff-grounded, scope-hygiene, localization, UI/UX, and verification review. The agent must not treat the short user request as a casual opinion check; it is a directive to perform the full review process unless the user explicitly asks for a concise summary only.
