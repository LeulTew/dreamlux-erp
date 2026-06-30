"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getNotifications,
  getUnreadNotificationsCount,
  markNotificationRead,
  markAllNotificationsRead,
  archiveNotification,
} from "@/lib/api";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/utils/supabase/client";
import {
  HiOutlineBell,
  HiBell,
  HiOutlineTrash,
  HiOutlineCheckCircle,
  HiOutlineInbox,
  HiOutlineShieldCheck
} from "react-icons/hi2";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    Notifications: "Notifications",
    "Mark all read": "Mark all read",
    "View all": "View all",
    "No notifications": "No notifications",
    "Enable Desktop Alerts": "Enable Desktop Alerts",
    "Enable push descriptions": "Receive live browser alerts for assignments, approvals, and payroll.",
    Enable: "Enable",
  },
  am: {
    Notifications: "ማሳወቂያዎች",
    "Mark all read": "ሁሉንም አንብቤያለሁ",
    "View all": "ሁሉንም አሳይ",
    "No notifications": "ምንም ማሳወቂያ የለም",
    "Enable Desktop Alerts": "የዴስክቶፕ ማሳወቂያ ፍቀድ",
    "Enable push descriptions": "ለደመወዝ፣ ለማጽደቂያዎች እና ለስራ ምደባዎች የቀጥታ ማሳወቂያ ያግኙ።",
    Enable: "ፍቀድ",
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
      <span className="inline-flex shrink-0 items-center px-1 py-0.5 rounded text-[8px] font-black uppercase tracking-wider text-rose-500 bg-rose-500/10 border border-rose-500/20 leading-none">
        High
      </span>
    );
  }
  if (priority === "low") {
    return (
      <span className="inline-flex shrink-0 items-center px-1 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider text-muted-foreground bg-neutral-100 dark:bg-neutral-800 border border-border leading-none">
        Low
      </span>
    );
  }
  return null;
};

export default function NotificationInbox() {
  const { lang } = useLanguage();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pushSupported, setPushSupported] = useState(false);
  const [permissionState, setPermissionState] = useState<string>("default");

  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;

  // Supabase Realtime Websocket Listener for instant notification updates
  useEffect(() => {
    if (!user?.id) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`public:notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${user.id}`,
        },
        (payload) => {
          // Instantly refresh query caches on any websocket broadcast event
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

  // 1. Fetch unread count & last 5 notifications
  const { data: countData } = useQuery<{ unread_count: number }>({
    queryKey: ["notifications-unread-count"],
    queryFn: getUnreadNotificationsCount,
    refetchInterval: 30000, // Conservative 30s polling fallback (websockets provide instant updates)
    refetchIntervalInBackground: true,
  });

  const { data: listData } = useQuery<{ notifications: NotificationItem[] }>({
    queryKey: ["notifications-recent"],
    queryFn: () => getNotifications({ page: 1, limit: 5 }),
    enabled: isOpen,
    staleTime: 0, // Always refetch when dropdown opens — never serve stale cache
  });

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

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Check push support and permission state safely
  useEffect(() => {
    const checkSupport = () => {
      if (typeof window !== "undefined" && "Notification" in window) {
        setPushSupported(true);
        setPermissionState(Notification.permission);
      }
    };
    const timer = setTimeout(checkSupport, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleRequestPermission = async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      const result = await Notification.requestPermission();
      setPermissionState(result);
    }
  };

  const handleNotificationClick = async (notification: NotificationItem) => {
    setIsOpen(false);
    if (!notification.read_at) {
      await markReadMutation.mutateAsync(notification.id);
    }
    if (notification.action_url) {
      router.push(notification.action_url);
    }
  };

  const unreadCount = countData?.unread_count || 0;
  const recentNotifications = listData?.notifications || [];

  return (
    <div className="relative flex items-center" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card-alt/50 text-muted hover:text-foreground hover:bg-card-alt hover:border-primary/30 transition-all cursor-pointer shrink-0"
        aria-label="Open notifications"
      >
        {unreadCount > 0 ? (
          <>
            <HiBell className="h-4.5 w-4.5 text-primary shrink-0 animate-wiggle" />
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-white leading-none tabular-nums border border-card shadow-sm">
              {unreadCount}
            </span>
          </>
        ) : (
          <HiOutlineBell className="h-4.5 w-4.5 shrink-0" />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 z-50 w-80 sm:w-96 rounded-xl border border-border bg-card shadow-xl p-3 flex flex-col gap-2.5 animate-scale-in">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="text-xs font-bold text-foreground">{t("Notifications")}</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllReadMutation.mutate()}
                className="flex items-center gap-1 text-[10px] font-bold text-primary hover:text-primary/80 transition-all cursor-pointer"
              >
                <HiOutlineCheckCircle className="h-3.5 w-3.5" />
                <span>{t("Mark all read")}</span>
              </button>
            )}
          </div>

          {/* Pre-prompt Permission Box (Non-intrusive) */}
          {pushSupported && permissionState === "default" && (
            <div className="rounded-lg border border-primary/20 bg-primary-light/5 p-2.5 flex flex-col gap-1.5">
              <div className="flex items-start gap-1.5">
                <HiOutlineShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-[11px] font-bold text-foreground leading-tight">{t("Enable Desktop Alerts")}</h4>
                  <p className="text-[9px] text-muted leading-snug mt-0.5">{t("Enable push descriptions")}</p>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={handleRequestPermission}
                  className="rounded bg-primary px-2.5 py-1 text-[9px] font-bold text-white hover:opacity-90 active:scale-95 transition-all cursor-pointer uppercase tracking-wider"
                >
                  {t("Enable")}
                </button>
              </div>
            </div>
          )}

          {/* List Area */}
          <div className="max-h-72 overflow-y-auto flex flex-col gap-1.5">
            {recentNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <HiOutlineInbox className="h-8 w-8 text-muted/40 mb-1" />
                <span className="text-[10px] font-semibold text-muted">{t("No notifications")}</span>
              </div>
            ) : (
              recentNotifications.map((n) => (
                <div
                  key={n.id}
                  className={`group relative rounded-lg border-l-4 p-2.5 flex items-start gap-2.5 transition-all cursor-pointer ${
                    n.read_at 
                      ? "bg-transparent border-y-border/40 border-r-border/40 border-l-transparent text-muted-foreground/80 hover:bg-primary/[0.02] hover:border-primary/10" 
                      : "bg-primary/[0.04] dark:bg-primary/[0.08] border-y-primary/15 border-r-primary/15 border-l-primary shadow-sm hover:bg-primary/[0.07] dark:hover:bg-primary/[0.12]"
                  }`}
                  onClick={() => handleNotificationClick(n)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <h4 className="text-[11px] font-bold text-foreground leading-tight truncate">{n.title}</h4>
                        {renderPriorityBadge(n.priority)}
                      </div>
                      <span className="text-[9px] font-mono text-muted shrink-0">
                        {n.created_at ? String(n.created_at).slice(11, 16) : ""}
                      </span>
                    </div>
                    <p className={`text-[10px] leading-relaxed mt-1 break-words line-clamp-2 ${
                      n.read_at ? "text-muted-foreground/75" : "text-foreground/90 font-medium"
                    }`}>
                      {n.message}
                    </p>
                  </div>

                  {/* Actions (Archive) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      archiveMutation.mutate(n.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 flex h-6 w-6 items-center justify-center rounded border border-border bg-card text-muted hover:text-danger hover:border-danger/30 transition-all cursor-pointer shrink-0"
                    title="Archive notification"
                  >
                    <HiOutlineTrash className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border pt-2 text-center">
            <Link
              href="/notifications"
              onClick={() => setIsOpen(false)}
              className="inline-block text-[10px] font-black text-primary hover:text-primary/80 transition-all cursor-pointer uppercase tracking-wider"
            >
              {t("View all")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
