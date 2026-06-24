"use client";

import { ComponentType, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  bootstrapAdminUser,
  createUser,
  CreateUserPayload,
  deleteUser,
  getAppSettings,
  getBackendHealth,
  getRoles,
  getUsers,
  updateAppSettings,
  updateUser,
  UpdateUserPayload,
} from "@/lib/api";
import { Role, User } from "@/lib/types";
import AuthLayout from "@/components/AuthLayout";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import UserAvatar from "@/components/UserAvatar";
import {
  convertImageFileToWebpDataUrl,
  initialFormState,
  normalizeEthiopianPhone,
  UserFormState,
} from "@/components/settings/user-form-utils";
import toast from "react-hot-toast";
import {
  HiArrowLeft,
  HiArrowPath,
  HiCircleStack,
  HiCog6Tooth,
  HiOutlinePencil,
  HiOutlinePlus,
  HiOutlineTrash,
  HiServerStack,
  HiShieldCheck,
  HiUsers,
} from "react-icons/hi2";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/useAuth";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Global Admin Settings": "Global Admin Settings",
    "Manage users, profiles, permissions, and system configuration.": "Manage users, profiles, permissions, and system configuration.",
    "Refresh Data": "Refresh Data",
    "Overview": "Overview",
    "Users": "Users",
    "System": "System",
    "Database": "Database",
    "Roles": "Roles",
    "Backend": "Backend",
    "enabled /": "enabled /",
    "disabled": "disabled",
    "Role catalog from backend": "Role catalog from backend",
    "Checking...": "Checking...",
    "Healthy": "Healthy",
    "Unavailable": "Unavailable",
    "Health endpoint status": "Health endpoint status",
    "Users & Access": "Users & Access",
    "ERP-style user management with profile, contact, role, and status tabs.": "ERP-style user management with profile, contact, role, and status tabs.",
    "Sync Default Users": "Sync Default Users",
    "New User": "New User",
    "Syncing...": "Syncing...",
    "User": "User",
    "Contact": "Contact",
    "Role": "Role",
    "Status": "Status",
    "Actions": "Actions",
    "No phone": "No phone",
    "Enabled": "Enabled",
    "Disabled": "Disabled",
    "No users found in database.": "No users found in database.",
    "Create default users": "Create default users",
    "Employee ID Configuration": "Employee ID Configuration",
    "ID Prefix *": "ID Prefix *",
    "Save System Settings": "Save System Settings",
    "Saving...": "Saving...",
    "Backend & Database Sync": "Backend & Database Sync",
    "Verify backend status and sync default admin account.": "Verify backend status and sync default admin account.",
    "Health Check": "Health Check",
    "Admin Sync": "Admin Sync",
    "Ensures admin user exists and remains enabled.": "Ensures admin user exists and remains enabled.",
    "Run Defaults Sync": "Run Defaults Sync",
    "Go back": "Go back",
    "ID Configuration": "ID Configuration",
    "Configure ID prefixes for each module. Prefixes are uppercased automatically.": "Configure ID prefixes for each module. Prefixes are uppercased automatically.",
    "Employee ID Prefix *": "Employee ID Prefix *",
    "Inventory ID Prefix *": "Inventory ID Prefix *",
    "Event ID Prefix *": "Event ID Prefix *"
  },
  am: {
    "Global Admin Settings": "አጠቃላይ የአስተዳዳሪ ቅንጅቶች",
    "Manage users, profiles, permissions, and system configuration.": "ሠራተኞችን፣ መገለጫዎችን፣ ፈቃዶችን እና የስርዓት ውቅረትን ያስተዳድሩ።",
    "Refresh Data": "መረጃ አድስ",
    "Overview": "አጠቃላይ እይታ",
    "Users": "ሠራተኞች",
    "System": "ስርዓት",
    "Database": "የመረጃ ቋት",
    "Roles": "ሚናዎች",
    "Backend": "የጀርባ አገልግሎት",
    "enabled /": "ገባሪ /",
    "disabled": "ያልነቃ",
    "Role catalog from backend": "የሚናዎች ዝርዝር ከጀርባ አገልግሎት",
    "Checking...": "በማጣራት ላይ...",
    "Healthy": "በጥሩ ሁኔታ ላይ",
    "Unavailable": "አልተገኘም",
    "Health endpoint status": "የአገልግሎቱ ጤንነት ሁኔታ",
    "Users & Access": "ተጠቃሚዎች እና ፈቃዶች",
    "ERP-style user management with profile, contact, role, and status tabs.": "የተጠቃሚዎችን መረጃ፣ አድራሻ፣ ሚና እና ሁኔታ ማስተዳደሪያ።",
    "Sync Default Users": "ነባሪ ተጠቃሚዎችን አመሳስል",
    "New User": "አዲስ ተጠቃሚ",
    "Syncing...": "በማመሳሰል ላይ...",
    "User": "ተጠቃሚ",
    "Contact": "አድራሻ",
    "Role": "ሚና",
    "Status": "ሁኔታ",
    "Actions": "ድርጊቶች",
    "No phone": "ስልክ የለም",
    "Enabled": "ገባሪ",
    "Disabled": "ያልነቃ",
    "No users found in database.": "በመረጃ ቋቱ ውስጥ ምንም ተጠቃሚዎች አልተገኙም።",
    "Create default users": "ነባሪ ተጠቃሚዎችን ፍጠር",
    "Employee ID Configuration": "የሠራተኛ መለያ መዋቅር",
    "ID Prefix *": "የመለያ መነሻ *",
    "Save System Settings": "የስርዓት ቅንጅቶችን አስቀምጥ",
    "Saving...": "በማስቀመጥ ላይ...",
    "Backend & Database Sync": "የጀርባ አገልግሎት እና መረጃ ቋት ማመሳሰል",
    "Verify backend status and sync default admin account.": "የጀርባ አገልግሎት ሁኔታን ያረጋግጡ እና ነባሪ የአስተዳዳሪ መለያ ያመሳስሉ።",
    "Health Check": "የጤንነት ምርመራ",
    "Admin Sync": "የአስተዳዳሪ ማመሳሰል",
    "Ensures admin user exists and remains enabled.": "የአስተዳዳሪ ተጠቃሚ መኖሩን እና መከፈቱን ያረጋግጣል።",
    "Run Defaults Sync": "ነባሪ ማመሳሰልን አሂድ",
    "Go back": "ተመለስ",
    "ID Configuration": "የመለያ ውቅረት",
    "Configure ID prefixes for each module. Prefixes are uppercased automatically.": "ለእያንዳንዱ ሞጁል የመለያ መነሻ ቅጥያዎችን ያዋቅሩ። መነሻ ቅጥያዎች ራሳቸው በራሳቸው ወደ ትልቅ ፊደል ይቀየራሉ።",
    "Employee ID Prefix *": "የሠራተኛ መለያ መነሻ *",
    "Inventory ID Prefix *": "የክምችት መለያ መነሻ *",
    "Event ID Prefix *": "የዝግጅት መለያ መነሻ *"
  }
};

type TabId = "overview" | "users" | "system" | "database";
type UserModalTab = "identity" | "contact" | "access" | "security";

// Removed hardcoded ALLOWED_SETTINGS_ROLES mapping. Access is now gated dynamically via useAuth.

function extractErrorMessage(err: unknown, fallback: string): string {
  const maybeError = err as {
    response?: {
      data?: {
        error?: string;
      };
    };
  };
  return maybeError?.response?.data?.error || fallback;
}

export default function SettingsPage() {
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const router = useRouter();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [prefix, setPrefix] = useState("");
  const [inventoryPrefix, setInventoryPrefix] = useState("");
  const [eventPrefix, setEventPrefix] = useState("");

  const { hasPermission, isLoading: authLoading, isAuthenticated } = useAuth();
  const canAccessAdmin = hasPermission("users:manage") || hasPermission("settings:write");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [userModalTab, setUserModalTab] = useState<UserModalTab>("identity");
  const [showPassword, setShowPassword] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<UserFormState>(initialFormState);
  const [removeProfileImage, setRemoveProfileImage] = useState(false);
  const [profileImageProgress, setProfileImageProgress] = useState(0);
  const [profileImageStatus, setProfileImageStatus] = useState("");
  const [profileImageBusy, setProfileImageBusy] = useState(false);
  const [pendingImageSaveAction, setPendingImageSaveAction] = useState<"none" | "upload" | "remove">("none");

  const { data: settings, isLoading } = useQuery({
    queryKey: ["appSettings"],
    queryFn: getAppSettings,
    enabled: canAccessAdmin,
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ["users"],
    queryFn: getUsers,
    enabled: canAccessAdmin,
    staleTime: 15000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["roles"],
    queryFn: getRoles,
    enabled: canAccessAdmin,
    staleTime: 120000,
    refetchOnWindowFocus: false,
  });

  const roleNameById = useMemo(() => {
    const byId = new Map<string, string>();
    for (const role of roles) {
      byId.set(role.id, role.name);
    }
    return byId;
  }, [roles]);

  const effectivePermissions = useMemo(() => {
    const slugs = new Set<string>();
    formData.roleIds.forEach((roleId) => {
      const roleObj = roles.find((r) => r.id === roleId);
      if (roleObj) {
        const nameUpper = roleObj.name.toUpperCase();
        if (["SUPER_ADMIN", "ADMIN", "OWNER"].includes(nameUpper)) {
          slugs.add("*");
        }
        if (roleObj.permission_slugs) {
          roleObj.permission_slugs.forEach((slug) => slugs.add(slug));
        }
      }
    });
    return Array.from(slugs).sort();
  }, [formData.roleIds, roles]);

  const { data: health, isLoading: healthLoading } = useQuery({
    queryKey: ["backendHealth"],
    queryFn: getBackendHealth,
    refetchInterval: 30000,
    enabled: canAccessAdmin,
  });

  useEffect(() => {
    if (settings) {
      queueMicrotask(() => {
        setPrefix(settings.employee_id_prefix || "EMP");
        setInventoryPrefix(settings.inventory_id_prefix || "INV");
        setEventPrefix(settings.event_id_prefix || "EVT");
      });
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: (data: { employee_id_prefix: string; inventory_id_prefix?: string; event_id_prefix?: string }) => updateAppSettings(data),
    onSuccess: () => {
      toast.success("Settings updated successfully");
      queryClient.invalidateQueries({ queryKey: ["appSettings"] });
      queryClient.invalidateQueries({ queryKey: ["nextEmployeeId"] });
    },
    onError: () => {
      toast.error("Failed to update settings");
    },
  });

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: (createdUser, variables) => {
      if (pendingImageSaveAction === "upload") {
        toast.success("User and profile image saved successfully");
      } else {
        toast.success("User created successfully");
      }

      const resolvedRoleIds =
        createdUser.role_ids?.length
          ? createdUser.role_ids
          : variables.roleIds?.length
            ? variables.roleIds
            : [createdUser.role_id || variables.roleId];
      const resolvedRoleNames =
        createdUser.role_names?.length
          ? createdUser.role_names
          : resolvedRoleIds
              .map((roleId) => roleNameById.get(roleId))
              .filter((name): name is string => Boolean(name));

      const hydratedUser: User = {
        ...createdUser,
        phone: createdUser.phone ?? variables.phone ?? null,
        profile_image_url: createdUser.profile_image_url ?? null,
        role_id: createdUser.role_id || variables.roleId,
        role_name: createdUser.role_name || resolvedRoleNames[0] || "UNKNOWN",
        role_ids: resolvedRoleIds,
        role_names: resolvedRoleNames.length ? resolvedRoleNames : [createdUser.role_name || "UNKNOWN"],
        created_at: createdUser.created_at || new Date().toISOString(),
      };

      queryClient.setQueryData<User[]>(["users"], (prev = []) => [hydratedUser, ...prev]);
      closeModal();
    },
    onError: (err: unknown) => {
      if (pendingImageSaveAction !== "none") {
        setProfileImageBusy(false);
        setProfileImageStatus("Profile image failed to save.");
      }
      toast.error(extractErrorMessage(err, "Failed to create user"));
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserPayload }) => updateUser(id, data),
    onSuccess: (updatedUser, variables) => {
      if (pendingImageSaveAction === "upload") {
        toast.success("User and profile image saved successfully");
      } else if (pendingImageSaveAction === "remove") {
        toast.success("User updated and profile image removed");
      } else {
        toast.success("User updated successfully");
      }
      const resolvedRoleIds =
        updatedUser.role_ids?.length
          ? updatedUser.role_ids
          : variables.data.roleIds?.length
            ? variables.data.roleIds
            : [updatedUser.role_id || variables.data.roleId];
      const resolvedRoleNames =
        updatedUser.role_names?.length
          ? updatedUser.role_names
          : resolvedRoleIds
              .map((roleId) => roleNameById.get(roleId))
              .filter((name): name is string => Boolean(name));

      queryClient.setQueryData<User[]>(["users"], (prev = []) =>
        prev.map((row) =>
          row.id === variables.id
            ? {
                ...row,
                ...updatedUser,
                phone: updatedUser.phone ?? row.phone ?? null,
                profile_image_url:
                  updatedUser.profile_image_url !== undefined
                    ? updatedUser.profile_image_url
                    : row.profile_image_url ?? null,
                role_id: updatedUser.role_id || variables.data.roleId,
                role_name: updatedUser.role_name || resolvedRoleNames[0] || row.role_name,
                role_ids: resolvedRoleIds,
                role_names: resolvedRoleNames.length ? resolvedRoleNames : [updatedUser.role_name || row.role_name],
              }
            : row,
        ),
      );

      try {
        const rawUser = localStorage.getItem("user");
        if (rawUser) {
          const loggedUser = JSON.parse(rawUser) as { id?: string; username?: string; role?: string };
          if (loggedUser.id && loggedUser.id === updatedUser.id) {
            const merged = {
              ...loggedUser,
              full_name: updatedUser.full_name,
              profile_image_url: updatedUser.profile_image_url || null,
              role: updatedUser.role_names?.[0] || updatedUser.role_name || loggedUser.role,
            };
            localStorage.setItem("user", JSON.stringify(merged));
            window.dispatchEvent(new StorageEvent("storage"));
          }
        }
      } catch {
        // ignore localStorage sync errors
      }

      closeModal();
    },
    onError: (err: unknown) => {
      if (pendingImageSaveAction !== "none") {
        setProfileImageBusy(false);
        setProfileImageStatus("Profile image failed to save.");
      }
      toast.error(extractErrorMessage(err, "Failed to update user"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: (_result, deletedId) => {
      toast.success("User deleted successfully");
      queryClient.setQueryData<User[]>(["users"], (prev = []) => prev.filter((row) => row.id !== deletedId));
      setDeleteId(null);
    },
    onError: (err: unknown) => {
      toast.error(extractErrorMessage(err, "Failed to delete user"));
      setDeleteId(null);
    },
  });

  const bootstrapMutation = useMutation({
    mutationFn: bootstrapAdminUser,
    onSuccess: (res) => {
      if (res.degraded) {
        toast.success("Default users synchronized in fallback mode");
      } else {
        toast.success("Default users synchronized");
      }
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (err: unknown) => {
      toast.error(extractErrorMessage(err, "Failed to sync admin account"));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prefix.trim()) {
      toast.error("Prefix cannot be empty");
      return;
    }
    updateMutation.mutate({ employee_id_prefix: prefix, inventory_id_prefix: inventoryPrefix || "INV", event_id_prefix: eventPrefix || "EVT" });
  };

  const handleAdd = () => {
    setSelectedUser(null);
    setUserModalTab("identity");
    const defaultRoleId = roles[0]?.id || "";
    setFormData({
      ...initialFormState,
      roleId: defaultRoleId,
      roleIds: defaultRoleId ? [defaultRoleId] : [],
      isActive: true,
    });
    setRemoveProfileImage(false);
    setProfileImageProgress(0);
    setProfileImageStatus("");
    setProfileImageBusy(false);
    setPendingImageSaveAction("none");
    setIsModalOpen(true);
  };

  const handleEdit = (user: User) => {
    setSelectedUser(user);
    setUserModalTab("identity");
    setFormData({
      username: user.username,
      rawPassword: "",
      fullName: user.full_name,
      email: user.email || "",
      phone: user.phone || "",
      roleId: user.role_id,
      roleIds: user.role_ids?.length ? user.role_ids : [user.role_id],
      isActive: user.is_active,
      profileImageDataUrl: "",
      profileImagePreviewUrl: user.profile_image_url || "",
    });
    setRemoveProfileImage(false);
    setProfileImageProgress(0);
    setProfileImageStatus("");
    setProfileImageBusy(false);
    setPendingImageSaveAction("none");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedUser(null);
    setShowPassword(false);
    setRemoveProfileImage(false);
    setProfileImageProgress(0);
    setProfileImageStatus("");
    setProfileImageBusy(false);
    setPendingImageSaveAction("none");
  };

  const handleProfileImageChange = async (file: File | null) => {
    if (!file) return;

    setRemoveProfileImage(false);
    setProfileImageBusy(true);
    setProfileImageProgress(0);
    setProfileImageStatus("Starting conversion...");
    setPendingImageSaveAction("upload");

    try {
      const webpDataUrl = await convertImageFileToWebpDataUrl(file, (progress) => {
        setProfileImageProgress(progress.percent);
        setProfileImageStatus(progress.message);
      });
      setFormData((prev) => ({
        ...prev,
        profileImageDataUrl: webpDataUrl,
        profileImagePreviewUrl: webpDataUrl,
      }));
      setProfileImageBusy(false);
    } catch {
      setProfileImageBusy(false);
      setProfileImageStatus("Failed to process image. Try another file.");
      setPendingImageSaveAction("none");
      toast.error("Failed to process profile image");
    }
  };

  const handleRemoveProfileImage = () => {
    setFormData((prev) => ({
      ...prev,
      profileImageDataUrl: "",
      profileImagePreviewUrl: "",
    }));
    setRemoveProfileImage(true);
    setProfileImageBusy(false);
    setProfileImageProgress(100);
    setProfileImageStatus("Profile image will be removed when you save.");
    setPendingImageSaveAction("remove");
  };

  const toggleRoleSelection = (roleId: string) => {
    setFormData((prev) => {
      if (prev.roleIds.includes(roleId)) {
        const next = prev.roleIds.filter((id) => id !== roleId);
        return {
          ...prev,
          roleIds: next,
          roleId: next[0] || "",
        };
      }

      const next = [...prev.roleIds, roleId];
      return {
        ...prev,
        roleIds: next,
        roleId: next[0],
      };
    });
  };

  const handleUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.username || !formData.fullName || !formData.roleIds.length) {
      toast.error("Please fill all required fields");
      return;
    }

    const primaryRoleId = formData.roleIds[0] || formData.roleId;
    if (!primaryRoleId) {
      toast.error("Select at least one role");
      setUserModalTab("access");
      return;
    }

    const normalizedPhone = normalizeEthiopianPhone(formData.phone);
    if (normalizedPhone.error) {
      toast.error(normalizedPhone.error);
      setUserModalTab("contact");
      return;
    }

    if (selectedUser) {
      const payload: UpdateUserPayload = {
        fullName: formData.fullName,
        email: formData.email || null,
        phone: normalizedPhone.value,
        roleId: primaryRoleId,
        roleIds: formData.roleIds,
        isActive: formData.isActive,
      };

      if (formData.rawPassword) {
        payload.rawPassword = formData.rawPassword;
      }
      if (formData.profileImageDataUrl) {
        payload.profileImageDataUrl = formData.profileImageDataUrl;
      }
      if (removeProfileImage) {
        payload.removeProfileImage = true;
      }

      if (pendingImageSaveAction !== "none") {
        setProfileImageBusy(true);
        setProfileImageStatus(
          pendingImageSaveAction === "remove" ? "Removing profile image..." : "Saving profile image..."
        );
      }

      updateUserMutation.mutate({ id: selectedUser.id, data: payload });
      return;
    }

    if (!formData.rawPassword) {
      toast.error("Password is required for new users");
      setUserModalTab("security");
      return;
    }

    const payload: CreateUserPayload = {
      username: formData.username,
      rawPassword: formData.rawPassword,
      fullName: formData.fullName,
      email: formData.email || null,
      phone: normalizedPhone.value,
      roleId: primaryRoleId,
      roleIds: formData.roleIds,
      profileImageDataUrl: formData.profileImageDataUrl || undefined,
    };

    if (pendingImageSaveAction === "upload") {
      setProfileImageBusy(true);
      setProfileImageStatus("Saving profile image...");
    }

    createMutation.mutate(payload);
  };

  const userStats = useMemo(() => {
    const userRows = users || [];
    const activeCount = userRows.filter((u) => u.is_active).length;
    return {
      total: userRows.length,
      active: activeCount,
      inactive: userRows.length - activeCount,
    };
  }, [users]);

  const tabs: Array<{ id: TabId; label: string; icon: ComponentType<{ className?: string }> }> = [
    { id: "overview", label: t("Overview"), icon: HiShieldCheck },
    { id: "users", label: t("Users"), icon: HiUsers },
    { id: "system", label: t("System"), icon: HiCog6Tooth },
    { id: "database", label: t("Database"), icon: HiCircleStack },
  ];

  const modalTabs: Array<{ id: UserModalTab; label: string }> = [
    { id: "identity", label: "Identity" },
    { id: "contact", label: "Contact" },
    { id: "access", label: "Access" },
    { id: "security", label: "Security" },
  ];

  const isSystemSavePending = updateMutation.isPending;
  const isSystemSaveDisabled = !isSystemSavePending && prefix === settings?.employee_id_prefix && inventoryPrefix === (settings?.inventory_id_prefix || "INV") && eventPrefix === (settings?.event_id_prefix || "EVT");
  const isUserSavePending = createMutation.isPending || updateUserMutation.isPending;

  if (authLoading) {
    return (
      <AuthLayout>
        <div className="max-w-3xl mx-auto py-20">
          <div className="animate-pulse bg-card h-40 rounded-xl border border-border" />
        </div>
      </AuthLayout>
    );
  }

  if (!isAuthenticated || !canAccessAdmin) {
    return (
      <AuthLayout>
        <div className="max-w-3xl mx-auto py-20">
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">{t("Restricted Settings")}</h1>
            <p className="text-sm text-muted mt-3">Only Admin or System Manager roles can access this page.</p>
            <button
              onClick={() => router.push("/")}
              className="mt-6 h-11 px-5 rounded-xl bg-primary text-on-primary font-semibold"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="page-container pb-12 space-y-6">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="w-10 h-10 rounded-xl bg-card-alt border border-border text-muted hover:text-foreground transition-colors flex items-center justify-center"
              title={t("Go back")}
            >
              <HiArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-white shadow-sm">
              <HiCog6Tooth className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">{t("Global Admin Settings")}</h1>
              <p className="text-sm text-muted font-medium">{t("Manage users, profiles, permissions, and system configuration.")}</p>
            </div>
          </div>
          <button
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["users"] });
              queryClient.invalidateQueries({ queryKey: ["roles"] });
              queryClient.invalidateQueries({ queryKey: ["appSettings"] });
              queryClient.invalidateQueries({ queryKey: ["backendHealth"] });
            }}
            className="inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-card-alt border border-border text-sm font-semibold hover:bg-border transition-colors"
          >
            <HiArrowPath className="w-4 h-4" />
            {t("Refresh Data")}
          </button>
        </header>

        <section className="glass-card rounded-2xl p-1 shadow-sm">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-sm font-semibold tracking-wide transition-all ${
                    selected ? "bg-primary text-on-primary shadow-sm" : "bg-card-alt text-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </section>

        {isLoading ? (
          <div className="animate-pulse bg-card rounded-xl h-32 border border-border" />
        ) : (
          <div className="space-y-6">
            {activeTab === "overview" && (
              <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-xl bg-white dark:bg-card border border-border p-6">
                  <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">{t("Users")}</p>
                  <p className="text-3xl font-bold text-foreground mt-2">{userStats.total}</p>
                  <p className="text-xs text-muted mt-2">{userStats.active} {t("enabled /")} {userStats.inactive} {t("disabled")}</p>
                </div>
                <div className="rounded-xl bg-white dark:bg-card border border-border p-6">
                  <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">{t("Roles")}</p>
                  <p className="text-3xl font-bold text-foreground mt-2">{roles.length}</p>
                  <p className="text-xs text-muted mt-2">{t("Role catalog from backend")}</p>
                </div>
                <div className="rounded-xl bg-white dark:bg-card border border-border p-6">
                  <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">{t("Backend")}</p>
                  <p className={`text-2xl font-bold mt-2 ${health?.status === "ok" ? "text-success" : "text-danger"}`}>
                    {healthLoading ? t("Checking...") : health?.status === "ok" ? t("Healthy") : t("Unavailable")}
                  </p>
                  <p className="text-xs text-muted mt-2">{t("Health endpoint status")}</p>
                </div>
              </section>
            )}

            {activeTab === "users" && (
              <section className="space-y-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-foreground tracking-tight">{t("Users & Access")}</h2>
                    <p className="text-sm text-muted">{t("ERP-style user management with profile, contact, role, and status tabs.")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => bootstrapMutation.mutate()}
                      className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-card-alt border border-border text-sm font-semibold hover:bg-border transition-colors"
                      disabled={bootstrapMutation.isPending}
                    >
                      <HiArrowPath className="w-4 h-4" />
                      {bootstrapMutation.isPending ? t("Syncing...") : t("Sync Default Users")}
                    </button>
                    <button
                      onClick={handleAdd}
                      className="h-10 px-4 rounded-xl bg-primary text-on-primary text-sm font-semibold shadow-sm flex items-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all"
                    >
                      <HiOutlinePlus className="w-4 h-4" />
                      {t("New User")}
                    </button>
                  </div>
                </div>

                {usersLoading ? (
                  <div className="animate-pulse space-y-3">
                    <div className="h-16 rounded-xl bg-card border border-border" />
                    <div className="h-16 rounded-xl bg-card border border-border" />
                    <div className="h-16 rounded-xl bg-card border border-border" />
                  </div>
                ) : (
                  <>
                    <div className="hidden md:block glass-card rounded-xl overflow-hidden border border-border/50">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-card-alt/60 text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                          <tr>
                            <th className="px-5 py-3">{t("User")}</th>
                            <th className="px-5 py-3">{t("Contact")}</th>
                            <th className="px-5 py-3">{t("Role")}</th>
                            <th className="px-5 py-3">{t("Status")}</th>
                            <th className="px-5 py-3 text-right">{t("Actions")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {users?.map((user) => (
                            <tr key={user.id} className="hover:bg-card-alt/30 transition-colors">
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-3">
                                  <UserAvatar
                                    fullName={user.full_name}
                                    imageUrl={user.profile_image_url}
                                    sizeClassName="w-10 h-10"
                                  />
                                  <div>
                                    <p className="font-bold text-foreground">{user.full_name}</p>
                                    <p className="text-xs text-muted">@{user.username}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-5 py-3">
                                <p className="text-sm text-foreground">{user.email || "—"}</p>
                                <p className="text-xs text-muted">{user.phone || t("No phone")}</p>
                              </td>
                              <td className="px-5 py-3">
                                <div className="flex flex-wrap gap-1.5">
                                  {(user.role_names?.length ? user.role_names : [user.role_name]).map((roleName) => (
                                    <span key={`${user.id}-${roleName}`} className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider">
                                      {roleName}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="px-5 py-3">
                                <span
                                  className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                                    user.is_active ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"
                                  }`}
                                >
                                  {user.is_active ? t("Enabled") : t("Disabled")}
                                </span>
                              </td>
                              <td className="px-5 py-3 text-right space-x-2">
                                <button
                                  onClick={() => handleEdit(user)}
                                  className="p-2 rounded-lg border border-border bg-card-alt text-foreground hover:bg-primary/10 hover:text-primary dark:hover:text-foreground transition-colors"
                                  title={t("Edit")}
                                >
                                  <HiOutlinePencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setDeleteId(user.id)}
                                  className="p-2 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-600 hover:text-white transition-colors"
                                  title={t("Delete")}
                                >
                                  <HiOutlineTrash className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="md:hidden space-y-3">
                      {users?.map((user) => (
                        <button
                          key={user.id}
                          onClick={() => handleEdit(user)}
                          className="w-full text-left rounded-xl border border-border bg-card p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <UserAvatar
                                fullName={user.full_name}
                                imageUrl={user.profile_image_url}
                                sizeClassName="w-11 h-11"
                              />
                              <div className="min-w-0">
                                <p className="font-bold text-foreground truncate">{user.full_name}</p>
                                <p className="text-xs text-muted truncate">@{user.username}</p>
                                <p className="text-xs text-muted truncate">{user.email || "No email"}</p>
                                <p className="text-xs text-muted truncate">{user.phone || t("No phone")}</p>
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteId(user.id);
                              }}
                              className="p-2 rounded-lg bg-red-500/10 text-red-600"
                            >
                              <HiOutlineTrash className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-2">
                            <div className="flex flex-wrap gap-1">
                              {(user.role_names?.length ? user.role_names : [user.role_name]).map((roleName) => (
                                <span key={`${user.id}-${roleName}-mobile`} className="px-2 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-semibold uppercase tracking-wider">
                                  {roleName}
                                </span>
                              ))}
                            </div>
                            <span
                              className={`px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                                user.is_active ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"
                              }`}
                            >
                              {user.is_active ? t("Enabled") : t("Disabled")}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>

                    {users?.length === 0 && (
                      <div className="rounded-xl border border-border bg-card p-8 text-center">
                        <p className="text-muted font-medium mb-3">{t("No users found in database.")}</p>
                        <button
                          onClick={() => bootstrapMutation.mutate()}
                          className="h-10 px-4 rounded-lg bg-primary text-on-primary text-sm font-semibold"
                          disabled={bootstrapMutation.isPending}
                        >
                          {bootstrapMutation.isPending ? t("Syncing...") : t("Create default users")}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </section>
            )}

            {activeTab === "system" && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="glass-card rounded-xl p-6 shadow-sm space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-foreground tracking-tight">{t("ID Configuration")}</h2>
                    <p className="text-xs text-muted mt-1">{t("Configure ID prefixes for each module. Prefixes are uppercased automatically.")}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Employee ID */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground mb-1.5 block px-1">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-primary"></span>
                          {t("Employee ID Prefix *")}
                        </span>
                      </label>
                      <input
                        type="text"
                        required
                        value={prefix}
                        onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                        placeholder="e.g. EMP"
                        className="w-full h-11 px-4 rounded-xl border border-border/50 bg-card-alt text-foreground focus:ring-1 focus:ring-muted/30 outline-none transition-all uppercase font-mono shadow-sm"
                      />
                      <p className="text-xs text-muted px-1 font-medium opacity-60">
                        {lang === "am" ? `ለምሳሌ: ${prefix || "EMP"}001` : `Example: ${prefix || "EMP"}001`}
                      </p>
                    </div>

                    {/* Inventory/Asset ID */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground mb-1.5 block px-1">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                          {t("Inventory ID Prefix *")}
                        </span>
                      </label>
                      <input
                        type="text"
                        value={inventoryPrefix}
                        onChange={(e) => setInventoryPrefix(e.target.value.toUpperCase())}
                        placeholder="e.g. INV"
                        className="w-full h-11 px-4 rounded-xl border border-border/50 bg-card-alt text-foreground focus:ring-1 focus:ring-muted/30 outline-none transition-all uppercase font-mono shadow-sm"
                      />
                      <p className="text-xs text-muted px-1 font-medium opacity-60">
                        {lang === "am" ? `ለምሳሌ: ${inventoryPrefix || "INV"}001` : `Example: ${inventoryPrefix || "INV"}001`}
                      </p>
                    </div>

                    {/* Event ID */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground mb-1.5 block px-1">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                          {t("Event ID Prefix *")}
                        </span>
                      </label>
                      <input
                        type="text"
                        value={eventPrefix}
                        onChange={(e) => setEventPrefix(e.target.value.toUpperCase())}
                        placeholder="e.g. EVT"
                        className="w-full h-11 px-4 rounded-xl border border-border/50 bg-card-alt text-foreground focus:ring-1 focus:ring-muted/30 outline-none transition-all uppercase font-mono shadow-sm"
                      />
                      <p className="text-xs text-muted px-1 font-medium opacity-60">
                        {lang === "am" ? `ለምሳሌ: ${eventPrefix || "EVT"}001` : `Example: ${eventPrefix || "EVT"}001`}
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSystemSavePending || isSystemSaveDisabled}
                  className={`w-full h-11 rounded-xl font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2 ${
                    isSystemSavePending
                      ? "bg-primary text-on-primary opacity-90 cursor-wait"
                      : isSystemSaveDisabled
                        ? "bg-card-alt text-muted"
                        : "bg-primary text-on-primary hover:opacity-90 active:scale-[0.98]"
                  }`}
                >
                  {isSystemSavePending ? t("Saving...") : t("Save System Settings")}
                </button>
              </form>
            )}

            {activeTab === "database" && (
              <section className="space-y-4">
                <div className="rounded-xl border border-border bg-card p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-foreground tracking-tight">{t("Backend & Database Sync")}</h2>
                      <p className="text-sm text-muted">{t("Verify backend status and sync default admin account.")}</p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                      <HiServerStack className="w-6 h-6" />
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl bg-card-alt border border-border p-4">
                      <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">{t("Health Check")}</p>
                      <p className={`text-lg font-bold mt-2 ${health?.status === "ok" ? "text-success" : "text-danger"}`}>
                        {healthLoading ? t("Checking...") : health?.status === "ok" ? "OK" : t("Unavailable")}
                      </p>
                      <p className="text-xs text-muted mt-1">
                        {health?.timestamp ? new Date(health.timestamp).toLocaleString() : "No response timestamp"}
                      </p>
                    </div>

                    <div className="rounded-xl bg-card-alt border border-border p-4">
                      <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">{t("Admin Sync")}</p>
                      <p className="text-sm text-foreground font-medium mt-2">
                        {t("Ensures admin user exists and remains enabled.")}
                      </p>
                      <button
                        onClick={() => bootstrapMutation.mutate()}
                        className="mt-3 h-10 px-4 rounded-lg bg-primary text-on-primary text-sm font-semibold"
                        disabled={bootstrapMutation.isPending}
                      >
                        {bootstrapMutation.isPending ? "Syncing..." : "Run Defaults Sync"}
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card w-full md:max-w-2xl rounded-t-xl md:rounded-xl shadow-premium border border-border/50 flex flex-col max-h-[95vh]">
            <div className="p-5 border-b border-border/50 flex justify-between items-center bg-card-alt/30 rounded-t-xl">
              <h2 className="text-lg md:text-xl font-bold text-foreground tracking-tight">
                {selectedUser ? "Edit User" : "Add New User"}
              </h2>
              <button
                onClick={closeModal}
                className="text-muted hover:text-foreground font-normal text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            <div className="px-4 md:px-6 pt-4 pb-2 border-b border-border/30 bg-card">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {modalTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setUserModalTab(tab.id)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition-colors ${
                      userModalTab === tab.id
                        ? "bg-primary text-on-primary"
                        : "bg-card-alt text-muted hover:text-foreground"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleUserSubmit} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
              {userModalTab === "identity" && (
                <div className="space-y-4">
                  <div className="space-y-3">
                    <label className="text-xs uppercase font-semibold text-muted-foreground tracking-wider block">Profile Image</label>

                    <input
                      id="profile-image-input"
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleProfileImageChange(e.target.files?.[0] || null)}
                      className="hidden"
                    />

                    <label
                      htmlFor="profile-image-input"
                      className="block rounded-xl border border-dashed border-border bg-card-alt p-3 cursor-pointer hover:border-primary/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <UserAvatar
                          fullName={formData.fullName || selectedUser?.full_name || "User"}
                          imageUrl={formData.profileImagePreviewUrl || null}
                          sizeClassName="w-20 h-20"
                          textClassName="text-xs font-semibold text-muted-foreground"
                        />
                        <div>
                          <p className="text-sm font-semibold text-foreground">Upload / Replace Profile Image</p>
                          <p className="text-[11px] text-muted mt-1">Click this placeholder to choose an image.</p>
                        </div>
                      </div>
                    </label>

                    {formData.profileImagePreviewUrl && (
                      <button
                        type="button"
                        onClick={handleRemoveProfileImage}
                        className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-600 text-xs font-semibold hover:bg-red-600 hover:text-white transition-colors"
                      >
                        Remove Image
                      </button>
                    )}

                    {(profileImageStatus || profileImageBusy) && (
                      <div className="rounded-lg border border-border bg-card-alt p-3 space-y-2">
                        <div className="h-2 rounded-full bg-border overflow-hidden">
                          <div
                            className={`h-full transition-all ${profileImageBusy ? "bg-primary" : "bg-success"}`}
                            style={{ width: `${Math.max(0, Math.min(100, profileImageProgress))}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-muted font-semibold">{profileImageStatus || "Working..."}</p>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Username *</label>
                    <input
                      required
                      type="text"
                      value={formData.username}
                      onChange={(e) => setFormData((prev) => ({ ...prev, username: e.target.value }))}
                      disabled={!!selectedUser}
                      className="w-full h-11 px-4 rounded-xl bg-card-alt border border-border/50 focus:ring-2 focus:ring-primary/50 text-sm font-medium disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Full Name *</label>
                    <input
                      required
                      type="text"
                      value={formData.fullName}
                      onChange={(e) => setFormData((prev) => ({ ...prev, fullName: e.target.value }))}
                      className="w-full h-11 px-4 rounded-xl bg-card-alt border border-border/50 focus:ring-2 focus:ring-primary/50 text-sm font-medium"
                    />
                  </div>
                </div>
              )}

              {userModalTab === "contact" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                      className="w-full h-11 px-4 rounded-xl bg-card-alt border border-border/50 focus:ring-2 focus:ring-primary/50 text-sm font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Ethiopian Phone</label>
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                      placeholder="+2519XXXXXXXX or 09XXXXXXXX"
                      className="w-full h-11 px-4 rounded-xl bg-card-alt border border-border/50 focus:ring-2 focus:ring-primary/50 text-sm font-medium"
                    />
                    <p className="text-[11px] text-muted mt-1">Normalized to +251 format when saved.</p>
                  </div>
                </div>
              )}

              {userModalTab === "access" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Roles *</label>
                    <div className="rounded-xl border border-border bg-card-alt p-3 space-y-2">
                      {roles.map((r) => {
                        const checked = formData.roleIds.includes(r.id);
                        return (
                          <label key={r.id} className="flex items-start gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleRoleSelection(r.id)}
                              className="mt-0.5 w-4 h-4 rounded border-border text-primary focus:ring-primary/50"
                            />
                            <span className="text-sm text-foreground font-medium">
                              {r.name}
                              <span className="text-xs text-muted ml-1">{r.description || ""}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-muted mt-1">
                      Multiple roles are supported; the first checked role is used as primary for compatibility.
                    </p>
                  </div>

                  <div className="pt-2">
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Resolved Effective Permissions</label>
                    {effectivePermissions.length === 0 ? (
                      <div className="text-xs text-muted-foreground p-3 border border-dashed border-border rounded-xl bg-card-alt">
                        No permissions resolved. Select at least one role.
                      </div>
                    ) : (
                      <div className="max-h-40 overflow-y-auto rounded-xl border border-border bg-card-alt p-3 space-y-1.5">
                        {effectivePermissions.includes("*") ? (
                          <div className="flex items-center gap-1.5 text-xs font-bold text-success font-mono bg-success/10 p-2 rounded-lg">
                            <span className="w-2.5 h-2.5 rounded-full bg-success animate-pulse" />
                            * (Full System Access)
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-1.5">
                            {effectivePermissions.map((slug) => (
                              <div key={slug} className="text-xs font-semibold text-foreground font-mono bg-card border border-border/50 px-2 py-1 rounded-lg truncate" title={slug}>
                                {slug}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3 pt-1">
                    <input
                      type="checkbox"
                      id="isActive"
                      checked={formData.isActive}
                      onChange={(e) => setFormData((prev) => ({ ...prev, isActive: e.target.checked }))}
                      className="w-5 h-5 rounded border-border text-primary focus:ring-primary/50"
                    />
                    <label htmlFor="isActive" className="text-sm font-semibold text-foreground">
                      Account Enabled
                    </label>
                  </div>
                </div>
              )}

              {userModalTab === "security" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                      {selectedUser ? "Password (leave blank to keep current)" : "Password *"}
                    </label>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={formData.rawPassword}
                      onChange={(e) => setFormData((prev) => ({ ...prev, rawPassword: e.target.value }))}
                      required={!selectedUser}
                      className="w-full h-11 px-4 rounded-xl bg-card-alt border border-border/50 focus:ring-2 focus:ring-primary/50 text-sm font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted hover:text-foreground"
                    >
                      {showPassword ? "Hide Password" : "Reveal Password"}
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-4 flex flex-col-reverse sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 h-11 text-sm font-semibold text-muted hover:text-foreground transition-colors rounded-xl bg-card-alt"
                >
                  Cancel
                </button>

                {selectedUser && (
                  <button
                    type="button"
                    onClick={() => {
                      closeModal();
                      setDeleteId(selectedUser.id);
                    }}
                    className="flex-1 h-11 text-sm font-semibold rounded-xl bg-red-500/10 text-red-600 hover:bg-red-600 hover:text-white transition-colors"
                  >
                    Delete User
                  </button>
                )}

                <button
                  type="submit"
                  disabled={isUserSavePending}
                  className={`flex-1 h-11 text-sm font-semibold rounded-xl shadow-sm transition-colors ${
                    isUserSavePending
                      ? "bg-primary text-on-primary opacity-90 cursor-wait"
                      : "bg-primary text-on-primary hover:bg-primary/90"
                  }`}
                >
                  {isUserSavePending ? "Saving..." : "Save User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <DeleteConfirmModal
        isOpen={!!deleteId}
        title="Delete User"
        message="Are you sure you want to permanently delete this user? This action cannot be undone."
        itemName={users?.find((u) => u.id === deleteId)?.full_name || "User"}
        onConfirm={() => {
          if (deleteId) deleteMutation.mutate(deleteId);
        }}
        onClose={() => setDeleteId(null)}
        isDeleting={deleteMutation.isPending}
      />
    </AuthLayout>
  );
}
