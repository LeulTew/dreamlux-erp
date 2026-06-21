## Senior Frontend Architecture Notes — RBAC Permission UI

> **Grounding**: This comment covers only the frontend UI aspects of RBAC. Before implementing the permission hook provider, sidebar gates, or user-role admin UI, read `.agents/skills/enforce_senior_frontend_engineering_and_anti_slop_design_systems/SKILL.md`. For the user-role admin UI surface (new page), invoke `$impeccable shape [permission admin UI]` before writing code.

---

### Permission Hook & Provider Architecture

**Hook interface**:
```tsx
// hooks/use-permission.ts
export function usePermission(slug: string): boolean
export function usePermissions(slugs: string[]): Record<string, boolean>
export function useHasAnyPermission(slugs: string[]): boolean
```

- These hooks read from a React context populated at login from `GET /auth/permissions`.
- The context must be hydrated **before** any protected component mounts. Use Next.js middleware or a `PermissionProvider` wrapping the app layout.
- On context loading state: render a skeleton, not a flash of protected content. The skeleton must match the dimensions of the actual content (CLS prevention — see Group E2 of the skill).
- Never derive permission state from the JWT claim directly in components — always go through the hook. This keeps the permission resolution logic in one place.

**Context shape**:
```ts
interface PermissionContext {
  permissions: Set<string>; // effective slugs
  loading: boolean;
  error: Error | null;
}
```

Using a `Set<string>` (not an array) makes `has(slug)` O(1) — critical for sidebar rendering where 15–30 permission checks happen per navigation render.

---

### Sidebar Permission Gates

**Implementation pattern**:
```tsx
// In app-sidebar.tsx
const NAV_ITEMS = [
  {
    label: 'Events',
    href: '/events',
    icon: Calendar, // lucide-react
    permission: 'events:read',
  },
  {
    label: 'Payroll',
    href: '/payroll',
    icon: Banknote, // lucide-react
    permission: 'payroll:read',
  },
  // ...
];

// Render:
const visibleItems = NAV_ITEMS.filter(item => usePermission(item.permission));
```

**Visual requirements**:
- Do not render a disabled/greyed-out sidebar link. If the user lacks permission, the link does not exist in the DOM.
- Do not render a sidebar group label (e.g. "Financial") if all items in the group are hidden.
- No "lock" icon or tooltip on hidden items — silent omission, not visible denial.

**Icons**: All sidebar icons must be from `lucide-react`. The current `app-sidebar.tsx` likely uses a mix — audit it and replace non-lucide icons in the same PR that adds permission gating. This is the only acceptable reason to do icon replacement in a non-UI-focused issue.

Suggested icon map:
| Section | Icon |
|---|---|
| Events | `Calendar` |
| HR / Employees | `Users` |
| Inventory / Assets | `Package` |
| Payroll | `Banknote` |
| Expenses | `Receipt` |
| Reports | `BarChart2` |
| Settings | `Settings2` |
| Trips | `Car` |
| Allocations | `ArrowRightLeft` |

---

### Permission-Aware Page Shell

**Loading state** (permission context is loading):
- Render skeleton bars that match the exact dimensions of the actual page content.
- Skeleton: `animate-pulse bg-muted rounded-md` with fixed `h-[Xpx]` matching the real content.
- Never use a full-page spinner — it causes CLS on hydration.

**Denied state** (user navigates directly to a restricted route):
```tsx
// AccessDenied component spec
<div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
  <ShieldOff className="size-8 text-muted-foreground" /> {/* lucide-react */}
  <h2 className="text-lg font-semibold text-foreground">Access Restricted</h2>
  <p className="text-sm text-muted-foreground max-w-[320px] text-center">
    You don't have permission to view this page.
  </p>
  <Button variant="outline" size="sm" onClick={() => router.back()}>
    Go Back
  </Button>
</div>
```
- No gradient, no decorative elements, no large illustrations.
- The button must be `variant="outline"` (not primary gold) — this is not a primary action.
- `ShieldOff` from `lucide-react` at `size-8` (32px). No other icon packages.

---

### User-Role Admin UI

**This is a new page — use `$impeccable shape [user role admin UI]` before writing code.**

**Page structure**:
```
Page: Settings > Users & Roles

Tab bar: [Users] [Roles] [Permissions]

Users tab:
  Search input | Role filter dropdown | [Invite User] button
  Table: Name | Email | Role | Status | Last login | Actions
  
Roles tab:
  Table: Role name | Permissions count | User count | Actions
  [+ Add Role] button (top right)
  
Permissions tab (read-only for non-owners):
  Grouped by module: Events, HR, Payroll, Inventory, Expenses, Reports, Settings
  Each group: expandable, shows permission slug + label + which roles have it
  Visual: checkbox grid (Role columns × Permission rows)
```

**Role-permission matrix** (the Permissions tab):
- This is a data-dense grid. Columns are roles, rows are permissions grouped by module.
- Column header: role name, `text-xs font-semibold`, `text-center`, max 100px wide.
- Row: permission label `text-xs text-foreground`, permission slug `text-[10px] text-muted-foreground font-mono`, then a checkbox per role column.
- Checked state: `Check` icon from `lucide-react` at `size-3`, `text-primary`.
- Unchecked state: empty cell or `Minus` icon at `size-3 text-muted-foreground/30`.
- Do not use color fills per cell — rely on the `Check`/`Minus` icon pattern. The gold `--primary` color appears only on the checked `Check` icon — 90/10 color rule.
- Horizontal scroll: the matrix will exceed viewport width. Use `overflow-x-auto` on the table container, sticky first column (permission label), sticky column headers.

**Assign role modal** (when editing a user's role):
- Bottom sheet on mobile, compact centered dialog (max-w-sm) on desktop.
- Content: user name/email (read-only), current role badge, new role `<Select>`, `[Save]` / `[Cancel]` buttons.
- This is the only case where a centered modal is acceptable — it is a single-field confirmation, not a multi-step form.

---

### Anti-patterns to refuse

- Do not flash protected content and then hide it on the client — the permission context must resolve server-side or before first render.
- Do not use `role === 'Owner'` checks in UI components — always use the `usePermission(slug)` hook.
- Do not show a disabled sidebar link with a lock icon as a "you can request access" affordance. This is an operations tool, not a SaaS upsell.
- Do not use emojis as permission group separators or role indicators in the admin UI.
- Do not render the role-permission matrix as a list of text descriptions — it must be the checkbox grid for scannability.
