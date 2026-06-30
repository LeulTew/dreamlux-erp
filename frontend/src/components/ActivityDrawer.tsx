"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/hooks/use-language";
import { api } from "@/lib/api";
import { 
  HiOutlineXMark, 
  HiOutlineClock,
  HiOutlineUser,
  HiOutlinePlusCircle,
  HiOutlinePencilSquare,
  HiOutlineTrash,
  HiOutlineArrowPath,
  HiOutlineCheckCircle
} from "react-icons/hi2";

interface ActivityLogEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  user_id: string | null;
  username: string | null;
  full_name: string | null;
  action: string;
  field_changed: string | null;
  old_value: string | null;
  new_value: string | null;
  note: string | null;
  source_route?: string | null;
  created_at: string;
}

interface ActivityDrawerProps {
  entityType: string;
  entityId: string;
  isOpen: boolean;
  onClose: () => void;
}

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    ActivityTimeline: "Activity Timeline",
    Close: "Close",
    NoActivity: "No activity logged for this record yet.",
    Loading: "Loading timeline...",
    Error: "Failed to load activity logs.",
    ActorSystem: "System",
    ActionCreate: "Created record",
    ActionUpdate: "Updated record",
    ActionUpdatePermissions: "Updated permissions",
    ActionDelete: "Soft deleted record",
    ActionRestore: "Restored record",
    ActionPermanentDelete: "Permanently deleted",
    ActionReconcile: "Reconciled quantities",
    ActionUnknown: "Modified",
    Field: "Field",
    Before: "Before",
    After: "After",
    Note: "Note",
    Source: "Source",
  },
  am: {
    ActivityTimeline: "የእንቅስቃሴ ታሪክ",
    Close: "ዝጋ",
    NoActivity: "ለዚህ መዝገብ እስካሁን የተመዘገበ እንቅስቃሴ የለም።",
    Loading: "ታሪኩን በመጫን ላይ...",
    Error: "የእንቅስቃሴ መዝገቦችን መጫን አልተቻለም።",
    ActorSystem: "ሲስተም",
    ActionCreate: "መዝገብ ፈጠረ",
    ActionUpdate: "መዝገብ አሻሻለ",
    ActionUpdatePermissions: "ፈቃዶችን አሻሻለ",
    ActionDelete: "መዝገብ አጠፋ (ጊዜያዊ)",
    ActionRestore: "መዝገብ መለሰ",
    ActionPermanentDelete: "መዝገብ ሙሉ በሙሉ አጠፋ",
    ActionReconcile: "ብዛት አስተካከለ",
    ActionUnknown: "አሻሻለ",
    Field: "መስክ",
    Before: "ቀደም ሲል",
    After: "በኋላ",
    Note: "ማስታወሻ",
    Source: "ምንጭ",
  }
};

const getActionIcon = (action: string) => {
  switch (action) {
    case "create":
      return HiOutlinePlusCircle;
    case "update":
      return HiOutlinePencilSquare;
    case "update_permissions":
      return HiOutlineCheckCircle;
    case "delete":
      return HiOutlineTrash;
    case "restore":
      return HiOutlineArrowPath;
    case "permanent_delete":
      return HiOutlineTrash;
    case "reconcile":
      return HiOutlineCheckCircle;
    default:
      return HiOutlineClock;
  }
};

const getActionColor = (action: string) => {
  switch (action) {
    case "create":
      return "text-green-500 bg-green-500/10 border-green-500/20";
    case "delete":
    case "permanent_delete":
      return "text-red-500 bg-red-500/10 border-red-500/20";
    case "restore":
      return "text-indigo-400 bg-indigo-500/10 border-indigo-500/20";
    case "reconcile":
    case "update_permissions":
      return "text-amber-500 bg-amber-500/10 border-amber-500/20";
    default:
      return "text-primary bg-gold/10 border-gold/20";
  }
};

export default function ActivityDrawer({ entityType, entityId, isOpen, onClose }: ActivityDrawerProps) {
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;

  const { data, isLoading, error } = useQuery<{ activity: ActivityLogEntry[] }>({
    queryKey: ["activity-logs", entityType, entityId],
    queryFn: async () => {
      const res = await api.get<{ activity: ActivityLogEntry[] }>("/api/activity", {
        params: {
          entity_type: entityType,
          entity_id: entityId,
        },
      });
      return res.data;
    },
    enabled: isOpen && Boolean(entityId),
  });

  if (!isOpen) return null;

  const logs = data?.activity || [];

  return (
    <>
      {/* Backdrop overlay */}
      <div 
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Slide-out Sheet Panel */}
      <div 
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-card border-l border-border text-foreground flex flex-col shadow-massive transition-transform duration-300 transform translate-x-0"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-4 border-b border-border flex justify-between items-center bg-card-alt/50">
          <div className="flex items-center gap-2">
            <HiOutlineClock className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold tracking-tight text-foreground">{t("ActivityTimeline")}</h2>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-2xl bg-transparent text-muted hover:bg-card-alt hover:text-foreground transition-colors focus:outline-none"
            aria-label={t("Close")}
          >
            <HiOutlineXMark className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {isLoading && (
            <div className="flex flex-col items-center justify-center h-48 space-y-2 text-muted">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              <p className="text-sm">{t("Loading")}</p>
            </div>
          )}

          {error && (
            <div className="p-4 text-center border border-red-500/20 bg-red-500/10 text-red-400 rounded-xl text-sm">
              {t("Error")}
            </div>
          )}

          {!isLoading && !error && logs.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 text-muted text-center">
              <HiOutlineClock className="w-12 h-12 mb-2 text-muted/30" />
              <p className="text-sm">{t("NoActivity")}</p>
            </div>
          )}

          {!isLoading && !error && logs.length > 0 && (
            <div className="relative border-l border-border ml-4 space-y-6">
              {logs.map((log) => {
                const Icon = getActionIcon(log.action);
                const colorClasses = getActionColor(log.action);
                const formattedTime = new Date(log.created_at).toLocaleString(lang === "am" ? "am-ET" : "en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                });

                let actionLabel = t("ActionUnknown");
                if (log.action === "create") actionLabel = t("ActionCreate");
                if (log.action === "update") actionLabel = t("ActionUpdate");
                if (log.action === "update_permissions") actionLabel = t("ActionUpdatePermissions");
                if (log.action === "delete") actionLabel = t("ActionDelete");
                if (log.action === "restore") actionLabel = t("ActionRestore");
                if (log.action === "permanent_delete") actionLabel = t("ActionPermanentDelete");
                if (log.action === "reconcile") actionLabel = t("ActionReconcile");

                return (
                  <div key={log.id} className="relative pl-6">
                    <span className={`absolute -left-3.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-xl border text-sm ${colorClasses}`}>
                      <Icon className="w-4 h-4" />
                    </span>

                    <div className="flex flex-col space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground text-sm">
                          {actionLabel}
                        </span>
                        <span className="text-xs text-muted font-mono tabular-nums">
                          {formattedTime}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-muted mt-0.5">
                        <HiOutlineUser className="w-3.5 h-3.5 text-muted" />
                        <span>{log.full_name || log.username || t("ActorSystem")}</span>
                      </div>

                      {log.source_route && (
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                          {t("Source")}: <span className="font-mono normal-case tracking-normal">{log.source_route}</span>
                        </div>
                      )}

                      {log.note && (
                        <p className="text-xs text-foreground mt-2 bg-card-alt border border-border p-2 rounded-sm italic">
                          {log.note}
                        </p>
                      )}

                      {log.field_changed && (
                        <div className="mt-2 text-xs bg-card-alt/50 border border-border p-2 rounded-sm space-y-1.5 font-mono">
                          <div className="flex justify-between border-b border-border pb-1 text-[10px] text-muted">
                            <span>{t("Field")}: <span className="text-primary font-sans font-semibold">{log.field_changed}</span></span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 pt-0.5">
                            {log.old_value !== null && (
                              <div className="flex flex-col">
                                <span className="text-[10px] text-muted uppercase font-sans">{t("Before")}</span>
                                <span className="text-red-400/90 text-xs truncate" title={log.old_value}>
                                  {log.old_value}
                                </span>
                              </div>
                            )}
                            {log.new_value !== null && (
                              <div className="flex flex-col">
                                <span className="text-[10px] text-muted uppercase font-sans">{t("After")}</span>
                                <span className="text-green-400/90 text-xs truncate" title={log.new_value}>
                                  {log.new_value}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
