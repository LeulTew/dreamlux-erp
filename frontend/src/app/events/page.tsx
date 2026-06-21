"use client";
import React, { useEffect, useState, useMemo, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  getEvents, 
  getEventSavedViews, 
  createEventSavedView, 
  deleteEventSavedView, 
  duplicateEventSavedView, 
  setDefaultEventSavedView,
  getEventsExportUrl,
  api
} from "@/lib/api";
import { Event, EventsResponse, EventSavedView } from "@/lib/types";
import AuthLayout from "@/components/AuthLayout";
import { 
  HiCalendar, 
  HiPlus, 
  HiMagnifyingGlass, 
  HiPencilSquare, 
  HiArrowTopRightOnSquare,
  HiAdjustmentsHorizontal,
  HiBookmark,
  HiArrowDownTray,
  HiArrowUpTray,
  HiLockClosed,
  HiTrash,
  HiDocumentDuplicate,
  HiStar,
  HiPrinter,
  HiXMark
} from "react-icons/hi2";

import EditEventSheet from "@/components/EditEventSheet";
import PaginationControls from "@/components/PaginationControls";
import Link from "next/link";
import { useLanguage } from "@/hooks/use-language";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import ResponsiveDrawer from "@/components/ui/ResponsiveDrawer";
import ImportWizard from "@/components/ImportWizard";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    Events: "Events",
    Planned: "Planned",
    Ongoing: "Ongoing",
    Completed: "Completed",
    "Total Records": "Total Records",
    "Add Event": "Add Event",
    Search: "Search...",
    "All Statuses": "All Statuses",
    "Select Status": "Select Status",
    "Event Title": "Event Title",
    "Client Name": "Client Name",
    "Client Phone": "Client Phone",
    "Date": "Date",
    "Venue": "Venue",
    "Price": "Price",
    "Status": "Status",
    "Actions": "Actions",
    "Logs": "Logs",
    "No events found": "No events found",
    "Managing event directory": "Managing event directory",
    "Loading Events...": "Loading Events...",
    "Workspace": "Workspace",
    "Filters": "Filters",
    "Saved Views": "Saved Views",
    "Save Current View": "Save Current View",
    "Advanced Filters": "Advanced Filters",
    "Reset": "Reset",
    "Apply": "Apply",
    "Import": "Import",
    "Export": "Export",
    "Export CSV": "Export CSV",
    "Export XLSX": "Export XLSX",
    "All Time": "All Time",
    "Next 14 Days": "Next 14 Days",
    "This Month": "This Month",
    "Last Month": "Last Month",
    "View Name": "View Name",
    "Scope": "Scope",
    "Role Name": "Role Name",
    "Default": "Default",
    "Save": "Save",
    "Cancel": "Cancel",
    "Duplicate": "Duplicate",
    "Rename": "Rename",
    "Delete": "Delete",
    "Personal": "Personal",
    "Role-based": "Role-based",
    "Global": "Global",
    "Custom": "Custom",
    "Default View": "Default View",
    "Delete View": "Delete View",
    "Are you sure you want to delete this saved view?": "Are you sure you want to delete this saved view?",
    "Yes, Delete": "Yes, Delete",
    "Duplicate View": "Duplicate View",
    "Save View": "Save View",
    "Operator": "Operator",
    "Value": "Value",
    "Add Rule": "Add Rule",
    "Match All (AND)": "Match All (AND)",
    "Match Any (OR)": "Match Any (OR)",
    "Event Name": "Event Name",
    "Event Type Name": "Event Type Name",
    "Start Date": "Start Date",
    "End Date": "End Date",
    "Venue Location": "Venue Location",
    "Revenue": "Revenue",
    "Approved Expenses": "Approved Expenses",
    "Net Profit": "Net Profit",
    "Margin %": "Margin %",
    "Checklist %": "Checklist %",
    "Equals": "Equals",
    "Not Equals": "Not Equals",
    "Contains": "Contains",
    "Starts With": "Starts With",
    "Greater Than": "Greater Than",
    "Less Than": "Less Than",
    "Is Empty": "Is Empty",
    "Is Not Empty": "Is Not Empty",
    "No Saved Views": "No Saved Views",
    "Save View Description": "Save your current search, filters, and sorting parameters as a saved view.",
    "View Title": "View Title",
    "Proposals": "Proposals"
  },
  am: {
    Events: "ዝግጅቶች",
    Planned: "ቀጠሮ የተያዘ",
    Ongoing: "በሂደት ላይ",
    Completed: "የተጠናቀቀ",
    "Total Records": "ጠቅላላ መዝገቦች",
    "Add Event": "ዝግጅት መዝግብ",
    Search: "ፈልግ...",
    "All Statuses": "ሁሉንም ሁኔታዎች",
    "Select Status": "ሁኔታ ምረጥ",
    "Event Title": "የዝግጅቱ ርዕስ",
    "Client Name": "የደንበኛ ስም",
    "Client Phone": "የደንበኛ ስልክ",
    "Date": "ቀን",
    "Venue": "ቦታ",
    "Price": "ዋጋ",
    "Status": "ሁኔታ",
    "Actions": "ክንውኖች",
    "Logs": "ታሪክ",
    "No events found": "ምንም ዝግጅት አልተገኘም",
    "Managing event directory": "የዝግጅቶች መዝገብ መቆጣጠሪያ",
    "Loading Events...": "ዝግጅቶች በመጫን ላይ...",
    "Workspace": "የስራ ቦታ",
    "Filters": "ማጣሪያዎች",
    "Saved Views": "የተቀመጡ እይታዎች",
    "Save Current View": "የአሁኑን እይታ አስቀምጥ",
    "Advanced Filters": "የላቁ ማጣሪያዎች",
    "Reset": "ዳግም ጀምር",
    "Apply": "ተግብር",
    "Import": "አስገባ",
    "Export": "አውጣ",
    "Export CSV": "በCSV አውጣ",
    "Export XLSX": "በXLSX አውጣ",
    "All Time": "ሁሉንም ጊዜ",
    "Next 14 Days": "የሚቀጥሉት 14 ቀናት",
    "This Month": "በዚህ ወር",
    "Last Month": "ባለፈው ወር",
    "View Name": "የእይታ ስም",
    "Scope": "ወሰን",
    "Role Name": "የሚና ስም",
    "Default": "ቀዳሚ",
    "Save": "አስቀምጥ",
    "Cancel": "ሰርዝ",
    "Duplicate": "ቅዳ",
    "Rename": "ስም ቀይር",
    "Delete": "ሰርዝ",
    "Personal": "የግል",
    "Role-based": "በሚና ላይ የተመሠረተ",
    "Global": "አጠቃላይ",
    "Custom": "ብጁ",
    "Default View": "ቀዳሚ እይታ",
    "Delete View": "እይታ ሰርዝ",
    "Are you sure you want to delete this saved view?": "እርግጠኛ ነዎት ይህንን የተቀመጠ እይታ መሰረዝ ይፈልጋሉ?",
    "Yes, Delete": "አዎ፣ ሰርዝ",
    "Duplicate View": "እይታ ቅዳ",
    "Save View": "እይታ አስቀምጥ",
    "Operator": "ክንውን",
    "Value": "ዋጋ",
    "Add Rule": "ደንብ አክል",
    "Match All (AND)": "ሁሉንም አዛምድ (AND)",
    "Match Any (OR)": "ማንኛውንም አዛምድ (OR)",
    "Event Name": "የዝግጅት ስም",
    "Event Type Name": "የዝግጅት አይነት ስም",
    "Start Date": "የመጀመሪያ ቀን",
    "End Date": "የማብቂያ ቀን",
    "Venue Location": "የቦታ አድራሻ",
    "Revenue": "ገቢ",
    "Approved Expenses": "የጸደቀ ወጪ",
    "Net Profit": "የተጣራ ትርፍ",
    "Margin %": "ህዳግ %",
    "Checklist %": "የቼክሊስት %",
    "Equals": "እኩል ነው",
    "Not Equals": "እኩል አይደለም",
    "Contains": "የያዘ",
    "Starts With": "የሚጀምረው በ",
    "Greater Than": "ይበልጣል",
    "Less Than": "ያንሳል",
    "Is Empty": "ባዶ ነው",
    "Is Not Empty": "ባዶ አይደለም",
    "No Saved Views": "ምንም የተቀመጡ እይታዎች የሉም",
    "Save View Description": "የአሁኑን ፍለጋ፣ ማጣሪያዎች እና መደርደሪያዎች እንደ የተቀመጠ እይታ ያስቀምጡ።",
    "View Title": "የእይታ ርዕስ",
    "Proposals": "ጥያቄዎች"
  }
};

const FIELD_OPTIONS = [
  { key: "name", label: "Event Name" },
  { key: "client_name", label: "Client Name" },
  { key: "client_phone", label: "Client Phone" },
  { key: "venue_location", label: "Venue Location" },
  { key: "contract_price", label: "Revenue" },
  { key: "status", label: "Status" },
  { key: "start_date", label: "Start Date" },
  { key: "end_date", label: "End Date" },
  { key: "checklist_completion_percentage", label: "Checklist %" }
];

const OPERATOR_OPTIONS = [
  { id: "contains", label: "Contains" },
  { id: "equals", label: "Equals" },
  { id: "not_equals", label: "Not Equals" },
  { id: "greater_than", label: "Greater Than" },
  { id: "less_than", label: "Less Than" },
  { id: "is_empty", label: "Is Empty" },
  { id: "is_not_empty", label: "Is Not Empty" }
];

const DATE_RANGE_OPTIONS = [
  { id: "all", label: "All Time" },
  { id: "next_14", label: "Next 14 Days" },
  { id: "this_month", label: "This Month" },
  { id: "last_month", label: "Last Month" }
];

export function EventsPageContent() {
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // URL state persistence parsing
  const page = Number(searchParams.get("page") || "1");
  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "all";
  const dateRange = searchParams.get("dateRange") || "all";
  const sortBy = searchParams.get("sortBy") || "start_date";
  const sortOrder = (searchParams.get("sortOrder") || "asc") as "asc" | "desc";
  const filterLogic = (searchParams.get("filterLogic") || "and") as "and" | "or";
  const activeViewId = searchParams.get("viewId") || "";

  // Parse advanced filters from URL
  const filters = useMemo<EventSavedView["filters"]>(() => {
    const raw = searchParams.get("filters");
    if (!raw) return [];
    try {
      return JSON.parse(raw) as EventSavedView["filters"];
    } catch {
      return [];
    }
  }, [searchParams]);

  // Modals / Sheets UI state
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isSaveViewOpen, setIsSaveViewOpen] = useState(false);
  const [isDeleteViewOpen, setIsDeleteViewOpen] = useState<string | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);

  // Saved view creation form state
  const [newViewName, setNewViewName] = useState("");
  const [newViewScope, setNewViewScope] = useState<"personal" | "role" | "global">("personal");
  const [newViewRoleName, setNewViewRoleName] = useState("");
  const [newViewIsDefault, setNewViewIsDefault] = useState(false);

  const limit = 10;

  const { data: authData, isLoading: authLoading } = useQuery({
    queryKey: ["auth-permissions"],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      if (!token) return { permission_slugs: [], roles: [] };
      const res = await api.get("/auth/permissions");
      return res.data;
    }
  });

  const hasPermission = (slug: string) => {
    return authData?.permission_slugs?.includes(slug) || authData?.is_superuser;
  };

  const hasProfitAccess = hasPermission("reports:profit:read");
  const canWrite = hasPermission("events:write");

  // Format dates helper for quick filters
  const dateParams = useMemo(() => {
    const today = new Date();
    if (dateRange === "next_14") {
      const future = new Date();
      future.setDate(today.getDate() + 14);
      return {
        start_date: today.toISOString().split("T")[0],
        end_date: future.toISOString().split("T")[0]
      };
    }
    if (dateRange === "this_month") {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return {
        start_date: start.toISOString().split("T")[0],
        end_date: end.toISOString().split("T")[0]
      };
    }
    if (dateRange === "last_month") {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return {
        start_date: start.toISOString().split("T")[0],
        end_date: end.toISOString().split("T")[0]
      };
    }
    return { start_date: undefined, end_date: undefined };
  }, [dateRange]);

  // Fetch events list
  const { data, isLoading } = useQuery<EventsResponse>({
    queryKey: ["events", page, search, status, dateParams.start_date, dateParams.end_date, sortBy, sortOrder, filterLogic, filters],
    queryFn: () => getEvents(
      page,
      limit,
      search || undefined,
      status === "all" ? undefined : status,
      dateParams.start_date,
      dateParams.end_date,
      sortBy,
      sortOrder,
      filterLogic,
      filters
    ),
  });

  // Fetch saved views
  const { data: savedViewsData } = useQuery<{ savedViews: EventSavedView[] }>({
    queryKey: ["event-saved-views"],
    queryFn: getEventSavedViews,
    enabled: !!authData
  });

  const savedViews = savedViewsData?.savedViews || [];

  const events = useMemo(() => data?.events || [], [data?.events]);
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  // URL state synchronization router trigger
  const updateUrl = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Sync edits from URL searchParam "edit"
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId && !editingEvent && events.length > 0) {
      const target = events.find((e) => e.id === editId);
      if (target) {
        setTimeout(() => {
          setEditingEvent(target);
        }, 0);
      }
    }
  }, [searchParams, events, editingEvent]);

  // Mutations for Saved Views
  const createViewMutation = useMutation({
    mutationFn: createEventSavedView,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-saved-views"] });
      setIsSaveViewOpen(false);
      setNewViewName("");
    }
  });

  const deleteViewMutation = useMutation({
    mutationFn: deleteEventSavedView,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-saved-views"] });
      setIsDeleteViewOpen(null);
      updateUrl({ viewId: null });
    }
  });

  const duplicateViewMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => duplicateEventSavedView(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-saved-views"] });
    }
  });

  const setDefaultViewMutation = useMutation({
    mutationFn: setDefaultEventSavedView,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-saved-views"] });
    }
  });

  // Apply a Saved View parameters to the active URL parameters
  const handleApplyView = (view: EventSavedView) => {
    updateUrl({
      viewId: view.id,
      filters: view.filters.length > 0 ? JSON.stringify(view.filters) : null,
      sortBy: view.sort?.sortBy || "start_date",
      sortOrder: view.sort?.sortOrder || "asc",
      page: "1"
    });
  };

  const handleSaveViewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newViewName.trim()) return;
    createViewMutation.mutate({
      name: newViewName,
      scope: newViewScope,
      role_name: newViewScope === "role" ? newViewRoleName : null,
      is_default: newViewIsDefault,
      filters,
      sort: { sortBy, sortOrder },
      columns: ["name", "client_name", "start_date", "venue_location", "status"]
    });
  };

  // Advanced Filters builder logic modifiers
  const handleAddFilterRule = () => {
    const nextRules = [...filters, { field: "name", operator: "contains", value: "" }];
    updateUrl({ filters: JSON.stringify(nextRules), page: "1", viewId: null });
  };

  const handleUpdateFilterRule = (index: number, key: string, val: unknown) => {
    const nextRules = filters.map((rule, i: number) => {
      if (i === index) {
        return { ...rule, [key]: val };
      }
      return rule;
    });
    updateUrl({ filters: JSON.stringify(nextRules), page: "1", viewId: null });
  };

  const handleRemoveFilterRule = (index: number) => {
    const nextRules = filters.filter((_, i: number) => i !== index);
    updateUrl({ 
      filters: nextRules.length > 0 ? JSON.stringify(nextRules) : null,
      page: "1", 
      viewId: null 
    });
  };

  const handleClearFilters = () => {
    updateUrl({ filters: null, search: "", status: "all", dateRange: "all", page: "1", viewId: null });
  };

  // Sorting columns triggers
  const handleSort = (field: string) => {
    const order = sortBy === field && sortOrder === "asc" ? "desc" : "asc";
    updateUrl({ sortBy: field, sortOrder: order });
  };

  // Export downloads triggers
  const handleExport = (format: "csv" | "xlsx") => {
    setIsExportOpen(false);
    const exportUrl = getEventsExportUrl({
      search: search || undefined,
      status: status === "all" ? undefined : status,
      start_date: dateParams.start_date,
      end_date: dateParams.end_date,
      sortBy,
      sortOrder,
      filterLogic,
      filters,
      format
    });
    window.open(exportUrl, "_blank");
  };

  // Badges color helper
  const getStatusBadgeClass = (statusStr: string) => {
    switch (statusStr) {
      case "Planned":
        return "bg-primary-light text-primary-dark border border-primary/20";
      case "Ongoing":
        return "bg-warning/10 text-warning border border-warning/20";
      case "Completed":
        return "bg-success/10 text-success border border-success/20";
      default:
        return "bg-card-alt text-muted border border-border";
    }
  };

  if (authLoading) {
    return (
      <AuthLayout>
        <div className="flex h-[50vh] items-center justify-center">
          <span className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="page-container pt-4 md:py-8 px-4 sm:px-6 md:px-8">
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            body {
              background: white !important;
              color: black !important;
            }
            .no-print {
              display: none !important;
            }
            header, footer, nav, aside, [data-sidebar], .toolbar-container {
              display: none !important;
            }
            main, .page-container, .table-container {
              border: none !important;
              padding: 0 !important;
              margin: 0 !important;
              width: 100% !important;
              background: transparent !important;
            }
            table {
              width: 100% !important;
              border-collapse: collapse !important;
            }
            th, td {
              border: 1px solid #ddd !important;
              padding: 8px !important;
              font-size: 11px !important;
            }
          }
        ` }} />

        {/* Header Title */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 no-print">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-lg text-primary border border-primary/20">
              <HiCalendar className="w-6 h-6 md:w-7 md:h-7" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-foreground tracking-tight">
                {t("Events")}
              </h1>
              <p className="text-xs md:text-sm text-muted font-medium">
                {total} {t("Total Records")}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/events/proposals"
              className="flex items-center gap-1.5 px-4 h-[44px] rounded-lg text-xs font-black uppercase tracking-wider bg-card-alt text-muted hover:text-foreground border border-border"
            >
              {t("Proposals")}
            </Link>
            {canWrite && (
              <button
                onClick={() => setIsAddOpen(true)}
                className="flex items-center gap-1.5 px-4 h-[44px] rounded-lg text-xs font-black bg-primary text-on-primary hover:opacity-90 active:scale-[0.98] transition-all border border-primary/20"
              >
                <HiPlus className="w-4 h-4" />
                {t("Add Event")}
              </button>
            )}
          </div>
        </header>

        {/* Compact Integrated Toolbar Container */}
        <div className="toolbar-container bg-card border border-border rounded-lg p-3.5 mb-6 space-y-3 no-print">
          <div className="flex flex-wrap items-center justify-between gap-3">
            
            {/* Search and Saved Views dropdown */}
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
              <div className="relative flex-1 max-w-sm min-w-[180px]">
                <HiMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  type="text"
                  placeholder={t("Search")}
                  value={search}
                  onChange={(e) => updateUrl({ search: e.target.value, page: "1" })}
                  className="w-full pl-10 pr-4 h-[44px] rounded-lg bg-card-alt text-sm focus:ring-1 focus:ring-primary/30 outline-none border border-border transition-all"
                />
              </div>

              {/* Saved view dropdown selector */}
              <div className="relative">
                <select
                  value={activeViewId}
                  onChange={(e) => {
                    const view = savedViews.find(v => v.id === e.target.value);
                    if (view) handleApplyView(view);
                    else handleClearFilters();
                  }}
                  className="pl-3 pr-8 h-[44px] text-xs font-bold uppercase tracking-wider rounded-lg bg-card-alt border border-border outline-none appearance-none cursor-pointer focus:ring-1 focus:ring-primary/30"
                >
                  <option value="">{t("Saved Views")}</option>
                  {savedViews.map((view) => (
                    <option key={view.id} value={view.id}>
                      {view.name} ({t(view.scope)})
                    </option>
                  ))}
                </select>
                <HiBookmark className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
              </div>

              {/* Saved view controls */}
              {activeViewId && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setDefaultViewMutation.mutate(activeViewId)}
                    className="p-2.5 rounded-lg bg-card-alt border border-border text-muted hover:text-warning"
                    title={t("Default View")}
                  >
                    <HiStar className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      const active = savedViews.find(v => v.id === activeViewId);
                      if (active) duplicateViewMutation.mutate({ id: active.id, name: `${active.name} Copy` });
                    }}
                    className="p-2.5 rounded-lg bg-card-alt border border-border text-muted hover:text-foreground"
                    title={t("Duplicate")}
                  >
                    <HiDocumentDuplicate className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setIsDeleteViewOpen(activeViewId)}
                    className="p-2.5 rounded-lg bg-card-alt border border-border text-muted hover:text-danger"
                    title={t("Delete")}
                  >
                    <HiTrash className="w-4 h-4" />
                  </button>
                </div>
              )}

              {filters.length > 0 && !activeViewId && (
                <button
                  onClick={() => setIsSaveViewOpen(true)}
                  className="px-3.5 h-[44px] text-xs font-black uppercase tracking-wider rounded-lg bg-card-alt text-primary hover:bg-primary/5 border border-primary/20 flex items-center gap-1.5"
                >
                  <HiBookmark className="w-4 h-4" />
                  {t("Save Current View")}
                </button>
              )}
            </div>

            {/* Quick date filters & drawers triggers */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-border overflow-hidden bg-card-alt">
                {DATE_RANGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => updateUrl({ dateRange: opt.id, page: "1" })}
                    className={`px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-all ${dateRange === opt.id ? "bg-primary text-on-primary" : "text-muted hover:bg-border"}`}
                  >
                    {t(opt.label)}
                  </button>
                ))}
              </div>

              {/* Advanced filter builder button */}
              <button
                onClick={() => setIsFiltersOpen(true)}
                className={`flex items-center gap-1.5 px-4 h-[44px] rounded-lg text-xs font-black uppercase tracking-wider border ${filters.length > 0 ? "border-primary bg-primary/5 text-primary" : "border-border bg-card-alt text-muted hover:text-foreground"}`}
              >
                <HiAdjustmentsHorizontal className="w-4 h-4" />
                {t("Filters")}
                {filters.length > 0 && (
                  <span className="ml-1 w-5 h-5 rounded-full bg-primary text-on-primary text-[10px] flex items-center justify-center font-bold">
                    {filters.length}
                  </span>
                )}
              </button>

              {/* Import/Export buttons */}
              {canWrite && (
                <button
                  onClick={() => setIsImportOpen(true)}
                  className="p-2.5 rounded-lg bg-card-alt border border-border text-muted hover:text-foreground"
                  title={t("Import")}
                >
                  <HiArrowUpTray className="w-5 h-5" />
                </button>
              )}

              <div className="relative">
                <button
                  onClick={() => setIsExportOpen(!isExportOpen)}
                  className="p-2.5 rounded-lg bg-card-alt border border-border text-muted hover:text-foreground flex items-center justify-center"
                  title={t("Export")}
                >
                  <HiArrowDownTray className="w-5 h-5" />
                </button>
                {isExportOpen && (
                  <div className="absolute right-0 mt-1.5 w-40 bg-card border border-border rounded-lg shadow-massive z-10 py-1">
                    <button
                      onClick={() => handleExport("csv")}
                      className="w-full text-left px-4 py-2 text-xs font-black uppercase tracking-wider text-foreground hover:bg-card-alt"
                    >
                      {t("Export CSV")}
                    </button>
                    <button
                      onClick={() => handleExport("xlsx")}
                      className="w-full text-left px-4 py-2 text-xs font-black uppercase tracking-wider text-foreground hover:bg-card-alt"
                    >
                      {t("Export XLSX")}
                    </button>
                    <button
                      onClick={() => window.print()}
                      className="w-full text-left px-4 py-2 text-xs font-black uppercase tracking-wider text-foreground hover:bg-card-alt flex items-center gap-1.5"
                    >
                      <HiPrinter className="w-4 h-4" />
                      Print PDF
                    </button>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Quick status chips */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-3">
            <button
              onClick={() => updateUrl({ status: "all", page: "1" })}
              className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-full border transition-all ${status === "all" ? "bg-primary border-primary text-on-primary" : "bg-card-alt border-border text-muted hover:text-foreground"}`}
            >
              {t("All Statuses")}
            </button>
            {["Planned", "Ongoing", "Completed"].map((s) => (
              <button
                key={s}
                onClick={() => updateUrl({ status: s, page: "1" })}
                className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-full border transition-all ${status === s ? "bg-primary border-primary text-on-primary" : "bg-card-alt border-border text-muted hover:text-foreground"}`}
              >
                {t(s)}
              </button>
            ))}
          </div>
        </div>

        {/* Content list block */}
        {isLoading ? (
          <div className="space-y-4 animate-pulse">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-card-alt rounded-lg border border-border" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-card rounded-lg border border-dashed border-border text-center px-4">
            <HiCalendar className="w-16 h-16 text-muted mb-4 opacity-10" />
            <h3 className="text-lg font-bold text-foreground opacity-50">
              {t("No events found")}
            </h3>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-hidden bg-card border border-border rounded-lg table-container">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-card-alt/30 border-b border-border text-[10px] uppercase tracking-[0.2em] text-muted font-black">
                    <th className="px-6 py-4">#</th>
                    <th className="px-6 py-4 cursor-pointer hover:bg-card-alt/50" onClick={() => handleSort("name")}>
                      {t("Event Title")} {sortBy === "name" && (sortOrder === "asc" ? "▲" : "▼")}
                    </th>
                    <th className="px-6 py-4 cursor-pointer hover:bg-card-alt/50" onClick={() => handleSort("client_name")}>
                      {t("Client Name")} {sortBy === "client_name" && (sortOrder === "asc" ? "▲" : "▼")}
                    </th>
                    <th className="px-6 py-4 cursor-pointer hover:bg-card-alt/50" onClick={() => handleSort("start_date")}>
                      {t("Date")} {sortBy === "start_date" && (sortOrder === "asc" ? "▲" : "▼")}
                    </th>
                    <th className="px-6 py-4 cursor-pointer hover:bg-card-alt/50" onClick={() => handleSort("venue_location")}>
                      {t("Venue")} {sortBy === "venue_location" && (sortOrder === "asc" ? "▲" : "▼")}
                    </th>
                    <th className="px-6 py-4 cursor-pointer hover:bg-card-alt/50 text-right" onClick={() => handleSort("contract_price")}>
                      {t("Price")} {sortBy === "contract_price" && (sortOrder === "asc" ? "▲" : "▼")}
                    </th>
                    <th className="px-6 py-4 cursor-pointer hover:bg-card-alt/50" onClick={() => handleSort("status")}>
                      {t("Status")} {sortBy === "status" && (sortOrder === "asc" ? "▲" : "▼")}
                    </th>
                    <th className="px-6 py-4 text-right no-print">{t("Actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event, index) => (
                    <tr
                      key={event.id}
                      className="border-b border-border/50 hover:bg-primary-light/5 transition-all text-sm"
                    >
                      <td className="px-6 py-4 text-xs font-mono text-muted">
                        {(page - 1) * limit + index + 1}
                      </td>
                      <td className="px-6 py-4 font-bold text-foreground">
                        <button
                          type="button"
                          onClick={() => setEditingEvent(event)}
                          className="font-bold text-foreground hover:text-primary transition-all text-left cursor-pointer hover:underline"
                        >
                          {event.name}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <button
                            type="button"
                            onClick={() => setEditingEvent(event)}
                            className="font-semibold text-foreground hover:text-primary transition-all text-left cursor-pointer hover:underline"
                          >
                            {event.client_name}
                          </button>
                          {event.client_phone && (
                            <div className="text-xs text-muted font-mono">{event.client_phone}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-mono text-muted">
                        <div>{event.start_date.split("T")[0]}</div>
                        {event.start_date !== event.end_date && (
                          <div className="mt-0.5 text-[10px] text-muted opacity-70">
                            to {event.end_date.split("T")[0]}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs">{event.venue_location}</td>
                      <td className="px-6 py-4 font-bold text-foreground text-right">
                        {hasProfitAccess ? (
                          `ETB ${Number(event.contract_price).toLocaleString()}`
                        ) : (
                          <span className="flex items-center justify-end gap-1.5 text-xs text-muted font-normal">
                            <HiLockClosed className="w-3.5 h-3.5 text-muted-foreground/30" />
                            [🔒 Restricted]
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2 py-1 rounded text-xs font-bold ${getStatusBadgeClass(
                            event.status
                          )}`}
                        >
                          {t(event.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right no-print">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setEditingEvent(event)}
                            className="p-1.5 rounded bg-card-alt border border-border text-muted hover:text-primary hover:border-primary/30 transition-all"
                            title="Edit Event"
                          >
                            <HiPencilSquare className="w-4 h-4" />
                          </button>
                          <Link
                            href={`/events/${event.id}`}
                            className="p-1.5 rounded bg-card-alt border border-border text-muted hover:text-foreground hover:border-border transition-all flex items-center gap-1 text-xs font-black uppercase tracking-wider px-2.5"
                            title="Open Event Workspace"
                          >
                            <HiArrowTopRightOnSquare className="w-3.5 h-3.5" />
                            {t("Workspace")}
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="md:hidden space-y-3">
              {events.map((event) => (
                <div
                  key={event.id}
                  onClick={() => setEditingEvent(event)}
                  className="p-4 bg-card border border-border rounded-lg space-y-3 active:scale-[0.98] transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-foreground text-base leading-snug">
                        {event.name}
                      </h4>
                      <p className="text-xs text-muted font-medium mt-0.5">
                        {event.client_name}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${getStatusBadgeClass(
                        event.status
                      )}`}
                    >
                      {t(event.status)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs border-t border-border/50 pt-2.5">
                    <div>
                      <span className="text-[10px] text-muted block uppercase tracking-wider font-bold">
                        {t("Date")}
                      </span>
                      <span className="font-mono text-muted-dark">
                        {event.start_date.split("T")[0]}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted block uppercase tracking-wider font-bold">
                        {t("Venue")}
                      </span>
                      <span className="text-muted-dark truncate block">
                        {event.venue_location}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-1">
                    <div>
                      <span className="text-[10px] text-muted block uppercase tracking-wider font-bold">
                        {t("Price")}
                      </span>
                      {hasProfitAccess ? (
                        <span className="font-black text-foreground">
                          ETB {Number(event.contract_price).toLocaleString()}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] text-muted font-normal">
                          <HiLockClosed className="w-3 h-3 text-muted-foreground/30" />
                          [🔒 Restricted]
                        </span>
                      )}
                    </div>
                    <Link
                      href={`/events/${event.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px] font-black uppercase tracking-wider bg-card-alt border border-border px-2.5 py-1 rounded text-muted hover:text-foreground flex items-center gap-1"
                    >
                      <HiArrowTopRightOnSquare className="w-3 h-3" />
                      {t("Workspace")}
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            <PaginationControls
              page={page}
              totalPages={Math.max(1, totalPages)}
              onPageChange={(p) => updateUrl({ page: String(p) })}
            />
          </>
        )}
      </div>

      {/* Advanced Filters Drawer */}
      <ResponsiveDrawer
        isOpen={isFiltersOpen}
        onClose={() => setIsFiltersOpen(false)}
        title={t("Advanced Filters")}
        subtitle="Manage logical filter constraints"
      >
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-muted uppercase tracking-wider">Logic</label>
              <div className="flex rounded-lg border border-border overflow-hidden">
                <button
                  onClick={() => updateUrl({ filterLogic: "and", page: "1" })}
                  className={`px-3 py-1.5 text-[10px] font-bold transition-all ${filterLogic === "and" ? "bg-primary text-on-primary" : "bg-card-alt text-muted hover:bg-border"}`}
                >
                  {t("Match All (AND)")}
                </button>
                <button
                  onClick={() => updateUrl({ filterLogic: "or", page: "1" })}
                  className={`px-3 py-1.5 text-[10px] font-bold transition-all ${filterLogic === "or" ? "bg-primary text-on-primary" : "bg-card-alt text-muted hover:bg-border"}`}
                >
                  {t("Match Any (OR)")}
                </button>
              </div>
            </div>
            <button
              onClick={handleClearFilters}
              className="text-xs font-bold text-danger hover:underline uppercase tracking-wider"
            >
              {t("Reset")}
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {filters.map((rule, idx: number) => (
              <div key={idx} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 p-3 rounded-lg border border-border bg-card-alt">
                {/* Field Selector */}
                <select
                  value={rule.field}
                  onChange={(e) => handleUpdateFilterRule(idx, "field", e.target.value)}
                  className="flex-1 px-3 py-2 text-xs font-semibold rounded bg-card border border-border outline-none"
                >
                  {FIELD_OPTIONS.map((f) => (
                    <option key={f.key} value={f.key}>{t(f.label)}</option>
                  ))}
                </select>

                {/* Operator Selector */}
                <select
                  value={rule.operator}
                  onChange={(e) => handleUpdateFilterRule(idx, "operator", e.target.value)}
                  className="w-full sm:w-36 px-3 py-2 text-xs font-semibold rounded bg-card border border-border outline-none"
                >
                  {OPERATOR_OPTIONS.map((op) => (
                    <option key={op.id} value={op.id}>{t(op.label)}</option>
                  ))}
                </select>

                {/* Value Input */}
                {rule.operator !== "is_empty" && rule.operator !== "is_not_empty" && (
                  <input
                    type="text"
                    value={(rule.value as string) || ""}
                    placeholder={t("Value")}
                    onChange={(e) => handleUpdateFilterRule(idx, "value", e.target.value)}
                    className="flex-2 px-3 py-2 text-xs font-semibold rounded bg-card border border-border outline-none text-foreground"
                  />
                )}

                {/* Remove button */}
                <button
                  onClick={() => handleRemoveFilterRule(idx)}
                  className="w-8 h-8 rounded bg-danger/10 text-danger hover:bg-danger hover:text-on-danger flex items-center justify-center transition-all shrink-0 self-end sm:self-auto"
                >
                  <HiXMark className="w-4 h-4" />
                </button>
              </div>
            ))}

            <button
              onClick={handleAddFilterRule}
              className="mt-2 h-[44px] border border-dashed border-primary/35 hover:bg-primary/5 rounded-lg text-primary text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all active:scale-[0.99]"
            >
              <HiPlus className="w-4 h-4" />
              {t("Add Rule")}
            </button>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4 mt-4">
            <button
              onClick={() => setIsFiltersOpen(false)}
              className="h-[44px] px-6 rounded-lg text-xs font-black uppercase tracking-wider bg-primary text-on-primary hover:opacity-90 transition-all border border-primary/20"
            >
              {t("Apply")}
            </button>
          </div>
        </div>
      </ResponsiveDrawer>

      {/* Save View Modal dialog */}
      {isSaveViewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsSaveViewOpen(false)} />
          <form onSubmit={handleSaveViewSubmit} className="relative w-full max-w-md bg-card border border-border rounded-lg shadow-massive p-6 space-y-4">
            <div>
              <h3 className="text-base font-black text-foreground uppercase tracking-wider">{t("Save View")}</h3>
              <p className="text-xs text-muted font-medium mt-1">{t("Save View Description")}</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-muted uppercase tracking-wider">{t("View Name")}</label>
              <input
                type="text"
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                required
                className="px-3 py-2 rounded bg-card-alt border border-border text-sm outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-muted uppercase tracking-wider">{t("Scope")}</label>
              <select
                value={newViewScope}
                onChange={(e) => setNewViewScope(e.target.value as "personal" | "role" | "global")}
                className="px-3 py-2 rounded bg-card-alt border border-border text-sm outline-none"
              >
                <option value="personal">{t("Personal")}</option>
                <option value="role">{t("Role-based")}</option>
                <option value="global">{t("Global")}</option>
              </select>
            </div>

            {newViewScope === "role" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-muted uppercase tracking-wider">{t("Role Name")}</label>
                <input
                  type="text"
                  value={newViewRoleName}
                  onChange={(e) => setNewViewRoleName(e.target.value)}
                  required
                  placeholder="e.g. Administrator"
                  className="px-3 py-2 rounded bg-card-alt border border-border text-sm outline-none"
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="default-view-checkbox"
                checked={newViewIsDefault}
                onChange={(e) => setNewViewIsDefault(e.target.checked)}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary/30 cursor-pointer"
              />
              <label htmlFor="default-view-checkbox" className="text-xs font-bold text-muted uppercase tracking-wider cursor-pointer">
                {t("Default")}
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setIsSaveViewOpen(false)}
                className="h-[44px] px-5 rounded-lg text-xs font-black uppercase tracking-wider bg-card-alt border border-border text-muted hover:text-foreground"
              >
                {t("Cancel")}
              </button>
              <button
                type="submit"
                className="h-[44px] px-5 rounded-lg text-xs font-black uppercase tracking-wider bg-primary text-on-primary hover:opacity-90 border border-primary/20"
              >
                {t("Save")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete View dialog */}
      {isDeleteViewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsDeleteViewOpen(null)} />
          <div className="relative w-full max-w-md bg-card border border-border rounded-lg shadow-massive p-6 space-y-4">
            <h3 className="text-base font-black text-foreground uppercase tracking-wider">{t("Delete View")}</h3>
            <p className="text-sm text-muted font-semibold">{t("Are you sure you want to delete this saved view?")}</p>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setIsDeleteViewOpen(null)}
                className="h-[44px] px-5 rounded-lg text-xs font-black uppercase tracking-wider bg-card-alt border border-border text-muted hover:text-foreground"
              >
                {t("Cancel")}
              </button>
              <button
                onClick={() => deleteViewMutation.mutate(isDeleteViewOpen)}
                className="h-[44px] px-5 rounded-lg text-xs font-black uppercase tracking-wider bg-danger text-on-danger hover:opacity-90 border border-danger/25"
              >
                {t("Yes, Delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Wizard sheet */}
      {isImportOpen && (
        <ImportWizard
          isOpen={isImportOpen}
          onClose={() => setIsImportOpen(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["events"] });
            updateUrl({ page: "1" });
          }}
        />
      )}

      {/* Legacy Add Event Modal sheet */}
      {isAddOpen && (
        <EditEventSheet
          onClose={() => setIsAddOpen(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["events"] });
            updateUrl({ page: "1" });
          }}
        />
      )}

      {/* Legacy Edit Event Modal sheet */}
      {editingEvent && (
        <EditEventSheet
          event={editingEvent}
          onClose={() => {
            setEditingEvent(null);
            if (searchParams.get("edit")) {
              router.replace(pathname, { scroll: false });
            }
          }}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["events"] });
          }}
        />
      )}
    </AuthLayout>
  );
}

export default function EventsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-muted-foreground animate-pulse text-[10px] font-black uppercase tracking-widest">
          Loading Events...
        </div>
      }
    >
      <EventsPageContent />
    </Suspense>
  );
}
