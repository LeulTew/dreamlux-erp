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

### Senior Frontend Engineering & Anti-Slop Design Rules

#### Group A: Quantitative Dominance & Typographic Hierarchy
- **Metric-First Visual Anchoring**: Prioritize raw quantitative metrics over semantic titles or metadata labels. Format numerical values significantly larger than their context labels (e.g., 32px to 48px bold tracking-tight). Use tabular-monospace font variants (`font-variant-numeric: tabular-nums` or `font-mono`) to prevent layout shifts or numerical jitter during live database updates.
- **Label De-emphasis and Proximity**: Compress and mute description labels to force instant data focus. Position modifying titles or tags directly below the metric using precise, tight padding (under 4px). Drop label sizing down to 11px-12px, convert to medium weight, and apply a secondary/muted color token (`text-neutral-400` or `var(--text-muted)`). Never space labels and metrics equally.
- **Tabular and Functional Data Density**: Eradicate raw narrative prose or loose lists for data presentation. Flatten complex objects into precise alignment grids or high-density layout panels. Maximize scannability by binding contextual labels directly into the data matrix, completely eliminating empty or purely decorative whitespace.

#### Group B: Iconography, Asset Hygiene & Anti-Slop Primitives
- **Strict Icon Package Enforcement**: Ban all generic UI emojis, raw inline SVG dumps, and un-optimized asset injections. Import explicit vector assets exclusively from modern, standardized, optimized icon packages (e.g., `lucide-react`, `@heroicons/react`). Wrap icons within dedicated sizing and color classes. Never paste massive raw multi-line SVG paths directly inside localized component layout files.
- **Zero Decorative Slop**: Absolute prohibition of ambient "AI Slop" styling gimmicks. Ban floating background gradients, un-aliased shadows, and fuzzy glassmorphic blurring filters used to hide poor text readability. Enforce visual structure using sharp, single-pixel crisp solid borders (`border border-neutral-800`) set against absolute dark backgrounds (`bg-black` or `bg-neutral-950`).

#### Group C: Clutter Management, Color Tokens, and Redundancy Reduction
- **Absolute Input Minimization**: Avoid forcing manual keyboard text invocation for predictable user operations. Replace general open-ended text inputs with instant tap-to-select structural token cards, segmented option sliders, or predefined badge-choice blocks to radically minimize user effort and form friction.
- **Strict 90/10 Color Distribution**: Construct 90% of the display architecture using high-contrast, structural neutrals (deep charcoal, pitch blacks, precise cool grays). Limit high-saturation branding accents to crucial interactive destinations, reserving vivid accent color tokens exclusively for functional interactive responses, primary actions, or critical system warning states.
- **Elimination of Structural Redundancy**: Eradicate double-labeling and repeating descriptions. If a structural header or a dataset cell inherently clarifies context, never add redundant helper strings underneath it. Let precise styling, alignment, and data units (e.g., `$`, `ms`, `%`, `kb/s`) communicate meaning instantly.

#### Group D: Native Mobile App Specific Interaction
*(Applies to Expo / React Native / Native Mobile development wrappers)*
- **Interruptible Gesture and Spring Physics**: Enforce physical interactive responsive physics on touch targets. Bind touch points to interruptible spring physics models. Target items must listen for drag-away flags or parent scrolling events; if the user scrolls the view or drifts their finger mid-press, seamlessly animate the touch asset back to rest and cancel the firing contract immediately.
- **Hardware Haptic Alignment**: Sync viewport alterations directly with device haptic physical responses. Programmatically trigger precise, micro-haptic ticks (`Haptics.impactAsync`) on critical state transitions, successful forms, and slider snaps to bridge software action with physical tactile reassurance.
- **Pre-Prompt Permission Orchestration**: Never initiate raw, unannounced native operating system access requests. Intercept physical permissions (Camera, Files, Location, Push notifications) behind a custom layout view detailing exactly what feature benefits are unlocked by the access. Invoke the native system prompt only after the user triggers explicit confirmation from this explanatory screen.

#### Group E: Responsive Web Architecture
*(Applies to Tailwind CSS / React / Next.js Web applications)*
- **Web Sticky Hover Isolation**: Isolate mouse-overs to protect mobile touchscreen viewports from sticky element states. Enforce hover actions exclusively behind Tailwind's touch-safe hover modifier (`hover:text-white md:hover:bg-neutral-900`) or explicit media feature queries (`@media (hover: hover)`). Prevent tooltips, dropdown menus, or color states from getting stuck on mobile screens when a user taps away.
- **Content Layout Shift (CLS) Hard Containment**: Zero visual frame jumping or content shifting during asynchronous mutations. Enforce locked aspect ratios (`aspect-video`, `aspect-square`) and precise layout boxes around incoming data, dynamically parsed graphics, or media slots. Allocate rigid skeleton dimensions that match the incoming markup tree to secure absolute stability during Server-Side Rendering (SSR) and client hydration cycles.
- **Fluid Grid Safety Boundaries**: Prevent grid collapse, overlap, or line clipping on non-standard breakdown widths. Utilize CSS Grid layout rules (`grid-cols-[repeat(auto-fit,minmax(280px,1fr))]`) coupled with structural flexing flags. Ensure layout components naturally reflow or collapse fluidly across fine viewport transitions, blocking text truncation or overlap errors on narrow viewports.

#### Group F: Mobile-Viewport Touch Architecture
*(Screens Under 768px Width)*
- **Lower-Third Reachability Prioritization**: Map primary high-frequency interactive triggers directly into the handheld natural thumb zone. Position global filtering menus, confirmation buttons, checkout steps, and destructive actions within the lower 33% to 40% of the viewport area. Abolish the use of top-corner burger menus or header-nested actions for core user behaviors.
- **Tap Footprint and Fat-Finger Padding**: Enforce minimum safe collision boxes for accurate finger tracking. Secure a rigid touch target geometry of at least 48x48px for every actionable element. Isolate adjacent buttons or links with a clear margin boundary (minimum 8px) to insulate operations against double-tap or misclick errors.
- **Modern Bottom Sheet Orchestration**: Replace intrusive full-screen center layout alerts with progressive bottom sheets. Route details, complex form options, and configuration modifications into bottom-anchored, swipe-dismissible sheets. Ensure overlays can be easily discarded via intuitive down-swipes or tapping outside the structural focus box.

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
- **Merge Discipline**: DO NOT merge any pull requests or proceed to subsequent task phases/issues unless the user explicitly gives authorization in a prompt. Keep all PRs open as drafts or ready for review, and do not advance past the current phase until instructed. Even when authorized, do not merge until local verification, senior diff review, and required GitHub checks are clean. After authorized merge, return to `main`, pull fast-forward, verify a clean worktree, and deploy when the task requires production release.
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
