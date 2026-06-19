# AI Collaboration & Style Rules for Dream Lux ERP

These rules apply to all AI agents working in this repository.

---

## 1. Operating Mode & Workflow

- Read existing files before editing.
- Keep changes small, vertical, and testable.
- Prefer established project patterns over new abstractions.
- Never silently remove behavior to make implementation easier.
- Add verification notes to every PR.

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
- **Commit Messages**: Commits must be prefix-based:
  - `feat(<scope>): ...` for new features.
  - `fix(<scope>): ...` for bug fixes.
  - `docs(<scope>): ...` for documentation changes.
  - `refactor(<scope>): ...` for code restructures.
  - `test(<scope>): ...` for adding/updating tests.
- **Self-Verification Checklist**: Before completing a task, verify against:
  - [Codebase Structure Rules](file:///.github/ai_templates/agent_structure.md) for module organization.
  - Pull request template items (type-checks, lint, migration dry-runs).
  - Screen/UI checks on viewport widths down to 320px (mobile responsiveness check).

---

## 6. Senior Frontend Engineering & Anti-Slop Design Systems (Mandatory on All UI Work)

**Trigger**: This section activates unconditionally whenever an agent:
- Creates a new React, Next.js, or React Native component
- Edits any existing UI component, page, or layout file
- Modifies CSS, Tailwind classes, design tokens, or theme configuration
- Adds or changes iconography, typography, color usage, or spacing
- Builds or refactors a design system primitive (button, card, badge, table, form field, modal, sheet)
- Touches any file in `components/`, `app/`, `pages/`, `screens/`, `styles/`, `tokens/`, or `theme/`

**Required action**: Before writing any UI code, load and apply the full rules in:

```
.agents/skills/enforce_senior_frontend_engineering_and_anti_slop_design_systems/SKILL.md
```

Use the `view_file` tool to read this skill file. It is non-optional. Proceeding with UI changes without reading it is a policy violation.

### Inline Summary (read the full skill for implementation detail)

The skill enforces six groups of standards:

| Group | Topic | Key Mandate |
|---|---|---|
| A | Typographic hierarchy | Metrics ≥ 2.5× label size; `tabular-nums` on all live data |
| B | Iconography & anti-slop | `lucide-react` only; no raw SVG dumps; no decorative blobs/shadows |
| C | Color & redundancy | 90% neutrals / 10% accent; no double-labeling |
| D | Native mobile physics | Spring gestures, haptics, pre-prompt permission gates (RN/Expo only) |
| E | Responsive web | Hover isolation, CLS containment, fluid grid safety (Next.js/Tailwind) |
| F | Mobile touch UX | Lower-third primary actions; 48×48px targets; bottom sheets over modals |

### Hard Bans (refuse and rewrite — no exceptions)

- `box-shadow` blur > 8px as primary element separator
- `background-clip: text` gradient text
- Floating decorative background gradient blobs
- Raw multi-line SVG path dumps inside component files
- Bare `hover:` Tailwind utilities without `@media (hover: hover)` guard
- `Alert.alert()` or browser `alert()`/`confirm()` for product UX
- Labels and metrics at equal visual weight on data surfaces
- More than 2 elements per viewport using the accent/gold color simultaneously

### Mandatory Pre-Ship Verification

Before completing any UI task, run through the full checklist at the bottom of the skill file. Every checkbox must pass. A task is not done until the checklist is clean.
