"use client";
import React, { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getEventProposal,
  submitEventProposal,
  approveEventProposal,
  rejectEventProposal,
  cancelEventProposal,
  convertEventProposal,
  api
} from "@/lib/api";
import { EventProposal, EventProposalLog } from "@/lib/types";
import AuthLayout from "@/components/AuthLayout";
import {
  HiInboxStack,
  HiCheckCircle,
  HiPrinter,
  HiArrowLeft,
  HiExclamationTriangle,
  HiCurrencyDollar,
  HiArrowTopRightOnSquare
} from "react-icons/hi2";
import { useLanguage } from "@/hooks/use-language";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Proposal Details": "Proposal Details",
    "Client Details": "Client Details",
    "Client Name": "Client Name",
    "Client Phone": "Client Phone",
    "Requested Budget": "Requested Budget (Revenue)",
    "Requested Dates": "Requested Dates",
    "Venue": "Venue",
    "Status": "Status",
    "Notes": "Notes",
    "Design Notes": "Design Notes",
    "Estimate Summary": "Estimate Summary",
    "Design Cost": "Design Cost",
    "Team Cost": "Team Cost",
    "Trip Cost": "Trip Cost",
    "Other Cost": "Other Cost",
    "Total Cost": "Total Cost",
    "Net Profit": "Net Profit",
    "Margin %": "Margin %",
    "Logs": "Audit Logs",
    "Actions": "Intake Actions",
    "Submit": "Submit Proposal",
    "Approve": "Approve Proposal",
    "Reject": "Reject Proposal",
    "Cancel": "Cancel Proposal",
    "Convert to Event": "Convert to Event",
    "Rejection Reason": "Rejection Reason",
    "Enter reason": "Enter rejection reason...",
    "Rejection Modal Title": "Reject Intake Proposal",
    "Convert Modal Title": "Convert Approved Proposal",
    "Convert Modal Details": "This action will convert this approved proposal into a planned event. Estimated costs and designs will remain in the proposal history for audit variance, and a real event will be created in the directory.",
    "Yes, Convert": "Yes, Convert",
    "Cancel Action": "Cancel",
    "Print Proposal": "Print / PDF",
    "Back": "Back to Proposals",
    "Linked Event": "Linked Event",
    "Open Event Workspace": "Open Event Workspace"
  },
  am: {
    "Proposal Details": "የፕሮፖዛል ዝርዝሮች",
    "Client Details": "የደንበኛ ዝርዝሮች",
    "Client Name": "የደንበኛ ስም",
    "Client Phone": "የደንበኛ ስልክ",
    "Requested Budget": "የተጠየቀ በጀት (ገቢ)",
    "Requested Dates": "የተጠየቁ ቀናት",
    "Venue": "ቦታ",
    "Status": "ሁኔታ",
    "Notes": "ማስታወሻዎች",
    "Design Notes": "የዲዛይን ማስታወሻዎች",
    "Estimate Summary": "የግምት ማጠቃለያ",
    "Design Cost": "የዲዛይን ወጪ",
    "Team Cost": "የሰራተኛ ወጪ",
    "Trip Cost": "የጉዞ ወጪ",
    "Other Cost": "ሌላ ወጪ",
    "Total Cost": "አጠቃላይ ወጪ",
    "Net Profit": "የተጣራ ትርፍ",
    "Margin %": "ህዳግ %",
    "Logs": "የታሪክ መዝገቦች",
    "Actions": "የፕሮፖዛል ተግባራት",
    "Submit": "ፕሮፖዛል አቅርብ",
    "Approve": "ፕሮፖዛል አጽድቅ",
    "Reject": "ፕሮፖዛል ውድቅ አድርግ",
    "Cancel": "ፕሮፖዛል ሰርዝ",
    "Convert to Event": "ወደ ዝግጅት ቀይር",
    "Rejection Reason": "ውድቅ የተደረገበት ምክንያት",
    "Enter reason": "ውድቅ የተደረገበትን ምክንያት እዚህ ይፃፉ...",
    "Rejection Modal Title": "ፕሮፖዛል ውድቅ ማድረጊያ",
    "Convert Modal Title": "የጸደቀ ፕሮፖዛል መለወጫ",
    "Convert Modal Details": "ይህ ተግባር ይህንን የጸደቀ ፕሮፖዛል ወደታቀደ ዝግጅት ይቀይረዋል። የተገመቱ ወጪዎች እና ዲዛይኖች በፕሮፖዛል ታሪክ ውስጥ ይቀመጣሉ፣ እና በእውነተኛ የዝግጅት መዝገብ ውስጥ አዲስ ዝግጅት ይፈጠራል።",
    "Yes, Convert": "አዎ፣ ቀይር",
    "Cancel Action": "ተመለስ",
    "Print Proposal": "ሪፖርት አትም",
    "Back": "ወደ ፕሮፖዛሎች ተመለስ",
    "Linked Event": "የተያያዘ ዝግጅት",
    "Open Event Workspace": "የዝግጅቱን ቦርድ ክፈት"
  }
};

export default function ProposalDetailPage() {
  const { id } = useParams() as { id: string };
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const router = useRouter();
  const queryClient = useQueryClient();

  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [isConvertOpen, setIsConvertOpen] = useState(false);
  const [actionError, setActionError] = useState("");
  const rejectDialogRef = useRef<HTMLFormElement>(null);
  const convertDialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const activeDialog = isRejectOpen ? rejectDialogRef.current : isConvertOpen ? convertDialogRef.current : null;
    if (!activeDialog) return;

    const focusableElements = activeDialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusableElements[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsRejectOpen(false);
        setIsConvertOpen(false);
        return;
      }

      if (event.key !== "Tab" || focusableElements.length === 0) return;
      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        last.focus();
        event.preventDefault();
      } else if (!event.shiftKey && document.activeElement === last) {
        first.focus();
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isConvertOpen, isRejectOpen]);

  const { data, isLoading } = useQuery<{
    proposal: EventProposal;
    logs: EventProposalLog[];
  }>({
    queryKey: ["event-proposal", id],
    queryFn: () => getEventProposal(id),
    enabled: !!id
  });

  const { data: authData } = useQuery({
    queryKey: ["auth-permissions"],
    queryFn: async () => {
      const res = await api.get("/auth/permissions");
      return res.data;
    }
  });

  const hasPermission = (slug: string) => {
    return authData?.permission_slugs?.includes(slug) || authData?.is_superuser;
  };

  const canApprove = hasPermission("events:proposals:approve");
  const canWrite = hasPermission("events:proposals:write") || hasPermission("events:write");

  const proposal = data?.proposal;
  const logs = data?.logs || [];

  const submitMutation = useMutation({
    mutationFn: () => submitEventProposal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-proposal", id] });
    },
    onError: (err: { response?: { data?: { error?: string } }; message?: string }) => setActionError(err.response?.data?.error || err.message || "An error occurred")
  });

  const approveMutation = useMutation({
    mutationFn: () => approveEventProposal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-proposal", id] });
    },
    onError: (err: { response?: { data?: { error?: string } }; message?: string }) => setActionError(err.response?.data?.error || err.message || "An error occurred")
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => rejectEventProposal(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-proposal", id] });
      setIsRejectOpen(false);
      setRejectReason("");
    },
    onError: (err: { response?: { data?: { error?: string } }; message?: string }) => setActionError(err.response?.data?.error || err.message || "An error occurred")
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelEventProposal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-proposal", id] });
    },
    onError: (err: { response?: { data?: { error?: string } }; message?: string }) => setActionError(err.response?.data?.error || err.message || "An error occurred")
  });

  const convertMutation = useMutation({
    mutationFn: () => convertEventProposal(id),
    onSuccess: (resData) => {
      router.push(`/events/${resData.event.id}`);
    },
    onError: (err: { response?: { data?: { error?: string } }; message?: string }) => {
      setIsConvertOpen(false);
      setActionError(err.response?.data?.error || err.message || "An error occurred");
    }
  });

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <AuthLayout>
        <div className="flex h-[50vh] items-center justify-center">
          <span className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      </AuthLayout>
    );
  }

  if (!proposal) {
    return (
      <AuthLayout>
        <div className="p-8 text-center text-muted">Proposal not found</div>
      </AuthLayout>
    );
  }

  const getStatusBadgeClass = (statusStr: string) => {
    switch (statusStr) {
      case "Draft":
        return "bg-card-alt text-muted border border-border";
      case "Submitted":
        return "bg-primary-light text-primary-dark border border-primary/20";
      case "Approved":
        return "bg-success/10 text-success border border-success/20";
      case "Rejected":
        return "bg-danger/10 text-danger border border-danger/20";
      case "Converted":
        return "bg-warning/10 text-warning border border-warning/20";
      default:
        return "bg-card-alt text-muted border border-border";
    }
  };

  return (
    <AuthLayout>
      <div className="page-container pt-4 md:py-8 px-4 sm:px-6 md:px-8">
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            body {
              background: white !important;
              color: black !important;
            }
            .no-print {
              display: none !important;
            }
            header, footer, nav, aside, [data-sidebar], .actions-panel, .logs-panel {
              display: none !important;
            }
            main, .page-container {
              border: none !important;
              padding: 0 !important;
              margin: 0 !important;
              width: 100% !important;
            }
            .print-grid {
              grid-template-cols: 1fr !important;
              gap: 16px !important;
            }
          }
        ` }} />

        {/* Back Link */}
        <button
          onClick={() => router.push("/events/proposals")}
          className="no-print flex items-center gap-1.5 text-xs font-bold text-muted [@media(hover:hover)]:hover:text-foreground mb-6 uppercase tracking-wider"
        >
          <HiArrowLeft className="w-4 h-4" />
          {t("Back")}
        </button>

        {actionError && (
          <div className="mb-4 p-4 bg-danger/10 border border-danger/20 rounded-lg text-danger text-sm font-semibold flex items-center gap-2 no-print">
            <HiExclamationTriangle className="w-5 h-5 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-lg text-primary border border-primary/20">
              <HiInboxStack className="w-6 h-6 md:w-7 md:h-7" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-foreground tracking-tight">
                {proposal.name}
              </h1>
              <p className="text-xs md:text-sm text-muted font-medium mt-1">
                {t("Proposal Details")}
              </p>
            </div>
          </div>

          <button
            onClick={handlePrint}
            className="no-print flex items-center justify-center gap-1.5 px-4 h-[44px] rounded-lg text-xs font-black bg-card border border-border text-muted [@media(hover:hover)]:hover:text-foreground transition-all"
          >
            <HiPrinter className="w-4 h-4" />
            {t("Print Proposal")}
          </button>
        </header>

        {/* Primary layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start print-grid">

          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">

            {/* Basics Card */}
            <div className="bg-card border border-border rounded-lg p-5 space-y-4">
              <h3 className="text-xs font-black text-foreground uppercase tracking-wider border-b border-border/40 pb-2">
                {t("Client Details")}
              </h3>
              <div className="grid grid-cols-2 gap-4 text-xs font-semibold text-foreground">
                <div>
                  <span className="text-[10px] text-muted block uppercase tracking-wider font-bold">{t("Client Name")}</span>
                  <span>{proposal.client_name}</span>
                </div>
                {proposal.client_phone && (
                  <div>
                    <span className="text-[10px] text-muted block uppercase tracking-wider font-bold">{t("Client Phone")}</span>
                    <span className="font-mono">{proposal.client_phone}</span>
                  </div>
                )}
                <div>
                  <span className="text-[10px] text-muted block uppercase tracking-wider font-bold">{t("Requested Budget")}</span>
                  <span className="font-mono font-bold">ETB {Number(proposal.requested_budget).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted block uppercase tracking-wider font-bold">{t("Venue")}</span>
                  <span>{proposal.venue_location || "-"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted block uppercase tracking-wider font-bold">{t("Requested Dates")}</span>
                  <span className="font-mono">
                    {proposal.requested_start_date ? proposal.requested_start_date.split("T")[0] : "-"}
                    {proposal.requested_end_date && proposal.requested_end_date !== proposal.requested_start_date ? ` to ${proposal.requested_end_date.split("T")[0]}` : ""}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted block uppercase tracking-wider font-bold">{t("Status")}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getStatusBadgeClass(proposal.status)}`}>
                    {t(proposal.status)}
                  </span>
                </div>
              </div>

              {proposal.notes && (
                <div className="pt-2">
                  <span className="text-[10px] text-muted block uppercase tracking-wider font-bold">{t("Notes")}</span>
                  <p className="text-xs text-foreground mt-1 bg-card-alt p-3 rounded border border-border/40">{proposal.notes}</p>
                </div>
              )}

              {proposal.package_design_notes && (
                <div className="pt-2">
                  <span className="text-[10px] text-muted block uppercase tracking-wider font-bold">{t("Design Notes")}</span>
                  <p className="text-xs text-foreground mt-1 bg-card-alt p-3 rounded border border-border/40">{proposal.package_design_notes}</p>
                </div>
              )}
            </div>

            {/* Estimates breakdown details list */}
            <div className="bg-card border border-border rounded-lg p-5 space-y-4">
              <h3 className="text-xs font-black text-foreground uppercase tracking-wider border-b border-border/40 pb-2">
                {t("Estimate Summary")}
              </h3>

              {/* Design Cost Lines */}
              {proposal.cost_breakdown?.design && proposal.cost_breakdown.design.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[10px] text-muted uppercase tracking-wider font-bold">{t("Design Cost")}</h4>
                  {proposal.cost_breakdown.design.map((line, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs font-semibold bg-card-alt p-2 rounded border border-border/30">
                      <span>{line.label}</span>
                      <span className="font-mono">ETB {Number(line.amount).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Team Cost Lines */}
              {proposal.cost_breakdown?.team && proposal.cost_breakdown.team.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[10px] text-muted uppercase tracking-wider font-bold">{t("Team Cost")}</h4>
                  {proposal.cost_breakdown.team.map((line, idx) => {
                    const explicit = Number(line.amount || 0);
                    const derived = Number(line.people_count || 1) * Number(line.commission_per_person || 0);
                    const applied = Math.max(explicit, derived);
                    return (
                      <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between text-xs font-semibold bg-card-alt p-2 rounded border border-border/30 gap-1">
                        <div>
                          <span>{line.label}</span>
                          <span className="text-[10px] text-muted block mt-0.5">
                            {line.people_count} people × ETB {line.commission_per_person} commission
                          </span>
                        </div>
                        <span className="font-mono">ETB {applied.toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Trip Cost Lines */}
              {proposal.cost_breakdown?.trip && proposal.cost_breakdown.trip.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[10px] text-muted uppercase tracking-wider font-bold">{t("Trip Cost")}</h4>
                  {proposal.cost_breakdown.trip.map((line, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs font-semibold bg-card-alt p-2 rounded border border-border/30">
                      <div>
                        <span>{line.label}</span>
                        {line.km && <span className="text-[10px] text-muted block mt-0.5">{line.km} KM ({line.fuel_price} ETB/L)</span>}
                      </div>
                      <span className="font-mono">ETB {Number(line.amount).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Other Cost Lines */}
              {proposal.cost_breakdown?.other && proposal.cost_breakdown.other.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[10px] text-muted uppercase tracking-wider font-bold">{t("Other Cost")}</h4>
                  {proposal.cost_breakdown.other.map((line, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs font-semibold bg-card-alt p-2 rounded border border-border/30">
                      <span>{line.label}</span>
                      <span className="font-mono">ETB {Number(line.amount).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sticky Actions Sidebar */}
          <div className="space-y-6 sticky top-6 w-full shrink-0">

            {/* Live Financial Totals */}
            <div className="bg-card border border-border rounded-lg p-5 flex flex-col gap-4 shadow-sm">
              <h3 className="text-xs font-black text-foreground uppercase tracking-wider border-b border-border/40 pb-2 flex items-center gap-1.5">
                <HiCurrencyDollar className="w-4 h-4 text-primary" />
                {t("Live Financial Summary")}
              </h3>

              <div className="space-y-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted font-semibold text-xs uppercase tracking-wider">{t("Requested Budget")}</span>
                  <span className="font-mono font-bold text-foreground">
                    ETB {Number(proposal.requested_budget).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted font-semibold text-xs uppercase tracking-wider">{t("Total Cost")}</span>
                  <span className="font-mono font-bold text-foreground">
                    ETB {Number(proposal.estimated_total_cost).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-border/40 pt-2.5">
                  <span className="text-muted font-semibold text-xs uppercase tracking-wider">{t("Net Profit")}</span>
                  <span className={`font-mono font-black ${proposal.estimated_net_profit < 0 ? "text-danger" : "text-foreground"}`}>
                    ETB {Number(proposal.estimated_net_profit).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted font-semibold text-xs uppercase tracking-wider">{t("Margin %")}</span>
                  <span className={`font-mono font-black ${proposal.estimated_margin_percentage < 25 ? "text-warning" : "text-success"}`}>
                    {proposal.estimated_margin_percentage}%
                  </span>
                </div>
              </div>
            </div>

            {/* Workflow Actions Panel */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4 actions-panel no-print">
              <h3 className="text-xs font-black text-foreground uppercase tracking-wider border-b border-border/40 pb-2">
                {t("Actions")}
              </h3>

              <div className="flex flex-col gap-2">
                {proposal.status === "Draft" && canWrite && (
                  <button
                    onClick={() => submitMutation.mutate()}
                    className="w-full h-10 text-xs font-black uppercase tracking-wider bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 rounded-xl border border-indigo-600/20 transition-all duration-300 shadow-md shadow-indigo-600/10"
                  >
                    {t("Submit")}
                  </button>
                )}

                {proposal.status === "Submitted" && canApprove && (
                  <div className="flex flex-row gap-3">
                    <button
                      onClick={() => approveMutation.mutate()}
                      className="flex-1 h-10 text-xs font-black uppercase tracking-wider bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 rounded-xl transition-all duration-300"
                    >
                      {t("Approve")}
                    </button>
                    <button
                      onClick={() => setIsRejectOpen(true)}
                      className="flex-1 h-10 text-xs font-black uppercase tracking-wider bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-400 border border-rose-500/20 rounded-xl transition-all duration-300"
                    >
                      {t("Reject")}
                    </button>
                  </div>
                )}

                {proposal.status === "Approved" && canApprove && (
                  <button
                    onClick={() => setIsConvertOpen(true)}
                    className="w-full h-10 text-xs font-black uppercase tracking-wider bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 rounded-xl border border-indigo-600/20 flex items-center justify-center gap-1.5 transition-all duration-300 shadow-md shadow-indigo-600/10"
                  >
                    <HiCheckCircle className="w-4 h-4" />
                    {t("Convert to Event")}
                  </button>
                )}

                {(proposal.status === "Draft" || proposal.status === "Submitted" || proposal.status === "Approved") && canWrite && (
                  <button
                    onClick={() => cancelMutation.mutate()}
                    className="w-full h-10 text-xs font-bold uppercase tracking-wider bg-card-alt border border-border/50 text-muted hover:text-foreground hover:bg-border/30 rounded-xl transition-all duration-300 mt-1"
                  >
                    {t("Cancel")}
                  </button>
                )}
              </div>
            </div>

            {/* Linked Event Panel */}
            {proposal.converted_event_id && (
              <div className="bg-card border border-border rounded-xl p-5 space-y-3 no-print">
                <h3 className="text-xs font-black text-foreground uppercase tracking-wider border-b border-border/40 pb-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                  {t('Linked Event')}
                </h3>
                <p className="text-[11px] text-muted font-medium">This proposal was converted into a live event. Open the event workspace to manage it.</p>
                <Link
                  href={`/events/${proposal.converted_event_id}`}
                  className="flex items-center justify-center gap-1.5 w-full h-10 rounded-xl bg-indigo-600 text-white text-xs font-black uppercase tracking-wider hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 transition-all border border-indigo-600/20 shadow-md shadow-indigo-600/10"
                >
                  <HiArrowTopRightOnSquare className="w-4 h-4" />
                  {t('Open Event Workspace')}
                </Link>
              </div>
            )}

            {/* Audit Logs History */}
            <div className="bg-card border border-border rounded-lg p-5 space-y-3 logs-panel no-print">
              <h3 className="text-xs font-black text-foreground uppercase tracking-wider border-b border-border/40 pb-2">
                {t("Logs")}
              </h3>
              <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                {logs.length === 0 ? (
                  <span className="text-xs text-muted block py-2">No history logged</span>
                ) : (
                  logs.map((log) => (
                    <div key={log.id} className="text-xs border-b border-border/30 pb-2 last:border-0 last:pb-0 space-y-1">
                      <div className="flex items-center justify-between font-bold text-foreground">
                        <span className="uppercase text-[9px] tracking-wide text-primary">
                          {log.action.replace("proposal_", "")}
                        </span>
                        <span className="font-mono text-[9px] text-muted">
                          {log.created_at.split("T")[0]}
                        </span>
                      </div>
                      {log.note && <p className="text-[10px] text-muted-dark leading-relaxed font-semibold bg-card-alt p-1.5 rounded">{log.note}</p>}
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Reject Modal dialog */}
      {isRejectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsRejectOpen(false)} />
          <form
            ref={rejectDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reject-proposal-title"
            onSubmit={(e) => {
              e.preventDefault();
              rejectMutation.mutate(rejectReason);
            }}
            className="relative w-full max-w-md bg-card border border-border rounded-lg shadow-massive p-6 space-y-4"
          >
            <h3 id="reject-proposal-title" className="text-base font-black text-foreground uppercase tracking-wider">{t("Rejection Modal Title")}</h3>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-muted uppercase tracking-wider">{t("Rejection Reason")} *</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                required
                rows={4}
                placeholder={t("Enter reason")}
                className="p-3 rounded bg-card-alt border border-border text-sm outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setIsRejectOpen(false)}
                className="h-[44px] px-5 rounded-lg text-xs font-black uppercase tracking-wider bg-card-alt border border-border text-muted [@media(hover:hover)]:hover:text-foreground"
              >
                {t("Cancel Action")}
              </button>
              <button
                type="submit"
                className="h-[44px] px-5 rounded-lg text-xs font-black uppercase tracking-wider bg-danger text-on-danger [@media(hover:hover)]:hover:opacity-90 border border-danger/25"
              >
                {t("Reject")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Convert confirmation Modal dialog */}
      {isConvertOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsConvertOpen(false)} />
          <div
            ref={convertDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="convert-proposal-title"
            className="relative w-full max-w-md bg-card border border-border rounded-lg shadow-massive p-6 space-y-4"
          >
            <h3 id="convert-proposal-title" className="text-base font-black text-foreground uppercase tracking-wider">{t("Convert Modal Title")}</h3>
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg text-primary text-xs font-semibold flex items-start gap-2.5">
              <HiExclamationTriangle className="w-5 h-5 shrink-0" />
              <p className="leading-relaxed">
                {t("Convert Modal Details")}
              </p>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setIsConvertOpen(false)}
                className="h-[44px] px-5 rounded-lg text-xs font-black uppercase tracking-wider bg-card-alt border border-border text-muted [@media(hover:hover)]:hover:text-foreground"
              >
                {t("Cancel Action")}
              </button>
              <button
                onClick={() => convertMutation.mutate()}
                className="h-[44px] px-5 rounded-lg text-xs font-black uppercase tracking-wider bg-primary text-on-primary [@media(hover:hover)]:hover:opacity-90 border border-primary/20"
              >
                {t("Yes, Convert")}
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
