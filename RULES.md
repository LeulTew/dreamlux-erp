# 🚀 Dream Lux ERP - Agent Development Rules & Workflow

This document details the mandatory workflow, tooling standards, build guidelines, and design quality practices that every developer agent (including Antigravity, ChatGPT, and Codex) must strictly follow in this repository.

---

## 1. 🛠️ Development & GitHub Workflow (`gh` CLI)

Always interact with GitHub using the `gh` tool to maintain project hygiene:

1. **Issue Management**:
   - Every task or bug must correspond to an active GitHub issue.
   - Use `gh issue list` to inspect current work, or `gh issue create` to initialize a new issue if none exists.
   - Properly label the issue (e.g. `bug`, `enhancement`) and assign it to yourself (`assign @self`).

2. **Branching Strategy**:
   - Create a clean feature branch from `main` or `develop` using a standard naming pattern: `feature/<issue-id>-short-name` (e.g. `feature/6-amharic-fix`).
   - Work must never be done directly on `main` unless it is a simple diagnostic/hotfix check.

3. **Pull Request (PR) Lifecycle**:
   - Use `gh pr create` to initiate a PR from your feature branch to the target integration branch.
   - Set titles prefixed by semantic tags: `feat(...)`, `fix(...)`, `chore(...)`, `docs(...)`.
   - Ensure the PR description matches the project template, references the solved issue number, and lists all completed tasks.
   - All checkmarks on the issue and PR checklists must be ticked (`[x]`) before merging.
   - Use `gh pr merge --merge` to merge once fully validated.

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

## 3. 🎨 Design Aesthetics & Visual Quality (No AI Slop)

All UI elements must look premium, modern, and aligned with standard high-quality styling principles:

- **Impeccable Style Standards**: Refer to the style guidelines and rules defined in the [Impeccable Style Guide](file:///.agents/skills/impeccable/SKILL.md) and apply the visual hygiene rules listed in [AGENTS.md](file:///AGENTS.md).
- **Anti-AI Slop**: Do not generate basic, raw, or unpolished layouts. Maintain balanced contrast ratios (meeting WCAG 4.5:1 standards), smooth modern transitions, and elegant styling tokens (e.g. warm elegant gold `#D4AF37` and dark slate gradients).
- **Radius & Borders**: Keep container roundness clean and minimal (`rounded-lg` or `rounded-xl`). Avoid huge round shapes or extreme drop shadows; favor sharp, elegant high-contrast borders.

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
