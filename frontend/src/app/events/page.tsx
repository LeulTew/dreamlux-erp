"use client";
import React, { useEffect, useState, useMemo, Suspense, useRef } from "react";
import { PillButton } from "@/components/ui/PillButton";
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
import { createPermissionMatcher } from "@/lib/permission-matcher";
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

import Select from "@/components/ui/Select";

import EditEventSheet from "@/components/EditEventSheet";
import PaginationControls from "@/components/PaginationControls";
import Link from "next/link";
import { useLanguage } from "@/hooks/use-language";
import StatusBadge from "@/components/ui/StatusBadge";
import { SortableHeader } from "@/components/ui/SortableHeader";
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
    "Proposals": "Proposals",
    "Trash": "Trash",
    "Logic": "Logic",
    "Filter constraints": "Manage logical filter constraints",
    "Print PDF": "Print PDF",
    "e.g. Administrator": "e.g. Administrator",
    "Greater Than or Equal": "Greater Than or Equal",
    "Less Than or Equal": "Less Than or Equal",
    "In List": "In List",
    "Not In List": "Not In List",
    "Between": "Between",
    "and": "and",
    "comma-separated": "comma-separated values",
    "Event Status": "Event Status",
    "Workflow Status": "Workflow Status",
    "Created At": "Created At",
    "Updated At": "Updated At",
    "Estimated Cost": "Estimated Cost",
    "Vehicle Count": "Vehicle Count",
    "Staff Count": "Staff Count",
    "Allocation Count": "Allocation Count",
    "Pending Expense Count": "Pending Expense Count",
    "to": "to",
    "Restricted": "Restricted"
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
    "Proposals": "ጥያቄዎች",
    "Trash": "ቆሻሻ",
    "Logic": "ሎጂክ",
    "Filter constraints": "የማጣሪያ ቅናሾችን ያስተዳድሩ",
    "Print PDF": "PDF አትም",
    "e.g. Administrator": "ለምሳሌ፡ Administrator",
    "Greater Than or Equal": "ይበልጣል ወይም እኩል ነው",
    "Less Than or Equal": "ያንሳል ወይም እኩል ነው",
    "In List": "ዝርዝር ውስጥ ነው",
    "Not In List": "ዝርዝር ውስጥ አይደለም",
    "Between": "መካከል",
    "and": "እና",
    "comma-separated": "በኮማ የተለዩ ዋጋዎች",
    "Event Status": "የዝግጅት ሁኔታ",
    "Workflow Status": "የስርዓት ሁኔታ",
    "Created At": "የተፈጠረበት ቀን",
    "Updated At": "የተዘመነበት ቀን",
    "Estimated Cost": "የተገመተ ወጪ",
    "Vehicle Count": "የተሽከርካሪ ብዛት",
    "Staff Count": "የሰራተኛ ብዛት",
    "Allocation Count": "የምደባ ብዛት",
    "Pending Expense Count": "የጥበቃ ወጪ ብዛት",
    "to": "እስከ",
    "Restricted": "ክልክል ነው"
  }
};

// Field type metadata for typed value editors and operator compatibility
type FieldType = "text" | "numeric" | "date" | "status" | "workflow_status";

const FIELD_OPTIONS: { key: string; label: string; type: FieldType }[] = [
  // Event fields
  { key: "name", label: "Event Name", type: "text" },
  { key: "client_name", label: "Client Name", type: "text" },
  { key: "client_phone", label: "Client Phone", type: "text" },
  { key: "venue_location", label: "Venue Location", type: "text" },
  { key: "event_type_name", label: "Event Type Name", type: "text" },
  { key: "status", label: "Event Status", type: "status" },
  { key: "workflow_status", label: "Workflow Status", type: "workflow_status" },
  // Dates
  { key: "start_date", label: "Start Date", type: "date" },
  { key: "end_date", label: "End Date", type: "date" },
  { key: "created_at", label: "Created At", type: "date" },
  { key: "updated_at", label: "Updated At", type: "date" },
  // Financial
  { key: "contract_price", label: "Revenue", type: "numeric" },
  { key: "approved_expenses", label: "Approved Expenses", type: "numeric" },
  { key: "net_profit", label: "Net Profit", type: "numeric" },
  { key: "margin_percent", label: "Margin %", type: "numeric" },
  { key: "estimated_cost", label: "Estimated Cost", type: "numeric" },
  // Operational
  { key: "checklist_completion_percentage", label: "Checklist %", type: "numeric" },
  { key: "vehicle_count", label: "Vehicle Count", type: "numeric" },
  { key: "staff_count", label: "Staff Count", type: "numeric" },
  { key: "allocation_count", label: "Allocation Count", type: "numeric" },
  { key: "pending_expense_count", label: "Pending Expense Count", type: "numeric" },
];

type OperatorId =
  | "contains" | "equals" | "not_equals" | "starts_with"
  | "greater_than" | "less_than" | "gte" | "lte" | "between"
  | "in_list" | "not_in_list" | "is_empty" | "is_not_empty";

const OPERATOR_OPTIONS: { id: OperatorId; label: string; forTypes: FieldType[] }[] = [
  { id: "contains",       label: "Contains",             forTypes: ["text"] },
  { id: "starts_with",    label: "Starts With",          forTypes: ["text"] },
  { id: "equals",         label: "Equals",               forTypes: ["text", "numeric", "date", "status", "workflow_status"] },
  { id: "not_equals",     label: "Not Equals",           forTypes: ["text", "numeric", "date", "status", "workflow_status"] },
  { id: "in_list",        label: "In List",              forTypes: ["text", "status", "workflow_status"] },
  { id: "not_in_list",    label: "Not In List",          forTypes: ["text", "status", "workflow_status"] },
  { id: "greater_than",   label: "Greater Than",         forTypes: ["numeric", "date"] },
  { id: "less_than",      label: "Less Than",            forTypes: ["numeric", "date"] },
  { id: "gte",            label: "Greater Than or Equal",forTypes: ["numeric", "date"] },
  { id: "lte",            label: "Less Than or Equal",   forTypes: ["numeric", "date"] },
  { id: "between",        label: "Between",              forTypes: ["numeric", "date"] },
  { id: "is_empty",       label: "Is Empty",             forTypes: ["text", "numeric", "date", "status", "workflow_status"] },
  { id: "is_not_empty",   label: "Is Not Empty",         forTypes: ["text", "numeric", "date", "status", "workflow_status"] },
];

const DATE_RANGE_OPTIONS = [
  { id: "all", label: "All Time" },
  { id: "next_14", label: "Next 14 Days" },
  { id: "this_month", label: "This Month" },
  { id: "last_month", label: "Last Month" }
];

function EventsPageContent() {
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

  // Parse advanced filters from URL — base64url-encoded JSON for Amharic/special char safety
  const filters = useMemo<EventSavedView["filters"]>(() => {
    const raw = searchParams.get("filters");
    if (!raw) return [];
    try {
      return JSON.parse(atob(raw)) as EventSavedView["filters"];
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

  // Local draft states for advanced filtering inside drawer
  const [draftFilters, setDraftFilters] = useState<EventSavedView["filters"]>([]);
  const [draftFilterLogic, setDraftFilterLogic] = useState<string>("and");

  // Saved view creation form state
  const [newViewName, setNewViewName] = useState("");
  const [newViewScope, setNewViewScope] = useState<"personal" | "role" | "global">("personal");
  const [newViewRoleName, setNewViewRoleName] = useState("");
  const [newViewIsDefault, setNewViewIsDefault] = useState(false);

  const [limit, setLimit] = useState(10);

  // Refs and hooks for dialog accessibility (focus trap and Escape key listener)
  const saveViewModalRef = useRef<HTMLFormElement>(null);
  const deleteViewModalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isSaveViewOpen) return;
    const focusableElements = saveViewModalRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusableElements && focusableElements.length > 0) {
      (focusableElements[0] as HTMLElement).focus();
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsSaveViewOpen(false);
        return;
      }
      if (e.key === "Tab") {
        if (!focusableElements || focusableElements.length === 0) return;
        const firstEl = focusableElements[0] as HTMLElement;
        const lastEl = focusableElements[focusableElements.length - 1] as HTMLElement;
        if (e.shiftKey) {
          if (document.activeElement === firstEl) {
            lastEl.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastEl) {
            firstEl.focus();
            e.preventDefault();
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSaveViewOpen]);

  useEffect(() => {
    if (!isDeleteViewOpen) return;
    const focusableElements = deleteViewModalRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusableElements && focusableElements.length > 0) {
      (focusableElements[0] as HTMLElement).focus();
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsDeleteViewOpen(null);
        return;
      }
      if (e.key === "Tab") {
        if (!focusableElements || focusableElements.length === 0) return;
        const firstEl = focusableElements[0] as HTMLElement;
        const lastEl = focusableElements[focusableElements.length - 1] as HTMLElement;
        if (e.shiftKey) {
          if (document.activeElement === firstEl) {
            lastEl.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastEl) {
            firstEl.focus();
            e.preventDefault();
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDeleteViewOpen]);

  const { data: authData, isLoading: authLoading } = useQuery({
    queryKey: ["auth-permissions"],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      if (!token) return { permission_slugs: [], roles: [] };
      const res = await api.get("/auth/permissions");
      return res.data;
    }
  });

  const hasPermission = createPermissionMatcher(authData?.permission_slugs || [], !!authData?.is_superuser);

  const hasProfitAccess = hasPermission("reports:profit:read");
  const canWrite = hasPermission("events:write");
  const canDeleteEvents = hasPermission("events:delete");

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
    queryKey: ["events", page, limit, search, status, dateParams.start_date, dateParams.end_date, sortBy, sortOrder, filterLogic, filters],
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
      filters: view.filters.length > 0 ? btoa(JSON.stringify(view.filters)) : null,
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



  const handleAddDraftFilterRule = () => {
    setDraftFilters([...draftFilters, { field: "name", operator: "contains", value: "" }]);
  };

  const handleUpdateDraftFilterRule = (index: number, key: string, val: unknown) => {
    const nextRules = draftFilters.map((rule, i: number) => {
      if (i === index) {
        if (key === "field") {
          const fieldMeta = FIELD_OPTIONS.find(f => f.key === val);
          const fieldType = fieldMeta?.type || "text";
          const currentOp = OPERATOR_OPTIONS.find(op => op.id === rule.operator);
          const isCompatible = currentOp?.forTypes.includes(fieldType);
          const defaultOp = isCompatible
            ? rule.operator
            : (OPERATOR_OPTIONS.find(op => op.forTypes.includes(fieldType))?.id || "equals");
          return { ...rule, field: val as string, operator: defaultOp, value: "" };
        }
        return { ...rule, [key]: val };
      }
      return rule;
    });
    setDraftFilters(nextRules);
  };

  const handleRemoveDraftFilterRule = (index: number) => {
    setDraftFilters(draftFilters.filter((_, i: number) => i !== index));
  };

  const handleResetDraftFilters = () => {
    setDraftFilters([]);
    setDraftFilterLogic("and");
  };

  const handleClearFilters = () => {
    updateUrl({ filters: null, search: "", status: "all", dateRange: "all", page: "1", viewId: null });
  };

  // Sorting columns triggers
  const handleSort = (field: string, order?: "asc" | "desc") => {
    const nextOrder = order ?? (sortBy === field && sortOrder === "asc" ? "desc" : "asc");
    updateUrl({ sortBy: field, sortOrder: nextOrder });
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
            <div className="p-2.5 bg-primary/10 rounded-2xl text-primary border border-primary/20">
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
              className="flex items-center gap-1.5 px-4 h-[44px] rounded-2xl text-xs font-black uppercase tracking-wider bg-card-alt text-muted [@media(hover:hover)]:hover:text-foreground border border-border"
            >
              {t("Proposals")}
            </Link>
            {canDeleteEvents && (
              <Link
                href="/events/trash"
                className="flex items-center gap-1.5 px-4 h-[44px] rounded-2xl text-xs font-semibold bg-card-alt text-muted border border-border [@media(hover:hover)]:hover:bg-rose-500/10 [@media(hover:hover)]:hover:border-rose-500/30 [@media(hover:hover)]:hover:text-rose-600 dark:hover:bg-rose-500/20 dark:hover:border-rose-500/40 dark:hover:text-rose-400 transition-all"
              >
                <HiTrash className="w-4 h-4" />
                {t("Trash")}
              </Link>
            )}
            {canWrite && (
              <>
                <button
                  onClick={() => setIsImportOpen(true)}
                  className="flex items-center gap-1.5 px-4 h-[44px] rounded-2xl text-xs font-black uppercase tracking-wider bg-card-alt text-muted [@media(hover:hover)]:hover:text-foreground border border-border transition-all"
                >
                  <HiArrowUpTray className="w-4 h-4 text-primary" />
                  {t("Import")}
                </button>
                <PillButton
                  onClick={() => setIsAddOpen(true)}
                  variant="primary"
                  className="h-[44px] px-6 text-sm font-bold shadow-md shadow-amber-500/10"
                  icon={
                    <HiPlus className="w-4 h-4" />
                  }
                >
                  {t("Add Event")}
                </PillButton>
              </>
            )}
          </div>
        </header>

        {/* Compact Integrated Toolbar Container */}
        <div className="toolbar-container bg-card border border-border rounded-2xl 2xl:rounded-4xl p-3.5 mb-6 space-y-3 no-print">
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
                  className="w-full pl-10 pr-4 h-[44px] rounded-2xl bg-card-alt text-sm focus:ring-1 focus:ring-primary/30 outline-none border border-border transition-all"
                />
              </div>

              {/* Saved view dropdown selector */}
              <Select
                options={savedViews.map((view) => ({
                  id: view.id,
                  label: `${view.name} (${t(view.scope)})`
                }))}
                value={activeViewId || ""}
                onChange={(val) => {
                  const view = savedViews.find(v => String(v.id) === String(val));
                  if (view) handleApplyView(view);
                  else handleClearFilters();
                }}
                placeholder={t("Saved Views")}
                className="min-w-[160px] max-w-[200px]"
                icon={HiBookmark}
                triggerClassName="w-full flex items-center justify-between px-4 h-[44px] rounded-2xl bg-card-alt border border-border/50 text-xs font-black uppercase tracking-wider text-muted hover:text-foreground hover:bg-primary-light/5 hover:border-primary/30 dark:hover:bg-primary-light/10 dark:hover:text-primary dark:hover:border-primary/30 transition-all duration-300 ease-out outline-none focus:ring-2 focus:ring-primary/20 shadow-sm"
                valueClassName="text-xs font-black uppercase tracking-wider truncate mr-1.5"
              />

              {/* Saved view controls */}
              {activeViewId && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setDefaultViewMutation.mutate(activeViewId)}
                    className="p-2.5 rounded-2xl bg-card-alt border border-border text-muted [@media(hover:hover)]:hover:text-warning"
                    title={t("Default View")}
                  >
                    <HiStar className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      const active = savedViews.find(v => v.id === activeViewId);
                      if (active) duplicateViewMutation.mutate({ id: active.id, name: `${active.name} Copy` });
                    }}
                    className="p-2.5 rounded-2xl bg-card-alt border border-border text-muted [@media(hover:hover)]:hover:text-foreground"
                    title={t("Duplicate")}
                  >
                    <HiDocumentDuplicate className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setIsDeleteViewOpen(activeViewId)}
                    className="p-2.5 rounded-2xl bg-card-alt border border-border text-muted [@media(hover:hover)]:hover:text-danger"
                    title={t("Delete")}
                  >
                    <HiTrash className="w-4 h-4" />
                  </button>
                </div>
              )}

              {filters.length > 0 && !activeViewId && (
                <button
                  onClick={() => setIsSaveViewOpen(true)}
                  className="px-3.5 h-[44px] text-xs font-black uppercase tracking-wider rounded-2xl bg-card-alt text-primary [@media(hover:hover)]:hover:bg-primary/5 border border-primary/20 flex items-center gap-1.5"
                >
                  <HiBookmark className="w-4 h-4" />
                  {t("Save Current View")}
                </button>
              )}
            </div>

            {/* Quick date filters & drawers triggers */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-2xl border border-border overflow-hidden bg-card-alt">
                {DATE_RANGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => updateUrl({ dateRange: opt.id, page: "1" })}
                    className={`px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-all ${dateRange === opt.id ? "bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white shadow-md shadow-amber-500/10" : "text-muted [@media(hover:hover)]:hover:bg-border"}`}
                  >
                    {t(opt.label)}
                  </button>
                ))}
              </div>

              {/* Advanced filter builder button */}
              <button
                onClick={() => {
                  setDraftFilters(filters.map(r => ({ ...r })));
                  setDraftFilterLogic(filterLogic);
                  setIsFiltersOpen(true);
                }}
                className={`flex items-center gap-1.5 px-4 h-[44px] rounded-2xl text-xs font-black uppercase tracking-wider border ${filters.length > 0 ? "border-amber-500/40 bg-amber-500/5 text-amber-600" : "border-border bg-card-alt text-muted [@media(hover:hover)]:hover:text-foreground"} active:scale-[0.98] transition-all`}
              >
                <HiAdjustmentsHorizontal className="w-4 h-4" />
                {t("Filters")}
                {filters.length > 0 && (
                  <span className="ml-1 w-5 h-5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-white text-[10px] flex items-center justify-center font-bold">
                    {filters.length}
                  </span>
                )}
              </button>



              <div className="relative">
                <button
                  onClick={() => setIsExportOpen(!isExportOpen)}
                  className="p-2.5 rounded-2xl bg-card-alt border border-border text-muted [@media(hover:hover)]:hover:text-foreground flex items-center justify-center"
                  title={t("Export")}
                >
                  <HiArrowDownTray className="w-5 h-5" />
                </button>
                {isExportOpen && (
                  <div className="absolute right-0 mt-1.5 w-40 bg-card border border-border rounded-2xl shadow-massive z-10 py-1">
                    <button
                      onClick={() => handleExport("csv")}
                      className="w-full text-left px-4 py-2 text-xs font-black uppercase tracking-wider text-foreground [@media(hover:hover)]:hover:bg-card-alt"
                    >
                      {t("Export CSV")}
                    </button>
                    <button
                      onClick={() => handleExport("xlsx")}
                      className="w-full text-left px-4 py-2 text-xs font-black uppercase tracking-wider text-foreground [@media(hover:hover)]:hover:bg-card-alt"
                    >
                      {t("Export XLSX")}
                    </button>
                    <button
                      onClick={() => window.print()}
                      className="w-full text-left px-4 py-2 text-xs font-black uppercase tracking-wider text-foreground [@media(hover:hover)]:hover:bg-card-alt flex items-center gap-1.5"
                    >
                      <HiPrinter className="w-4 h-4" />
                      {t("Print PDF")}
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
              className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-full border transition-all ${status === "all" ? "bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 border-transparent text-white shadow-md shadow-amber-500/10" : "bg-card-alt border-border text-muted [@media(hover:hover)]:hover:text-foreground"}`}
            >
              {t("All Statuses")}
            </button>
            {["Planned", "Ongoing", "Completed"].map((s) => (
              <button
                key={s}
                onClick={() => updateUrl({ status: s, page: "1" })}
                className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-full border transition-all ${status === s ? "bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 border-transparent text-white shadow-md shadow-amber-500/10" : "bg-card-alt border-border text-muted [@media(hover:hover)]:hover:text-foreground"}`}
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
              <div key={i} className="h-16 bg-card-alt rounded-2xl border border-border" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-card rounded-2xl border border-dashed border-border text-center px-4">
            <HiCalendar className="w-16 h-16 text-muted mb-4 opacity-10" />
            <h3 className="text-lg font-bold text-foreground opacity-50">
              {t("No events found")}
            </h3>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-hidden bg-card border border-border rounded-2xl 2xl:rounded-4xl table-container">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-card-alt/30 border-b border-border text-[10px] uppercase tracking-[0.2em] text-muted font-black">
                    <th className="px-6 py-4 text-xs font-black tracking-[0.2em] text-muted">#</th>
                    <th className="px-6 py-4">
                      <SortableHeader
                        label={t("Event Title")}
                        sortKey="name"
                        currentSortBy={sortBy}
                        currentSortOrder={sortOrder}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="px-6 py-4">
                      <SortableHeader
                        label={t("Client Name")}
                        sortKey="client_name"
                        currentSortBy={sortBy}
                        currentSortOrder={sortOrder}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="px-6 py-4">
                      <SortableHeader
                        label={t("Date")}
                        sortKey="start_date"
                        currentSortBy={sortBy}
                        currentSortOrder={sortOrder}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="px-6 py-4">
                      <SortableHeader
                        label={t("Venue")}
                        sortKey="venue_location"
                        currentSortBy={sortBy}
                        currentSortOrder={sortOrder}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="px-6 py-4 text-right">
                      <SortableHeader
                        label={t("Price")}
                        sortKey="contract_price"
                        currentSortBy={sortBy}
                        currentSortOrder={sortOrder}
                        onSort={handleSort}
                        align="right"
                      />
                    </th>
                    <th className="px-6 py-4 text-center">
                      <SortableHeader
                        label={t("Status")}
                        sortKey="status"
                        currentSortBy={sortBy}
                        currentSortOrder={sortOrder}
                        onSort={handleSort}
                        align="center"
                      />
                    </th>
                    <th className="px-6 py-4 text-right no-print">{t("Actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event, index) => (
                    <tr
                      key={event.id}
                      className="border-b border-border/50 [@media(hover:hover)]:hover:bg-primary-light/5 transition-all text-sm"
                    >
                      <td className="px-6 py-4 text-xs font-mono text-muted">
                        {(page - 1) * limit + index + 1}
                      </td>
                      <td className="px-6 py-4 font-bold text-foreground">
                        <button
                          type="button"
                          onClick={() => setEditingEvent(event)}
                          className="font-bold text-foreground [@media(hover:hover)]:hover:text-primary transition-all text-left cursor-pointer [@media(hover:hover)]:hover:underline"
                        >
                          {event.name}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <button
                            type="button"
                            onClick={() => setEditingEvent(event)}
                            className="font-semibold text-foreground [@media(hover:hover)]:hover:text-primary transition-all text-left cursor-pointer [@media(hover:hover)]:hover:underline"
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
                            {t("Restricted")}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="inline-flex justify-center w-full">
                          <StatusBadge status={event.status} />
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right no-print">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setEditingEvent(event)}
                            className="p-1.5 rounded bg-card-alt border border-border text-muted [@media(hover:hover)]:hover:text-primary [@media(hover:hover)]:hover:border-primary/30 transition-all"
                            title="Edit Event"
                          >
                            <HiPencilSquare className="w-4 h-4" />
                          </button>
                          <Link
                            href={`/events/${event.id}`}
                            className="p-1.5 rounded bg-card-alt border border-border text-muted [@media(hover:hover)]:hover:text-foreground [@media(hover:hover)]:hover:border-border transition-all flex items-center gap-1 text-xs font-black uppercase tracking-wider px-2.5"
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
                  className="p-4 bg-card border border-border rounded-2xl space-y-3 active:scale-[0.98] transition-all cursor-pointer"
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
                    <StatusBadge status={event.status} />
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
                          {t("Restricted")}
                        </span>
                      )}
                    </div>
                    <Link
                      href={`/events/${event.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px] font-black uppercase tracking-wider bg-card-alt border border-border px-2.5 py-1 rounded text-muted [@media(hover:hover)]:hover:text-foreground flex items-center gap-1"
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
              pageSize={limit}
              onPageSizeChange={(newLimit) => {
                setLimit(newLimit);
                updateUrl({ page: "1" });
              }}
              totalItems={total}
              pageSizeOptions={[10, 20, 50, 100]}
            />
          </>
        )}
      </div>

      {/* Advanced Filters Drawer */}
      <ResponsiveDrawer
        isOpen={isFiltersOpen}
        onClose={() => setIsFiltersOpen(false)}
        title={t("Advanced Filters")}
        subtitle={t("Filter constraints")}
      >
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-muted uppercase tracking-wider">{t("Logic")}</label>
              <div className="flex rounded-2xl border border-border overflow-hidden">
                <button
                  onClick={() => setDraftFilterLogic("and")}
                  className={`px-3 py-1.5 text-[10px] font-bold transition-all ${draftFilterLogic === "and" ? "bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white shadow-sm" : "bg-card-alt text-muted [@media(hover:hover)]:hover:bg-border"}`}
                >
                  {t("Match All (AND)")}
                </button>
                <button
                  onClick={() => setDraftFilterLogic("or")}
                  className={`px-3 py-1.5 text-[10px] font-bold transition-all ${draftFilterLogic === "or" ? "bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white shadow-sm" : "bg-card-alt text-muted [@media(hover:hover)]:hover:bg-border"}`}
                >
                  {t("Match Any (OR)")}
                </button>
              </div>
            </div>
            <button
              onClick={handleResetDraftFilters}
              className="text-xs font-bold text-danger [@media(hover:hover)]:hover:underline uppercase tracking-wider"
            >
              {t("Reset")}
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {draftFilters.map((rule, idx: number) => (
              <div key={idx} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 p-3 rounded-2xl border border-border bg-card-alt">
                {/* Field Selector */}
                <select
                  value={rule.field}
                  onChange={(e) => handleUpdateDraftFilterRule(idx, "field", e.target.value)}
                  className="flex-1 px-3 py-2 text-xs font-semibold rounded-2xl bg-card border border-border outline-none"
                >
                  {FIELD_OPTIONS.map((f) => (
                    <option key={f.key} value={f.key}>{t(f.label)}</option>
                  ))}
                </select>

                {/* Operator Selector — filtered by selected field type */}
                {
                  (() => {
                    const fieldMeta = FIELD_OPTIONS.find(f => f.key === rule.field);
                    const fieldType = fieldMeta?.type || "text";
                    const compatibleOps = OPERATOR_OPTIONS.filter(op => op.forTypes.includes(fieldType));
                    return (
                      <select
                        value={rule.operator}
                        onChange={(e) => handleUpdateDraftFilterRule(idx, "operator", e.target.value)}
                        className="w-full sm:w-44 px-3 py-2 text-xs font-semibold rounded-2xl bg-card border border-border outline-none"
                      >
                        {compatibleOps.map((op) => (
                          <option key={op.id} value={op.id}>{t(op.label)}</option>
                        ))}
                      </select>
                    );
                  })()
                }

                {/* Typed Value Editor — adapts to field type and operator */}
                {rule.operator !== "is_empty" && rule.operator !== "is_not_empty" && (
                  (() => {
                    const fieldMeta = FIELD_OPTIONS.find(f => f.key === rule.field);
                    const fieldType = fieldMeta?.type || "text";
                    const inputCls = "flex-1 px-3 py-2 text-xs font-semibold rounded-2xl bg-card border border-border outline-none text-foreground";

                    if (rule.operator === "between") {
                      const parts = ((rule.value as string) || "").split("|");
                      return (
                        <div className="flex items-center gap-1 flex-1">
                          <input
                            type={fieldType === "date" ? "date" : "number"}
                            value={parts[0] || ""}
                            placeholder="From"
                            onChange={(e) => handleUpdateDraftFilterRule(idx, "value", `${e.target.value}|${parts[1] || ""}`)}
                            className={inputCls}
                          />
                          <span className="text-xs text-muted font-bold">{t("and")}</span>
                          <input
                            type={fieldType === "date" ? "date" : "number"}
                            value={parts[1] || ""}
                            placeholder="To"
                            onChange={(e) => handleUpdateDraftFilterRule(idx, "value", `${parts[0] || ""}|${e.target.value}`)}
                            className={inputCls}
                          />
                        </div>
                      );
                    }

                    if (fieldType === "date") {
                      return (
                        <input
                          type="date"
                          value={(rule.value as string) || ""}
                          onChange={(e) => handleUpdateDraftFilterRule(idx, "value", e.target.value)}
                          className={inputCls}
                        />
                      );
                    }

                    if (fieldType === "numeric") {
                      return (
                        <input
                          type="number"
                          value={(rule.value as string) || ""}
                          placeholder={t("Value")}
                          onChange={(e) => handleUpdateDraftFilterRule(idx, "value", e.target.value)}
                          className={inputCls}
                        />
                      );
                    }

                    if (fieldType === "status") {
                      return (
                        <select
                          value={(rule.value as string) || ""}
                          onChange={(e) => handleUpdateDraftFilterRule(idx, "value", e.target.value)}
                          className={inputCls}
                        >
                          <option value="">{t("Select Status")}</option>
                          {["Planned", "Ongoing", "Completed"].map(s => (
                            <option key={s} value={s}>{t(s)}</option>
                          ))}
                        </select>
                      );
                    }

                    if (fieldType === "workflow_status") {
                      return (
                        <select
                          value={(rule.value as string) || ""}
                          onChange={(e) => handleUpdateDraftFilterRule(idx, "value", e.target.value)}
                          className={inputCls}
                        >
                          <option value="">{t("Select Status")}</option>
                          {["draft", "submitted", "approved", "rejected", "converted"].map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      );
                    }

                    // Default: text / in_list / not_in_list
                    return (
                      <div className="flex-1 flex flex-col gap-1">
                        <input
                          type="text"
                          value={(rule.value as string) || ""}
                          placeholder={rule.operator === "in_list" || rule.operator === "not_in_list" ? t("comma-separated") : t("Value")}
                          onChange={(e) => handleUpdateDraftFilterRule(idx, "value", e.target.value)}
                          className={inputCls}
                        />
                        {(rule.operator === "in_list" || rule.operator === "not_in_list") && (
                          <span className="text-[10px] text-muted font-semibold">{t("comma-separated")}</span>
                        )}
                      </div>
                    );
                  })()
                )}

                {/* Remove button */}
                <button
                  onClick={() => handleRemoveDraftFilterRule(idx)}
                  className="w-8 h-8 rounded-2xl bg-danger/10 text-danger [@media(hover:hover)]:hover:bg-danger [@media(hover:hover)]:hover:text-on-danger flex items-center justify-center transition-all shrink-0 self-end sm:self-auto cursor-pointer"
                >
                  <HiXMark className="w-4 h-4" />
                </button>
              </div>
            ))}

            <button
              onClick={handleAddDraftFilterRule}
              className="mt-2 h-[44px] border border-dashed border-primary/35 [@media(hover:hover)]:hover:bg-primary/5 rounded-2xl text-primary text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all active:scale-[0.99] cursor-pointer"
            >
              <HiPlus className="w-4 h-4" />
              {t("Add Rule")}
            </button>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4 mt-4">
            <button
              onClick={() => setIsFiltersOpen(false)}
              className="h-[44px] px-6 rounded-xl text-xs font-black uppercase tracking-wider bg-card-alt border border-border text-muted hover:text-foreground transition-all cursor-pointer"
            >
              {t("Cancel")}
            </button>
            <button
              onClick={() => {
                updateUrl({
                  filters: draftFilters.length > 0 ? btoa(JSON.stringify(draftFilters)) : null,
                  filterLogic: draftFilterLogic,
                  page: "1",
                  viewId: null
                });
                setIsFiltersOpen(false);
              }}
              className="h-[44px] px-6 rounded-xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white shadow-md shadow-amber-500/10 hover:from-amber-600 hover:via-amber-700 hover:to-amber-800 transition-all border border-transparent cursor-pointer"
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
          <form
            ref={saveViewModalRef}
            onSubmit={handleSaveViewSubmit}
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-view-title"
            className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-massive p-6 space-y-4"
          >
            <div>
              <h3 id="save-view-title" className="text-base font-black text-foreground uppercase tracking-wider">{t("Save View")}</h3>
              <p className="text-xs text-muted font-medium mt-1">{t("Save View Description")}</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-muted uppercase tracking-wider">{t("View Name")}</label>
              <input
                type="text"
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                required
                className="px-3 py-2 rounded-2xl bg-card-alt border border-border text-sm outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-muted uppercase tracking-wider">{t("Scope")}</label>
              <select
                value={newViewScope}
                onChange={(e) => setNewViewScope(e.target.value as "personal" | "role" | "global")}
                className="px-3 py-2 rounded-2xl bg-card-alt border border-border text-sm outline-none"
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
                  placeholder={t("e.g. Administrator")}
                  className="px-3 py-2 rounded-2xl bg-card-alt border border-border text-sm outline-none"
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="default-view-checkbox"
                checked={newViewIsDefault}
                onChange={(e) => setNewViewIsDefault(e.target.checked)}
                className="w-4 h-4 rounded-xl border-border accent-primary"
              />
              <label htmlFor="default-view-checkbox" className="text-xs font-bold text-muted uppercase tracking-wider">{t("Set as default view")}</label>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setIsSaveViewOpen(false)}
                className="h-[44px] px-5 rounded-2xl text-xs font-black uppercase tracking-wider bg-card-alt border border-border text-muted [@media(hover:hover)]:hover:text-foreground"
              >
                {t("Cancel")}
              </button>
              <button
                type="submit"
                className="h-[44px] px-5 rounded-2xl text-xs font-black uppercase tracking-wider bg-primary text-on-primary [@media(hover:hover)]:hover:opacity-90 border border-primary/20"
              >
                {t("Save")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete View Modal dialog */}
      {isDeleteViewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsDeleteViewOpen(null)} />
          <div
            ref={deleteViewModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-view-title"
            className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-massive p-6 space-y-4"
          >
            <h3 id="delete-view-title" className="text-base font-black text-foreground uppercase tracking-wider">{t("Delete View")}</h3>
            <p className="text-sm text-muted font-semibold">{t("Are you sure you want to delete this saved view?")}</p>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setIsDeleteViewOpen(null)}
                className="h-[44px] px-5 rounded-lg text-xs font-black uppercase tracking-wider bg-card-alt border border-border text-muted [@media(hover:hover)]:hover:text-foreground"
              >
                {t("Cancel")}
              </button>
              <button
                onClick={() => deleteViewMutation.mutate(isDeleteViewOpen)}
                className="h-[44px] px-5 rounded-lg text-xs font-black uppercase tracking-wider bg-danger text-on-danger [@media(hover:hover)]:hover:opacity-90 border border-danger/25"
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
