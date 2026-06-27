"use client";

import React from "react";
import AuthLayout from "@/components/AuthLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getEventTypesTrash, restoreEventType, deleteEventTypePermanent } from "@/lib/api";
import { EventType } from "@/lib/types";
import toast from "react-hot-toast";
import Link from "next/link";
import { HiArrowLeft } from "react-icons/hi2";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import ForbiddenState from "@/components/ForbiddenState";


export default function EventTypesTrashPage() {
  const { hasPermission, isLoading: authLoading, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const hasEventReadAccess = hasPermission("events:read");
  const hasEventDeleteAccess = hasPermission("events:delete");

  const { data: events, isLoading } = useQuery<EventType[]>({
    queryKey: ["event-types-trash"],
    queryFn: getEventTypesTrash,
    enabled: isAuthenticated && hasEventReadAccess,
  });

  const restoreMut = useMutation({
    mutationFn: (id: string) => restoreEventType(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-types-trash"] });
      queryClient.invalidateQueries({ queryKey: ["event-types"] });
      toast.success("Restored successfully");
    }
  });

  const permDeleteMut = useMutation({
    mutationFn: (id: string) => deleteEventTypePermanent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-types-trash"] });
      setDeleteId(null);
      toast.success("Permanently deleted");
    }
  });

  if (authLoading) {
    return (
      <AuthLayout>
        <div className="flex h-[50vh] items-center justify-center">
          <span className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      </AuthLayout>
    );
  }

  if (!isAuthenticated || !hasEventReadAccess) {
    return (
      <AuthLayout>
        <ForbiddenState
          title="Forbidden: Insufficient privileges"
          description="You need event read permissions to view deleted event types."
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="max-w-5xl mx-auto pt-4 md:py-8 px-4 sm:px-6 md:px-8">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/hr/event-types" className="p-2 rounded-full hover:bg-muted/80 transition-colors text-muted-foreground mr-2">
            <HiArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-black uppercase tracking-tight text-danger">Deleted Event Payments</h1>
        </div>
        
        <div className="bg-card rounded-2xl shadow-premium border border-danger/20 overflow-hidden">
          <div className="p-4 bg-danger/5 border-b border-danger/20">
            <p className="text-[10px] font-black uppercase tracking-widest text-danger">Items you deleted are here. You can bring them back.</p>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                <th className="px-3 sm:px-6 py-4 text-[10px] font-black uppercase text-muted-foreground tracking-widest">Event Name</th>
                <th className="px-3 sm:px-6 py-4 text-[10px] font-black uppercase text-muted-foreground tracking-widest">Description</th>
                <th className="px-3 sm:px-6 py-4 text-[10px] font-black uppercase text-muted-foreground tracking-widest hidden sm:table-cell">Deleted At</th>
                {hasEventDeleteAccess && (
                  <th className="px-3 sm:px-6 py-4 text-right text-[10px] font-black uppercase text-muted-foreground tracking-widest">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr><td colSpan={hasEventDeleteAccess ? 4 : 3} className="p-8 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground animate-pulse">Loading...</td></tr>
              ) : events?.length === 0 ? (
                <tr><td colSpan={hasEventDeleteAccess ? 4 : 3} className="p-8 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Empty.</td></tr>
              ) : (
                events?.map(ev => (
                  <tr key={ev.id} className="transition-colors group opacity-75 hover:opacity-100">
                    <td className="px-3 sm:px-6 py-4">
                      <div className="font-black uppercase text-sm sm:text-base text-foreground/70 group-hover:text-foreground transition-colors truncate max-w-37.5 sm:max-w-none">{ev.event_name}</div>
                    </td>
                    <td className="px-3 sm:px-6 py-4">
                      <div className="text-[10px] sm:text-xs font-medium text-muted-foreground truncate max-w-50 sm:max-w-md">
                        {ev.description || "No description"}
                      </div>
                    </td>
                    <td className="px-3 sm:px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hidden sm:table-cell">{new Date(ev.deleted_at!).toLocaleDateString()}</td>
                    {hasEventDeleteAccess && (
                      <td className="px-3 sm:px-6 py-4 text-right">
                        <div className="flex justify-end gap-1 sm:gap-2">
                          <button onClick={() => restoreMut.mutate(ev.id)} className="text-[8px] sm:text-[10px] font-black tracking-widest text-white bg-emerald-600 hover:bg-emerald-700 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-emerald-700 outline-none uppercase transition-colors">
                            Restore
                          </button>
                          <button onClick={() => setDeleteId(ev.id)} className="text-[8px] sm:text-[10px] font-black tracking-widest text-white bg-danger hover:bg-danger/90 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-danger/80 outline-none uppercase transition-colors">
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
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
        onConfirm={() => deleteId && permDeleteMut.mutate(deleteId)}
        title="Delete Forever"
        message="Are you sure you want to permanently delete this event type? Finalized payroll history using this event will be safely preserved."
        itemName={events?.find(e => e.id === deleteId)?.event_name ?? ""}
        isDeleting={permDeleteMut.isPending}
      />
    </AuthLayout>
  );
}
