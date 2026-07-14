"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  HiPrinter,
  HiArrowDownTray,
  HiPlus,
  HiCheck,
  HiXMark,
  HiPencilSquare,
  HiTrash,
  HiOutlineClock,
} from "react-icons/hi2";
import AuthLayout from "@/components/AuthLayout";
import ForbiddenState from "@/components/ForbiddenState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Select from "@/components/ui/Select";
import { FilterToolbar, ToolbarSearch } from "@/components/ui/FilterToolbar";
import PdfExportModal, { type PdfColumn } from "@/components/PdfExportModal";
import StatusBadge from "@/components/ui/StatusBadge";
import PaginationControls from "@/components/PaginationControls";
import ResponsiveDrawer from "@/components/ui/ResponsiveDrawer";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import toast from "@/lib/toast";
import { useLanguage } from "@/hooks/use-language";
import ActivityDrawer from "@/components/ActivityDrawer";
import { createPermissionMatcher } from "@/lib/permission-matcher";
import {
  api,
  getCapitalInvestments,
  getCapitalInvestmentSummary,
  createCapitalInvestment,
  updateCapitalInvestment,
  deleteCapitalInvestment,
  approveCapitalInvestment,
  rejectCapitalInvestment,
  downloadCapitalInvestmentsExport,
  getItems,
  INVESTMENT_CATEGORIES,
  CAPEX_CLASSIFICATIONS,
} from "@/lib/api";
import type { CapitalInvestment } from "@/lib/types";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Capital Register": "Capital Register",
    "Manage long-term capital assets, equipment purchases, and fixtures.": "Manage long-term capital assets, equipment purchases, and fixtures.",
    "Approved Total": "Approved Total",
    "Pending Exposure": "Pending Exposure",
    "Pending count": "Pending count",
    "Linked Assets": "Linked Assets",
    "Unlinked Purchases": "Unlinked Purchases",
    "Item Name": "Item Name",
    "Category": "Category",
    "Quantity / Unit": "Quantity / Unit",
    "Unit Cost": "Unit Cost",
    "Total Cost": "Total Cost",
    "Vendor": "Vendor",
    "Classification": "Classification",
    "Linked Asset": "Linked Asset",
    "Status": "Status",
    "Actions": "Actions",
    "Add Investment": "Add Investment",
    "Edit Investment": "Edit Investment",
    "Save Investment": "Save Investment",
    "Delete Investment": "Delete Investment",
    "Approve": "Approve",
    "Reject": "Reject",
    "Export": "Export",
    "Rejection reason": "Rejection reason",
    "Reason required": "Reason required",
    "Cancel": "Cancel",
    "Notes": "Notes",
    "Creates Stock?": "Creates Stock?",
    "Stock applied": "Stock applied",
    "On approval": "On approval",
    "Unit mismatch": "Unit mismatch",
    "A linked inventory item is required when the purchase creates stock": "A linked inventory item is required when the purchase creates stock",
    "Stock-creating purchases must use a whole-number quantity": "Stock-creating purchases must use a whole-number quantity",
    "Select Linked Asset": "Select Linked Asset",
    "Purchase Date": "Purchase Date",
    "Due Date": "Due Date",
    "Unit": "Unit",
    "Workspace unavailable": "Workspace unavailable",
    "No data found for the selected filter criteria.": "No data found for the selected filter criteria.",
    "Equipment": "Equipment",
    "Fabric": "Fabric",
    "Fixtures": "Fixtures",
    "Hardware": "Hardware",
    "Vehicle": "Vehicle",
    "Store Buildout": "Store Buildout",
    "Office Equipment": "Office Equipment",
    "Other": "Other",
    "Capital Asset": "Capital Asset",
    "Inventory Asset": "Inventory Asset",
    "Leasehold Improvement": "Leasehold Improvement",
    "Fixture": "Fixture",
    "Other Capex": "Other Capex",
    "Linked": "Linked",
    "Unlinked": "Unlinked",
  },
  am: {
    "Capital Register": "የካፒታል መዝገብ",
    "Manage long-term capital assets, equipment purchases, and fixtures.": "የረጅም ጊዜ የካፒታል ንብረቶች፣ የእቃ ግዢዎች እና ቋሚ እቃዎች ያስተዳድሩ።",
    "Approved Total": "የጸደቀ ድምር",
    "Pending Exposure": "በጥበቃ ላይ ያለ መጠን",
    "Pending count": "በጥበቃ ላይ ያለ ብዛት",
    "Linked Assets": "የተገናኙ ንብረቶች",
    "Unlinked Purchases": "ያልተገናኙ ግዢዎች",
    "Item Name": "የእቃው ስም",
    "Category": "ዓይነት",
    "Quantity / Unit": "ብዛት / መለኪያ",
    "Unit Cost": "የአንዱ ዋጋ",
    "Total Cost": "ጠቅላላ ዋጋ",
    "Vendor": "ሻጭ",
    "Classification": "ክፍልፍል",
    "Linked Asset": "የተገናኘው እቃ",
    "Status": "ሁኔታ",
    "Actions": "ድርጊቶች",
    "Add Investment": "ካፒታል መዝግብ",
    "Edit Investment": "ካፒታል አሻሽል",
    "Save Investment": "ካፒታል አስቀምጥ",
    "Delete Investment": "ካፒታል ሰርዝ",
    "Approve": "አጽድቅ",
    "Reject": "ውድቅ አድርግ",
    "Export": "ላክ (አውርድ)",
    "Rejection reason": "ውድቅ የተደረገበት ምክንያት",
    "Reason required": "ምክንያት ያስፈልጋል",
    "Cancel": "ሰርዝ",
    "Notes": "ማስታወሻዎች",
    "Creates Stock?": "ክምችት ይፈጥራል?",
    "Stock applied": "ክምችት ተጨምሯል",
    "On approval": "ሲጸድቅ",
    "Unit mismatch": "የመለኪያ አለመመጣጠን",
    "A linked inventory item is required when the purchase creates stock": "ግዢው ክምችት ሲፈጥር የተገናኘ የክምችት እቃ ያስፈልጋል",
    "Stock-creating purchases must use a whole-number quantity": "ክምችት የሚፈጥሩ ግዢዎች ሙሉ ቁጥር ብዛት መጠቀም አለባቸው",
    "Select Linked Asset": "የተገናኘ እቃ ይምረጡ",
    "Purchase Date": "የተገዛበት ቀን",
    "Due Date": "ቀን",
    "Unit": "መለኪያ",
    "Workspace unavailable": "ስራ ቦታው አይገኝም",
    "No data found for the selected filter criteria.": "ለተመረጡት ማጣሪያዎች ምንም ውሂብ አልተገኘም።",
    "Equipment": "መሳሪያ",
    "Fabric": "ጨርቃጨርቅ",
    "Fixtures": "ቋሚ እቃዎች",
    "Hardware": "ሃርድዌር",
    "Vehicle": "ተሽከርካሪ",
    "Store Buildout": "የመደብር ግንባታ",
    "Office Equipment": "የቢሮ እቃዎች",
    "Other": "ሌሎች",
    "Capital Asset": "የካፒታል ንብረት",
    "Inventory Asset": "የክምችት ንብረት",
    "Leasehold Improvement": "የተከራዩ ማሻሻያዎች",
    "Fixture": "ቋሚ እቃ",
    "Other Capex": "ሌላ ካፒታል",
    "Linked": "የተገናኘ",
    "Unlinked": "ያልተገናኘ",
  },
};

export default function InvestmentsPage() {
  const { lang } = useLanguage();
  const queryClient = useQueryClient();

  const t = (key: string): string => {
    return TRANSLATIONS[lang]?.[key] || TRANSLATIONS.en?.[key] || key;
  };

  // State
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [classificationFilter, setClassificationFilter] = useState<string>("all");
  const [linkedFilter, setLinkedFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [pdfOpen, setPdfOpen] = useState(false);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingInvestment, setEditingInvestment] = useState<CapitalInvestment | null>(null);
  const [deletingInvestment, setDeletingInvestment] = useState<CapitalInvestment | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);

  const defaultForm = {
    purchase_date: new Date().toISOString().slice(0, 10),
    item_name: "",
    category: "Equipment" as CapitalInvestment["category"],
    quantity: "",
    unit: "pcs",
    unit_cost: "",
    vendor: "",
    notes: "",
    capex_classification: "Capital Asset" as CapitalInvestment["capex_classification"],
    asset_id: "",
    creates_inventory_stock: false,
  };

  const [form, setForm] = useState(defaultForm);

  // Queries
  const { data: permissions, isLoading: permissionsLoading } = useQuery({
    queryKey: ["auth-permissions"],
    queryFn: async () => {
      const res = await api.get("/auth/permissions");
      return res.data;
    },
  });

  const permissionList = permissions?.permission_slugs || [];
  const matches = createPermissionMatcher(permissionList);

  const canRead = matches("finance:investments:read");
  const canWrite = matches("finance:investments:write");
  const canApprove = matches("finance:investments:approve");

  // Summary
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["finance-investments-summary", selectedMonth, statusFilter, categoryFilter, classificationFilter, linkedFilter, searchQuery],
    queryFn: () =>
      getCapitalInvestmentSummary({
        month: selectedMonth || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
        category: categoryFilter === "all" ? undefined : categoryFilter,
        capex_classification: classificationFilter === "all" ? undefined : classificationFilter,
        linked: linkedFilter === "all" ? undefined : linkedFilter,
        search: searchQuery.trim() || undefined,
      }),
    enabled: canRead,
  });

  // Investments list
  const { data: listResponse, isLoading: listLoading, error: listError } = useQuery({
    queryKey: ["finance-investments-list", selectedMonth, page, limit, statusFilter, categoryFilter, classificationFilter, linkedFilter, searchQuery],
    queryFn: () =>
      getCapitalInvestments({
        month: selectedMonth || undefined,
        page,
        limit,
        status: statusFilter === "all" ? undefined : statusFilter,
        category: categoryFilter === "all" ? undefined : categoryFilter,
        capex_classification: classificationFilter === "all" ? undefined : classificationFilter,
        linked: linkedFilter === "all" ? undefined : linkedFilter,
        search: searchQuery.trim() || undefined,
      }),
    enabled: canRead,
  });

  // Inventory assets lookup for select dropdown
  const { data: itemsResponse } = useQuery({
    queryKey: ["inventory-items-lookup"],
    queryFn: () => getItems(1, 100),
    enabled: canRead && isFormOpen,
  });
  const inventoryItemsList = itemsResponse?.items || [];

  // Mutations
  const saveMutation = useMutation({
    mutationFn: (data: Partial<CapitalInvestment>) => {
      if (editingInvestment) {
        return updateCapitalInvestment(editingInvestment.id, data);
      }
      return createCapitalInvestment(data);
    },
    onSuccess: () => {
      toast.success(editingInvestment ? t("Investment updated") : t("Investment created"));
      setIsFormOpen(false);
      setEditingInvestment(null);
      queryClient.invalidateQueries({ queryKey: ["finance-investments-list"] });
      queryClient.invalidateQueries({ queryKey: ["finance-investments-summary"] });
    },
    onError: (err: unknown) => {
      const error = err as Error & { response?: { data?: { error?: string } } };
      const msg = error.response?.data?.error || error.message || "Failed to save";
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCapitalInvestment(id),
    onSuccess: () => {
      toast.success(t("Investment deleted"));
      setDeletingInvestment(null);
      queryClient.invalidateQueries({ queryKey: ["finance-investments-list"] });
      queryClient.invalidateQueries({ queryKey: ["finance-investments-summary"] });
    },
    onError: (err: unknown) => {
      const error = err as Error & { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error || error.message || "Delete failed");
    },
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, decision, reason }: { id: string; decision: "approve" | "reject"; reason?: string }) => {
      if (decision === "approve") {
        return approveCapitalInvestment(id);
      }
      return rejectCapitalInvestment(id, reason || "");
    },
    onSuccess: (data: {
      stock_application?: { item_name: string; quantity_delta: number; quantity_after: number } | null;
    }) => {
      if (data?.stock_application) {
        const sa = data.stock_application;
        toast.success(`${t("Stock applied")}: +${sa.quantity_delta} → ${sa.item_name} (${sa.quantity_after})`);
      } else {
        toast.success(t("Investment reviewed"));
      }
      setRejectingId(null);
      setRejectReason("");
      queryClient.invalidateQueries({ queryKey: ["finance-investments-list"] });
      queryClient.invalidateQueries({ queryKey: ["finance-investments-summary"] });
      // Issue #172: an approved stock-creating purchase changes item quantities,
      // so refresh every inventory-derived view.
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-items-lookup"] });
    },
    onError: (err: unknown) => {
      const error = err as Error & { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error || error.message || "Review failed");
    },
  });

  if (permissionsLoading) {
    return (
      <AuthLayout>
        <div className="space-y-4">
          <Skeleton className="h-[64px] w-full dl-radius-xl" />
          <Skeleton className="h-[96px] w-full dl-radius-xl" />
          <Skeleton className="h-[320px] w-full dl-radius-xl" />
        </div>
      </AuthLayout>
    );
  }

  if (!canRead) {
    return <ForbiddenState />;
  }

  // Helpers
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "ETB" }).format(val);
  };

  const investmentsForPdf = listResponse?.investments ?? [];
  const investmentsGrandTotal = investmentsForPdf.reduce((sum, inv) => sum + Number(inv.quantity || 0) * Number(inv.unit_cost || 0), 0);
  const pdfColumns: PdfColumn[] = [
    { key: "date", label: t("Date") },
    { key: "item", label: t("Item") },
    { key: "category", label: t("Category") },
    { key: "qty", label: t("Qty"), align: "right" },
    { key: "unit_cost", label: t("Unit Cost"), align: "right" },
    { key: "total", label: t("Total"), align: "right" },
    { key: "vendor", label: t("Vendor") },
    { key: "status", label: t("Status") },
  ];
  const investmentRowValue = (inv: (typeof investmentsForPdf)[number], key: string): string => {
    switch (key) {
      case "date": return inv.purchase_date ? inv.purchase_date.slice(0, 10) : "-";
      case "item": return inv.item_name || "-";
      case "category": return t(inv.category);
      case "qty": return String(inv.quantity ?? "-");
      case "unit_cost": return formatCurrency(Number(inv.unit_cost || 0));
      case "total": return formatCurrency(Number(inv.quantity || 0) * Number(inv.unit_cost || 0));
      case "vendor": return inv.vendor || "-";
      case "status": return t(inv.status);
      default: return "";
    }
  };

  const handleOpenAddForm = () => {
    setEditingInvestment(null);
    setForm(defaultForm);
    setIsFormOpen(true);
  };

  const handleOpenEditForm = (investment: CapitalInvestment) => {
    if (investment.status === "Approved") return;
    setEditingInvestment(investment);
    setForm({
      purchase_date: investment.purchase_date.slice(0, 10),
      item_name: investment.item_name,
      category: investment.category,
      quantity: String(investment.quantity),
      unit: investment.unit,
      unit_cost: String(investment.unit_cost),
      vendor: investment.vendor || "",
      notes: investment.notes || "",
      capex_classification: investment.capex_classification,
      asset_id: investment.asset_id || "",
      creates_inventory_stock: investment.creates_inventory_stock,
    });
    setIsFormOpen(true);
  };

  const handleSubmitForm = () => {
    const qtyVal = Number.parseFloat(form.quantity);
    const costVal = Number.parseFloat(form.unit_cost);

    if (!form.item_name.trim()) {
      toast.error(t("Item Name is required"));
      return;
    }
    if (Number.isNaN(qtyVal) || qtyVal <= 0) {
      toast.error(t("Quantity must be a positive number"));
      return;
    }
    if (Number.isNaN(costVal) || costVal <= 0) {
      toast.error(t("Unit Cost must be a positive number"));
      return;
    }
    // Issue #172: stock-creating purchases must link an item and use a whole
    // quantity (inventory stock is an integer count). Mirrors the backend rules.
    if (form.creates_inventory_stock) {
      if (!form.asset_id) {
        toast.error(t("A linked inventory item is required when the purchase creates stock"));
        return;
      }
      if (!Number.isInteger(qtyVal)) {
        toast.error(t("Stock-creating purchases must use a whole-number quantity"));
        return;
      }
    }

    const payload = {
      ...form,
      quantity: qtyVal,
      unit_cost: costVal,
      vendor: form.vendor.trim() || null,
      notes: form.notes.trim() || null,
      asset_id: form.asset_id || null,
    };

    saveMutation.mutate(payload);
  };

  const handleExport = async (format: "csv" | "xlsx") => {
    try {
      await downloadCapitalInvestmentsExport({
        month: selectedMonth || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
        category: categoryFilter === "all" ? undefined : categoryFilter,
        capex_classification: classificationFilter === "all" ? undefined : classificationFilter,
        linked: linkedFilter === "all" ? undefined : linkedFilter,
        search: searchQuery.trim() || undefined,
        format,
      });
    } catch (err: unknown) {
      const error = err as Error & { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error || error.message || "Export failed");
    }
  };

  return (
    <AuthLayout>
      <div className="space-y-6">
        {/* Header Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/40 pb-4 no-print">
          <div>
            <h1 className="text-xl font-black tracking-wider text-foreground">{t("Capital Register")}</h1>
            <p className="text-xs text-muted mt-1 max-w-xl">
              {t("Manage long-term capital assets, equipment purchases, and fixtures.")}
            </p>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {canApprove && (
              <div className="flex items-center gap-1 bg-card border border-border dl-radius-lg p-1">
                <button
                  type="button"
                  onClick={() => handleExport("csv")}
                  className="flex items-center gap-1.5 h-[32px] px-3 text-[10px] font-black uppercase tracking-wider text-muted [@media(hover:hover)]:hover:text-foreground transition-all"
                >
                  <HiArrowDownTray className="w-3.5 h-3.5" />
                  CSV
                </button>
                <div className="w-[1px] h-4 bg-border/60" />
                <button
                  type="button"
                  onClick={() => handleExport("xlsx")}
                  className="flex items-center gap-1.5 h-[32px] px-3 text-[10px] font-black uppercase tracking-wider text-muted [@media(hover:hover)]:hover:text-foreground transition-all"
                >
                  <HiArrowDownTray className="w-3.5 h-3.5" />
                  XLSX
                </button>
              </div>
            )}
            <button
              onClick={() => setPdfOpen(true)}
              aria-label={t("Export PDF")}
              className="flex items-center justify-center w-[40px] h-[40px] dl-radius-lg border border-border text-muted bg-card [@media(hover:hover)]:hover:text-foreground transition-all"
            >
              <HiPrinter className="w-4 h-4" />
            </button>
            <button
              onClick={handleOpenAddForm}
              disabled={!canWrite}
              className="flex items-center gap-1.5 h-[40px] px-4 text-xs font-black uppercase tracking-wider bg-primary text-primary-foreground dl-radius-lg shadow-gold transition-all disabled:opacity-50"
            >
              <HiPlus className="w-4 h-4" />
              {t("Add Investment")}
            </button>
          </div>
        </div>

        {/* Workbook Summary Cards */}
        {summaryLoading ? (
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-5 no-print">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-[96px] w-full dl-radius-xl" />)}
          </div>
        ) : summary ? (
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-5 font-semibold">
            <div className="dl-radius-xl border border-border bg-card p-4 bg-primary/5">
              <div className="text-[9px] font-bold text-primary-dark uppercase tracking-wider">{t("Approved Total")}</div>
              <div className="mt-2 text-base font-black text-foreground font-mono tabular-nums">{formatCurrency(summary.totals.approvedTotal)}</div>
            </div>
            <div className="dl-radius-xl border border-border bg-card p-4">
              <div className="text-[9px] font-bold text-muted uppercase tracking-wider">{t("Pending Exposure")}</div>
              <div className="mt-2 text-base font-black text-foreground font-mono tabular-nums">{formatCurrency(summary.totals.pendingTotal)}</div>
            </div>
            <div className="dl-radius-xl border border-border bg-card p-4">
              <div className="text-[9px] font-bold text-muted uppercase tracking-wider">{t("Pending count")}</div>
              <div className="mt-2 text-base font-black text-foreground font-mono tabular-nums">{summary.totals.pendingCount}</div>
            </div>
            <div className="dl-radius-xl border border-border bg-card p-4">
              <div className="text-[9px] font-bold text-muted uppercase tracking-wider">{t("Linked Assets")}</div>
              <div className="mt-2 text-base font-black text-foreground font-mono tabular-nums">{summary.totals.linkedCount}</div>
            </div>
            <div className="dl-radius-xl border border-border bg-card p-4 bg-card-alt/30">
              <div className="text-[9px] font-bold text-muted uppercase tracking-wider">{t("Unlinked Purchases")}</div>
              <div className="mt-2 text-base font-black text-foreground font-mono tabular-nums">{summary.totals.unlinkedCount}</div>
            </div>
          </div>
        ) : null}

        {/* Filters Toolbar */}
        <FilterToolbar
          clearLabel={t("Clear")}
          showClear={Boolean(searchQuery) || Boolean(selectedMonth) || statusFilter !== "all" || categoryFilter !== "all" || classificationFilter !== "all" || linkedFilter !== "all"}
          onClear={() => {
            setSearchQuery("");
            setSelectedMonth("");
            setStatusFilter("all");
            setCategoryFilter("all");
            setClassificationFilter("all");
            setLinkedFilter("all");
            setPage(1);
          }}
          search={
            <ToolbarSearch
              value={searchQuery}
              onChange={(v) => { setSearchQuery(v); setPage(1); }}
              placeholder={t("Search") + "..."}
            />
          }
        >
          <div className="w-[120px]">
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => { setSelectedMonth(e.target.value); setPage(1); }}
              className="w-full px-3 h-[38px] text-xs font-semibold dl-radius-lg bg-card-alt border border-border/80 outline-none"
            />
          </div>

          <div className="w-[130px]">
            <Select
              value={statusFilter}
              onChange={(val) => { setStatusFilter(val); setPage(1); }}
              options={[
                { id: "all", label: t("Status") + ": " + t("All") },
                { id: "Pending", label: t("Pending") },
                { id: "Approved", label: t("Approved") },
                { id: "Rejected", label: t("Rejected") },
              ]}
              className="h-[38px] text-xs font-semibold"
            />
          </div>

          <div className="w-[135px]">
            <Select
              value={categoryFilter}
              onChange={(val) => { setCategoryFilter(val); setPage(1); }}
              options={[
                { id: "all", label: t("Category") + ": " + t("All") },
                ...INVESTMENT_CATEGORIES.map((cat) => ({ id: cat, label: t(cat) })),
              ]}
              className="h-[38px] text-xs font-semibold"
            />
          </div>

          <div className="w-[150px]">
            <Select
              value={classificationFilter}
              onChange={(val) => { setClassificationFilter(val); setPage(1); }}
              options={[
                { id: "all", label: t("Classification") + ": " + t("All") },
                ...CAPEX_CLASSIFICATIONS.map((c) => ({ id: c, label: t(c) })),
              ]}
              className="h-[38px] text-xs font-semibold"
            />
          </div>

          <div className="w-[125px]">
            <Select
              value={linkedFilter}
              onChange={(val) => { setLinkedFilter(val); setPage(1); }}
              options={[
                { id: "all", label: t("Linked") + ": " + t("All") },
                { id: "linked", label: t("Linked") },
                { id: "unlinked", label: t("Unlinked") },
              ]}
              className="h-[38px] text-xs font-semibold"
            />
          </div>

        </FilterToolbar>

        {/* Ledger Table */}
        {listLoading ? (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-[52px] w-full dl-radius-lg" />)}
          </div>
        ) : listError || !listResponse ? (
          <div className="dl-radius-xl border border-border bg-card p-8 text-center text-muted">
            {t("Workspace unavailable")}
          </div>
        ) : listResponse.investments.length === 0 ? (
          <div className="dl-radius-xl border border-border bg-card p-8 text-center text-sm text-muted">
            {t("No data found for the selected filter criteria.")}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto dl-radius-xl border border-border bg-card">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-card-alt/30 border-b border-border text-[10px] uppercase tracking-[0.2em] text-muted font-black">
                    <th className="px-4 py-3.5">{t("Purchase Date")}</th>
                    <th className="px-4 py-3.5">{t("Item Name")}</th>
                    <th className="px-4 py-3.5">{t("Category")}</th>
                    <th className="px-4 py-3.5">{t("Quantity / Unit")}</th>
                    <th className="px-4 py-3.5 text-right">{t("Unit Cost")}</th>
                    <th className="px-4 py-3.5 text-right">{t("Total Cost")}</th>
                    <th className="px-4 py-3.5">{t("Classification")}</th>
                    <th className="px-4 py-3.5">{t("Linked Asset")}</th>
                    <th className="px-4 py-3.5">{t("Status")}</th>
                    <th className="px-4 py-3.5 text-right no-print">{t("Actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {listResponse.investments.map((item: CapitalInvestment) => (
                    <tr key={item.id} className="border-b border-border/50 [@media(hover:hover)]:hover:bg-card-alt/20 transition-all font-semibold text-foreground align-top">
                      <td className="px-4 py-4 whitespace-nowrap">{item.purchase_date.slice(0, 10)}</td>
                      <td className="px-4 py-4 font-bold">
                        <span className="block truncate">{item.item_name}</span>
                        {item.vendor && <span className="block text-[10px] text-muted font-medium mt-0.5">{t("Vendor")}: {item.vendor}</span>}
                      </td>
                      <td className="px-4 py-4">{t(item.category)}</td>
                      <td className="px-4 py-4 whitespace-nowrap font-mono tabular-nums">{item.quantity} / {item.unit}</td>
                      <td className="px-4 py-4 text-right font-mono tabular-nums">{formatCurrency(item.unit_cost)}</td>
                      <td className="px-4 py-4 text-right font-mono tabular-nums font-bold">{formatCurrency(item.total_cost)}</td>
                      <td className="px-4 py-4 text-[10px] font-black uppercase tracking-wider text-muted">{t(item.capex_classification)}</td>
                      <td className="px-4 py-4 max-w-[150px]">
                        {item.asset_id ? (
                          <span className="block text-success truncate font-bold" data-testid="linked-asset-badge">
                            ✓ {item.asset_name || item.asset_id.slice(0, 8)}
                          </span>
                        ) : (
                          <span className="block text-muted italic" data-testid="unlinked-asset-badge">
                            {t("Unlinked")}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge status={item.status} />
                          {item.stock_applied_at && (
                            <span className="inline-flex items-center px-2 py-0.5 dl-radius-md text-[9px] font-black uppercase tracking-wider bg-success/10 text-success border border-success/25">
                              {t("Stock applied")}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right no-print">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {canApprove && item.status === "Pending" && rejectingId !== item.id && (
                            <>
                              <button
                                onClick={() => reviewMutation.mutate({ id: item.id, decision: "approve" })}
                                disabled={reviewMutation.isPending}
                                aria-label={t("Approve")}
                                className="flex items-center gap-1 h-[32px] px-2.5 text-[10px] font-black uppercase tracking-wider dl-radius-md border border-success/40 text-success [@media(hover:hover)]:hover:bg-success/10 transition-all disabled:opacity-50"
                              >
                                <HiCheck className="w-3.5 h-3.5" />
                                {t("Approve")}
                              </button>
                              <button
                                onClick={() => { setRejectingId(item.id); setRejectReason(""); }}
                                disabled={reviewMutation.isPending}
                                aria-label={t("Reject")}
                                className="flex items-center gap-1 h-[32px] px-2.5 text-[10px] font-black uppercase tracking-wider dl-radius-md border border-danger/40 text-danger [@media(hover:hover)]:hover:bg-danger/10 transition-all disabled:opacity-50"
                              >
                                <HiXMark className="w-3.5 h-3.5" />
                                {t("Reject")}
                              </button>
                            </>
                          )}
                          {canApprove && rejectingId === item.id && (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                autoFocus
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder={t("Rejection reason")}
                                className="h-[32px] w-36 px-2 dl-radius-md bg-card-alt text-xs outline-none border border-border focus:ring-1 focus:ring-danger/30"
                              />
                              <button
                                onClick={() => {
                                  if (!rejectReason.trim()) {
                                    toast.error(t("Reason required"));
                                    return;
                                  }
                                  reviewMutation.mutate({ id: item.id, decision: "reject", reason: rejectReason.trim() });
                                }}
                                disabled={reviewMutation.isPending}
                                aria-label={t("Reject")}
                                className="h-[32px] px-2.5 text-[10px] font-black uppercase tracking-wider dl-radius-md bg-danger text-white transition-all disabled:opacity-50"
                              >
                                {t("Reject")}
                              </button>
                              <button
                                onClick={() => setRejectingId(null)}
                                aria-label={t("Cancel")}
                                className="h-[32px] px-1.5 text-[10px] font-black uppercase tracking-wider dl-radius-md border border-border text-muted"
                              >
                                <HiXMark className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                          {canWrite && item.status !== "Approved" && rejectingId !== item.id && (
                            <>
                              <button
                                onClick={() => handleOpenEditForm(item)}
                                aria-label={t("Edit")}
                                className="flex items-center justify-center h-[32px] w-[32px] dl-radius-md border border-border text-muted [@media(hover:hover)]:hover:text-foreground transition-all"
                              >
                                <HiPencilSquare className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setDeletingInvestment(item)}
                                disabled={deleteMutation.isPending}
                                aria-label={t("Delete")}
                                className="flex items-center justify-center h-[32px] w-[32px] dl-radius-md border border-danger/40 text-danger [@media(hover:hover)]:hover:bg-danger/10 transition-all disabled:opacity-50"
                              >
                                <HiTrash className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => {
                              setSelectedActivityId(item.id);
                              setIsActivityOpen(true);
                            }}
                            aria-label={t("Activity")}
                            className="flex items-center justify-center h-[32px] w-[32px] dl-radius-md border border-border text-muted [@media(hover:hover)]:hover:text-foreground transition-all cursor-pointer"
                            title={t("Activity")}
                          >
                            <HiOutlineClock className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {listResponse.totalPages > 1 && (
              <PaginationControls page={page} totalPages={listResponse.totalPages} onPageChange={setPage} />
            )}
          </div>
        )}
      </div>

      <DeleteConfirmModal
        isOpen={!!deletingInvestment}
        onClose={() => setDeletingInvestment(null)}
        onConfirm={() => deletingInvestment && deleteMutation.mutate(deletingInvestment.id)}
        title={t("Delete Investment")}
        message={t("This will remove the capital investment from the ledger.")}
        itemName={deletingInvestment ? `${deletingInvestment.item_name} — ${formatCurrency(deletingInvestment.total_cost)}` : ""}
        isDeleting={deleteMutation.isPending}
      />

      {/* Form Drawer */}
      {isFormOpen && (
        <ResponsiveDrawer
          isOpen={isFormOpen}
          onClose={() => { setIsFormOpen(false); setEditingInvestment(null); }}
          title={editingInvestment ? t("Edit Investment") : t("Add Investment")}
          footer={
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" className="h-[44px] font-bold" onClick={() => { setIsFormOpen(false); setEditingInvestment(null); }}>
                {t("Cancel")}
              </Button>
              <Button className="h-[44px] font-bold" onClick={handleSubmitForm} disabled={saveMutation.isPending}>
                {t("Save Investment")}
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">{t("Purchase Date")}</label>
                <input
                  type="date"
                  value={form.purchase_date}
                  onChange={(e) => setForm((f) => ({ ...f, purchase_date: e.target.value }))}
                  className="w-full px-3 h-[44px] dl-radius-lg bg-card-alt text-sm outline-none border border-border focus:ring-1 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">{t("Classification")}</label>
                <Select
                  value={form.capex_classification}
                  onChange={(val) => setForm((f) => ({ ...f, capex_classification: val as CapitalInvestment["capex_classification"] }))}
                  options={CAPEX_CLASSIFICATIONS.map((c) => ({ id: c, label: t(c) }))}
                  className="h-[44px] text-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="item_name" className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">{t("Item Name")}</label>
              <input
                id="item_name"
                type="text"
                value={form.item_name}
                onChange={(e) => setForm((f) => ({ ...f, item_name: e.target.value }))}
                placeholder={t("e.g. Industrial Washing Machine")}
                className="w-full px-4 h-[44px] dl-radius-lg bg-card-alt text-sm outline-none border border-border focus:ring-1 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">{t("Category")}</label>
              <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto border border-border/50 p-2 dl-radius-lg bg-card-alt">
                {INVESTMENT_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setForm((f) => ({ ...f, category: cat }))}
                    className={`h-[32px] px-3 text-[10px] font-black uppercase tracking-wider dl-radius-md border transition-all ${form.category === cat ? "border-primary bg-primary/10 text-primary" : "border-border/60 bg-card text-muted [@media(hover:hover)]:hover:text-foreground"}`}
                  >
                    {t(cat)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="quantity" className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">{t("Quantity")}</label>
                <input
                  id="quantity"
                  type="number"
                  min="0.0001"
                  step="any"
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                  className="w-full px-4 h-[44px] dl-radius-lg bg-card-alt text-sm font-mono tabular-nums outline-none border border-border focus:ring-1 focus:ring-primary/30"
                />
              </div>
              <div>
                <label htmlFor="unit" className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">{t("Unit")}</label>
                <input
                  id="unit"
                  type="text"
                  value={form.unit}
                  onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                  placeholder="pcs"
                  className="w-full px-4 h-[44px] dl-radius-lg bg-card-alt text-sm outline-none border border-border focus:ring-1 focus:ring-primary/30"
                />
              </div>
              <div>
                <label htmlFor="unit_cost" className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">{t("Unit Cost")} (ETB)</label>
                <input
                  id="unit_cost"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.unit_cost}
                  onChange={(e) => setForm((f) => ({ ...f, unit_cost: e.target.value }))}
                  className="w-full px-4 h-[44px] dl-radius-lg bg-card-alt text-sm font-mono tabular-nums outline-none border border-border focus:ring-1 focus:ring-primary/30"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 items-end">
              <div>
                <label htmlFor="vendor" className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">{t("Vendor")}</label>
                <input
                  id="vendor"
                  type="text"
                  value={form.vendor}
                  onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))}
                  placeholder={t("e.g. SINGER Corp")}
                  className="w-full px-4 h-[44px] dl-radius-lg bg-card-alt text-sm outline-none border border-border focus:ring-1 focus:ring-primary/30"
                />
              </div>
              <div className="flex items-center gap-2 h-[44px] pb-2.5">
                <input
                  type="checkbox"
                  id="creates_inventory_stock"
                  checked={form.creates_inventory_stock}
                  onChange={(e) => setForm((f) => ({ ...f, creates_inventory_stock: e.target.checked }))}
                  className="w-4 h-4 text-primary border-border dl-radius-sm focus:ring-primary/30 bg-card-alt"
                />
                <label htmlFor="creates_inventory_stock" className="text-xs font-bold text-foreground cursor-pointer select-none">{t("Creates Stock?")}</label>
              </div>
            </div>

            <div data-testid="linked-asset-select">
              <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">{t("Linked Asset")} ({t("Select Linked Asset")})</label>
              <Select
                value={form.asset_id}
                onChange={(val) => setForm((f) => ({ ...f, asset_id: val }))}
                options={[
                  { id: "", label: t("Select Linked Asset") },
                  ...inventoryItemsList.map((item: { id: string; name: string; quantity: number; unit_of_measurement?: string | null }) => ({
                    id: item.id,
                    label: `${item.name} (${item.quantity} ${item.unit_of_measurement || ""})`,
                  })),
                ]}
                className="h-[44px] text-sm"
              />
            </div>

            {form.creates_inventory_stock && (() => {
              // Issue #172: stock is applied on APPROVAL (not when this draft is
              // saved). Preview the quantity/unit impact and flag unit mismatch.
              const linked = inventoryItemsList.find(
                (item: { id: string; name: string; quantity: number; unit_of_measurement?: string | null }) => item.id === form.asset_id,
              );
              const qty = Number.parseFloat(form.quantity);
              const unitMismatch =
                linked && form.unit.trim() &&
                form.unit.trim().toLowerCase() !== String(linked.unit_of_measurement || "pcs").trim().toLowerCase();
              return (
                <div
                  role="status"
                  className={`dl-radius-lg border px-3 py-2.5 text-xs font-semibold ${
                    unitMismatch
                      ? "border-danger/40 bg-danger/5 text-danger"
                      : "border-primary/30 bg-primary/5 text-foreground"
                  }`}
                >
                  {!form.asset_id ? (
                    <span>{t("A linked inventory item is required when the purchase creates stock")}</span>
                  ) : unitMismatch ? (
                    <span>
                      {t("Unit mismatch")}: {form.unit} ≠ {linked?.unit_of_measurement || "pcs"}
                    </span>
                  ) : (
                    <span>
                      {t("On approval")}: +{Number.isNaN(qty) ? "?" : qty} {form.unit || ""} → {linked?.name}
                      {linked ? ` (${linked.quantity} → ${Number.isNaN(qty) ? "?" : linked.quantity + qty})` : ""}
                    </span>
                  )}
                </div>
              );
            })()}

            <div>
              <label htmlFor="notes" className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">{t("Notes")}</label>
              <input
                id="notes"
                type="text"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder={t("Notes")}
                className="w-full px-4 h-[44px] dl-radius-lg bg-card-alt text-sm outline-none border border-border focus:ring-1 focus:ring-primary/30"
              />
            </div>
          </div>
        </ResponsiveDrawer>
      )}
      <ActivityDrawer
        entityType="capital_investment"
        entityId={selectedActivityId || ""}
        isOpen={isActivityOpen}
        onClose={() => {
          setIsActivityOpen(false);
          setSelectedActivityId(null);
        }}
      />

      <PdfExportModal
        open={pdfOpen}
        onClose={() => setPdfOpen(false)}
        title="Capital Investment Register"
        subtitle={selectedMonth ? `${t("Month")}: ${selectedMonth}` : undefined}
        meta={[`${t("Generated")}: ${new Date().toLocaleString()}`, `${t("Records")}: ${investmentsForPdf.length}`]}
        columns={pdfColumns}
        buildRows={(keys) => investmentsForPdf.map((inv) => keys.map((k) => investmentRowValue(inv, k)))}
        buildFoot={(keys) => [keys.map((k) => (k === "total" ? formatCurrency(investmentsGrandTotal) : k === "vendor" ? t("Total") : ""))]}
        fileName={`investments-${selectedMonth || "report"}.pdf`}
        defaultOrientation="l"
        t={t}
      />
    </AuthLayout>
  );
}
