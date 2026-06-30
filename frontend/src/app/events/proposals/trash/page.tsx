"use client";

import React, { useState } from "react";
import AuthLayout from "@/components/AuthLayout";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import ForbiddenState from "@/components/ForbiddenState";
import PaginationControls from "@/components/PaginationControls";
import { deleteEventProposalPermanent, getEventProposalsTrash, restoreEventProposal } from "@/lib/api";
import { EventProposal } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import toast from "@/lib/toast";
import { HiArrowLeft, HiArrowPath, HiTrash } from "react-icons/hi2";
import StatusBadge from "@/components/ui/StatusBadge";

type ProposalsTrashResponse = {
  proposals: EventProposal[];
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

function formatProposalUser(proposal: EventProposal) {
  return proposal.proposed_by_name || proposal.proposed_by_username || proposal.proposed_by_email || "Unknown user";
}

export default function ProposalTrashPage() {
  const { hasAnyPermission, hasPermission, isAuthenticated, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const limit = 10;

  const canReadProposals = hasAnyPermission(["events:proposals:write", "events:write", "events:proposals:approve"]);
  const canDeleteEvents = hasPermission("events:delete");

  const { data, isLoading } = useQuery<ProposalsTrashResponse>({
    queryKey: ["event-proposals-trash", page, limit],
    queryFn: () => getEventProposalsTrash({ page, limit }),
    enabled: isAuthenticated && canReadProposals,
  });

  const restoreMutation = useMutation({
    mutationFn: restoreEventProposal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-proposals-trash"] });
      queryClient.invalidateQueries({ queryKey: ["event-proposals"] });
      toast.success("Proposal restored");
    },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: deleteEventProposalPermanent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-proposals-trash"] });
      setDeleteId(null);
      toast.success("Proposal permanently deleted");
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

  if (!isAuthenticated || !canReadProposals) {
    return (
      <AuthLayout>
        <ForbiddenState
          title="Forbidden: Insufficient privileges"
          description="You need event proposal access permissions to view deleted proposals."
        />
      </AuthLayout>
    );
  }

  const proposals = data?.proposals || [];
  const total = data?.total ?? proposals.length;
  const totalPages = data?.totalPages ?? Math.max(1, Math.ceil(total / limit));

  return (
    <AuthLayout>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:px-8">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/events/proposals"
              className="flex h-12 w-12 items-center justify-center rounded-[6px] border border-border bg-card-alt text-muted [@media(hover:hover)]:hover:bg-neutral-900 [@media(hover:hover)]:hover:text-white transition-all duration-200"
              aria-label="Back to proposals"
            >
              <HiArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-xl font-black tracking-tight text-foreground md:text-2xl">Deleted Proposals</h1>
              <p className="text-xs font-medium text-muted">{total} records in trash</p>
            </div>
          </div>
        </header>

        <section className="hidden md:block overflow-hidden bg-card border border-border rounded-md table-container">
          <div className="border-b border-border bg-card-alt px-6 py-3">
            <p className="text-[11px] font-black uppercase tracking-wider text-muted">Converted proposals remain protected to preserve event traceability.</p>
          </div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-card-alt/30 border-b border-border text-[10px] uppercase tracking-[0.2em] text-muted font-black">
                <th className="px-6 py-5 text-xs font-black tracking-[0.2em] text-muted">Proposal</th>
                <th className="px-6 py-5 text-xs font-black tracking-[0.2em] text-muted">Proposed By</th>
                <th className="px-6 py-5 text-xs font-black tracking-[0.2em] text-muted">Budget</th>
                <th className="px-6 py-5 text-xs font-black tracking-[0.2em] text-muted">Status</th>
                <th className="px-6 py-5 text-xs font-black tracking-[0.2em] text-muted">Deleted</th>
                {canDeleteEvents && <th className="px-6 py-5 text-xs font-black tracking-[0.2em] text-muted text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {isLoading ? (
                <tr>
                  <td colSpan={canDeleteEvents ? 6 : 5} className="px-6 py-8 text-center text-xs font-bold uppercase tracking-wider text-muted">
                    Loading deleted proposals...
                  </td>
                </tr>
              ) : proposals.length === 0 ? (
                <tr>
                  <td colSpan={canDeleteEvents ? 6 : 5} className="px-6 py-8 text-center text-xs font-bold uppercase tracking-wider text-muted">
                    Proposal trash is empty.
                  </td>
                </tr>
              ) : (
                proposals.map((proposal) => (
                  <tr key={proposal.id} className="border-b border-border/30 hover:bg-primary-light/5 transition-all">
                    <td className="px-6 py-4">
                      <div className="max-w-[260px] truncate font-bold text-foreground">{proposal.name}</div>
                      <div className="max-w-[260px] truncate text-xs text-muted">{proposal.client_name}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="max-w-[180px] truncate text-xs font-semibold text-foreground" title={formatProposalUser(proposal)}>
                        {formatProposalUser(proposal)}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs font-bold tabular-nums text-foreground">
                      ETB {Number(proposal.requested_budget || 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={proposal.status} />
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-muted">{proposal.deleted_at ? String(proposal.deleted_at).slice(0, 10) : "-"}</td>
                    {canDeleteEvents && (
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => restoreMutation.mutate(proposal.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600/10 text-emerald-600 border border-emerald-600/20 text-xs font-semibold hover:bg-emerald-600 hover:text-white transition-all active:scale-[0.98]"
                          >
                            <HiArrowPath className="h-4 w-4" />
                            Restore
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteId(proposal.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-rose-600/10 text-rose-600 border border-rose-600/20 text-xs font-semibold hover:bg-rose-600 hover:text-white transition-all active:scale-[0.98]"
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
        message="Converted proposals cannot be permanently deleted because they preserve the event conversion history."
        itemName={proposals.find((proposal) => proposal.id === deleteId)?.name ?? ""}
        isDeleting={permanentDeleteMutation.isPending}
      />
    </AuthLayout>
  );
}
