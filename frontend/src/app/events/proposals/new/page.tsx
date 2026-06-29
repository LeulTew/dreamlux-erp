"use client";
import React, { useState, useMemo, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createEventProposal, submitEventProposal, getEventTypes, createEventType, getEventProposal } from "@/lib/api";
import { notify } from "@/lib/toast";
import { EventType } from "@/lib/types";
import AuthLayout from "@/components/AuthLayout";
import ForbiddenState from "@/components/ForbiddenState";
import Select from "@/components/ui/Select";
import {
  HiArrowRight,
  HiArrowLeft,
  HiPlus,
  HiTrash,
  HiExclamationTriangle,
  HiOutlineCalendar,
  HiOutlinePhone,
  HiOutlineUser,
  HiOutlineClock,
  HiOutlineMapPin,
  HiOutlinePresentationChartBar,
  HiOutlineQuestionMarkCircle,
  HiArrowTopRightOnSquare,
  HiInboxStack
} from "react-icons/hi2";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/useAuth";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "New Proposal Intake": "New Proposal Intake",
    "Progress": "Progress",
    "Basics": "Basics",
    "Estimates": "Estimates",
    "Review": "Review",
    "Back": "Back",
    "Next": "Next",
    "Create Draft": "Create Draft",
    "Submit for Approval": "Submit for Approval",
    "Event Name": "Event Name",
    "Client Name": "Client Name",
    "Client Phone": "Client Phone",
    "Event Type": "Event Type",
    "Select Event Type": "Select Event Type",
    "Requested Budget": "Requested Budget (Revenue)",
    "Start Date": "Start Date",
    "End Date": "End Date",
    "Start Time": "Start Time",
    "End Time": "End Time",
    "Venue Location": "Venue Location",
    "Client Notes": "Client Notes / Special Requirements",
    "Design Notes": "Design Package Notes",
    "Cost Estimator": "Cost Estimator",
    "Design Estimate": "Design Estimate",
    "Team & Labor Estimate": "Team & Labor Estimate",
    "Trip & Fuel Estimate": "Trip & Fuel Estimate",
    "Other Expenses": "Other Expenses",
    "Label": "Label",
    "Amount": "Amount",
    "Notes": "Notes",
    "People Count": "People Count",
    "Commission": "Commission per Person",
    "KM": "Distance (KM)",
    "Fuel Price": "Fuel Price",
    "Add Row": "Add Row",
    "Live Financial Summary": "Live Financial Summary",
    "Revenue": "Revenue",
    "Estimated Cost": "Estimated Cost",
    "Net Profit": "Net Profit",
    "Margin": "Margin",
    "Margin Risk Warning": "Margin Risk Warning",
    "Low margin alert. Margin is below the 25% target or profit is negative. Please review estimates.": "Low margin alert. Margin is below the 25% target or profit is negative. Please review estimates.",
    "Draft Success": "Draft saved successfully",
    "Submit Success": "Proposal submitted successfully",
    "Review Details": "Review Details",
    "Review Description": "Please verify all details and calculations before committing or submitting for approval.",
    "phone_validation_error": "Invalid Ethiopian phone number. Use +251... or 09.../07...",
    "Event Details": "Event Details",
    "Location & Notes": "Location & Notes",
    "Need help?": "Need help?",
    "Make sure to fill all required fields to get accurate estimates.": "Make sure to fill all required fields to get accurate estimates.",
    "View Guidelines": "View Guidelines",
    "Form Progress": "Form Progress",
    "Complete basic information": "Complete basic information",
    "Complete estimates": "Complete estimates",
    "Review & submit": "Review & submit",
    "Add Event Type": "Add Event Type",
    "Event Type Name": "Event Type Name",
    "Description": "Description",
    "Save": "Save",
    "New Proposal Subtitle": "Fill in all 3 steps to create a proposal"
  },
  am: {
    "New Proposal Intake": "አዲስ ፕሮፖዛል ማስገቢያ",
    "Progress": "ሂደት",
    "Basics": "መሰረታዊያን",
    "Estimates": "ግምቶች",
    "Review": "ክለሳ",
    "Back": "ተመለስ",
    "Next": "ቀጥል",
    "Create Draft": "ረቂቅ አስቀምጥ",
    "Submit for Approval": "ለማጽደቅ አቅርብ",
    "Event Name": "የዝግጅት ስም",
    "Client Name": "የደንበኛ ስም",
    "Client Phone": "የደንበኛ ስልክ",
    "Event Type": "የዝግጅት አይነት",
    "Select Event Type": "የዝግጅት አይነት ምረጥ",
    "Requested Budget": "የተጠየቀ በጀት (ገቢ)",
    "Start Date": "የመጀመሪያ ቀን",
    "End Date": "የማብቂያ ቀን",
    "Start Time": "የመጀመሪያ ሰዓት",
    "End Time": "የማብቂያ ሰዓት",
    "Venue Location": "የቦታ አድራሻ",
    "Client Notes": "የደንበኛ ማስታወሻዎች / ልዩ ፍላጎቶች",
    "Design Notes": "የዲዛይን ጥቅል ማስታወሻዎች",
    "Cost Estimator": "የወጪ መገመቻ",
    "Design Estimate": "የዲዛይን ግምት",
    "Team & Labor Estimate": "የሰራተኛ እና ጉልበት ግምት",
    "Trip & Fuel Estimate": "የጉዞ እና ነዳጅ ግምት",
    "Other Expenses": "ሌሎች ወጪዎች",
    "Label": "መለያ",
    "Amount": "መጠን",
    "Notes": "ማስታወሻ",
    "People Count": "የሰው ብዛት",
    "Commission": "ኮሚሽን በሰው",
    "KM": "ርቀት (KM)",
    "Fuel Price": "የነዳጅ ዋጋ",
    "Add Row": "ረድፍ አክል",
    "Live Financial Summary": "የቀጥታ የፋይናንስ ማጠቃለያ",
    "Revenue": "ገቢ",
    "Estimated Cost": "የተገመተ ወጪ",
    "Net Profit": "የተጣራ ትርፍ",
    "Margin": "ህዳግ",
    "Margin Risk Warning": "የህዳግ ስጋት ማስጠንቀቂያ",
    "Low margin alert. Margin is below the 25% target or profit is negative. Please review estimates.": "አነስተኛ የህዳግ ማስጠንቀቂያ። ህዳጉ ከታለመው 25% በታች ነው ወይም ትርፉ አነስተኛ ነው። እባክዎን ግምቶችን ይከልሱ።",
    "Draft Success": "ረቂቁ በተሳካ ሁኔታ ተቀምጧል",
    "Submit Success": "ፕሮፖዛሉ በተሳካ ሁኔታ ቀርቧል",
    "Review Details": "ዝርዝሩን ይከልሱ",
    "Review Description": "እባክዎን ከማስገባትዎ ወይም ለማጽደቅ ከማቅረብዎ በፊት ሁሉንም ዝርዝሮች እና ስሌቶች ያረጋግጡ።",
    "phone_validation_error": "ትክክለኛ የኢትዮጵያ ስልክ ቁጥር አይደለም። በ +251... ወይም 09.../07... ይጠቀሙ",
    "Event Details": "የዝግጅት ዝርዝሮች",
    "Location & Notes": "ቦታ እና ማስታወሻዎች",
    "Need help?": "እርዳታ ይፈልጋሉ?",
    "Make sure to fill all required fields to get accurate estimates.": "ትክክለኛ ግምቶችን ለማግኘት እባክዎን ሁሉንም አስፈላጊ መስኮች ይሙሉ",
    "View Guidelines": "መመሪያዎችን ይመልከቱ",
    "Form Progress": "የቅጽ ሂደት",
    "Complete basic information": "መሰረታዊ መረጃዎችን ይሙሉ",
    "Complete estimates": "ግምቶችን ያጠናቅቁ",
    "Review & submit": "ይከልሱ እና ያስገቡ",
    "Add Event Type": "አዲስ የዝግጅት አይነት",
    "Event Type Name": "የዝግጅት አይነት ስም",
    "Description": "መግለጫ",
    "Save": "አስቀምጥ",
    "New Proposal Subtitle": "ሁሉም 3 ደረጃዎችን ሙሉ ፕሮፖዛሉን ለመፍጠር"
  }
};

interface EstimateLine {
  label: string;
  amount: number;
  notes: string;
  people_count?: number;
  commission_per_person?: number;
  km?: number;
  fuel_price?: number;
}

export default function NewProposalPage() {
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const router = useRouter();
  const { hasAnyPermission, isAuthenticated, isLoading: authLoading } = useAuth();

  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [errorMsg, setErrorMsg] = useState("");

  // Add Event Type Modal state
  const [showAddEventType, setShowAddEventType] = useState(false);
  const [newEventTypeName, setNewEventTypeName] = useState("");
  const [newEventTypeDesc, setNewEventTypeDesc] = useState("");

  const addEventTypeModalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showAddEventType) return;
    const focusableElements = addEventTypeModalRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusableElements && focusableElements.length > 0) {
      (focusableElements[0] as HTMLElement).focus();
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowAddEventType(false);
        return;
      }
      if (e.key === "Tab") {
        if (!focusableElements || focusableElements.length === 0) return;
        const firstEl = focusableElements[0] as HTMLElement;
        const lastEl = focusableElements[focusableElements.length - 1] as HTMLElement;
        if (e.shiftKey) {
          if (document.activeElement === firstEl) {
            lastEl.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastEl) {
            firstEl.focus();
            e.preventDefault();
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showAddEventType]);

  // Step 1: Basics Form State
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [eventTypeId, setEventTypeId] = useState("");
  const [requestedBudget, setRequestedBudget] = useState<number>(0);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [venueLocation, setVenueLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [designNotes, setDesignNotes] = useState("");

  // Step 2: Estimates Form State
  const [designLines, setDesignLines] = useState<EstimateLine[]>([]);
  const [teamLines, setTeamLines] = useState<EstimateLine[]>([]);
  const [tripLines, setTripLines] = useState<EstimateLine[]>([]);
  const [otherLines, setOtherLines] = useState<EstimateLine[]>([]);

  const searchParams = useSearchParams();
  const cloneFromId = searchParams.get("clone_from_id");

  useEffect(() => {
    if (!cloneFromId) return;

    const formatDateForInput = (d?: string | Date) => {
      if (!d) return "";
      const date = new Date(d);
      if (isNaN(date.getTime())) return "";
      return date.toISOString().split("T")[0];
    };

    const formatTimeForInput = (t?: string) => {
      if (!t) return "";
      return t.slice(0, 5); // HH:MM
    };

    getEventProposal(cloneFromId)
      .then((proposal) => {
        setName(proposal.name + " (Copy)");
        setClientName(proposal.client_name);
        setClientPhone(proposal.client_phone || "");
        setEventTypeId(proposal.event_type_id || "");
        setRequestedBudget(proposal.requested_budget);
        setStartDate(formatDateForInput(proposal.start_date));
        setEndDate(formatDateForInput(proposal.end_date));
        setStartTime(formatTimeForInput(proposal.start_time));
        setEndTime(formatTimeForInput(proposal.end_time));
        setVenueLocation(proposal.venue_location || "");
        setNotes(proposal.notes || "");
        setDesignNotes(proposal.design_notes || "");

        // Set estimate lines
        setDesignLines(proposal.design_estimate || []);
        setTeamLines(proposal.team_estimate || []);
        setTripLines(proposal.trip_estimate || []);
        setOtherLines(proposal.other_estimate || []);

        notify.success("Duplicated Mode", "Proposal data pre-filled! Please edit or submit.");
      })
      .catch(() => {
        notify.error("Error", "Failed to retrieve source proposal to duplicate");
      });
  }, [cloneFromId]);

  // Fetch event types for dropdown
  const { data: eventTypesData } = useQuery<EventType[]>({
    queryKey: ["event-types"],
    queryFn: getEventTypes,
    enabled: isAuthenticated && hasAnyPermission(["events:proposals:write", "events:write"]),
  });

  const eventTypes = eventTypesData || [];

  // Live financial calculations matching backend logic
  const financials = useMemo(() => {
    const sumLineAmount = (lines: EstimateLine[]) => lines.reduce((sum, l) => sum + Number(l.amount || 0), 0);

    const designCost = sumLineAmount(designLines);
    const teamCost = teamLines.reduce((sum, l) => {
      const explicit = Number(l.amount || 0);
      const derived = Number(l.people_count || 1) * Number(l.commission_per_person || 0);
      return sum + Math.max(explicit, derived);
    }, 0);
    const tripCost = sumLineAmount(tripLines);
    const otherCost = sumLineAmount(otherLines);

    const totalCost = designCost + teamCost + tripCost + otherCost;
    const netProfit = requestedBudget - totalCost;
    const margin = requestedBudget > 0 ? Number(((netProfit / requestedBudget) * 100).toFixed(2)) : 0;

    return {
      designCost,
      teamCost,
      tripCost,
      otherCost,
      totalCost,
      netProfit,
      margin
    };
  }, [requestedBudget, designLines, teamLines, tripLines, otherLines]);

  const hasMarginRisk = financials.margin < 25 || financials.netProfit < 0;

  // Phone validation
  const validatePhone = (phoneStr: string) => {
    if (!phoneStr) return true;
    const ethioRegex = /^(?:\+251|0)[79]\d{8}$/;
    return ethioRegex.test(phoneStr.replace(/\s+/g, ""));
  };

  const handleNextStep = () => {
    setErrorMsg("");
    if (step === 1) {
      if (!name || !clientName || !venueLocation || requestedBudget <= 0) {
        setErrorMsg("Please fill in all required basic fields.");
        return;
      }
      if (clientPhone && !validatePhone(clientPhone)) {
        setErrorMsg(t("phone_validation_error"));
        return;
      }
      if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
        setErrorMsg("End date must be on or after start date.");
        return;
      }
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  };

  const createProposalMutation = useMutation({
    mutationFn: createEventProposal,
    onSuccess: (data) => {
      router.push(`/events/proposals/${data.proposal.id}`);
    },
    onError: (err: { response?: { data?: { error?: string } }; message?: string }) => {
      setErrorMsg(err.response?.data?.error || err.message || "Failed to save draft");
    }
  });

  const handleSaveDraft = () => {
    createProposalMutation.mutate({
      name,
      client_name: clientName,
      client_phone: clientPhone || null,
      event_type_id: eventTypeId || null,
      requested_budget: requestedBudget,
      requested_start_date: startDate || null,
      requested_end_date: endDate || null,
      requested_start_time: startTime || null,
      requested_end_time: endTime || null,
      venue_location: venueLocation || null,
      notes: notes || null,
      package_design_notes: designNotes || null,
      cost_breakdown: {
        design: designLines,
        team: teamLines,
        trip: tripLines,
        other: otherLines
      }
    });
  };

  const handleSubmitForApproval = async () => {
    setErrorMsg("");
    try {
      const res = await createEventProposal({
        name,
        client_name: clientName,
        client_phone: clientPhone || null,
        event_type_id: eventTypeId || null,
        requested_budget: requestedBudget,
        requested_start_date: startDate || null,
        requested_end_date: endDate || null,
        requested_start_time: startTime || null,
        requested_end_time: endTime || null,
        venue_location: venueLocation || null,
        notes: notes || null,
        package_design_notes: designNotes || null,
        cost_breakdown: {
          design: designLines,
          team: teamLines,
          trip: tripLines,
          other: otherLines
        }
      });
      await submitEventProposal(res.proposal.id);
      router.push(`/events/proposals/${res.proposal.id}`);
    } catch (err: unknown) {
      console.error(err);
      const error = err as { response?: { data?: { error?: string } }; message?: string };
      setErrorMsg(error.response?.data?.error || error.message || "Failed to submit proposal");
    }
  };

  const addLine = (category: "design" | "team" | "trip" | "other") => {
    const newLine = { label: "", amount: 0, notes: "" };
    if (category === "design") setDesignLines([...designLines, newLine]);
    if (category === "team") setTeamLines([...teamLines, { ...newLine, people_count: 1, commission_per_person: 0 }]);
    if (category === "trip") setTripLines([...tripLines, { ...newLine, km: 0, fuel_price: 80 }]);
    if (category === "other") setOtherLines([...otherLines, newLine]);
  };

  const updateLine = (category: "design" | "team" | "trip" | "other", idx: number, key: string, val: string | number) => {
    const mapLine = (lines: EstimateLine[]) => lines.map((line, i) => i === idx ? { ...line, [key]: val } : line);
    if (category === "design") setDesignLines(mapLine(designLines));
    if (category === "team") setTeamLines(mapLine(teamLines));
    if (category === "trip") setTripLines(mapLine(tripLines));
    if (category === "other") setOtherLines(mapLine(otherLines));
  };

  const removeLine = (category: "design" | "team" | "trip" | "other", idx: number) => {
    const filterLine = (lines: EstimateLine[]) => lines.filter((_, i) => i !== idx);
    if (category === "design") setDesignLines(filterLine(designLines));
    if (category === "team") setTeamLines(filterLine(teamLines));
    if (category === "trip") setTripLines(filterLine(tripLines));
    if (category === "other") setOtherLines(filterLine(otherLines));
  };

  const canCreateProposals = hasAnyPermission(["events:proposals:write", "events:write"]);

  return (
    <AuthLayout>
      {authLoading ? (
        <div className="page-container pt-4 pb-20 md:py-8 px-4 sm:px-6 md:px-8">
          <div className="h-48 animate-pulse rounded-lg border border-border bg-card" />
        </div>
      ) : !isAuthenticated || !canCreateProposals ? (
        <ForbiddenState
          description="You need event proposal write permissions to create proposals."
        />
      ) : (
        <>
        <div className="page-container pt-4 pb-20 md:py-8 px-4 sm:px-6 md:px-8">
        <header className="mb-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 border-b border-border/50 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-500 border border-indigo-500/20 shrink-0">
              <HiInboxStack className="w-6 h-6 md:w-7 md:h-7" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-black text-foreground tracking-tight break-words">
                {t("New Proposal Intake")}
              </h1>
              <p className="text-xs text-muted font-medium mt-0.5 break-words">{t("New Proposal Subtitle")}</p>
            </div>
          </div>

          {/* Stepper progress tracker */}
          <div className="flex items-center justify-center select-none w-full lg:w-auto max-w-md px-2">
            {/* Step 1 */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                step >= 1 ? "bg-primary text-on-primary font-bold shadow-md" : "bg-card-alt border border-border text-muted"
              }`}>
                1
              </div>
              <span className={`text-xs font-black uppercase tracking-wider hidden sm:inline ${step >= 1 ? "text-primary" : "text-muted"}`}>
                {t("Basics")}
              </span>
            </div>

            {/* Line 1 -> 2 */}
            <div className="flex-grow mx-2 sm:mx-4 h-0.5 bg-border relative min-w-[20px] sm:min-w-[40px]">
              <div className={`absolute top-0 left-0 h-full bg-primary transition-all duration-300 ${
                step > 1 ? "w-full" : step === 1 ? "w-1/2" : "w-0"
              }`} />
            </div>

            {/* Step 2 */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                step >= 2 ? "bg-primary text-on-primary font-bold shadow-md" : "bg-card-alt border border-border text-muted"
              }`}>
                2
              </div>
              <span className={`text-xs font-black uppercase tracking-wider hidden sm:inline ${step >= 2 ? "text-primary" : "text-muted"}`}>
                {t("Estimates")}
              </span>
            </div>

            {/* Line 2 -> 3 */}
            <div className="flex-grow mx-2 sm:mx-4 h-0.5 bg-border relative min-w-[20px] sm:min-w-[40px]">
              <div className={`absolute top-0 left-0 h-full bg-primary transition-all duration-300 ${
                step > 2 ? "w-full" : step === 2 ? "w-1/2" : "w-0"
              }`} />
            </div>

            {/* Step 3 */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                step >= 3 ? "bg-primary text-on-primary font-bold shadow-md" : "bg-card-alt border border-border text-muted"
              }`}>
                3
              </div>
              <span className={`text-xs font-black uppercase tracking-wider hidden sm:inline ${step >= 3 ? "text-primary" : "text-muted"}`}>
                {t("Review")}
              </span>
            </div>
          </div>
        </header>

        {errorMsg && (
          <div className="mb-4 p-4 bg-danger/10 border border-danger/20 rounded-lg text-danger text-sm font-semibold flex items-center gap-2">
            <HiExclamationTriangle className="w-5 h-5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Main Form Fields */}
          <div className="flex-1 w-full bg-card border border-border rounded-lg p-5 sm:p-6 space-y-6">
            {step === 1 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Event Details Section Header */}
                <div className="flex items-center gap-2 pb-2.5 border-b border-border/50 col-span-1 sm:col-span-2 mb-2">
                  <HiOutlineCalendar className="w-5 h-5 text-primary" />
                  <h3 className="text-sm font-black text-foreground uppercase tracking-wider">{t("Event Details")}</h3>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-muted uppercase tracking-wider">{t("Event Name")} *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Annual Charity Gala"
                    required
                    className="px-3.5 h-[44px] rounded-lg bg-card-alt border border-border text-sm outline-none focus:ring-1 focus:ring-primary/30"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-muted uppercase tracking-wider">{t("Client Phone")}</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      placeholder="e.g. +1 (123) 456-7890"
                      className="w-full pl-10 pr-3.5 h-[44px] rounded-lg bg-card-alt border border-border text-sm outline-none focus:ring-1 focus:ring-primary/30"
                    />
                    <HiOutlinePhone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted" />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-muted uppercase tracking-wider">{t("Client Name")} *</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="e.g. Acme Corporation"
                      required
                      className="w-full pl-10 pr-3.5 h-[44px] rounded-lg bg-card-alt border border-border text-sm outline-none focus:ring-1 focus:ring-primary/30"
                    />
                    <HiOutlineUser className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted" />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-muted uppercase tracking-wider">{t("Requested Budget")} *</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={requestedBudget || ""}
                      onChange={(e) => setRequestedBudget(Number(e.target.value))}
                      placeholder="0.00"
                      required
                      className="w-full pl-3.5 pr-16 h-[44px] rounded-lg bg-card-alt border border-border text-sm outline-none focus:ring-1 focus:ring-primary/30 font-mono font-bold"
                    />
                    <div className="absolute right-0 top-0 bottom-0 px-3 bg-card-alt border-l border-border/80 flex items-center justify-center text-xs font-black text-muted uppercase tracking-wider select-none rounded-r-lg">
                      ETB
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-muted uppercase tracking-wider">{t("Event Type")} *</label>
                  <Select
                    options={eventTypes.map((type) => ({ id: type.id, label: type.event_name }))}
                    value={eventTypeId}
                    onChange={setEventTypeId}
                    placeholder={t("Select Event Type")}
                    onAdd={() => setShowAddEventType(true)}
                    addLabel={t("+ Add Event Type")}
                  />
                </div>

                {/* Empty block to align grid */}
                <div className="hidden sm:block" />

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-muted uppercase tracking-wider">{t("Start Date")}</label>
                  <div className="relative">
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full pl-3.5 pr-10 h-[44px] rounded-lg bg-card-alt border border-border text-sm outline-none focus:ring-1 focus:ring-primary/30 font-mono font-bold"
                    />
                    <HiOutlineCalendar className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted pointer-events-none" />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-muted uppercase tracking-wider">{t("End Date")}</label>
                  <div className="relative">
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full pl-3.5 pr-10 h-[44px] rounded-lg bg-card-alt border border-border text-sm outline-none focus:ring-1 focus:ring-primary/30 font-mono font-bold"
                    />
                    <HiOutlineCalendar className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted pointer-events-none" />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-muted uppercase tracking-wider">{t("Start Time")}</label>
                  <div className="relative">
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full pl-3.5 pr-10 h-[44px] rounded-lg bg-card-alt border border-border text-sm outline-none focus:ring-1 focus:ring-primary/30 font-mono font-bold"
                    />
                    <HiOutlineClock className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted pointer-events-none" />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-muted uppercase tracking-wider">{t("End Time")}</label>
                  <div className="relative">
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full pl-3.5 pr-10 h-[44px] rounded-lg bg-card-alt border border-border text-sm outline-none focus:ring-1 focus:ring-primary/30 font-mono font-bold"
                    />
                    <HiOutlineClock className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted pointer-events-none" />
                  </div>
                </div>

                {/* Location & Notes Section Header */}
                <div className="flex items-center gap-2 pb-2.5 border-b border-border/50 col-span-1 sm:col-span-2 mt-4 mb-2">
                  <HiOutlineMapPin className="w-5 h-5 text-primary" />
                  <h3 className="text-sm font-black text-foreground uppercase tracking-wider">{t("Location & Notes")}</h3>
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label className="text-xs font-bold text-muted uppercase tracking-wider">{t("Venue Location")} *</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={venueLocation}
                      onChange={(e) => setVenueLocation(e.target.value)}
                      placeholder="e.g. Grand Hyatt, Addis Ababa"
                      required
                      className="w-full pl-3.5 pr-10 h-[44px] rounded-lg bg-card-alt border border-border text-sm outline-none focus:ring-1 focus:ring-primary/30"
                    />
                    <HiOutlineMapPin className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted pointer-events-none" />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label className="text-xs font-bold text-muted uppercase tracking-wider">{t("Client Notes")}</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add any special requests, requirements, or important notes..."
                    rows={3}
                    className="p-3.5 rounded-lg bg-card-alt border border-border text-sm outline-none focus:ring-1 focus:ring-primary/30"
                  />
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label className="text-xs font-bold text-muted uppercase tracking-wider">{t("Design Notes")}</label>
                  <textarea
                    value={designNotes}
                    onChange={(e) => setDesignNotes(e.target.value)}
                    placeholder="Add design direction, theme ideas, or package details..."
                    rows={3}
                    className="p-3.5 rounded-lg bg-card-alt border border-border text-sm outline-none focus:ring-1 focus:ring-primary/30"
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <h3 className="text-sm font-black text-foreground uppercase tracking-wider border-b border-border/50 pb-2">
                  {t("Cost Estimator")}
                </h3>

                {/* Design Section */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-black uppercase text-primary tracking-wider">{t("Design Estimate")}</h4>
                    <button onClick={() => addLine("design")} className="text-xs font-bold text-primary flex items-center gap-1">
                      <HiPlus className="w-3.5 h-3.5" /> {t("Add Row")}
                    </button>
                  </div>
                  {designLines.map((line, idx) => (
                    <div key={idx} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-card-alt p-3 rounded-lg border border-border/60">
                      <input
                        type="text"
                        placeholder={t("Label")}
                        value={line.label}
                        onChange={(e) => updateLine("design", idx, "label", e.target.value)}
                        className="px-3 py-1.5 text-xs rounded bg-card border border-border"
                      />
                      <input
                        type="number"
                        placeholder={t("Amount")}
                        value={line.amount || ""}
                        onChange={(e) => updateLine("design", idx, "amount", Number(e.target.value))}
                        className="px-3 py-1.5 text-xs rounded bg-card border border-border font-mono"
                      />
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder={t("Notes")}
                          value={line.notes}
                          onChange={(e) => updateLine("design", idx, "notes", e.target.value)}
                          className="flex-1 px-3 py-1.5 text-xs rounded bg-card border border-border"
                        />
                        <button onClick={() => removeLine("design", idx)} className="p-1.5 bg-danger/10 text-danger rounded [@media(hover:hover)]:hover:bg-danger [@media(hover:hover)]:hover:text-on-danger shrink-0">
                          <HiTrash className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Team Section */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-black uppercase text-primary tracking-wider">{t("Team & Labor Estimate")}</h4>
                    <button onClick={() => addLine("team")} className="text-xs font-bold text-primary flex items-center gap-1">
                      <HiPlus className="w-3.5 h-3.5" /> {t("Add Row")}
                    </button>
                  </div>
                  {teamLines.map((line, idx) => (
                    <div key={idx} className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 bg-card-alt p-3 rounded-lg border border-border/60">
                      <input
                        type="text"
                        placeholder={t("Label")}
                        value={line.label}
                        onChange={(e) => updateLine("team", idx, "label", e.target.value)}
                        className="px-3 py-1.5 text-xs rounded bg-card border border-border col-span-1 sm:col-span-2"
                      />
                      <input
                        type="number"
                        placeholder={t("People Count")}
                        value={line.people_count || ""}
                        onChange={(e) => updateLine("team", idx, "people_count", Number(e.target.value))}
                        className="px-3 py-1.5 text-xs rounded bg-card border border-border font-mono"
                      />
                      <input
                        type="number"
                        placeholder={t("Commission")}
                        value={line.commission_per_person || ""}
                        onChange={(e) => updateLine("team", idx, "commission_per_person", Number(e.target.value))}
                        className="px-3 py-1.5 text-xs rounded bg-card border border-border font-mono"
                      />
                      <div className="flex gap-2 col-span-1">
                        <input
                          type="number"
                          placeholder={t("Amount")}
                          value={line.amount || ""}
                          onChange={(e) => updateLine("team", idx, "amount", Number(e.target.value))}
                          className="flex-1 px-3 py-1.5 text-xs rounded bg-card border border-border font-mono"
                        />
                        <button onClick={() => removeLine("team", idx)} className="p-1.5 bg-danger/10 text-danger rounded [@media(hover:hover)]:hover:bg-danger [@media(hover:hover)]:hover:text-on-danger shrink-0">
                          <HiTrash className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Trip Section */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-black uppercase text-primary tracking-wider">{t("Trip & Fuel Estimate")}</h4>
                    <button onClick={() => addLine("trip")} className="text-xs font-bold text-primary flex items-center gap-1">
                      <HiPlus className="w-3.5 h-3.5" /> {t("Add Row")}
                    </button>
                  </div>
                  {tripLines.map((line, idx) => (
                    <div key={idx} className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 bg-card-alt p-3 rounded-lg border border-border/60">
                      <input
                        type="text"
                        placeholder={t("Label")}
                        value={line.label}
                        onChange={(e) => updateLine("trip", idx, "label", e.target.value)}
                        className="px-3 py-1.5 text-xs rounded bg-card border border-border"
                      />
                      <input
                        type="number"
                        placeholder={t("KM")}
                        value={line.km || ""}
                        onChange={(e) => updateLine("trip", idx, "km", Number(e.target.value))}
                        className="px-3 py-1.5 text-xs rounded bg-card border border-border font-mono"
                      />
                      <input
                        type="number"
                        placeholder={t("Fuel Price")}
                        value={line.fuel_price || ""}
                        onChange={(e) => updateLine("trip", idx, "fuel_price", Number(e.target.value))}
                        className="px-3 py-1.5 text-xs rounded bg-card border border-border font-mono"
                      />
                      <div className="flex gap-2">
                        <input
                          type="number"
                          placeholder={t("Amount")}
                          value={line.amount || ""}
                          onChange={(e) => updateLine("trip", idx, "amount", Number(e.target.value))}
                          className="flex-1 px-3 py-1.5 text-xs rounded bg-card border border-border font-mono"
                        />
                        <button onClick={() => removeLine("trip", idx)} className="p-1.5 bg-danger/10 text-danger rounded [@media(hover:hover)]:hover:bg-danger [@media(hover:hover)]:hover:text-on-danger shrink-0">
                          <HiTrash className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Other Section */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-black uppercase text-primary tracking-wider">{t("Other Expenses")}</h4>
                    <button onClick={() => addLine("other")} className="text-xs font-bold text-primary flex items-center gap-1">
                      <HiPlus className="w-3.5 h-3.5" /> {t("Add Row")}
                    </button>
                  </div>
                  {otherLines.map((line, idx) => (
                    <div key={idx} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-card-alt p-3 rounded-lg border border-border/60">
                      <input
                        type="text"
                        placeholder={t("Label")}
                        value={line.label}
                        onChange={(e) => updateLine("other", idx, "label", e.target.value)}
                        className="px-3 py-1.5 text-xs rounded bg-card border border-border"
                      />
                      <input
                        type="number"
                        placeholder={t("Amount")}
                        value={line.amount || ""}
                        onChange={(e) => updateLine("other", idx, "amount", Number(e.target.value))}
                        className="px-3 py-1.5 text-xs rounded bg-card border border-border font-mono"
                      />
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder={t("Notes")}
                          value={line.notes}
                          onChange={(e) => updateLine("other", idx, "notes", e.target.value)}
                          className="flex-1 px-3 py-1.5 text-xs rounded bg-card border border-border"
                        />
                        <button onClick={() => removeLine("other", idx)} className="p-1.5 bg-danger/10 text-danger rounded [@media(hover:hover)]:hover:bg-danger [@media(hover:hover)]:hover:text-on-danger shrink-0">
                          <HiTrash className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-black text-foreground uppercase tracking-wider">{t("Review Details")}</h3>
                  <p className="text-xs text-muted font-semibold mt-1">{t("Review Description")}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-border/40 pt-4 text-xs font-semibold text-foreground">
                  <div>
                    <span className="text-[10px] text-muted block uppercase tracking-wider font-bold">{t("Event Name")}</span>
                    <span>{name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted block uppercase tracking-wider font-bold">{t("Client Name")}</span>
                    <span>{clientName}</span>
                  </div>
                  {clientPhone && (
                    <div>
                      <span className="text-[10px] text-muted block uppercase tracking-wider font-bold">{t("Client Phone")}</span>
                      <span className="font-mono">{clientPhone}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-[10px] text-muted block uppercase tracking-wider font-bold">{t("Venue Location")}</span>
                    <span>{venueLocation}</span>
                  </div>
                  {startDate && (
                    <div>
                      <span className="text-[10px] text-muted block uppercase tracking-wider font-bold">{t("Start Date")}</span>
                      <span className="font-mono">{startDate} {startTime}</span>
                    </div>
                  )}
                  {endDate && (
                    <div>
                      <span className="text-[10px] text-muted block uppercase tracking-wider font-bold">{t("End Date")}</span>
                      <span className="font-mono">{endDate} {endTime}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step Controls */}
            <div className="flex items-center justify-between border-t border-border/40 pt-5 mt-6">
              {step > 1 ? (
                <button
                  onClick={() => setStep(step - 1)}
                  className="flex items-center gap-1.5 h-[44px] px-5 rounded-xl text-xs font-black uppercase tracking-wider bg-card-alt border border-border text-muted [@media(hover:hover)]:hover:text-foreground transition-all active:scale-[0.98]"
                >
                  <HiArrowLeft className="w-4 h-4" />
                  {t("Back")}
                </button>
              ) : (
                <button
                  onClick={() => router.push("/events/proposals")}
                  className="h-[44px] px-5 rounded-xl text-xs font-black uppercase tracking-wider bg-card-alt border border-border text-muted [@media(hover:hover)]:hover:text-foreground transition-all active:scale-[0.98]"
                >
                  {t("Cancel")}
                </button>
              )}

              {step < 3 ? (
                <button
                  onClick={handleNextStep}
                  className="flex items-center gap-1.5 h-[44px] px-5 rounded-xl text-xs font-black uppercase tracking-wider bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 border border-indigo-600/20 shadow-md shadow-indigo-600/10 transition-all active:scale-[0.98]"
                >
                  {t("Next")}
                  <HiArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveDraft}
                    disabled={createProposalMutation.isPending}
                    className="h-[44px] px-5 rounded-xl text-xs font-black uppercase tracking-wider bg-card border border-border text-foreground [@media(hover:hover)]:hover:bg-card-alt transition-all active:scale-[0.98] cursor-pointer"
                  >
                    {t("Create Draft")}
                  </button>
                  <button
                    onClick={handleSubmitForApproval}
                    className="h-[44px] px-5 rounded-xl text-xs font-black uppercase tracking-wider bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 border border-indigo-600/20 shadow-md shadow-indigo-600/10 transition-all active:scale-[0.98] cursor-pointer"
                  >
                    {t("Submit for Approval")}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Sticky Live Financial Summary Card */}
          <div className="hidden md:block w-full lg:w-80 shrink-0 space-y-4 lg:sticky lg:top-6">
            <div className="bg-card border border-border rounded-lg p-5 flex flex-col gap-4 shadow-sm">
              <h3 className="text-xs font-black text-foreground uppercase tracking-wider border-b border-border/40 pb-2 flex items-center gap-1.5">
                <HiOutlinePresentationChartBar className="w-4 h-4 text-primary" />
                {t("Live Financial Summary")}
              </h3>

              <div className="space-y-3.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted font-semibold text-xs uppercase tracking-wider">{t("Revenue")}</span>
                  <span className="font-mono font-bold text-foreground">
                    ETB {requestedBudget.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted font-semibold text-xs uppercase tracking-wider">{t("Estimated Cost")}</span>
                  <span className="font-mono font-bold text-foreground">
                    ETB {financials.totalCost.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-border/40 pt-3">
                  <span className="text-muted font-semibold text-xs uppercase tracking-wider">{t("Net Profit")}</span>
                  <span className={`font-mono font-black ${financials.netProfit < 0 ? "text-danger" : "text-foreground"}`}>
                    ETB {financials.netProfit.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted font-semibold text-xs uppercase tracking-wider">{t("Margin")}</span>
                  <span className={`font-mono font-black ${
                    financials.netProfit < 0 || financials.margin < 10
                      ? "text-danger"
                      : financials.margin < 25
                        ? "text-warning"
                        : "text-success"
                  }`}>
                    {financials.margin}%
                  </span>
                </div>
              </div>
            </div>

            {hasMarginRisk && (
              <div className="bg-danger/5 border border-danger/20 rounded-lg p-4 text-danger flex items-start gap-2.5 shadow-sm animate-pulse-subtle">
                <HiExclamationTriangle className="w-5 h-5 shrink-0 text-danger" />
                <div className="space-y-1">
                  <span className="text-xs font-black uppercase tracking-wider block">{t("Margin Risk Warning")}</span>
                  <p className="text-[11px] font-semibold leading-relaxed">
                    {t("Low margin alert. Margin is below the 25% target or profit is negative. Please review estimates.")}
                  </p>
                </div>
              </div>
            )}

            {/* Need Help Card */}
            <div className="bg-card border border-border rounded-lg p-5 flex flex-col gap-3 shadow-sm">
              <h3 className="text-xs font-black text-foreground uppercase tracking-wider border-b border-border/40 pb-2 flex items-center gap-1.5">
                <HiOutlineQuestionMarkCircle className="w-4 h-4 text-primary" />
                {t("Need help?")}
              </h3>
              <p className="text-xs text-muted font-semibold leading-relaxed">
                {t("Make sure to fill all required fields to get accurate estimates.")}
              </p>
              <button
                type="button"
                onClick={() => window.open("/docs/guidelines", "_blank")}
                className="w-full h-10 mt-1.5 flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card-alt text-xs font-black uppercase tracking-wider text-muted [@media(hover:hover)]:hover:text-foreground [@media(hover:hover)]:hover:bg-border/30 transition-all cursor-pointer active:scale-95"
              >
                <span>{t("View Guidelines")}</span>
                <HiArrowTopRightOnSquare className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Form Progress Card */}
            <div className="bg-card border border-border rounded-lg p-5 flex flex-col gap-4 shadow-sm">
              <h3 className="text-xs font-black text-foreground uppercase tracking-wider border-b border-border/40 pb-2">
                {t("Form Progress")}
              </h3>
              <div className="flex items-center gap-4">
                <div className="relative w-12 h-12 flex items-center justify-center shrink-0">
                  <svg className="w-12 h-12 transform -rotate-90">
                    <circle cx="24" cy="24" r="16" stroke="currentColor" className="text-muted/10" strokeWidth="3.5" fill="transparent" />
                    <circle cx="24" cy="24" r="16" stroke="currentColor" className="text-primary" strokeWidth="3.5" fill="transparent"
                      strokeDasharray={2 * Math.PI * 16}
                      strokeDashoffset={(2 * Math.PI * 16) - ((step === 1 ? 20 : step === 2 ? 60 : 100) / 100) * (2 * Math.PI * 16)}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute text-[10px] font-black text-foreground font-mono">
                    {step === 1 ? 20 : step === 2 ? 60 : 100}%
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-foreground leading-tight">
                    {step === 1 ? t("Complete basic information") : step === 2 ? t("Complete estimates") : t("Review & submit")}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Dense Fixed Bottom Strip for Mobile (<768px) */}
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border/80 px-4 py-2.5 shadow-lg flex items-center justify-between text-xs font-semibold">
            <div className="flex flex-col">
              <span className="text-[9px] text-muted uppercase tracking-wider block">{t("Revenue")}</span>
              <span className="font-mono font-bold text-foreground">
                ETB {requestedBudget.toLocaleString()}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] text-muted uppercase tracking-wider block">{t("Estimated Cost")}</span>
              <span className="font-mono font-bold text-foreground">
                ETB {financials.totalCost.toLocaleString()}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] text-muted uppercase tracking-wider block">{t("Net Profit")}</span>
              <span className={`font-mono font-bold ${financials.netProfit < 0 ? "text-danger" : "text-foreground"}`}>
                ETB {financials.netProfit.toLocaleString()}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[9px] text-muted uppercase tracking-wider block">{t("Margin")}</span>
              <span className={`font-mono font-black ${
                financials.netProfit < 0 || financials.margin < 10
                  ? "text-danger"
                  : financials.margin < 25
                    ? "text-warning"
                    : "text-success"
              }`}>
                {financials.margin}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Add Event Type Dialog Modal */}
      {showAddEventType && (
        <>
          <div
            className="fixed inset-0 z-70 bg-black/60 backdrop-blur-sm pointer-events-auto"
            onClick={() => setShowAddEventType(false)}
          />
          <div className="fixed inset-0 z-70 flex items-center justify-center pointer-events-none p-4">
            <div
              ref={addEventTypeModalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-event-type-title"
              className="pointer-events-auto bg-card rounded-lg border border-border p-6 w-full max-w-sm flex flex-col shadow-2xl relative animate-scale-in"
            >
              <h3 id="add-event-type-title" className="text-sm font-black text-foreground mb-4 uppercase tracking-wider">
                {t("Add Event Type")}
              </h3>
              <div className="flex flex-col gap-3 mb-6">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-muted uppercase tracking-wider">{t("Event Type Name")} *</label>
                  <input
                    type="text"
                    value={newEventTypeName}
                    onChange={(e) => setNewEventTypeName(e.target.value)}
                    required
                    className="px-3.5 h-[44px] rounded-lg bg-card-alt border border-border text-sm outline-none focus:ring-1 focus:ring-primary/30"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-muted uppercase tracking-wider">{t("Description")}</label>
                  <textarea
                    value={newEventTypeDesc}
                    onChange={(e) => setNewEventTypeDesc(e.target.value)}
                    rows={2}
                    className="p-3 rounded-lg bg-card-alt border border-border text-sm outline-none focus:ring-1 focus:ring-primary/30 resize-none"
                  />
                </div>
              </div>
              <div className="flex gap-3 w-full">
                <button
                  type="button"
                  onClick={() => setShowAddEventType(false)}
                  className="flex-1 py-2.5 rounded-lg bg-card-alt border border-border text-foreground font-bold [@media(hover:hover)]:hover:bg-border transition-all text-xs active:scale-95 cursor-pointer"
                >
                  {t("Cancel")}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!newEventTypeName.trim()) return;
                    try {
                      const res = await createEventType({
                        event_name: newEventTypeName.trim(),
                        description: newEventTypeDesc.trim() || null
                      });
                      await queryClient.invalidateQueries({ queryKey: ["event-types"] });
                      setEventTypeId(res.eventType.id);
                      setNewEventTypeName("");
                      setNewEventTypeDesc("");
                      setShowAddEventType(false);
                    } catch (err) {
                      console.error(err);
                      setErrorMsg("Failed to add event type");
                    }
                  }}
                  className="flex-1 py-2.5 rounded-lg bg-primary text-white font-bold [@media(hover:hover)]:hover:opacity-90 transition-all text-xs active:scale-95 cursor-pointer"
                >
                  {t("Save")}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
        </>
      )}
    </AuthLayout>
  );
}
