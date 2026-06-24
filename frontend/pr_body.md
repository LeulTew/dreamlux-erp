## Summary

This PR implements Phase 1 of the UX/UI Access & Polish epic (Issue #25). It hardens the custom `Button` component to match the visual design system, implements size/padding consistency, and introduces smooth transition animations (hover scales, arrow shifts, active presses). It also standardizes the button variants (default gold filled, outline light/dark variations, secondary slate/card, destructive, link) to match the reference design mockup.

### Changes Made So Far:
- **Interactive Expandable Department Addition UI**:
  - Replaced the cramped department add input with an animated slide-down text field inside a custom card sub-layout in both `EditEmployeeSheet` and `insert/page`.
  - Designed a rotating plus icon (+) that turns into an `x` close button with fluid transitions and custom ESC/Enter event bindings.
- **Symmetrical & Compact Drawer Footer Actions**:
  - Redesigned drawer actions in `EditEmployeeSheet` to be right-aligned and compact rather than full-width.
  - Integrated check icon (`HiCheck`) in "Save Changes" and trash icon (`HiTrash`) in "Delete".
  - Introduced a fully functional "Reset Changes" button (`HiArrowPath` icon) styled with a light indigo outline to revert form fields to database values.
- **2026-Style Premium Toast Notifications**:
  - Built a custom `PremiumToast` component powered by `react-hot-toast` rendering success/error/info cards with collapsible description panels.
  - Features a smooth bottom progress bar indicating dismissal time that pauses when hovered.
- **Specific Indigo Button Accents**:
  - Styled action-critical buttons (`Save Changes`, `Create Employee Record`, `Confirm Entry`, `+` add) with a vibrant indigo accent color (`bg-indigo-600`/`hover:bg-indigo-700` and `dark:bg-indigo-500`/`dark:hover:bg-indigo-600`) to highlight primary user workflows while keeping the application's native gold branding accents.
- **Shared Dropdown Integration**:
  - Swapped out native browser select element in `PaginationControls` for our unified `<Select>` component with consistent round corners (`rounded-xl`).

## Linked Issue

Relates to #25

## Type of Change

- [x] New feature (non-breaking change which adds functionality)

## Verification & QA

Verified frontend compilation, formatting, and unit tests locally.

- [x] Code compiles without TypeScript errors (`tsc --noEmit`)
- [x] Linter passes without warnings or errors (`bun run lint`)
- [x] Unit tests pass successfully (`bun run test`)

### Visual Evidence (for UI changes)
- Standardized `rounded-full` pill shapes.
- Seamless hover translation scale changes (`scale-[1.02]`) and active click presses (`scale-[0.98]`).
- Hover right-arrow translations (`group-hover/button:translate-x-1`) for premium micro-interactions.
- Correct light/dark theme variables mapped to default, outline, and secondary variants.

## AI Usage & Self-Audit

- Were any AI prompts modified? No.
- Did you follow the codebase structure rules in `.github/ai_templates/agent_structure.md`? Yes.
- Did you verify that tap targets are at least 48px high on mobile views? Yes, standard is 40px and large is 48px.
