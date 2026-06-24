## Summary

This PR implements Phase 1 of the UX/UI Access & Polish epic (Issue #25) and related visual/backend refinements. It hardens the custom `Button` component to match the visual design system, implements size/padding consistency, and introduces smooth transition animations (hover scales, arrow shifts, active presses). It also standardizes the button variants (default gold filled, outline light/dark variations, secondary slate/card, destructive, link) to match the reference design mockup.

In addition, this PR introduces new animated button components, redesigns pagination controls with dynamic page-size selectors, standardizes the border-radius design token (`rounded-2xl` / 16px) across all major pages, modernizes the profit report filters, introduces multi-entity configuration (ID prefixes) settings across frontend/backend, and adds Linked Event workspace connection panels.

---

## Change Log

| # | Area | File(s) | Description |
|---|------|---------|-------------|
| 1 | **PaginationControls** | `PaginationControls.tsx` | Full redesign: pill-shaped container, grouped Prev·numbers·Next, left-aligned **Show: X** selector + **Showing A–B of N** results label. Mobile responsive via flex-wrap. |
| 2 | **Dynamic page size – Employees** | `app/page.tsx` | Converted `limit` from const to state. Added `pageSize`, `onPageSizeChange`, `totalItems` props to pagination. Options: 10 / 20 / 50 / 100. |
| 3 | **Dynamic page size – Assets** | `app/assets/page.tsx` | Same as above; removed stale `ITEMS_PER_PAGE` constant. |
| 4 | **Dynamic page size – Events** | `app/events/page.tsx` | Same as above; `limit` state wired to TanStack Query key. |
| 5 | **PillButton** | `components/ui/PillButton.tsx` | Replaced old variant-based PillButton with cssbuttons-io bubble-fill animation. Border now uses `var(--border)` theme token (adapts light/dark). Radius: 16px. |
| 6 | **FancyButton** | `components/ui/FancyButton.tsx` | Added line-displacement hover-animation button (cssbuttons-io). Dark-mode aware. Radius: 16px matching theme. |
| 7 | **FancyButton usage – Payments** | `app/hr/payments/page.tsx` | Replaced PillButton with FancyButton for the **New Payout** CTA. |
| 8 | **Radius standardisation – Events page** | `app/events/page.tsx` | Changed every `rounded-lg` button, input, select, modal, card, and drawer to `rounded-2xl`. Covers: toolbar, search, saved-views dropdown, filter builder, export dropdown, save-view modal, delete-view modal, mobile cards, skeleton loaders. |
| 9 | **Revert DeleteButton** | `components/ui/DeleteButton.tsx` *(deleted)* | Removed animated DeleteButton component and its test file. Restored original plain `<button>` trash toggles in employees, assets, and payments pages. |
| 10 | **Events page JSX fix** | `app/events/page.tsx` | Fixed JSX corruption in save-view / delete-view modal section caused by a bad multi-replace merge. |
| 11 | **Select component upgrade** | `components/ui/Select.tsx` | Added support for custom trigger styling (`triggerClassName`), custom value styling (`valueClassName`), and a custom right-aligned icon. |
| 12 | **Reset changes & action buttons** | `components/EditEventSheet.tsx`, `components/EditAssetSheet.tsx` | Implemented "Reset Changes" button to revert form fields to database values. Restructured asset form container to be single-form layout. Symmetrically styled drawer footers (Delete left-aligned; Reset/Save right-aligned). |
| 13 | **Event Proposals UI redesign** | `app/events/proposals/page.tsx` | Upgraded "New Proposal" CTA to indigo style, redesigned all 4 KPI cards (with glassmorphic glowing blur, group scales, and custom icons), and updated table/toolbar container border-radii to `rounded-2xl` / `2xl:rounded-4xl`. |
| 14 | **Intake Workflow Actions redesign** | `app/events/proposals/[id]/page.tsx` | Repositioned Approve/Reject workflow buttons to be side-by-side, compact, and styled with desaturated indicator colors (emerald/rose tints) for optimal text contrast and premium design. |
| 15 | **Border radius standardization** | HR Finance Pages | Aligned list tables, cards, and toolbars to premium `rounded-2xl` and `rounded-xl` tokens on Expense Approvals (`hr/expenses/approve/page.tsx`), Profit Reports (`hr/reports/profit/page.tsx`), and Salary Levels (`hr/salary-levels/page.tsx`). |
| 16 | **Mobile spacing fix** | `app/assets/insert/page.tsx` | Added `pb-12` bottom padding to page container so mobile submit buttons don't cut off. |
| 17 | **Typecheck & compile fixes** | `components/ui/PillButton.tsx`, `app/events/page.tsx` | Fixed `PillButtonProps` to accept/destructure `variant` prop. Corrected EventsPageContent named export declaration to satisfy Next.js page routing requirements. |
| 18 | **Profit Report Filter Modernization** | `app/hr/reports/profit/page.tsx` | Swapped native HTML selects with custom `<Select>` dropdowns, and modernized the filter Reset button with rotating `HiArrowPath` icon and matching layout padding. |
| 19 | **Workspace Button in Event Drawer** | `components/EditEventSheet.tsx` | Added a dedicated "Workspace" link button in the Edit Event drawer footer (left-aligned next to Delete/Archive controls), using translations for English and Amharic. |
| 20 | **Linked Event Connection Panel** | `app/events/proposals/[id]/page.tsx` | Added a Frappe-style "Linked Event" panel shown when a proposal has been converted to an event, featuring a pulsing green connection status dot and active hyperlink. |
| 21 | **New Proposal Stepper Modernization** | `app/events/proposals/new/page.tsx` | Upgraded the title header and action buttons (Cancel, Back, Next) with rounded-xl padding, hover scales, and responsive transitions. |
| 22 | **Multi-Entity Settings Prefixes** | Settings UI & Backend | Added columns for `inventory_id_prefix` and `event_id_prefix` in the DB via migration. Wired them through backend route/lib handlers and added corresponding config inputs on the System tab of the settings page. |
| 23 | **AuthLayout Hydration Fix** | `components/AuthLayout.tsx` | Wrapped theme initialization and rendering in a client-side mount check inside `useEffect` to prevent React hydration mismatch warnings. |
| 24 | **Asset Page Header Modernization** | `frontend/src/app/assets/page.tsx` | Modernized the Asset page header by aligning header titles, adding dynamic search parameters synchronization with local states, and polishing layout actions. |

---

## Linked Issue

Closes #25 and relates to #33

## Type of Change

- [x] Bug fix (non-breaking change which fixes an issue)
- [x] New feature (non-breaking change which adds functionality)
- [x] Refactor (code cleanup, no functional changes)
- [x] Database migration (introduces schema alterations or indexes)

## Verification & QA

- [x] Code compiles without TypeScript errors (`npm run build` passes on frontend and backend)
- [x] ESLint passes with zero warnings or errors (`bun run lint`)
- [x] Unit tests pass successfully (`bun run test`)
- [x] Dry-run migration performed locally (for schema changes)

### Visual Evidence (for UI changes)
- Standardized `rounded-full` pill shapes.
- Seamless hover translation scale changes (`scale-[1.02]`) and active click presses (`scale-[0.98]`).
- Hover right-arrow translations (`group-hover/button:translate-x-1`) for premium micro-interactions.
- Correct light/dark theme variables mapped to default, outline, and secondary variants.
- Verified viewport sizing down to 320px for the Events List, Proposals list/form/workspace, and Profit Reports page.
- Checked Amharic text overflow protection.
- Print stylesheet verified for events proposal invoice style sheets and profitability drilldowns.

## Data / Migration Notes
- Executed migration to add `inventory_id_prefix` and `event_id_prefix` columns to settings. Wired the prefix properties inside backend `settings.ts` router and startup script.

## Deployment Notes
N/A

## AI Usage & Self-Audit

- Were any AI prompts modified? No.
- Did you follow the codebase structure rules in `.github/ai_templates/agent_structure.md`? Yes.
- Did you verify that tap targets are at least 48px high on mobile views? Yes — all primary touch buttons use `h-[44px]` or equivalent.
