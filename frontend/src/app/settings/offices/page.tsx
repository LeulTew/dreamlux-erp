"use client";

import React, { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { HiPlus, HiPencilSquare, HiOutlineTrash, HiDocumentDuplicate } from "react-icons/hi2";
import AuthLayout from "@/components/AuthLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAllOffices, createOffice, updateOffice, deleteOffice } from "@/lib/api";
import toast from "@/lib/toast";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import PaginationControls from "@/components/PaginationControls";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/useAuth";
import ForbiddenState from "@/components/ForbiddenState";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Office Setup": "Office Setup",
    "Manage corporate branches and office locations": "Manage corporate branches and office locations",
    "Office Name": "Office Name",
    "Update Office": "Update Office",
    "Add Office": "Add Office",
    "Cancel": "Cancel",
    "Actions": "Actions",
    "Initializing...": "Initializing...",
    "No offices found": "No offices found",
    "Edit": "Edit",
    "Delete": "Delete",
    "Delete Office": "Delete Office",
    "Are you sure you want to delete this office?": "Are you sure you want to delete this office? This operation cannot be undone if no employees or assets are associated with it.",
    "Status": "Status",
    "Active": "Active",
    "Inactive": "Inactive",
    "Status Option": "Active Status",
    "Duplicate": "Duplicate",
  },
  am: {
    "Office Setup": "የቢሮ ዝግጅት",
    "Manage corporate branches and office locations": "የኩባንያውን ቅርንጫፎች እና የቢሮ ቦታዎች ያስተዳድሩ",
    "Office Name": "የቢሮ ስም",
    "Update Office": "ቢሮ አዘምን",
    "Add Office": "ቢሮ ጨምር",
    "Cancel": "ሰርዝ",
    "Actions": "ድርጊቶች",
    "Initializing...": "በማዘጋጀት ላይ...",
    "No offices found": "ምንም ቢሮ አልተገኘም",
    "Edit": "አስተካክል",
    "Delete": "ሰርዝ",
    "Delete Office": "ቢሮ ሰርዝ",
    "Are you sure you want to delete this office?": "ይህንን ቢሮ ለመሰረዝ እርግጠኛ ነዎት? ይህንን ቢሮ የሚጠቀሙ ሰራተኞች ወይም ንብረቶች ከሌሉ ድርጊቱ የማይመለስ ይሆናል።",
    "Status": "ሁኔታ",
    "Active": "አክቲቭ",
    "Inactive": "ኢንአክቲቭ",
    "Status Option": "የአክቲቭ ሁኔታ",
    "Duplicate": "ቅጂ ፍጠር",
  }
};

type Office = {
  id: string;
  name: string;
  is_active: boolean;
  created_at?: string;
};

function getMutationErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null) {
    const maybeAxiosError = error as {
      response?: { data?: { error?: string } };
      message?: string;
    };
    return maybeAxiosError.response?.data?.error || maybeAxiosError.message || fallback;
  }

  return fallback;
}

function OfficesContent() {
  const { hasPermission, isLoading: authLoading, isAuthenticated } = useAuth();
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  const hasReadAccess = hasPermission("offices:manage") || hasPermission("hr:read") || hasPermission("offices:read");
  const hasWriteAccess = hasPermission("offices:manage");

  const { data: offices, isLoading } = useQuery<Office[]>({
    queryKey: ["all-offices"],
    queryFn: getAllOffices,
    enabled: isAuthenticated && hasReadAccess
  });

  const [form, setForm] = useState<{ id?: string; name: string; is_active: boolean }>({ name: "", is_active: true });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const highlightedId = searchParams.get("highlight");

  const [page, setPage] = useState(1);
  const limit = 10;
  const totalPages = Math.ceil((offices?.length || 0) / limit) || 1;
  const safePage = Math.min(page, totalPages);

  const paginatedOffices = offices
    ? offices.slice((safePage - 1) * limit, safePage * limit)
    : [];

  const activeDeleteOff = offices?.find((o) => o.id === deleteId);

  const createMut = useMutation({
    mutationFn: () => createOffice(form.name, form.is_active),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-offices"] });
      queryClient.invalidateQueries({ queryKey: ["offices"] });
      setForm({ name: "", is_active: true });
      toast.success("Office created successfully");
    },
    onError: (err: unknown) => {
      toast.error(getMutationErrorMessage(err, "Failed to create office"));
    }
  });

  const updateMut = useMutation({
    mutationFn: () => updateOffice(form.id!, form.name, form.is_active),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-offices"] });
      queryClient.invalidateQueries({ queryKey: ["offices"] });
      setForm({ name: "", is_active: true });
      toast.success("Office updated successfully");
    },
    onError: (err: unknown) => {
      toast.error(getMutationErrorMessage(err, "Failed to update office"));
    }
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteOffice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-offices"] });
      queryClient.invalidateQueries({ queryKey: ["offices"] });
      setDeleteId(null);
      toast.success("Office deleted successfully");
    },
    onError: (err: unknown) => {
      toast.error(getMutationErrorMessage(err, "Failed to delete office"));
      setDeleteId(null);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (form.id) {
      updateMut.mutate();
    } else {
      createMut.mutate();
    }
  };

  if (authLoading) {
    return (
      <AuthLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground animate-pulse">
            {t("Initializing...")}
          </span>
        </div>
      </AuthLayout>
    );
  }

  if (!hasReadAccess) {
    return <ForbiddenState />;
  }

  return (
    <AuthLayout>
      <div className="page-container-sm pt-4 md:py-8 px-4 sm:px-6 md:px-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 md:mb-8">
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-tight text-foreground">
              {t("Office Setup")}
            </h1>
            <p className="text-xs font-semibold text-muted-foreground mt-1">
              {t("Manage corporate branches and office locations")}
            </p>
          </div>
        </header>

        {hasWriteAccess && (
          <div className="bg-card p-6 rounded-2xl shadow-premium border border-border mb-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110" />

            <form onSubmit={handleSubmit} className="relative z-10 flex gap-6 items-end flex-wrap">
              <div className="flex-1 min-w-50">
                <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-2 tracking-wide leading-none">
                  {t("Office Name")}
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full h-11 px-4 bg-card-alt border border-border/80 rounded-xl font-semibold outline-none focus:ring-2 focus:ring-primary/20 transition-all focus:border-primary/50 text-foreground"
                  placeholder="e.g. Bole Branch"
                />
              </div>
              <div className="w-32">
                <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-2 tracking-wide leading-none">
                  {t("Status Option")}
                </label>
                <select
                  value={form.is_active ? "true" : "false"}
                  onChange={(e) => setForm({ ...form, is_active: e.target.value === "true" })}
                  className="w-full h-11 px-4 bg-card-alt border border-border/80 rounded-xl font-semibold outline-none focus:ring-2 focus:ring-primary/20 transition-all focus:border-primary/50 text-foreground"
                >
                  <option value="true">{t("Active")}</option>
                  <option value="false">{t("Inactive")}</option>
                </select>
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={createMut.isPending || updateMut.isPending}
                  className="h-11 px-5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white text-xs font-black uppercase tracking-widest shadow-md shadow-amber-500/10 hover:from-amber-600 hover:via-amber-700 hover:to-amber-800 hover:shadow-lg hover:scale-[1.02] active:scale-[0.97] transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {form.id ? (
                    <span>{t("Update Office")}</span>
                  ) : (
                    <>
                      <HiPlus className="w-4 h-4" />
                      <span>{t("Add Office")}</span>
                    </>
                  )}
                </button>
                {form.id && (
                  <button
                    type="button"
                    onClick={() => setForm({ name: "", is_active: true })}
                    className="px-4 h-11 bg-muted/50 text-foreground font-semibold text-sm rounded-xl hover:bg-muted transition-all active:scale-95 border border-border/50"
                  >
                    {t("Cancel")}
                  </button>
                )}
              </div>
            </form>
          </div>
        )}

        <div className="space-y-4">
          <div className="bg-card rounded-2xl shadow-premium border border-border overflow-hidden">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-muted/30">
                  <th className="px-4 sm:px-8 py-4 sm:py-5 text-xs font-semibold uppercase text-muted-foreground tracking-wider border-b border-border/50">
                    {t("Office Name")}
                  </th>
                  <th className="px-4 sm:px-8 py-4 sm:py-5 text-xs font-semibold uppercase text-muted-foreground tracking-wider border-b border-border/50">
                    {t("Status")}
                  </th>
                  {hasWriteAccess && (
                    <th className="px-4 sm:px-8 py-4 sm:py-5 text-right text-xs font-semibold uppercase text-muted-foreground tracking-wider border-b border-border/50">
                      {t("Actions")}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {isLoading ? (
                  <tr>
                    <td colSpan={hasWriteAccess ? 3 : 2} className="p-16 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground animate-pulse">
                      {t("Initializing...")}
                    </td>
                  </tr>
                ) : offices?.length === 0 ? (
                  <tr>
                    <td colSpan={hasWriteAccess ? 3 : 2} className="p-16 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-card-alt">
                      {t("No offices found")}
                    </td>
                  </tr>
                ) : (
                  paginatedOffices.map((off) => (
                    <tr
                      key={off.id}
                      className={`transition-colors group ${
                        highlightedId === off.id
                          ? "bg-primary/10 ring-1 ring-inset ring-primary/30"
                          : "hover:bg-primary/5"
                      }`}
                    >
                      <td className="px-4 sm:px-8 py-3 sm:py-3.5">
                        <span className="font-bold text-sm tracking-tight text-foreground">{off.name}</span>
                      </td>
                      <td className="px-4 sm:px-8 py-3 sm:py-3.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            off.is_active
                              ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                              : "bg-neutral-500/10 text-neutral-500 border border-neutral-500/20"
                          }`}
                        >
                          {off.is_active ? t("Active") : t("Inactive")}
                        </span>
                      </td>
                      {hasWriteAccess && (
                        <td className="px-4 sm:px-8 py-3 sm:py-3.5 text-right space-x-2.5">
                          <button
                            onClick={() => {
                              setForm({ id: off.id, name: off.name, is_active: off.is_active });
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            title={t("Edit")}
                            className="p-2 bg-primary/10 rounded-lg text-primary hover:bg-primary hover:text-background transition-all active:scale-90 inline-flex items-center justify-center border border-primary/20 cursor-pointer"
                          >
                            <HiPencilSquare className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setForm({ id: undefined, name: off.name + " (Copy)", is_active: off.is_active });
                              window.scrollTo({ top: 0, behavior: "smooth" });
                              toast.success(lang === "am" ? "የተገለበጠ መረጃ ተሞልቷል፤ ለመመዝገብ ቢሮ ጨምር የሚለውን ይጫኑ" : "Prefilled duplicate; click Add Office to save");
                            }}
                            title={t("Duplicate")}
                            className="p-2 bg-amber-500/10 rounded-lg text-amber-500 hover:bg-amber-500 hover:text-white transition-all active:scale-90 inline-flex items-center justify-center border border-amber-500/20 cursor-pointer"
                          >
                            <HiDocumentDuplicate className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteId(off.id)}
                            title={t("Delete")}
                            className="p-2 bg-danger/10 rounded-lg text-danger hover:bg-danger hover:text-white transition-all active:scale-90 inline-flex items-center justify-center border border-danger/20 cursor-pointer"
                          >
                            <HiOutlineTrash className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {offices && offices.length > limit && (
            <PaginationControls page={safePage} totalPages={totalPages} onPageChange={setPage} />
          )}
        </div>
      </div>

      <DeleteConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title={t("Delete Office")}
        message={t("Are you sure you want to delete this office?")}
        itemName={activeDeleteOff?.name ?? ""}
        isDeleting={deleteMut.isPending}
      />
    </AuthLayout>
  );
}

export default function OfficesPage() {
  return (
    <Suspense>
      <OfficesContent />
    </Suspense>
  );
}
