"use client";

import React, { useState } from "react";
import AuthLayout from "@/components/AuthLayout";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import ForbiddenState from "@/components/ForbiddenState";
import PaginationControls from "@/components/PaginationControls";
import { deleteEventPermanent, getEventsTrash, restoreEvent } from "@/lib/api";
import { Event } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import toast from "@/lib/toast";
import { HiArrowLeft, HiArrowPath, HiTrash } from "react-icons/hi2";

type EventsTrashResponse = {
  events: Event[];
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    return response?.data?.error || fallback;
  }
  return fallback;
}

export default function EventsTrashPage() {
  const { hasPermission, isAuthenticated, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const limit = 10;

  const canReadEvents = hasPermission("events:read");
  const canDeleteEvents = hasPermission("events:delete");

  const { data, isLoading } = useQuery<EventsTrashResponse>({
    queryKey: ["events-trash", page, limit],
    queryFn: () => getEventsTrash({ page, limit }),
    enabled: isAuthenticated && canReadEvents,
  });

  const restoreMutation = useMutation({
    mutationFn: restoreEvent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events-trash"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast.success("Event restored");
    },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: deleteEventPermanent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events-trash"] });
      setDeleteId(null);
      toast.success("Event permanently deleted");
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, "Permanent delete blocked"));
    },
  });

  if (authLoading) {
    return (
      <AuthLayout>
        <div className="flex h-[50vh] items-center justify-center">
          <span className="h-8 w-8 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
        </div>
      </AuthLayout>
    );
  }

  if (!isAuthenticated || !canReadEvents) {
    return (
      <AuthLayout>
        <ForbiddenState
          title="Forbidden: Insufficient privileges"
          description="You need event read permissions to view deleted events."
        />
      </AuthLayout>
    );
  }

  const events = data?.events || [];
  const total = data?.total ?? events.length;
  const totalPages = data?.totalPages ?? Math.max(1, Math.ceil(total / limit));

  return (
    <AuthLayout>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:px-8">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/events"
              className="flex h-12 w-12 items-center justify-center rounded-md border border-border bg-card-alt text-muted [@media(hover:hover)]:hover:text-foreground"
              aria-label="Back to events"
            >
              <HiArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-xl font-black tracking-tight text-foreground md:text-2xl">Deleted Events</h1>
              <p className="text-xs font-medium text-muted">{total} records in trash</p>
            </div>
          </div>
        </header>

        <section className="overflow-hidden rounded-md border border-border bg-card">
          <div className="border-b border-border bg-card-alt px-4 py-3">
            <p className="text-[11px] font-black uppercase tracking-wider text-muted">Restore records or permanently delete only empty events.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-border bg-muted/30">
                <tr>
                  <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-muted">Event</th>
                  <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-muted">Client</th>
                  <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-muted">Date</th>
                  <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-muted">Deleted</th>
                  {canDeleteEvents && <th className="px-4 py-3 text-right text-[11px] font-black uppercase tracking-wider text-muted">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {isLoading ? (
                  <tr>
                    <td colSpan={canDeleteEvents ? 5 : 4} className="px-4 py-8 text-center text-xs font-bold uppercase tracking-wider text-muted">
                      Loading deleted events...
                    </td>
                  </tr>
                ) : events.length === 0 ? (
                  <tr>
                    <td colSpan={canDeleteEvents ? 5 : 4} className="px-4 py-8 text-center text-xs font-bold uppercase tracking-wider text-muted">
                      Event trash is empty.
                    </td>
                  </tr>
                ) : (
                  events.map((event) => (
                    <tr key={event.id} className="[@media(hover:hover)]:hover:bg-primary-light/5">
                      <td className="px-4 py-4">
                        <div className="max-w-[260px] truncate font-bold text-foreground">{event.name}</div>
                        <div className="max-w-[260px] truncate text-xs text-muted">{event.venue_location}</div>
                      </td>
                      <td className="px-4 py-4 text-sm font-semibold text-foreground">{event.client_name}</td>
                      <td className="px-4 py-4 font-mono text-xs text-muted">{event.start_date ? String(event.start_date).slice(0, 10) : "-"}</td>
                      <td className="px-4 py-4 font-mono text-xs text-muted">{event.deleted_at ? String(event.deleted_at).slice(0, 10) : "-"}</td>
                      {canDeleteEvents && (
                        <td className="px-4 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => restoreMutation.mutate(event.id)}
                              className="flex h-11 min-w-[44px] items-center justify-center gap-1 rounded-md border border-emerald-700 bg-emerald-600 px-3 text-xs font-black uppercase tracking-wider text-white [@media(hover:hover)]:hover:bg-emerald-700"
                            >
                              <HiArrowPath className="h-4 w-4" />
                              Restore
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteId(event.id)}
                              className="flex h-11 min-w-[44px] items-center justify-center gap-1 rounded-md border border-danger/80 bg-danger px-3 text-xs font-black uppercase tracking-wider text-white [@media(hover:hover)]:hover:bg-danger/90"
                            >
                              <HiTrash className="h-4 w-4" />
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
        </section>
        <PaginationControls
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          pageSize={limit}
          totalItems={total}
        />
      </main>

      <DeleteConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && permanentDeleteMutation.mutate(deleteId)}
        title="Delete Forever"
        message="Only empty events can be permanently deleted. Events with assignments, expenses, allocations, checklist items, or converted proposal history will be blocked."
        itemName={events.find((event) => event.id === deleteId)?.name ?? ""}
        isDeleting={permanentDeleteMutation.isPending}
      />
    </AuthLayout>
  );
}
