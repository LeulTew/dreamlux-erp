"use client";

import { useState, useMemo, useEffect } from "react";
import axios from "axios";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  HiShieldCheck,
  HiArrowLeft,
  HiArrowPath,
  HiLockClosed,
  HiCheck,
  HiXMark,
} from "react-icons/hi2";

import AuthLayout from "@/components/AuthLayout";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/useAuth";
import { getRoles, getPermissionsCatalog, updateRolePermissions } from "@/lib/api";
import type { Role } from "@/lib/types";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Role Permissions Manager": "Role Permissions Manager",
    "Define and customize module-level capabilities and access gates for each user role.":
      "Define and customize module-level capabilities and access gates for each user role.",
    "Select Role": "Select Role",
    "Refresh Data": "Refresh Data",
    "Save Changes": "Save Changes",
    "Revert Changes": "Revert Changes",
    "Permissions updated successfully": "Permissions updated successfully",
    "Failed to update permissions": "Failed to update permissions",
    "Forbidden: Insufficient privileges": "Forbidden: Insufficient privileges",
    "Only System Managers and Administrators can access permission settings.":
      "Only System Managers and Administrators can access permission settings.",
    "Go back": "Go back",
    "System Role (Immutable)": "System Role (Immutable)",
    "This is a system role (SUPER_ADMIN / admin / owner) with full system permissions and cannot be modified.":
      "This is a system role (SUPER_ADMIN / admin / owner) with full system permissions and cannot be modified.",
    "No roles found": "No roles found",
    "Loading...": "Loading...",
    "Inventory Management": "Inventory Management",
    "Event Management": "Event Management",
    "Event Operations": "Event Operations",
    "HR & Payroll": "HR & Payroll",
    "Expenses & Approvals": "Expenses & Approvals",
    "Reporting & Settings": "Reporting & Settings",
    "assets:read": "assets:read",
    "assets:write": "assets:write",
    "assets:delete": "assets:delete",
    "assets:reconcile": "assets:reconcile",
    "users:manage": "users:manage",
    "settings:write": "settings:write",
    "hr:read": "hr:read",
    "hr:write": "hr:write",
    "departments:manage": "departments:manage",
    "salary-levels:manage": "salary-levels:manage",
    "payroll:read": "payroll:read",
    "payroll:write": "payroll:write",
    "events:read": "events:read",
    "events:write": "events:write",
    "events:delete": "events:delete",
    "events:override_completed": "events:override_completed",
    "event_allocations:write": "event_allocations:write",
    "event_checklist:write": "event_checklist:write",
    "event_assignments:write": "event_assignments:write",
    "vehicle_assignments:write": "vehicle_assignments:write",
    "exports:read": "exports:read",
    "reports:profit:read": "reports:profit:read",
    "trips:create": "trips:create",
    "expenses:write": "expenses:write",
    "expenses:labor_generate": "expenses:labor_generate",
    "expenses:approve": "expenses:approve",
    "approvals:history:read": "approvals:history:read",
  },
  am: {
    "Role Permissions Manager": "የሚና ፈቃዶች ማስተዳደሪያ",
    "Define and customize module-level capabilities and access gates for each user role.":
      "ለእያንዳንዱ የተጠቃሚ ሚና የሞጁል ደረጃ ፈቃዶችን እና የገጽ መግቢያዎችን ይግለጹ እና ያብጁ።",
    "Select Role": "ሚና ይምረጡ",
    "Refresh Data": "መረጃ አድስ",
    "Save Changes": "ለውጦችን አስቀምጥ",
    "Revert Changes": "ለውጦችን መልስ",
    "Permissions updated successfully": "ፈቃዶች በተሳካ ሁኔታ ተሻሽለዋል",
    "Failed to update permissions": "ፈቃዶችን ማሻሻል አልተሳካም",
    "Forbidden: Insufficient privileges": "የተከለከለ፡ በቂ ያልሆነ ልዩ መብቶች",
    "Only System Managers and Administrators can access permission settings.":
      "የፈቃድ ቅንብሮችን ማግኘት የሚችሉት የስርዓት አስተዳዳሪዎች ብቻ ናቸው።",
    "Go back": "ተመለስ",
    "System Role (Immutable)": "የስርዓት ሚና (ሊሻሻል የማይችል)",
    "This is a system role (SUPER_ADMIN / admin / owner) with full system permissions and cannot be modified.":
      "ይህ ሙሉ የስርዓት ፈቃዶች ያሉት እና ሊሻሻል የማይችል የስርዓት ሚና (SUPER_ADMIN / admin / owner) ነው።",
    "No roles found": "ምንም ሚናዎች አልተገኙም",
    "Loading...": "በመጫን ላይ...",
    "Inventory Management": "የዕቃዎች ቁጥጥር",
    "Event Management": "የዝግጅቶች ቁጥጥር",
    "Event Operations": "የዝግጅት ስራዎች",
    "HR & Payroll": "የሰው ኃይል እና ደመወዝ",
    "Expenses & Approvals": "ወጪዎች እና ማጽደቂያዎች",
    "Reporting & Settings": "ሪፖርቶች እና ቅንብሮች",
    "assets:read": "assets:read (ዕቃ እይታ)",
    "assets:write": "assets:write (ዕቃ ምዝገባ/ማሻሻያ)",
    "assets:delete": "assets:delete (ዕቃ መሰረዝ)",
    "assets:reconcile": "assets:reconcile (ዕቃ ማመሳከሪያ)",
    "users:manage": "users:manage (ተጠቃሚዎች ማስተዳደር)",
    "settings:write": "settings:write (ቅንብሮች መለወጥ)",
    "hr:read": "hr:read (የሰው ኃይል እይታ)",
    "hr:write": "hr:write (የሰው ኃይል ምዝገባ/ማሻሻያ)",
    "departments:manage": "departments:manage (ክፍሎች ማስተዳደር)",
    "salary-levels:manage": "salary-levels:manage (የደመወዝ ደረጃ ማስተዳደር)",
    "payroll:read": "payroll:read (ደመወዝ ክፍያ እይታ)",
    "payroll:write": "payroll:write (ደመወዝ ክፍያ ማዘጋጀት)",
    "events:read": "events:read (ዝግጅት እይታ)",
    "events:write": "events:write (ዝግጅት ምዝገባ/ማሻሻያ)",
    "events:delete": "events:delete (ዝግጅት መሰረዝ)",
    "events:override_completed": "events:override_completed (ያለቁ ዝግጅቶች ማሻሻል)",
    "event_allocations:write": "event_allocations:write (ለዝግጅት ዕቃ መመደብ)",
    "event_checklist:write": "event_checklist:write (የዝግጅት ተግባራት ማስተዳደር)",
    "event_assignments:write": "event_assignments:write (ለዝግጅት ሰራተኛ መመደብ)",
    "vehicle_assignments:write": "vehicle_assignments:write (ለዝግጅት መኪና/ሹፌር መመደብ)",
    "exports:read": "exports:read (መረጃ ወደ ውጭ መላክ)",
    "reports:profit:read": "reports:profit:read (የትርፍ ሪፖርቶች እይታ)",
    "trips:create": "trips:create (ጉዞ መመዝገብ)",
    "expenses:write": "expenses:write (ወጪ መመዝገብ)",
    "expenses:labor_generate": "expenses:labor_generate (የጉልበት ወጪ ማመንጨት)",
    "expenses:approve": "expenses:approve (ወጪ ማጽደቅ)",
    "approvals:history:read": "approvals:history:read (የማጽደቂያ ታሪክ እይታ)",
  },
};

const MODULE_GROUPS = [
  {
    name: "Inventory Management",
    slugs: ["assets:read", "assets:write", "assets:delete", "assets:reconcile"],
  },
  {
    name: "Event Management",
    slugs: ["events:read", "events:write", "events:delete", "events:override_completed"],
  },
  {
    name: "Event Operations",
    slugs: [
      "event_allocations:write",
      "event_checklist:write",
      "event_assignments:write",
      "vehicle_assignments:write",
      "trips:create",
    ],
  },
  {
    name: "HR & Payroll",
    slugs: ["hr:read", "hr:write", "departments:manage", "salary-levels:manage", "payroll:read", "payroll:write"],
  },
  {
    name: "Expenses & Approvals",
    slugs: ["expenses:write", "expenses:labor_generate", "expenses:approve", "approvals:history:read"],
  },
  {
    name: "Reporting & Settings",
    slugs: ["reports:profit:read", "exports:read", "users:manage", "settings:write"],
  },
];

export default function RolePermissionsPage() {
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const router = useRouter();
  const queryClient = useQueryClient();

  const { hasPermission, isLoading: authLoading, isAuthenticated } = useAuth();
  const canAccessPermissions = hasPermission("users:manage") || hasPermission("settings:write");

  // Fetch roles list
  const { data: roles = [], isLoading: rolesLoading } = useQuery<Role[]>({
    queryKey: ["roles"],
    queryFn: getRoles,
    enabled: canAccessPermissions,
    staleTime: 60000,
  });

  // Fetch permission catalog from backend
  const { data: catalog = [], isLoading: catalogLoading } = useQuery({
    queryKey: ["permissions-catalog"],
    queryFn: getPermissionsCatalog,
    enabled: canAccessPermissions,
    staleTime: 60000,
  });

  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [assignedSlugs, setAssignedSlugs] = useState<Set<string>>(new Set());

  // Find currently selected role details
  const selectedRole = useMemo(() => {
    return roles.find((r) => r.id === selectedRoleId);
  }, [roles, selectedRoleId]);

  // Set default selected role on load
  useEffect(() => {
    if (roles.length > 0 && !selectedRoleId) {
      const firstRole = roles[0];
      Promise.resolve().then(() => {
        setSelectedRoleId(firstRole.id);
        setAssignedSlugs(new Set(firstRole.permission_slugs || []));
      });
    }
  }, [roles, selectedRoleId]);

  const handleRoleSelect = (roleId: string) => {
    setSelectedRoleId(roleId);
    const roleObj = roles.find((r) => r.id === roleId);
    setAssignedSlugs(new Set(roleObj?.permission_slugs || []));
  };

  const isSystemRole = useMemo(() => {
    if (!selectedRole) return false;
    const name = selectedRole.name.toUpperCase();
    return ["SUPER_ADMIN", "ADMIN", "OWNER"].includes(name);
  }, [selectedRole]);

  const handleToggleSlug = (slug: string) => {
    if (isSystemRole) return;
    setAssignedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  };

  const handleRevert = () => {
    if (!selectedRole) return;
    setAssignedSlugs(new Set(selectedRole.permission_slugs || []));
    toast.success("Changes reverted");
  };

  const updateMutation = useMutation({
    mutationFn: (payload: { roleId: string; slugs: string[] }) =>
      updateRolePermissions(payload.roleId, payload.slugs),
    onSuccess: () => {
      toast.success(t("Permissions updated successfully"));
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      queryClient.invalidateQueries({ queryKey: ["permissions"] });
    },
    onError: (err: unknown) => {
      let msg = t("Failed to update permissions");
      if (axios.isAxiosError(err)) {
        msg = err.response?.data?.error || err.message || msg;
      } else if (err instanceof Error) {
        msg = err.message;
      }
      toast.error(msg);
    },
  });

  const handleSave = () => {
    if (!selectedRoleId || isSystemRole) return;
    updateMutation.mutate({
      roleId: selectedRoleId,
      slugs: Array.from(assignedSlugs),
    });
  };

  // Check if anything has changed compared to cached database role configuration
  const isDirty = useMemo(() => {
    if (!selectedRole) return false;
    const initial = new Set(selectedRole.permission_slugs || []);
    if (initial.size !== assignedSlugs.size) return true;
    for (const slug of Array.from(assignedSlugs)) {
      if (!initial.has(slug)) return true;
    }
    return false;
  }, [selectedRole, assignedSlugs]);

  if (authLoading || rolesLoading || catalogLoading) {
    return (
      <AuthLayout>
        <div className="flex h-[50vh] items-center justify-center">
          <span className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      </AuthLayout>
    );
  }

  if (!isAuthenticated || !canAccessPermissions) {
    return (
      <AuthLayout>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-danger/10 flex items-center justify-center text-danger mb-4">
            <HiLockClosed className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-foreground">{t("Forbidden: Insufficient privileges")}</h2>
          <p className="mt-2 text-sm text-muted">{t("Only System Managers and Administrators can access permission settings.")}</p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="page-container pb-12 space-y-6">
        {/* Header Section */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 select-none">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="w-10 h-10 rounded-xl bg-card-alt border border-border text-muted hover:text-foreground transition-colors flex items-center justify-center cursor-pointer"
              title={t("Go back")}
            >
              <HiArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-white shadow-sm">
              <HiShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">{t("Role Permissions Manager")}</h1>
              <p className="text-sm text-muted font-medium">
                {t("Define and customize module-level capabilities and access gates for each user role.")}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["roles"] });
              queryClient.invalidateQueries({ queryKey: ["permissions-catalog"] });
            }}
            className="inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-card-alt border border-border text-sm font-semibold hover:bg-border transition-colors cursor-pointer"
          >
            <HiArrowPath className="w-4 h-4" />
            {t("Refresh Data")}
          </button>
        </header>

        {roles.length === 0 ? (
          <div className="text-center py-10 bg-card border border-border rounded-2xl">
            <p className="text-muted font-medium">{t("No roles found")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-start">
            {/* Roles Sidebar List */}
            <aside className="bg-card border border-border/80 rounded-2xl p-4 space-y-3 shadow-sm select-none">
              <h3 className="text-xs font-bold text-muted uppercase tracking-wider px-2">{t("Select Role")}</h3>
              <nav className="flex flex-col gap-1">
                {roles.map((role) => {
                  const isSelected = role.id === selectedRoleId;
                  return (
                    <button
                      key={role.id}
                      onClick={() => handleRoleSelect(role.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? "bg-primary text-white shadow-sm"
                          : "text-foreground/80 hover:bg-card-alt hover:text-foreground"
                      }`}
                    >
                      <div className="truncate">{role.name}</div>
                      {role.description && (
                        <div
                          className={`text-[10px] mt-0.5 truncate ${
                            isSelected ? "text-white/80" : "text-muted"
                          }`}
                        >
                          {role.description}
                        </div>
                      )}
                    </button>
                  );
                })}
              </nav>
            </aside>

            {/* Permission checklist groups */}
            <main className="bg-card border border-border/80 rounded-2xl p-6 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-border/50 pb-4 gap-4">
                <div>
                  <h2 className="text-lg font-bold text-foreground">{selectedRole?.name}</h2>
                  <p className="text-xs text-muted mt-0.5">{selectedRole?.description || "No description provided"}</p>
                </div>

                {!isSystemRole && (
                  <div className="flex items-center gap-2">
                    <button
                      disabled={!isDirty || updateMutation.isPending}
                      onClick={handleRevert}
                      className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border text-xs font-bold transition-all cursor-pointer ${
                        isDirty
                          ? "bg-card-alt text-foreground hover:bg-border"
                          : "bg-card-alt/50 text-muted cursor-not-allowed"
                      }`}
                    >
                      <HiXMark className="w-3.5 h-3.5" />
                      {t("Revert Changes")}
                    </button>
                    <button
                      disabled={!isDirty || updateMutation.isPending}
                      onClick={handleSave}
                      className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-bold text-white transition-all cursor-pointer bg-primary hover:opacity-90 ${
                        isDirty ? "opacity-100" : "opacity-50 cursor-not-allowed"
                      }`}
                    >
                      {updateMutation.isPending ? (
                        <span className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      ) : (
                        <HiCheck className="w-3.5 h-3.5" />
                      )}
                      {t("Save Changes")}
                    </button>
                  </div>
                )}
              </div>

              {isSystemRole ? (
                <div className="flex flex-col items-center justify-center p-8 bg-card-alt/50 border border-border rounded-xl text-center select-none">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-3">
                    <HiShieldCheck className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-foreground">{t("System Role (Immutable)")}</h4>
                  <p className="text-xs text-muted mt-1 max-w-sm">
                    {t(
                      "This is a system role (SUPER_ADMIN / admin / owner) with full system permissions and cannot be modified."
                    )}
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {MODULE_GROUPS.map((group) => {
                    const availableInGroup = catalog.filter((p) => group.slugs.includes(p.slug));
                    if (availableInGroup.length === 0) return null;

                    return (
                      <div key={group.name} className="space-y-3">
                        <h4 className="text-xs font-black text-primary uppercase tracking-widest border-b border-border/30 pb-1">
                          {t(group.name)}
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 select-none">
                          {availableInGroup.map((perm) => {
                            const isAssigned = assignedSlugs.has(perm.slug);
                            return (
                              <button
                                key={perm.slug}
                                onClick={() => handleToggleSlug(perm.slug)}
                                className={`flex items-start text-left p-3 rounded-xl border transition-all cursor-pointer ${
                                  isAssigned
                                    ? "bg-primary/[0.03] border-primary/40 shadow-sm"
                                    : "bg-card-alt/30 border-border hover:border-muted-foreground/30"
                                }`}
                              >
                                <div className="flex items-center h-5 mr-3 mt-0.5">
                                  <input
                                    type="checkbox"
                                    checked={isAssigned}
                                    onChange={() => {}} // Controlled by button onClick
                                    className="w-4 h-4 text-primary bg-background border-border rounded focus:ring-primary/20 accent-primary cursor-pointer"
                                  />
                                </div>
                                <div>
                                  <span className="block text-xs font-bold text-foreground font-mono">
                                    {t(perm.slug)}
                                  </span>
                                  <span className="block text-[11px] text-muted mt-1 leading-normal">
                                    {perm.description}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </main>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
