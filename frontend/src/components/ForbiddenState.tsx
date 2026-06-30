"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { HiShieldExclamation } from "react-icons/hi2";
import { useLanguage } from "@/hooks/use-language";

interface ForbiddenStateProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Forbidden: Insufficient privileges": "Forbidden: Insufficient privileges",
    "Only Admin or System Manager roles can access this page.": "Only Admin or System Manager roles can access this page.",
    "Back to Dashboard": "Back to Dashboard",
    "Access Denied": "Access Denied",
    "You do not have the required permissions to view this content.": "You do not have the required permissions to view this content.",
    "Only HR Managers and Administrators can add employees.": "Only HR Managers and Administrators can add employees.",
    "Only Owners, Accountants, and Administrators can view payroll snapshots.": "Only Owners, Accountants, and Administrators can view payroll snapshots.",
    "Only Owners, Accountants, and Administrators can run payroll.": "Only Owners, Accountants, and Administrators can run payroll.",
    "Only Owners, Administrators, and HR Managers can manage salary levels.": "Only Owners, Administrators, and HR Managers can manage salary levels.",
    "Only Owners, Administrators, and Operations Managers can manage event types.": "Only Owners, Administrators, and Operations Managers can manage event types.",
    "Only Accountants and Administrators can access expense approvals.": "Only Accountants and Administrators can access expense approvals.",
    "Only Owners, Administrators, and HR Managers can view employee reports.": "Only Owners, Administrators, and HR Managers can view employee reports.",
    "Only authorized personnel can access inventory management.": "Only authorized personnel can access inventory management.",
    "Only authorized personnel can view inventory dashboard.": "Only authorized personnel can view inventory dashboard.",
    "Only authorized personnel can add inventory items.": "Only authorized personnel can add inventory items.",
    "Only authorized personnel can reconcile inventory.": "Only authorized personnel can reconcile inventory.",
    "Only authorized personnel can view inventory audit logs.": "Only authorized personnel can view inventory audit logs.",
    "Only authorized personnel can view inventory reports.": "Only authorized personnel can view inventory reports.",
    "Only authorized personnel can view low stock alerts.": "Only authorized personnel can view low stock alerts.",
    "Only authorized personnel can view trashed inventory items.": "Only authorized personnel can view trashed inventory items.",
    "Only authorized personnel can view items in this location.": "Only authorized personnel can view items in this location.",
    "You need event proposal access permissions to view this content.": "You need event proposal access permissions to view this content.",
    "You need event proposal write permissions to create proposals.": "You need event proposal write permissions to create proposals."
  },
  am: {
    "Forbidden: Insufficient privileges": "ክልክል ነው: በቂ ፈቃድ የለዎትም",
    "Only Admin or System Manager roles can access this page.": "ይህንን ገጽ መድረስ የሚችሉት አስተዳዳሪዎች ወይም የስርዓት አስተዳዳሪዎች ብቻ ናቸው።",
    "Back to Dashboard": "ወደ ዳሽቦርድ ተመለስ",
    "Access Denied": "ክልክል ነው",
    "You do not have the required permissions to view this content.": "ይህንን ይዘት ለማየት የሚያስፈልግዎት ፈቃድ የለዎትም።",
    "Only HR Managers and Administrators can add employees.": "ይህንን ገጽ መድረስ የሚችሉት የሰው ኃይል አስተዳዳሪዎች እና ባለስልጣናት ብቻ ናቸው።",
    "Only Owners, Accountants, and Administrators can view payroll snapshots.": "የክፍያ መዛግብትን መመልከት የሚችሉት ባለቤቶች፣ የሂሳብ ባለሙያዎች እና አስተዳዳሪዎች ብቻ ናቸው።",
    "Only Owners, Accountants, and Administrators can run payroll.": "ደሞዝ ማስላት የሚችሉት ባለቤቶች፣ የሂሳብ ባለሙያዎች እና አስተዳዳሪዎች ብቻ ናቸው።",
    "Only Owners, Administrators, and HR Managers can manage salary levels.": "የደሞዝ ደረጃዎችን ማስተዳደር የሚችሉት ባለቤቶች፣ አስተዳዳሪዎች እና የሰው ኃይል አስተዳዳሪዎች ብቻ ናቸው።",
    "Only Owners, Administrators, and Operations Managers can manage event types.": "የዝግጅት ዓይነቶችን ማስተዳደር የሚችሉት ባለቤቶች፣ አስተዳዳሪዎች እና የሥራ አስኪያጆች ብቻ ናቸው።",
    "Only Accountants and Administrators can access expense approvals.": "የወጪ ማጽደቂያዎችን መድረስ የሚችሉት የሂሳብ ባለሙያዎች እና አስተዳዳሪዎች ብቻ ናቸው።",
    "Only Owners, Administrators, and HR Managers can view employee reports.": "የሠራተኞችን ሪፖርት መመልከት የሚችሉት ባለቤቶች፣ አስተዳዳሪዎች እና የሰው ኃይል አስተዳዳሪዎች ብቻ ናቸው።",
    "Only authorized personnel can access inventory management.": "ዕቃዎችን ማስተዳደር የሚችሉት ፈቃድ ያላቸው ሠራተኞች ብቻ ናቸው።",
    "Only authorized personnel can view inventory dashboard.": "የዕቃዎችን ዳሽቦርድ መመልከት የሚችሉት ፈቃድ ያላቸው ሠራተኞች ብቻ ናቸው።",
    "Only authorized personnel can add inventory items.": "አዲስ ዕቃ መመዝገብ የሚችሉት ፈቃድ ያላቸው ሠራተኞች ብቻ ናቸው።",
    "Only authorized personnel can reconcile inventory.": "ቆጠራ ማመሳከር የሚችሉት ፈቃድ ያላቸው ሠራተኞች ብቻ ናቸው።",
    "Only authorized personnel can view inventory audit logs.": "የቆጠራ ታሪክ ማስታወሻዎችን መመልከት የሚችሉት ፈቃድ ያላቸው ሠራተኞች ብቻ ናቸው።",
    "Only authorized personnel can view inventory reports.": "የዕቃዎች ሪፖርቶችን መመልከት የሚችሉት ፈቃድ ያላቸው ሠራተኞች ብቻ ናቸው።",
    "Only authorized personnel can view low stock alerts.": "አነስተኛ ክምችት ማስጠንቀቂያዎችን መመልከት የሚችሉት ፈቃድ ያላቸው ሠራተኞች ብቻ ናቸው።",
    "Only authorized personnel can view trashed inventory items.": "የተጣሉ ዕቃዎችን መመልከት የሚችሉት ፈቃድ ያላቸው ሠራተኞች ብቻ ናቸው።",
    "Only authorized personnel can view items in this location.": "በዚህ ቦታ ውስጥ ያሉ ዕቃዎችን መመልከት የሚችሉት ፈቃድ ያላቸው ሠራተኞች ብቻ ናቸው።",
    "You need event proposal access permissions to view this content.": "የዝግጅት ፕሮፖዛል ይዘትን ለማየት የሚያስፈልገው ፈቃድ የለዎትም።",
    "You need event proposal write permissions to create proposals.": "የዝግጅት ፕሮፖዛል ለመፍጠር የሚያስፈልገው የመጻፍ ፈቃድ የለዎትም።"
  }
};

export default function ForbiddenState({
  title,
  description,
  actionLabel,
  onAction
}: ForbiddenStateProps) {
  const router = useRouter();
  const { lang } = useLanguage();
  
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;

  const defaultAction = () => {
    router.push("/");
  };

  const handleAction = onAction || defaultAction;

  return (
    <div className="flex flex-col items-center justify-center min-h-[450px] text-center p-8 max-w-lg mx-auto space-y-6">
      <div className="relative">
        <div className="absolute inset-0 bg-amber-500/5 blur-md rounded-full" />
        <div className="relative w-16 h-16 rounded-2xl bg-neutral-900 border border-gold/20 flex items-center justify-center text-amber-500 shadow-sm shadow-gold/5 shrink-0">
          <HiShieldExclamation className="w-8 h-8" />
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-black text-foreground tracking-tight">
          {title ? t(title) : t("Forbidden: Insufficient privileges")}
        </h2>
        <p className="text-xs text-muted-foreground font-semibold leading-relaxed max-w-sm">
          {description ? t(description) : t("You do not have the required permissions to view this content.")}
        </p>
      </div>

      <button
        onClick={handleAction}
        className="h-12 px-6 rounded-lg border border-gold/30 bg-neutral-950 text-gold [@media(hover:hover)]:hover:bg-gold [@media(hover:hover)]:hover:text-white font-extrabold uppercase tracking-wider text-[10px] transition-all duration-300 cursor-pointer shadow-sm active:scale-[0.97]"
      >
        {actionLabel ? t(actionLabel) : t("Back to Dashboard")}
      </button>
    </div>
  );
}
