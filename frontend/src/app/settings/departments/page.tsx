"use client";

import React, { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { HiPlus } from "react-icons/hi2";
import AuthLayout from "@/components/AuthLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDepartments, createDepartment, updateDepartment, deleteDepartment } from "@/lib/api";
import toast from "react-hot-toast";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import PaginationControls from "@/components/PaginationControls";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/useAuth";
import ForbiddenState from "@/components/ForbiddenState";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Department Setup": "Department Setup",
    "Manage company operational departments": "Manage company operational departments",
    "Department Name": "Department Name",
    "Update Department": "Update Department",
    "Add Department": "Add Department",
    "Cancel": "Cancel",
    "Actions": "Actions",
    "Initializing...": "Initializing...",
    "No departments found": "No departments found",
    "Edit": "Edit",
    "Delete": "Delete",
    "Delete Department": "Delete Department",
    "Are you sure you want to delete this department?": "Are you sure you want to delete this department? This operation cannot be undone if no employees are using it.",
  },
  am: {
    "Department Setup": "የክፍል ዝግጅት",
    "Manage company operational departments": "የኩባንያውን የሥራ ክፍሎች ያስተዳድሩ",
    "Department Name": "የክፍል ስም",
    "Update Department": "ክፍል አዘምን",
    "Add Department": "ክፍል ጨምር",
    "Cancel": "ሰርዝ",
    "Actions": "ድርጊቶች",
    "Initializing...": "በማዘጋጀት ላይ...",
    "No departments found": "ምንም ክፍል አልተገኘም",
    "Edit": "አስተካክል",
    "Delete": "ሰርዝ",
    "Delete Department": "ክፍል ሰርዝ",
    "Are you sure you want to delete this department?": "ይህንን ክፍል ለመሰረዝ እርግጠኛ ነዎት? ይህንን ክፍል የሚጠቀሙ ሰራተኞች ከሌሉ ድርጊቱ የማይመለስ ይሆናል።",
  }
};

type Department = {
  id: string;
  name: string;
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

function DepartmentsContent() {
  const { hasPermission, isLoading: authLoading, isAuthenticated } = useAuth();
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  const hasReadAccess = hasPermission("departments:manage") || hasPermission("hr:read") || hasPermission("departments:read");
  const hasWriteAccess = hasPermission("departments:manage");

  const { data: departments, isLoading } = useQuery<Department[]>({
    queryKey: ["departments"],
    queryFn: getDepartments,
    enabled: isAuthenticated && hasReadAccess
  });

  const [form, setForm] = useState<{ id?: string; name: string }>({ name: "" });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const highlightedId = searchParams.get("highlight");

  const [page, setPage] = useState(1);
  const limit = 10;
  const totalPages = Math.ceil((departments?.length || 0) / limit) || 1;
  const safePage = Math.min(page, totalPages);

  const paginatedDepartments = departments
    ? departments.slice((safePage - 1) * limit, safePage * limit)
    : [];

  const activeDeleteDept = departments?.find((d) => d.id === deleteId);

  const createMut = useMutation({
    mutationFn: () => createDepartment(form.name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      setForm({ name: "" });
      toast.success("Department created successfully");
    },
    onError: (err: unknown) => {
      toast.error(getMutationErrorMessage(err, "Failed to create department"));
    }
  });

  const updateMut = useMutation({
    mutationFn: () => updateDepartment(form.id!, form.name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      setForm({ name: "" });
      toast.success("Department updated successfully");
    },
    onError: (err: unknown) => {
      toast.error(getMutationErrorMessage(err, "Failed to update department"));
    }
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteDepartment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      setDeleteId(null);
      toast.success("Department deleted successfully");
    },
    onError: (err: unknown) => {
      toast.error(getMutationErrorMessage(err, "Failed to delete department"));
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
              {t("Department Setup")}
            </h1>
            <p className="text-xs font-semibold text-muted-foreground mt-1">
              {t("Manage company operational departments")}
            </p>
          </div>
        </header>

        {hasWriteAccess && (
          <div className="bg-card p-6 rounded-2xl shadow-premium border border-border mb-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110" />

            <form onSubmit={handleSubmit} className="relative z-10 flex gap-6 items-end flex-wrap">
              <div className="flex-1 min-w-50">
                <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-2 tracking-wide leading-none">
                  {t("Department Name")}
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full h-11 px-4 bg-card-alt border border-border/80 rounded-xl font-semibold outline-none focus:ring-2 focus:ring-primary/20 transition-all focus:border-primary/50 text-foreground"
                  placeholder="e.g. Logistics"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={createMut.isPending || updateMut.isPending}
                  className="h-11 px-5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white text-xs font-black uppercase tracking-widest shadow-md shadow-amber-500/10 hover:from-amber-600 hover:via-amber-700 hover:to-amber-800 hover:shadow-lg hover:scale-[1.02] active:scale-[0.97] transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {form.id ? (
                    <span>{t("Update Department")}</span>
                  ) : (
                    <>
                      <HiPlus className="w-4 h-4" />
                      <span>{t("Add Department")}</span>
                    </>
                  )}
                </button>
                {form.id && (
                  <button
                    type="button"
                    onClick={() => setForm({ name: "" })}
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
          <div className="bg-card rounded-2xl shadow-premium border border-border overflow-hidden p-2">
            <table className="w-full text-left text-sm border-separate border-spacing-0">
              <thead>
                <tr className="bg-muted/30">
                  <th className="px-4 sm:px-8 py-4 sm:py-5 text-xs font-semibold uppercase text-muted-foreground tracking-wider border-b border-border/50">
                    {t("Department Name")}
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
                    <td colSpan={hasWriteAccess ? 2 : 1} className="p-16 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground animate-pulse">
                      {t("Initializing...")}
                    </td>
                  </tr>
                ) : departments?.length === 0 ? (
                  <tr>
                    <td colSpan={hasWriteAccess ? 2 : 1} className="p-16 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-card-alt">
                      {t("No departments found")}
                    </td>
                  </tr>
                ) : (
                  paginatedDepartments.map((dept) => (
                    <tr
                      key={dept.id}
                      className={`transition-colors group ${
                        highlightedId === dept.id
                          ? "bg-primary/10 ring-1 ring-inset ring-primary/30"
                          : "hover:bg-primary/2"
                      }`}
                    >
                      <td className="px-4 sm:px-8 py-4 sm:py-6">
                        {hasWriteAccess ? (
                          <button
                            onClick={() => {
                              setForm({ id: dept.id, name: dept.name });
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            className="inline-flex items-center justify-center min-w-10 px-3 py-1 bg-foreground text-background rounded-lg font-semibold text-xs uppercase tracking-wider hover:opacity-85 active:scale-[0.98] transition-all shadow-sm cursor-pointer"
                          >
                            {dept.name}
                          </button>
                        ) : (
                          <span className="font-semibold text-foreground">{dept.name}</span>
                        )}
                      </td>
                      {hasWriteAccess && (
                        <td className="px-4 sm:px-8 py-4 sm:py-6 text-right space-x-2 sm:space-x-4 opacity-100 md:opacity-20 group-hover:opacity-100 transition-all duration-300">
                          <button
                            onClick={() => {
                              setForm({ id: dept.id, name: dept.name });
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            className="text-xs font-semibold tracking-wider text-primary hover:text-primary-dark outline-none p-1 uppercase underline decoration-2 underline-offset-4 decoration-primary/20"
                          >
                            {t("Edit")}
                          </button>
                          <button
                            onClick={() => setDeleteId(dept.id)}
                            className="text-xs font-semibold tracking-wider text-danger hover:text-danger-dark outline-none p-1 uppercase underline decoration-2 underline-offset-4 decoration-danger/20"
                          >
                            {t("Delete")}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {departments && departments.length > limit && (
            <PaginationControls page={safePage} totalPages={totalPages} onPageChange={setPage} />
          )}
        </div>
      </div>

      <DeleteConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title={t("Delete Department")}
        message={t("Are you sure you want to delete this department?")}
        itemName={activeDeleteDept?.name ?? ""}
        isDeleting={deleteMut.isPending}
      />
    </AuthLayout>
  );
}

export default function DepartmentsPage() {
  return (
    <Suspense>
      <DepartmentsContent />
    </Suspense>
  );
}
