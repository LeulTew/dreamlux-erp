## Summary

This PR implements Phase 1 of the UX/UI Access & Polish epic (Issue #25). It hardens the custom `Button` component, introduces new animated button components, redesigns pagination, and standardises the border-radius design token (`rounded-2xl` / 16px) across all major pages.

## Linked Issue

Relates to #25

## Type of Change

- [x] New feature (non-breaking change which adds functionality)
- [x] Refactor (code cleanup, no functional changes)

---

## Change Log

| # | Area | File(s) | Description |
|---|------|---------|-------------|
| 1 | **PaginationControls** | `PaginationControls.tsx` | Full redesign: pill-shaped container, grouped Prev·numbers·Next, left-aligned **Show: X** selector + **Showing A–B of N** results label. Mobile responsive via flex-wrap. |
| 2 | **Dynamic page size – Employees** | `app/page.tsx` | Converted `limit` from const to state. Added `pageSize`, `onPageSizeChange`, `totalItems` props to pagination. Options: 10 / 20 / 50 / 100. |
| 3 | **Dynamic page size – Assets** | `app/assets/page.tsx` | Same as above; removed stale `ITEMS_PER_PAGE` constant. |
| 4 | **Dynamic page size – Events** | `app/events/page.tsx` | Same as above; `limit` state wired to TanStack Query key. |
| 5 | **PillButton** | `components/ui/PillButton.tsx` | Replaced old variant-based PillButton with cssbuttons-io bubble-fill animation. Border now uses `var(--border)` theme token (adapts light/dark). Radius: 16px. |
| 6 | **FancyButton** | `components/ui/FancyButton.tsx` *(new)* | Added line-displacement hover-animation button (cssbuttons-io). Dark-mode aware. Radius: 16px matching theme. |
| 7 | **FancyButton usage – Payments** | `app/hr/payments/page.tsx` | Replaced PillButton with FancyButton for the **New Payout** CTA. |
| 8 | **Radius standardisation – Events page** | `app/events/page.tsx` | Changed every `rounded-lg` button, input, select, modal, card, and drawer to `rounded-2xl`. Covers: toolbar, search, saved-views dropdown, filter builder, export dropdown, save-view modal, delete-view modal, mobile cards, skeleton loaders. |
| 9 | **Revert DeleteButton** | `components/ui/DeleteButton.tsx` *(deleted)* | Removed animated DeleteButton component and its test file. Restored original plain `<button>` trash toggles in employees, assets, and payments pages. |
| 10 | **Events page JSX fix** | `app/events/page.tsx` | Fixed JSX corruption in save-view / delete-view modal section caused by a bad multi-replace merge. |

---

## Verification & QA

- [x] Code compiles without TypeScript errors
- [x] ESLint passes with zero warnings or errors (`bun run lint`)
- [x] Unit tests pass successfully (`bun run test`)
- [x] Dark mode tested — `var(--border)` and `var(--foreground)` tokens used throughout
- [x] Mobile layout verified — pagination wraps cleanly via flex-wrap

## AI Usage & Self-Audit

- Were any AI prompts modified? No.
- Did you follow the codebase structure rules? Yes.
- Did you verify that tap targets are at least 44px high on mobile views? Yes — all buttons use `h-[44px]` or equivalent.
