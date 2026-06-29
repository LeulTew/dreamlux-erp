"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { HiOutlineTrash, HiPlus } from "react-icons/hi2";
import AuthLayout from "@/components/AuthLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSalaryLevels, createSalaryLevel, updateSalaryLevel, deleteSalaryLevel, getSalaryLevelDeleteImpact } from "@/lib/api";
import { SalaryLevel } from "@/lib/types";
import toast from "@/lib/toast";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import PaginationControls from "@/components/PaginationControls";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/useAuth";
import ForbiddenState from "@/components/ForbiddenState";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Salary Settings": "Salary Settings",
    "Manage corporate base salary levels": "Manage corporate base salary levels",
    "Level Name": "Level Name",
    "Base Rate (ETB)": "Base Rate (ETB)",
    "Update Level": "Update Level",
    "Add Level": "Add Level",
    "Cancel": "Cancel",
    "Monthly Base (ETB)": "Monthly Base (ETB)",
    "Actions": "Actions",
    "Initializing data structure...": "Initializing data structure...",
    "No salary levels config detected": "No salary levels config detected",
    "Gross Base Monthly": "Gross Base Monthly",
    "Edit": "Edit",
    "Delete": "Delete",
    "Delete Salary Level": "Delete Salary Level",
    "Checking employee usage for this salary level...": "Checking employee usage for this salary level...",
    "TRASH": "TRASH"
  },
  am: {
    "Salary Settings": "የደሞዝ ቅንጅቶች",
    "Manage corporate base salary levels": "የድርጅቱን መሠረታዊ የደሞዝ እርከኖች ያስተዳድሩ",
    "Level Name": "የደረጃ ስም",
    "Base Rate (ETB)": "መሠረታዊ መጠን (ብር)",
    "Update Level": "ደረጃውን አዘምን",
    "Add Level": "ደረጃ ጨምር",
    "Cancel": "ሰርዝ",
    "Monthly Base (ETB)": "ወርሃዊ መሠረታዊ ደሞዝ (ብር)",
    "Actions": "ድርጊቶች",
    "Initializing data structure...": "መረጃዎችን በማዘጋጀት ላይ...",
    "No salary levels config detected": "ምንም የደሞዝ ደረጃ አልተገኘም",
    "Gross Base Monthly": "ጠቅላላ ወርሃዊ መሠረታዊ",
    "Edit": "አስተካክል",
    "Delete": "ሰርዝ",
    "Delete Salary Level": "የደሞዝ ደረጃ ሰርዝ",
    "Checking employee usage for this salary level...": "ይህ የደሞዝ ደረጃ በጥቅም ላይ መሆኑን በማጣራት ላይ...",
    "TRASH": "ቆሻሻ መጣያ"
  }
};

function SalaryLevelsContent() {
  const { hasPermission, isLoading: authLoading, isAuthenticated } = useAuth();
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  const hasSalaryLevelAccess = hasPermission("salary-levels:manage");

  const { data: levels, isLoading } = useQuery<SalaryLevel[]>({
    queryKey: ["salary-levels"],
    queryFn: getSalaryLevels,
    enabled: isAuthenticated && hasSalaryLevelAccess
  });

  const [form, setForm] = useState<{ id?: string, level_name: string, base_salary: string }>({ level_name: "", base_salary: "" });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const highlightedId = searchParams.get("highlight");

  const [page, setPage] = useState(1);
  const limit = 10;
  const totalPages = Math.ceil((levels?.length || 0) / limit) || 1;
  const safePage = Math.min(page, totalPages);

  const paginatedLevels = levels ? levels.slice((safePage - 1) * limit, safePage * limit) : [];

  const { data: deleteImpact, isLoading: isDeleteImpactLoading } = useQuery<{ salary_level_id: string; level_name: string; active_employee_count: number }>({
    queryKey: ["salary-level-delete-impact", deleteId],
    queryFn: () => getSalaryLevelDeleteImpact(deleteId as string),
    enabled: !!deleteId && isAuthenticated && hasSalaryLevelAccess,
    retry: false,
  });

  const createMut = useMutation({
    mutationFn: () => createSalaryLevel({ level_name: form.level_name, base_salary: Number(form.base_salary) }),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["salary-levels"] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      await queryClient.refetchQueries({ queryKey: ["employees"], type: "all" });
      setForm({ level_name: "", base_salary: "" });
      toast.success("Salary level created");
    }
  });

  const updateMut = useMutation({
    mutationFn: () => updateSalaryLevel(form.id!, { level_name: form.level_name, base_salary: Number(form.base_salary) }),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["salary-levels"] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      await queryClient.refetchQueries({ queryKey: ["employees"], type: "all" });
      setForm({ level_name: "", base_salary: "" });
      toast.success("Salary level updated");
    }
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteSalaryLevel(id),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["salary-levels"] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      await queryClient.refetchQueries({ queryKey: ["employees"], type: "all" });
      setDeleteId(null);
      toast.success("Deleted successfully");
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.id) updateMut.mutate();
    else createMut.mutate();
  };

  useEffect(() => {
    if (!highlightedId || !levels?.length) return;

    const highlightedLevel = levels.find((level) => level.id === highlightedId);
    if (!highlightedLevel) return;

    const timer = setTimeout(() => {
      setForm({
        id: highlightedLevel.id,
        level_name: highlightedLevel.level_name,
        base_salary: highlightedLevel.base_salary.toString(),
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [highlightedId, levels]);

  const activeDeleteLevel = levels?.find(l => l.id === deleteId);
  const impactedEmployees = deleteImpact?.active_employee_count ?? 0;
  const deleteMessage = isDeleteImpactLoading
    ? t("Checking employee usage for this salary level...")
    : impactedEmployees > 0
      ? lang === "am"
        ? `ማስጠንቀቂያ: ${impactedEmployees} ንቁ ሠራተኛ(ች) በአሁኑ ጊዜ ይህንን ደረጃ ይጠቀማሉ። ደረጃውን መሰረዝ ሠራተኞቹን አያጠፋም ነገር ግን ይህንን ትስስር ያስወግዳል።`
        : `Warning: ${impactedEmployees} active employee${impactedEmployees === 1 ? "" : "s"} currently use this level. Deleting it keeps employees but removes this mapping.`
      : lang === "am"
        ? "ይህንን የደሞዝ ደረጃ መሰረዝ እርግጠኛ ነዎት? በአሁኑ ጊዜ ምንም ንቁ ሠራተኞች እየተጠቀሙበት አይደለም።"
        : "Are you sure you want to remove this salary level? No active employees are currently using it.";

  if (authLoading) {
    return (
      <AuthLayout>
        <div className="flex h-[50vh] items-center justify-center">
          <span className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      </AuthLayout>
    );
  }

  if (!isAuthenticated || !hasSalaryLevelAccess) {
    return (
      <AuthLayout>
        <ForbiddenState
          title="Forbidden: Insufficient privileges"
          description="Only Owners, Administrators, and HR Managers can manage salary levels."
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="page-container-sm pt-4 md:py-8 px-4 sm:px-6 md:px-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 md:mb-8">
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-tight text-foreground">{t("Salary Settings")}</h1>
            <p className="text-xs font-semibold text-muted-foreground mt-1">{t("Manage corporate base salary levels")}</p>
          </div>
          <Link href="/hr/salary-levels/trash" className="flex items-center gap-2 h-10 px-4 bg-danger/10 text-danger rounded-lg font-semibold text-xs transition-all active:scale-[0.98] shadow-sm border border-danger/20">
            <HiOutlineTrash className="w-4 h-4" /> {t("TRASH")}
          </Link>
        </header>

        <div className="bg-card p-6 rounded-2xl 2xl:rounded-4xl shadow-premium border border-border mb-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110" />

          <form onSubmit={handleSubmit} className="relative z-10 flex gap-6 items-end flex-wrap">
            <div className="flex-1 min-w-50">
              <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-2 tracking-wide leading-none">{t("Level Name")}</label>
              <input
                type="text" required value={form.level_name}
                onChange={e => setForm({...form, level_name: e.target.value})}
                className="w-full h-11 px-4 bg-card-alt border border-border/80 rounded-xl font-mono text-sm font-semibold uppercase placeholder:text-muted-foreground/30 outline-none focus:ring-2 focus:ring-primary/20 transition-all focus:border-primary/50 text-foreground"
                placeholder="e.g. L1"
              />
            </div>
            <div className="flex-1 min-w-50">
              <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-2 tracking-wide leading-none">{t("Base Rate (ETB)")}</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">ETB</span>
                <input
                  type="number" min="0" required value={form.base_salary}
                  onChange={e => setForm({...form, base_salary: e.target.value})}
                  className="w-full pl-12 pr-4 h-11 bg-card-alt border border-border/80 rounded-xl font-mono text-sm font-semibold outline-none focus:ring-2 focus:ring-primary/20 transition-all focus:border-primary/50 text-foreground"
                  placeholder="5000"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={createMut.isPending || updateMut.isPending}
                className="h-11 px-5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white text-xs font-black uppercase tracking-widest shadow-md shadow-amber-500/10 hover:from-amber-600 hover:via-amber-700 hover:to-amber-800 hover:shadow-lg hover:scale-[1.02] active:scale-[0.97] transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {form.id ? (
                  <span>{t("Update Level")}</span>
                ) : (
                  <>
                    <HiPlus className="w-4 h-4" />
                    <span>{t("Add Level")}</span>
                  </>
                )}
              </button>
              {form.id && (
                <button type="button" onClick={() => setForm({ level_name: "", base_salary: "" })} className="px-4 h-11 bg-muted/50 text-foreground font-semibold text-sm rounded-xl hover:bg-muted transition-all active:scale-95 border border-border/50">
                  {t("Cancel")}
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="space-y-4">
          <div className="bg-card rounded-2xl 2xl:rounded-4xl shadow-premium border border-border overflow-hidden p-2">
            <table className="w-full text-left text-sm border-separate border-spacing-0">
              <thead>
                <tr className="bg-muted/30">
                  <th className="px-4 sm:px-8 py-4 sm:py-5 text-xs font-semibold uppercase text-muted-foreground tracking-wider border-b border-border/50">{t("Level Name")}</th>
                  <th className="px-4 sm:px-8 py-4 sm:py-5 text-xs font-semibold uppercase text-muted-foreground tracking-wider border-b border-border/50">{t("Monthly Base (ETB)")}</th>
                  <th className="px-4 sm:px-8 py-4 sm:py-5 text-right text-xs font-semibold uppercase text-muted-foreground tracking-wider border-b border-border/50">{t("Actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {isLoading ? (
                  <tr><td colSpan={3} className="p-16 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground animate-pulse">{t("Initializing data structure...")}</td></tr>
                ) : levels?.length === 0 ? (
                  <tr><td colSpan={3} className="p-16 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-card-alt">{t("No salary levels config detected")}</td></tr>
                ) : (
                  paginatedLevels.map(lvl => (
                    <tr
                      key={lvl.id}
                      className={`transition-colors group ${
                        highlightedId === lvl.id
                          ? "bg-primary/10 ring-1 ring-inset ring-primary/30"
                          : "hover:bg-primary/2"
                      }`}
                    >
                      <td className="px-4 sm:px-8 py-4 sm:py-6">
                        <button
                          onClick={() => {
                            setForm({ id: lvl.id, level_name: lvl.level_name, base_salary: lvl.base_salary.toString() });
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="inline-flex items-center justify-center min-w-10 px-3 py-1 bg-foreground text-background rounded-lg font-semibold text-xs uppercase tracking-wider hover:opacity-85 active:scale-[0.98] transition-all shadow-sm cursor-pointer"
                        >
                          {lvl.level_name}
                        </button>
                      </td>
                      <td className="px-4 sm:px-8 py-4 sm:py-6">
                        <div className="flex flex-col">
                          <span className="text-base sm:text-lg font-bold tracking-tight text-foreground">
                            ETB {Number(lvl.base_salary).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-[9px] sm:text-[10px] uppercase font-bold text-muted-foreground tracking-widest mt-0.5 opacity-60">{t("Gross Base Monthly")}</span>
                        </div>
                      </td>
                      <td className="px-4 sm:px-8 py-4 sm:py-6 text-right space-x-2 sm:space-x-4 opacity-100 md:opacity-20 group-hover:opacity-100 transition-all duration-300">
                        <button onClick={() => {
                          setForm({ id: lvl.id, level_name: lvl.level_name, base_salary: lvl.base_salary.toString() });
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }} className="text-xs font-semibold tracking-wider text-primary hover:text-primary-dark outline-none p-1 uppercase underline decoration-2 underline-offset-4 decoration-primary/20">{t("Edit")}</button>
                        <button onClick={() => setDeleteId(lvl.id)} className="text-xs font-semibold tracking-wider text-danger hover:text-danger-dark outline-none p-1 uppercase underline decoration-2 underline-offset-4 decoration-danger/20">{t("Delete")}</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {levels && levels.length > limit && (
            <PaginationControls page={safePage} totalPages={totalPages} onPageChange={setPage} />
          )}
        </div>
      </div>

      <DeleteConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title={t("Delete Salary Level")}
        message={deleteMessage}
        itemName={activeDeleteLevel?.level_name ?? ""}
        isDeleting={deleteMut.isPending}
      />
    </AuthLayout>
  );
}

export default function SalaryLevelsPage() {
  return (
    <Suspense>
      <SalaryLevelsContent />
    </Suspense>
  );
}
