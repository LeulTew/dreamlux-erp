export type PermissionMap = Record<string, unknown>;

export type PermissionDefinition = {
  slug: string;
  description: string;
};

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  { slug: "assets:read", description: "View inventory items, stock levels, and asset reports" },
  { slug: "assets:write", description: "Create and update inventory items" },
  { slug: "assets:delete", description: "Delete and restore inventory items" },
  { slug: "assets:reconcile", description: "Run inventory reconciliation updates" },
  { slug: "users:manage", description: "Manage users and role assignments" },
  { slug: "settings:write", description: "Manage system settings" },
  { slug: "hr:read", description: "View HR records" },
  { slug: "hr:write", description: "Create and update HR records" },
  { slug: "departments:manage", description: "Manage departments" },
  { slug: "salary-levels:manage", description: "Manage salary levels" },
  { slug: "payroll:read", description: "View payroll runs and payroll exports" },
  { slug: "payroll:write", description: "Create and update payroll runs" },
  { slug: "events:read", description: "View events, event types, and operational schedules" },
  { slug: "events:write", description: "Create and update events and event types" },
  { slug: "events:delete", description: "Delete, restore, and permanently remove events or event types" },
  { slug: "events:override_completed", description: "Modify completed events and restricted status transitions" },
  { slug: "event_allocations:write", description: "Create and release event inventory allocations" },
  { slug: "event_checklist:write", description: "Create and update event checklist items" },
  { slug: "event_assignments:write", description: "Assign employees to events and manage attendance" },
  { slug: "vehicle_assignments:write", description: "Assign vehicles and drivers to events" },
  { slug: "exports:read", description: "Export inventory, employee, and payroll data" },
  { slug: "reports:profit:read", description: "View profit and profitability reports" },
  { slug: "trips:create", description: "Create event trip logs and generated fuel expenses" },
  { slug: "expenses:write", description: "Create manual event expenses" },
  { slug: "expenses:labor_generate", description: "Generate labor expenses from attended event assignments" },
  { slug: "expenses:approve", description: "Approve expenses" },
  { slug: "approvals:history:read", description: "View approval history" },
];

export const ROLE_PERMISSION_SEEDS: Record<string, string[]> = {
  super_admin: ["*"],
  admin: ["*"],
  owner: ["*"],
  system_manager: ["users:manage", "settings:write"],
  inventory_controller: ["assets:read", "assets:write", "assets:reconcile", "assets:delete", "exports:read"],
  inventory_officer: ["assets:read", "assets:write", "assets:reconcile", "exports:read"],
  ops_manager: [
    "assets:read",
    "events:read",
    "events:write",
    "events:delete",
    "events:override_completed",
    "event_allocations:write",
    "event_checklist:write",
    "event_assignments:write",
    "vehicle_assignments:write",
    "trips:create",
    "expenses:write",
    "expenses:labor_generate",
    "exports:read",
    "approvals:history:read",
  ],
  event_manager: ["assets:read", "events:read", "events:write", "event_checklist:write", "event_assignments:write", "vehicle_assignments:write", "trips:create", "expenses:write"],
  viewer: ["assets:read", "events:read"],
  sales_rep: ["assets:read", "events:read"],
  hr_manager: ["hr:read", "hr:write", "departments:manage", "salary-levels:manage", "exports:read"],
  accountant: [
    "payroll:read",
    "payroll:write",
    "exports:read",
    "reports:profit:read",
    "events:override_completed",
    "expenses:write",
    "expenses:labor_generate",
    "expenses:approve",
    "approvals:history:read",
  ],
  driver: ["events:read", "trips:create"],
};

export function normalizePermissionMap(raw: unknown): PermissionMap {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as PermissionMap;
  }
  return {};
}

export function normalizeRoleName(value: string | undefined | null): string {
  return (value || "").trim().toLowerCase();
}

export function roleNamesToPermissionSlugs(roleNames: Array<string | undefined | null>): string[] {
  return [
    ...new Set(
      roleNames.flatMap((roleName) => ROLE_PERMISSION_SEEDS[normalizeRoleName(roleName)] || []),
    ),
  ];
}

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizePermissionSlugs(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return [...new Set(raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map(normalizeSlug))];
}

export function permissionMapToSlugs(map: PermissionMap): string[] {
  const slugs: string[] = [];

  for (const [moduleName, rawValue] of Object.entries(map)) {
    const moduleSlug = normalizeSlug(moduleName);

    if (moduleSlug === "all" && rawValue === true) {
      slugs.push("*");
      continue;
    }

    if (rawValue === "all" || rawValue === true) {
      slugs.push(`${moduleSlug}:*`);
      continue;
    }

    if (typeof rawValue === "string" && rawValue.trim()) {
      slugs.push(`${moduleSlug}:${normalizeSlug(rawValue)}`);
      continue;
    }

    if (Array.isArray(rawValue)) {
      for (const entry of rawValue) {
        if (typeof entry === "string" && entry.trim()) {
          slugs.push(`${moduleSlug}:${normalizeSlug(entry)}`);
        }
      }
    }
  }

  return [...new Set(slugs.map(normalizeSlug))];
}

export function hasPermissionSlug(permissionSlugs: string[], requiredSlug: string): boolean {
  const normalizedRequired = normalizeSlug(requiredSlug);
  const normalized = new Set(permissionSlugs.map(normalizeSlug));

  if (normalized.has("*")) {
    return true;
  }

  if (normalized.has(normalizedRequired)) {
    return true;
  }

  const moduleName = normalizedRequired.split(":")[0];
  if (moduleName && normalized.has(`${moduleName}:*`)) {
    return true;
  }

  return false;
}
