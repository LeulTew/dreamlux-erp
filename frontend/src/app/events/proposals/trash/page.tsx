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

        <section className="overflow-hidden rounded-md border border-border bg-card">
          <div className="border-b border-border bg-card-alt px-4 py-3">
            <p className="text-[11px] font-black uppercase tracking-wider text-muted">Converted proposals remain protected to preserve event traceability.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-border bg-muted/30">
                <tr>
                  <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-muted">Proposal</th>
                  <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-muted">Proposed By</th>
                  <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-muted">Budget</th>
                  <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-muted">Status</th>
                  <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-muted">Deleted</th>
                  {canDeleteEvents && <th className="px-4 py-3 text-right text-[11px] font-black uppercase tracking-wider text-muted">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {isLoading ? (
                  <tr>
                    <td colSpan={canDeleteEvents ? 6 : 5} className="px-4 py-8 text-center text-xs font-bold uppercase tracking-wider text-muted">
                      Loading deleted proposals...
                    </td>
                  </tr>
                ) : proposals.length === 0 ? (
                  <tr>
                    <td colSpan={canDeleteEvents ? 6 : 5} className="px-4 py-8 text-center text-xs font-bold uppercase tracking-wider text-muted">
                      Proposal trash is empty.
                    </td>
                  </tr>
                ) : (
                  proposals.map((proposal) => (
                    <tr key={proposal.id} className="[@media(hover:hover)]:hover:bg-primary-light/5">
                      <td className="px-4 py-4">
                        <div className="max-w-[260px] truncate font-bold text-foreground">{proposal.name}</div>
                        <div className="max-w-[260px] truncate text-xs text-muted">{proposal.client_name}</div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="max-w-[180px] truncate text-xs font-semibold text-foreground" title={formatProposalUser(proposal)}>
                          {formatProposalUser(proposal)}
                        </div>
                      </td>
                      <td className="px-4 py-4 font-mono text-xs font-bold tabular-nums text-foreground">
                        ETB {Number(proposal.requested_budget || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge status={proposal.status} />
                      </td>
                      <td className="px-4 py-4 font-mono text-xs text-muted">{proposal.deleted_at ? String(proposal.deleted_at).slice(0, 10) : "-"}</td>
                      {canDeleteEvents && (
                        <td className="px-4 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => restoreMutation.mutate(proposal.id)}
                              className="flex h-11 min-w-[44px] items-center justify-center gap-1 rounded-md border border-emerald-700 bg-emerald-600 px-3 text-xs font-black uppercase tracking-wider text-white [@media(hover:hover)]:hover:bg-emerald-700"
                            >
                              <HiArrowPath className="h-4 w-4" />
                              Restore
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteId(proposal.id)}
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
        message="Converted proposals cannot be permanently deleted because they preserve the event conversion history."
        itemName={proposals.find((proposal) => proposal.id === deleteId)?.name ?? ""}
        isDeleting={permanentDeleteMutation.isPending}
      />
    </AuthLayout>
  );
}
