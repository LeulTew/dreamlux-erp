"use client";
import React from "react";
import { 
  HiCheckCircle, 
  HiExclamationCircle, 
  HiXCircle, 
  HiInformationCircle, 
  HiMinusCircle 
} from "react-icons/hi2";
import { useLanguage } from "@/hooks/use-language";

export type StatusVariant = "success" | "warning" | "danger" | "info" | "neutral";

interface StatusBadgeProps {
  status: string;
}

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    ARCHIVED: "Archived",
    BLOCKED: "Blocked",
    PLANNED: "Planned",
    ONGOING: "Ongoing",
    COMPLETED: "Completed",
    DRAFT: "Draft",
    SUBMITTED: "Submitted",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    CONVERTED: "Converted",
    CANCELED: "Canceled",
    CANCELLED: "Canceled",
    FINALIZED: "Finalized",
    FLAGGED_WRONG: "Flagged Incorrect",
    PENDING: "Pending",
    OVERDUE: "Overdue",
    ALLOCATED: "Allocated",
    RETURNED: "Returned",
    RESERVED: "Reserved",
    PULLED: "Pulled",
    RESTRICTED: "Restricted",
  },
  am: {
    ARCHIVED: "በማህደር የተያዘ",
    BLOCKED: "የተከለከለ",
    PLANNED: "ቀጠሮ የተያዘ",
    ONGOING: "በሂደት ላይ",
    COMPLETED: "የተጠናቀቀ",
    DRAFT: "ረቂቅ",
    SUBMITTED: "የቀረበ",
    APPROVED: "የጸደቀ",
    REJECTED: "ውድቅ የተደረገ",
    CONVERTED: "የተቀየረ",
    CANCELED: "የተሰረዘ",
    CANCELLED: "የተሰረዘ",
    FINALIZED: "የተጠናቀቀ",
    FLAGGED_WRONG: "ስህተት የተገኘበት",
    PENDING: "በመጠባበቅ ላይ",
    OVERDUE: "ያለፈ ጊዜ",
    ALLOCATED: "የተመደበ",
    RETURNED: "የተመለሰ",
    RESERVED: "የተያዘ",
    PULLED: "የወጣ",
    RESTRICTED: "የተገደበ",
  }
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const { lang } = useLanguage();
  
  // Normalize the status string to match consistently
  const normalized = status.trim().toUpperCase();

  let variant: StatusVariant = "neutral";
  switch (normalized) {
    case "COMPLETED":
    case "APPROVED":
    case "FINALIZED":
    case "RETURNED":
      variant = "success";
      break;
    case "PULLED":
    case "ONGOING":
    case "SUBMITTED":
    case "DRAFT":
    case "PENDING":
    case "OVERDUE":
      variant = "warning";
      break;
    case "REJECTED":
    case "FLAGGED_WRONG":
    case "BLOCKED":
      variant = "danger";
      break;
    case "RESERVED":
    case "PLANNED":
    case "CONVERTED":
    case "ALLOCATED":
    case "RESTRICTED":
      variant = "info";
      break;
    case "ARCHIVED":
    case "CANCELED":
    case "CANCELLED":
    default:
      variant = "neutral";
      break;
  }

  // Retain exact styles from git history and brand design tokens
  const variantStyles: Record<StatusVariant, string> = {
    success: "bg-success/10 text-success border border-success/20",
    warning: "bg-warning/10 text-warning border border-warning/20",
    danger: "bg-danger/10 text-danger border border-danger/20",
    info: "bg-primary-light text-primary-dark border border-primary/20",
    neutral: "bg-card-alt text-muted border border-border",
  };

  const Icons: Record<StatusVariant, React.ComponentType<{ className?: string }>> = {
    success: HiCheckCircle,
    warning: HiExclamationCircle,
    danger: HiXCircle,
    info: HiInformationCircle,
    neutral: HiMinusCircle,
  };

  const IconComponent = Icons[variant];

  // Look up translation using normalized uppercase key; fallback to standard sentence case from input status
  const translated = TRANSLATIONS[lang]?.[normalized] || status;

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[9px] font-medium tracking-wide border leading-none shrink-0 ${variantStyles[variant]}`}
    >
      <IconComponent className="w-3.5 h-3.5 shrink-0" />
      <span className="md:hidden lg:inline">{translated}</span>
    </span>
  );
}
