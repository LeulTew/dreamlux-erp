/**
 * Friendly, non-technical display names for permission slugs (issue #180).
 * Raw slugs (e.g. "events:saved_views:share") must never be the primary label
 * a business user reads — the role manager shows these names instead.
 */
const PERMISSION_LABELS: Record<string, string> = {
  "*": "Full System Access (everything)",
  "assets:read": "View Inventory",
  "assets:write": "Add & Edit Inventory Items",
  "assets:delete": "Delete & Restore Inventory Items",
  "assets:reconcile": "Run Stock Recounts",
  "users:manage": "Manage Users & Roles",
  "settings:write": "Change System Settings",
  "hr:read": "View Employee Records",
  "hr:write": "Add & Edit Employee Records",
  "departments:manage": "Manage Departments",
  "salary-levels:manage": "Manage Salary Levels",
  "payroll:read": "View Payroll",
  "payroll:write": "Create & Edit Payroll Runs",
  "events:read": "View Events",
  "events:write": "Add & Edit Events",
  "events:delete": "Delete & Restore Events",
  "events:override_completed": "Edit Completed Events",
  "events:saved_views:share": "Share Saved Event Views",
  "events:proposals:write": "Create Event Proposals",
  "events:proposals:approve": "Approve Event Proposals",
  "event_allocations:write": "Allocate Inventory to Events",
  "event_allocations:dispatch": "Check & Dispatch Event Inventory",
  "event_checklist:write": "Manage Event Checklists",
  "event_assignments:write": "Assign Staff to Events",
  "vehicle_assignments:write": "Assign Vehicles & Drivers",
  "vehicles:read": "View Fleet Vehicles",
  "vehicles:write": "Add & Edit Fleet Vehicles",
  "vehicles:delete": "Delete Fleet Vehicles",
  "exports:read": "Export Data & Reports",
  "reports:profit:read": "View Profit Reports",
  "trips:create": "Log Trips & Fuel",
  "expenses:write": "Record Event Expenses",
  "expenses:labor_generate": "Generate Labor Expenses",
  "expenses:approve": "Approve Expenses",
  "approvals:history:read": "View Approval History",
  "finance:hisab:read": "View Hisab Reports",
  "finance:opex:write": "Record Operating Expenses",
  "finance:opex:approve": "Approve Operating Expenses",
  "finance:overheads:read": "View Overhead Register",
  "finance:overheads:write": "Record Overhead Expenses",
  "finance:overheads:approve": "Approve Overhead Expenses",
  "finance:investments:read": "View Capital Register",
  "finance:investments:write": "Record Capital Purchases",
  "finance:investments:approve": "Approve Capital Purchases",
  "finance:imports:write": "Import Legacy Hisab Files",
  "offices:read": "View Offices & Stores",
  "offices:manage": "Manage Offices & Stores",
};

/** Fallback for unmapped slugs: "finance:foo_bar:read" → "Finance Foo Bar Read". */
function titleCaseSlug(slug: string): string {
  return slug
    .split(/[:_-]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function permissionLabel(slug: string): string {
  return PERMISSION_LABELS[slug] ?? titleCaseSlug(slug);
}
