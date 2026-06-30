"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import AuthLayout from "@/components/AuthLayout";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  archiveNotification,
  getNotificationPreferences,
  updateNotificationPreferences,
} from "@/lib/api";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/utils/supabase/client";
import {
  HiOutlineInbox,
  HiOutlineCheck,
  HiOutlineTrash,
  HiOutlineBell,
  HiOutlineEnvelope,
  HiOutlineDevicePhoneMobile
} from "react-icons/hi2";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Notification Center": "Notification Center",
    Inbox: "Inbox",
    Preferences: "Preferences",
    "Mark all read": "Mark all read",
    "No notifications found": "No notifications found",
    "In-App Notifications": "In-App Notifications",
    "In-App Description": "Enable the notification bell and unread counts inside the ERP header.",
    "Email Alerts": "Email Alerts",
    "Email Description": "Receive summaries of pending proposals and payroll events directly in your inbox.",
    "Push Notifications": "Push Notifications",
    "Push Description": "Send direct browser alerts to your device for immediate event assignments.",
    "Notification Categories": "Notification Categories",
    "Event Proposals": "Event Proposals",
    "Events & Assignments": "Events & Assignments",
    Expenses: "Expenses",
    Payroll: "Payroll",
    Inventory: "Inventory & Discrepancies",
    Employees: "Employees",
    "System Settings & Reference Data": "System Settings & Reference Data",
    "Save Preferences": "Save Preferences",
    "Preferences Saved Successfully": "Notification preferences updated successfully.",
    "All Alerts": "All Alerts",
    "Unread Only": "Unread Only",
    "Page Info": "Page {page} of {totalPages}",
    Previous: "Previous",
    Next: "Next",
  },
  am: {
    "Notification Center": "የማሳወቂያ ማዕከል",
    Inbox: "ማሳወቂያዎች",
    Preferences: "ቅንብሮች",
    "Mark all read": "ሁሉንም አንብቤያለሁ",
    "No notifications found": "ምንም ማሳወቂያዎች አልተገኙም",
    "In-App Notifications": "በሲስተሙ ውስጥ ማሳወቂያዎች",
    "In-App Description": "በERP ዋናው ራስጌ ላይ የማሳወቂያ ደወል እና ያልተነበቡ ቆጠራዎችን ያግብሩ።",
    "Email Alerts": "የኢሜይል ማንቂያዎች",
    "Email Description": "ስለ ሚጠብቁ ፕሮፖዛሎች እና የደመወዝ ክንውኖች ማጠቃለያ በቀጥታ በኢሜይልዎ ያግኙ።",
    "Push Notifications": "የቀጥታ ስልክ/ብሮውዘር ማሳወቂያዎች",
    "Push Description": "ለፈጣን ዝግጅት ምደባዎች ወደ መሳሪያዎ የቀጥታ የብሮውዘር ማንቂያዎችን ይላኩ።",
    "Notification Categories": "የማሳወቂያ ምድቦች",
    "Event Proposals": "የዝግጅት ፕሮፖዛል",
    "Events & Assignments": "ዝግጅቶች እና ምደባዎች",
    Expenses: "ወጪዎች",
    Payroll: "ደመወዝ",
    Inventory: "ንብረት እና የቆጠራ ግድፈቶች",
    Employees: "ሰራተኞች",
    "System Settings & Reference Data": "የስርዓት ቅንብሮች እና ማመሳከሪያ መረጃዎች",
    "Save Preferences": "ቅንብሮችን አስቀምጥ",
    "Preferences Saved Successfully": "የማሳወቂያ ምርጫዎች በተሳካ ሁኔታ ተዘምነዋል።",
    "All Alerts": "ሁሉም ማንቂያዎች",
    "Unread Only": "ያልተነበቡ ብቻ",
    "Page Info": "ገጽ {page} ከ {totalPages}",
    Previous: "የቀደመ",
    Next: "ቀጣይ",
  },
};

interface NotificationItem {
  id: string;
  recipient_id: string;
  actor_id?: string | null;
  title: string;
  message: string;
  entity_type?: string | null;
  entity_id?: string | null;
  action_url?: string | null;
  read_at?: string | null;
  archived_at?: string | null;
  created_at?: string;
  actor_username?: string | null;
  actor_name?: string | null;
  priority?: string | null;
}

const renderPriorityBadge = (priority?: string | null) => {
  if (priority === "high") {
    return (
      <span className="inline-flex shrink-0 items-center px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider text-rose-500 bg-rose-500/10 border border-rose-500/20 leading-none">
        High
      </span>
    );
  }
  if (priority === "low") {
    return (
      <span className="inline-flex shrink-0 items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider text-muted-foreground bg-neutral-100 dark:bg-neutral-800 border border-border leading-none">
        Low
      </span>
    );
  }
  return null;
};

interface NotificationPreferences {
  in_app_enabled: boolean;
  email_enabled: boolean;
  push_enabled: boolean;
  categories: Record<string, boolean>;
}

type NotificationPreferenceFlag = "in_app_enabled" | "email_enabled" | "push_enabled";

export default function NotificationsPage() {
  const { lang } = useLanguage();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"inbox" | "preferences">("inbox");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 10;

  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;

  // Supabase Realtime Websocket Listener for instant standalone page updates
  useEffect(() => {
    if (!user?.id) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`public:notifications:page:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${user.id}`,
        },
        () => {
          // Instantly refresh list, unread count, etc. on any realtime database change
          queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
          queryClient.invalidateQueries({ queryKey: ["notifications-recent"] });
          queryClient.invalidateQueries({ queryKey: ["notifications-list"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  // 1. Queries
  const { data: notificationsData, isLoading } = useQuery<{
    notifications: NotificationItem[];
    total: number;
    totalPages: number;
  }>({
    queryKey: ["notifications-list", page, unreadOnly],
    queryFn: () => getNotifications({ page, limit }),
    placeholderData: keepPreviousData,
  });

  const { data: prefsData } = useQuery<NotificationPreferences>({
    queryKey: ["notification-preferences"],
    queryFn: getNotificationPreferences,
    enabled: activeTab === "preferences",
  });

  // Local preferences state for form manipulation
  const [localPrefs, setLocalPrefs] = useState<NotificationPreferences | null>(null);
  const [showSaveToast, setShowSaveToast] = useState(false);

  React.useEffect(() => {
    if (prefsData) {
      setLocalPrefs({
        in_app_enabled: prefsData.in_app_enabled,
        email_enabled: prefsData.email_enabled,
        push_enabled: prefsData.push_enabled,
        categories: prefsData.categories || {
          proposals: true,
          events: true,
          expenses: true,
          payroll: true,
          inventory: true,
          employees: true,
          settings: true,
        },
      });
    }
  }, [prefsData]);

  // 2. Mutations (tagged to skip global MutationCache re-invalidation)
  const markReadMutation = useMutation({
    mutationKey: ["notification-action"],
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-recent"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-list"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationKey: ["notification-action"],
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-recent"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-list"] });
    },
  });

  const archiveMutation = useMutation({
    mutationKey: ["notification-action"],
    mutationFn: archiveNotification,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-recent"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-list"] });
    },
  });

  const updatePrefsMutation = useMutation({
    mutationFn: updateNotificationPreferences,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
      setShowSaveToast(true);
      setTimeout(() => setShowSaveToast(false), 3000);
    },
  });

  const filteredNotifications = React.useMemo(() => {
    const list = notificationsData?.notifications || [];
    if (unreadOnly) {
      return list.filter((n) => !n.read_at);
    }
    return list;
  }, [notificationsData, unreadOnly]);

  const totalPages = notificationsData?.totalPages || 1;

  const handleRowClick = async (n: NotificationItem) => {
    if (!n.read_at) {
      await markReadMutation.mutateAsync(n.id);
    }
    if (n.action_url) {
      router.push(n.action_url);
    }
  };

  const handleTogglePref = (key: NotificationPreferenceFlag) => {
    if (!localPrefs) return;
    setLocalPrefs({
      ...localPrefs,
      [key]: !localPrefs[key],
    });
  };

  const handleToggleCategory = (categoryKey: string) => {
    if (!localPrefs) return;
    setLocalPrefs({
      ...localPrefs,
      categories: {
        ...localPrefs.categories,
        [categoryKey]: !localPrefs.categories[categoryKey],
      },
    });
  };

  return (
    <AuthLayout>
      <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full select-none">
        {/* Title Block */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/40 pb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {t("Notification Center")}
            </h1>
          </div>
          {activeTab === "inbox" && filteredNotifications.length > 0 && (
            <button
              onClick={() => markAllReadMutation.mutate()}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/20 bg-primary-light/5 text-primary hover:bg-primary-light/10 text-xs font-bold transition-all cursor-pointer select-none"
            >
              <HiOutlineCheck className="h-4 w-4 shrink-0" />
              <span>{t("Mark all read")}</span>
            </button>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab("inbox")}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === "inbox"
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t("Inbox")}
          </button>
          <button
            onClick={() => setActiveTab("preferences")}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === "preferences"
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t("Preferences")}
          </button>
        </div>

        {/* Tab 1: Inbox */}
        {activeTab === "inbox" && (
          <div className="flex flex-col gap-4">
            {/* Filter Toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setUnreadOnly(false)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                  !unreadOnly
                    ? "bg-primary border-primary text-white"
                    : "bg-card border-border text-muted hover:text-foreground"
                }`}
              >
                {t("All Alerts")}
              </button>
              <button
                onClick={() => setUnreadOnly(true)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                  unreadOnly
                    ? "bg-primary border-primary text-white"
                    : "bg-card border-border text-muted hover:text-foreground"
                }`}
              >
                {t("Unread Only")}
              </button>
            </div>

            {/* List */}
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="h-6 w-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border rounded-xl bg-card">
                <HiOutlineInbox className="h-10 w-10 text-muted/30 mb-2" />
                <p className="text-xs font-semibold text-muted">{t("No notifications found")}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {filteredNotifications.map((n) => (
                  <div
                    key={n.id}
                    className={`group relative rounded-xl border-l-4 p-4 flex items-start gap-4 transition-all cursor-pointer ${
                      n.read_at 
                        ? "bg-transparent border-y-border/40 border-r-border/40 border-l-transparent text-muted-foreground/80 hover:bg-primary/[0.02] hover:border-primary/10" 
                        : "bg-primary/[0.04] dark:bg-primary/[0.08] border-y-primary/20 border-r-primary/20 border-l-primary shadow-sm hover:bg-primary/[0.07] dark:hover:bg-primary/[0.12]"
                    }`}
                    onClick={() => handleRowClick(n)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <h3 className="text-xs font-bold text-foreground truncate">{n.title}</h3>
                          {renderPriorityBadge(n.priority)}
                        </div>
                        <span className="text-[10px] font-mono text-muted">
                          {n.created_at ? new Date(n.created_at).toLocaleString() : ""}
                        </span>
                      </div>
                      <p className={`text-xs leading-relaxed max-w-2xl ${
                        n.read_at ? "text-muted-foreground/80" : "text-foreground/90 font-medium"
                      }`}>{n.message}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {!n.read_at && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            markReadMutation.mutate(n.id);
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card text-muted hover:text-primary hover:border-primary/30 transition-all cursor-pointer"
                          title="Mark as read"
                        >
                          <HiOutlineCheck className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          archiveMutation.mutate(n.id);
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card text-muted hover:text-danger hover:border-danger/30 transition-all cursor-pointer"
                        title="Archive"
                      >
                        <HiOutlineTrash className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border pt-4">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg border border-border text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-card-alt transition-all cursor-pointer"
                >
                  {t("Previous")}
                </button>
                <span className="text-xs text-muted">
                  {t("Page Info").replace("{page}", String(page)).replace("{totalPages}", String(totalPages))}
                </span>
                <button
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 rounded-lg border border-border text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-card-alt transition-all cursor-pointer"
                >
                  {t("Next")}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Preferences */}
        {activeTab === "preferences" && localPrefs && (
          <div className="flex flex-col gap-6">
            {/* Save Confirmation Toast */}
            {showSaveToast && (
              <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-card border border-primary/20 p-3 shadow-xl animate-fade-in-up">
                <HiOutlineCheck className="h-4.5 w-4.5 text-primary shrink-0" />
                <span className="text-xs font-semibold text-foreground">
                  {t("Preferences Saved Successfully")}
                </span>
              </div>
            )}

            {/* Notification Channels */}
            <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-5">
              <h2 className="text-xs font-bold text-muted uppercase tracking-wider">Notification Channels</h2>

              {/* In-app */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  <div className="mt-0.5 rounded-lg bg-primary-light/10 p-2 text-primary shrink-0">
                    <HiOutlineBell className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-foreground">{t("In-App Notifications")}</h3>
                    <p className="text-[10px] text-muted leading-relaxed mt-0.5">{t("In-App Description")}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleTogglePref("in_app_enabled")}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out ${
                    localPrefs.in_app_enabled ? "bg-primary" : "bg-neutral-800"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out mt-0.5 ${
                      localPrefs.in_app_enabled ? "translate-x-4.5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>

              {/* Email */}
              <div className="flex items-start justify-between gap-4 border-t border-border/40 pt-4">
                <div className="flex gap-3">
                  <div className="mt-0.5 rounded-lg bg-primary-light/10 p-2 text-primary shrink-0">
                    <HiOutlineEnvelope className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-foreground">{t("Email Alerts")}</h3>
                    <p className="text-[10px] text-muted leading-relaxed mt-0.5">{t("Email Description")}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleTogglePref("email_enabled")}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out ${
                    localPrefs.email_enabled ? "bg-primary" : "bg-neutral-800"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out mt-0.5 ${
                      localPrefs.email_enabled ? "translate-x-4.5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>

              {/* Push */}
              <div className="flex items-start justify-between gap-4 border-t border-border/40 pt-4">
                <div className="flex gap-3">
                  <div className="mt-0.5 rounded-lg bg-primary-light/10 p-2 text-primary shrink-0">
                    <HiOutlineDevicePhoneMobile className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-foreground">{t("Push Notifications")}</h3>
                    <p className="text-[10px] text-muted leading-relaxed mt-0.5">{t("Push Description")}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleTogglePref("push_enabled")}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out ${
                    localPrefs.push_enabled ? "bg-primary" : "bg-neutral-800"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out mt-0.5 ${
                      localPrefs.push_enabled ? "translate-x-4.5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Notification Categories */}
            <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4">
              <h2 className="text-xs font-bold text-muted uppercase tracking-wider">{t("Notification Categories")}</h2>

              <div className="flex flex-col gap-3">
                {/* Proposals */}
                <label className="flex items-center justify-between cursor-pointer p-1">
                  <span className="text-xs font-semibold text-foreground">{t("Event Proposals")}</span>
                  <input
                    type="checkbox"
                    checked={localPrefs.categories.proposals}
                    onChange={() => handleToggleCategory("proposals")}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary accent-primary"
                  />
                </label>

                {/* Events */}
                <label className="flex items-center justify-between cursor-pointer border-t border-border/40 pt-3 p-1">
                  <span className="text-xs font-semibold text-foreground">{t("Events & Assignments")}</span>
                  <input
                    type="checkbox"
                    checked={localPrefs.categories.events}
                    onChange={() => handleToggleCategory("events")}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary accent-primary"
                  />
                </label>

                {/* Expenses */}
                <label className="flex items-center justify-between cursor-pointer border-t border-border/40 pt-3 p-1">
                  <span className="text-xs font-semibold text-foreground">{t("Expenses")}</span>
                  <input
                    type="checkbox"
                    checked={localPrefs.categories.expenses}
                    onChange={() => handleToggleCategory("expenses")}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary accent-primary"
                  />
                </label>

                {/* Payroll */}
                <label className="flex items-center justify-between cursor-pointer border-t border-border/40 pt-3 p-1">
                  <span className="text-xs font-semibold text-foreground">{t("Payroll")}</span>
                  <input
                    type="checkbox"
                    checked={localPrefs.categories.payroll}
                    onChange={() => handleToggleCategory("payroll")}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary accent-primary"
                  />
                </label>

                {/* Inventory */}
                <label className="flex items-center justify-between cursor-pointer border-t border-border/40 pt-3 p-1">
                  <span className="text-xs font-semibold text-foreground">{t("Inventory")}</span>
                  <input
                    type="checkbox"
                    checked={localPrefs.categories.inventory}
                    onChange={() => handleToggleCategory("inventory")}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary accent-primary"
                  />
                </label>

                {/* Employees */}
                <label className="flex items-center justify-between cursor-pointer border-t border-border/40 pt-3 p-1">
                  <span className="text-xs font-semibold text-foreground">{t("Employees")}</span>
                  <input
                    type="checkbox"
                    checked={localPrefs.categories.employees ?? true}
                    onChange={() => handleToggleCategory("employees")}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary accent-primary"
                  />
                </label>

                {/* Settings & Reference Data */}
                <label className="flex items-center justify-between cursor-pointer border-t border-border/40 pt-3 p-1">
                  <span className="text-xs font-semibold text-foreground">{t("System Settings & Reference Data")}</span>
                  <input
                    type="checkbox"
                    checked={localPrefs.categories.settings ?? true}
                    onChange={() => handleToggleCategory("settings")}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary accent-primary"
                  />
                </label>
              </div>
            </div>

            {/* Save button */}
            <div className="flex justify-end pt-2">
              <button
                onClick={() => updatePrefsMutation.mutate(localPrefs)}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-primary text-white font-bold hover:opacity-90 active:scale-95 transition-all text-xs tracking-wider uppercase cursor-pointer"
              >
                {t("Save Preferences")}
              </button>
            </div>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
