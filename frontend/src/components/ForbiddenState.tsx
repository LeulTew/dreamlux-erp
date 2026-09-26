"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { HiShieldExclamation } from "react-icons/hi2";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/useAuth";
import { readCurrentAuthority } from "@/lib/auth-authority";
import { createPermissionMatcher } from "@/lib/permission-matcher";
import { resolveLandingRoute } from "@/lib/landing-route";

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
    "List Events": "List Events",
    "List Items": "List Items",
    "Checking current access…": "Checking current access…",
    "Access could not be verified.": "Access could not be verified.",
    "Retry access": "Retry access",
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
    "Only authorized personnel can manage event dispatch.": "Only authorized personnel can manage event dispatch.",
    "You need event proposal access permissions to view this content.": "You need event proposal access permissions to view this content.",
    "You need event proposal write permissions to create proposals.": "You need event proposal write permissions to create proposals."
  },
  am: {
    "Forbidden: Insufficient privileges": "ክልክል ነው: በቂ ፈቃድ የለዎትም",
    "Only Admin or System Manager roles can access this page.": "ይህንን ገጽ መድረስ የሚችሉት አስተዳዳሪዎች ወይም የስርዓት አስተዳዳሪዎች ብቻ ናቸው።",
    "Back to Dashboard": "ወደ ዳሽቦርድ ተመለስ",
    "List Events": "የዝግጅቶች ዝርዝር",
    "List Items": "የዕቃዎች ዝርዝር",
    "Checking current access…": "የመግቢያ ፈቃድን በማረጋገጥ ላይ",
    "Access could not be verified.": "ፈቃድን ማረጋገጥ አልተቻለም።",
    "Retry access": "እንደገና ሞክር",
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
    "Only authorized personnel can manage event dispatch.": "የዝግጅት መላኪያን ማስተዳደር የሚችሉት ፈቃድ ያላቸው ሠራተኞች ብቻ ናቸው።",
    "You need event proposal access permissions to view this content.": "የዝግጅት ፕሮፖዛል ይዘትን ለማየት የሚያስፈልገው ፈቃድ የለዎትም።",
    "You need event proposal write permissions to create proposals.": "የዝግጅት ፕሮፖዛል ለመፍጠር የሚያስፈልገው የመጻፍ ፈቃድ የለዎትም።"
  }
};

function ReturnButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button
    type="button"
    onClick={onClick}
    className="min-h-12 min-w-12 px-6 py-2.5 rounded-lg border border-border bg-card text-foreground text-sm font-semibold [@media(hover:hover)_and_(pointer:fine)]:hover:bg-card-alt transition-colors duration-150 motion-reduce:transition-none cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
  >{children}</button>;
}

function DefaultReturnAction({ actionLabel, t }: { actionLabel?: string; t: (key: string) => string }) {
  const auth = useAuth();
  const client = useQueryClient();
  const router = useRouter();
  const route = resolveLandingRoute(auth);
  const navigate = () => {
    const current = readCurrentAuthority(client);
    const livePermission = createPermissionMatcher(current.permissionSlugs);
    const destination = resolveLandingRoute({
      isCurrent: auth.isCurrent && current.phase === "ready" && current.principalId === auth.principalId,
      hasPermission: (permission) => auth.hasPermission(permission) && livePermission(permission),
    });
    if (destination) router.push(destination);
    else console.warn("[ForbiddenState] Current access changed before return navigation");
  };

  if (auth.phase === "unavailable") return <>
    <p role="alert" className="text-sm text-muted">{t("Access could not be verified.")}</p>
    <ReturnButton onClick={() => { void auth.retryCurrent(); }}>{t(actionLabel || "Retry access")}</ReturnButton>
  </>;
  if (!auth.isCurrent) return auth.phase === "checking" || auth.phase === "rechecking"
    ? <p role="status" className="text-sm text-muted">{t("Checking current access…")}</p>
    : null;
  if (!route) return null;
  const label = { "/": "Back to Dashboard", "/events": "List Events", "/assets": "List Items" }[route];
  return <ReturnButton onClick={navigate}>{t(actionLabel || label)}</ReturnButton>;
}

export default function ForbiddenState({
  title,
  description,
  actionLabel,
  onAction
}: ForbiddenStateProps) {
  const { lang } = useLanguage();
  
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;

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

      {onAction
        ? <ReturnButton onClick={onAction}>{t(actionLabel || "Back to Dashboard")}</ReturnButton>
        : <DefaultReturnAction actionLabel={actionLabel} t={t} />}
    </div>
  );
}
