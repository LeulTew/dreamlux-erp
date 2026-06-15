"use client";

import React, { useState } from "react";
import Link from "next/link";
import { HiOutlineTrash, HiPlus } from "react-icons/hi2";
import AuthLayout from "@/components/AuthLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSalaryLevels, createSalaryLevel, updateSalaryLevel, deleteSalaryLevel, getSalaryLevelDeleteImpact } from "@/lib/api";
import { SalaryLevel } from "@/lib/types";
import toast from "react-hot-toast";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";

export default function SalaryLevelsPage() {
  const queryClient = useQueryClient();
  const { data: levels, isLoading } = useQuery<SalaryLevel[]>({
    queryKey: ["salary-levels"],
    queryFn: getSalaryLevels
  });

  const [form, setForm] = useState<{ id?: string, level_name: string, base_salary: string }>({ level_name: "", base_salary: "" });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: deleteImpact, isLoading: isDeleteImpactLoading } = useQuery<{ salary_level_id: string; level_name: string; active_employee_count: number }>({
    queryKey: ["salary-level-delete-impact", deleteId],
    queryFn: () => getSalaryLevelDeleteImpact(deleteId as string),
    enabled: !!deleteId,
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

  const activeDeleteLevel = levels?.find(l => l.id === deleteId);
  const impactedEmployees = deleteImpact?.active_employee_count ?? 0;
  const deleteMessage = isDeleteImpactLoading
    ? "Checking employee usage for this salary level..."
    : impactedEmployees > 0
      ? `Warning: ${impactedEmployees} active employee${impactedEmployees === 1 ? "" : "s"} currently use this level. Deleting it keeps employees but removes this mapping.`
      : "Are you sure you want to remove this salary level? No active employees are currently using it.";

  return (
    <AuthLayout>
      <div className="page-container-sm pt-4 md:py-8 px-4 sm:px-6 md:px-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 md:mb-8">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight text-foreground">Salary Settings</h1>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mt-1">Manage corporate base salary levels</p>
          </div>
          <Link href="/hr/salary-levels/trash" className="flex items-center gap-2 px-5 py-2.5 bg-danger/10 text-danger rounded-2xl font-black text-[10px] uppercase tracking-[0.15em] hover:bg-danger/20 transition-all active:scale-95 shadow-sm border border-danger/20">
            <HiOutlineTrash className="w-4 h-4" /> TRASH
          </Link>
        </header>
        
        <div className="bg-card p-8 rounded-3xl shadow-premium border border-border pb-10 mb-10 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110" />
          
          <form onSubmit={handleSubmit} className="relative z-10 flex gap-6 items-end flex-wrap">
            <div className="flex-1 min-w-50">
              <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-2 tracking-wide leading-none">Level Name</label>
              <input 
                type="text" required value={form.level_name} 
                onChange={e => setForm({...form, level_name: e.target.value})} 
                className="w-full h-11 px-4 bg-card-alt border border-border/80 rounded-xl font-mono text-sm font-semibold uppercase placeholder:text-muted-foreground/30 outline-none focus:ring-2 focus:ring-primary/20 transition-all focus:border-primary/50 text-foreground" 
                placeholder="e.g. L1" 
              />
            </div>
            <div className="flex-1 min-w-50">
              <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-2 tracking-wide leading-none">Base Rate (ETB)</label>
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
                className="h-11 px-5 rounded-xl bg-primary text-on-primary text-sm font-semibold hover:bg-primary-dark transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                {form.id ? (
                  <span>Update Level</span>
                ) : (
                  <>
                    <HiPlus className="w-4 h-4" />
                    <span>Add Level</span>
                  </>
                )}
              </button>
              {form.id && (
                <button type="button" onClick={() => setForm({ level_name: "", base_salary: "" })} className="px-4 h-11 bg-muted/50 text-foreground font-semibold text-sm rounded-xl hover:bg-muted transition-all active:scale-95 border border-border/50">
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="bg-card rounded-xl shadow-premium border border-border overflow-hidden p-2">
          <table className="w-full text-left text-sm border-separate border-spacing-0">
            <thead>
              <tr className="bg-muted/30">
                <th className="px-4 sm:px-8 py-4 sm:py-5 text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em] border-b border-border/50 first:rounded-tl-4xl">Level Name</th>
                <th className="px-4 sm:px-8 py-4 sm:py-5 text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em] border-b border-border/50">Monthly Base (ETB)</th>
                <th className="px-4 sm:px-8 py-4 sm:py-5 text-right text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em] border-b border-border/50 last:rounded-tr-4xl">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {isLoading ? (
                <tr><td colSpan={3} className="p-16 text-center text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground animate-pulse">Initializing data structure...</td></tr>
              ) : levels?.length === 0 ? (
                <tr><td colSpan={3} className="p-16 text-center text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground bg-card-alt rounded-b-4xl">No salary levels config detected</td></tr>
              ) : (
                levels?.map(lvl => (
                  <tr key={lvl.id} className="hover:bg-primary/2 transition-colors group">
                    <td className="px-4 sm:px-8 py-4 sm:py-6">
                      <button
                        onClick={() => {
                          setForm({ id: lvl.id, level_name: lvl.level_name, base_salary: lvl.base_salary.toString() });
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="inline-flex items-center justify-center min-w-10 px-3 py-1.5 bg-foreground text-background rounded-full font-black text-[10px] uppercase tracking-widest hover:opacity-85 active:scale-95 transition-all shadow-sm cursor-pointer"
                      >
                        {lvl.level_name}
                      </button>
                    </td>
                    <td className="px-4 sm:px-8 py-4 sm:py-6">
                      <div className="flex flex-col">
                        <span className="text-base sm:text-lg font-black tracking-tighter text-foreground">
                          ETB {Number(lvl.base_salary).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-[9px] sm:text-[10px] uppercase font-bold text-muted-foreground tracking-widest mt-0.5 opacity-60">Gross Base Monthly</span>
                      </div>
                    </td>
                    <td className="px-4 sm:px-8 py-4 sm:py-6 text-right space-x-2 sm:space-x-4 opacity-100 md:opacity-20 group-hover:opacity-100 transition-all duration-300">
                      <button onClick={() => {
                        setForm({ id: lvl.id, level_name: lvl.level_name, base_salary: lvl.base_salary.toString() });
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }} className="text-[10px] font-black tracking-widest text-primary hover:text-primary-dark outline-none p-1 uppercase underline decoration-2 underline-offset-4 decoration-primary/20">Edit</button>
                      <button onClick={() => setDeleteId(lvl.id)} className="text-[10px] font-black tracking-widest text-danger hover:text-danger-dark outline-none p-1 uppercase underline decoration-2 underline-offset-4 decoration-danger/20">Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <DeleteConfirmModal 
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title="Delete Salary Level"
        message={deleteMessage}
        itemName={activeDeleteLevel?.level_name ?? ""}
        isDeleting={deleteMut.isPending}
      />
    </AuthLayout>
  );
}
