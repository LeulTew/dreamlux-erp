"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSalaryLevelsTrash, restoreSalaryLevel, deleteSalaryLevelPermanent } from "@/lib/api";
import { SalaryLevel } from "@/lib/types";
import { HiArrowUturnLeft, HiTrash, HiCurrencyDollar } from "react-icons/hi2";
import { useState } from "react";
import Link from "next/link";
import AuthLayout from "@/components/AuthLayout";
import toast from "react-hot-toast";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import { AnimatePresence, motion } from "framer-motion";

export default function SalaryLevelsTrashPage() {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isPermanentDeleting, setIsPermanentDeleting] = useState(false);
  const [singleDeleteId, setSingleDeleteId] = useState<string | null>(null);

  const { data: items, isLoading, error } = useQuery<SalaryLevel[]>({
    queryKey: ["trash-salary-levels"],
    queryFn: getSalaryLevelsTrash,
  });

  const restoreMutation = useMutation({
    mutationFn: restoreSalaryLevel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trash-salary-levels"] });
      queryClient.invalidateQueries({ queryKey: ["salary-levels"] });
      toast.success("Restored successfully");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to restore"),
  });

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (items && selectedIds.size === items.length && items.length > 0) {
      setSelectedIds(new Set());
    } else if (items) {
      setSelectedIds(new Set(items.map(i => i.id)));
    }
  };

  const handlePermanentDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsPermanentDeleting(true);
    try {
      await Promise.all(Array.from(selectedIds).map(id => deleteSalaryLevelPermanent(id)));
      toast.success(`${selectedIds.size} record${selectedIds.size > 1 ? "s" : ""} permanently deleted`);
      queryClient.invalidateQueries({ queryKey: ["trash-salary-levels"] });
      setSelectedIds(new Set());
      setSelectMode(false);
      setShowDeleteModal(false);
    } catch (e: unknown) {
      toast.error((e as {response?: {data?: {error?: string}}}).response?.data?.error || "Deletion failed");
    } finally {
      setIsPermanentDeleting(false);
    }
  };

  const handleSingleDelete = (id: string) => {
    setSingleDeleteId(id);
  };

  const confirmSingleDelete = async () => {
    if (!singleDeleteId) return;
    setIsPermanentDeleting(true);
    try {
      await deleteSalaryLevelPermanent(singleDeleteId);
      toast.success("Record permanently deleted");
      queryClient.invalidateQueries({ queryKey: ["trash-salary-levels"] });
      setSingleDeleteId(null);
    } catch (e: unknown) {
      toast.error((e as {response?: {data?: {error?: string}}}).response?.data?.error || "Deletion failed");
    } finally {
      setIsPermanentDeleting(false);
    }
  };

  const isAllSelected = !!(items && items.length > 0 && selectedIds.size === items.length);

  return (
    <AuthLayout>
      <div className="max-w-4xl mx-auto pt-4 md:py-8 px-4 sm:px-6 md:px-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <Link
              href="/hr/salary-levels"
              className="p-2.5 bg-card-alt rounded-2xl text-muted hover:text-foreground border border-border transition-all"
            >
              <HiArrowUturnLeft className="w-5 h-5" />
            </Link>
            <div className="p-2.5 bg-red-500/10 rounded-2xl text-red-500 shadow-sm">
              <HiTrash className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-foreground tracking-tight">
                Salary Level Trash
              </h1>
              <p className="text-xs md:text-sm text-muted font-medium">
                {items?.length ?? 0} Deleted Records
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Select Mode Toggle */}
            <button
              onClick={() => { setSelectMode(!selectMode); if (selectMode) setSelectedIds(new Set()); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all border ${
                selectMode
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "bg-card-alt text-foreground border-border"
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              {selectMode ? `${selectedIds.size} Selected` : "Select"}
            </button>

            {/* Bulk Delete Button - only when items selected */}
            <AnimatePresence>
              {selectMode && selectedIds.size > 0 && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={() => setShowDeleteModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-sm font-black rounded-xl shadow-premium hover:bg-red-700 active:scale-95 transition-all"
                >
                  <HiTrash className="w-4 h-4" />
                  Delete {selectedIds.size}
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </header>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 bg-card-alt rounded-3xl" />
            ))}
          </div>
        ) : error ? (
          <div className="p-12 text-center rounded-3xl border border-dashed border-destructive/30 text-destructive font-black uppercase tracking-widest text-sm">
            Error loading trash
          </div>
        ) : !items || items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-card rounded-3xl border border-dashed border-border text-center px-4">
            <HiTrash className="w-16 h-16 text-muted mb-4 opacity-10" />
            <h3 className="text-lg font-bold text-foreground opacity-50">Trash is empty</h3>
            <p className="text-xs text-muted mt-1">Deleted salary levels will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Select All Bar */}
            {selectMode && (
              <div className="flex items-center gap-3 px-4 py-2.5 bg-card-alt rounded-2xl border border-border/50">
                <button
                  onClick={toggleAll}
                  className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                    isAllSelected ? "bg-primary border-primary text-white" : "border-border bg-card"
                  }`}
                >
                  {isAllSelected && (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <span className="text-xs font-black uppercase tracking-widest text-muted">
                  {isAllSelected ? "Deselect All" : "Select All"}
                </span>
              </div>
            )}

            {/* Item Cards */}
            {items.map((item) => (
              <div
                key={item.id}
                className={`group flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 rounded-3xl bg-card shadow-sm transition-all gap-4 ${
                  selectMode && selectedIds.has(item.id)
                    ? "ring-2 ring-primary"
                    : "border border-border/30 hover:border-border"
                }`}
              >
                <div className="flex items-center gap-4">
                  {/* Checkbox in select mode */}
                  {selectMode && (
                    <button
                      onClick={() => toggleSelection(item.id)}
                      className={`w-5 h-5 rounded-md border flex shrink-0 items-center justify-center transition-all ${
                        selectedIds.has(item.id)
                          ? "bg-primary border-primary text-white"
                          : "border-border bg-card-alt"
                      }`}
                    >
                      {selectedIds.has(item.id) && (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  )}

                  {/* Icon */}
                  <div className="w-10 h-10 rounded-2xl bg-red-500/10 flex items-center justify-center shrink-0">
                    <HiCurrencyDollar className="w-5 h-5 text-red-500" />
                  </div>

                  {/* Info */}
                  <div>
                    <div className="font-black text-foreground tracking-tight">{item.level_name}</div>
                    <div className="text-xs text-muted font-semibold mt-0.5">
                      ETB {Number(item.base_salary).toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    onClick={() => restoreMutation.mutate(item.id)}
                    disabled={restoreMutation.isPending}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-black bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50"
                  >
                    <HiArrowUturnLeft className="w-4 h-4" />
                    Restore
                  </button>
                  {!selectMode && (
                    <button
                      onClick={() => handleSingleDelete(item.id)}
                      className="p-2 rounded-xl text-red-400 hover:bg-red-50 hover:text-red-600 transition-all"
                      title="Delete permanently"
                    >
                      <HiTrash className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Bulk Delete Confirm Modal */}
        <DeleteConfirmModal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={handlePermanentDelete}
          title={`Permanently delete ${selectedIds.size} record${selectedIds.size > 1 ? "s" : ""}?`}
          message="This cannot be undone. Selected salary levels will be wiped from the database forever."
          itemName={`${selectedIds.size} salary level${selectedIds.size > 1 ? "s" : ""} selected`}
          isDeleting={isPermanentDeleting}
          confirmLabel="Delete Forever"
        />

        {/* Single Delete Confirm Modal */}
        <DeleteConfirmModal
          isOpen={!!singleDeleteId}
          onClose={() => setSingleDeleteId(null)}
          onConfirm={confirmSingleDelete}
          title="Permanently delete this salary level?"
          message="This cannot be undone. This salary level will be wiped from the database forever."
          itemName="1 salary level"
          isDeleting={isPermanentDeleting}
          confirmLabel="Delete Forever"
        />
      </div>
    </AuthLayout>
  );
}
