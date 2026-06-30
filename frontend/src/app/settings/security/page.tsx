"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Lock,
  CheckCircle2,
  AlertCircle,
  Info,
} from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import ForbiddenState from "@/components/ForbiddenState";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/use-language";

// ---------------------------------------------------------------------------
// Translations — plain, non-technical language for non-technical users
// ---------------------------------------------------------------------------
const TRANSLATIONS: Record<string, Record<string, string | string[]>> = {
  en: {
    "Security Review": "Security Review",
    "page_subtitle":
      "A summary of how well the system is protected. Reviewed by the technical team on your behalf.",
    "Go back": "Go back",
    "no_secrets_note": "No passwords or private data are shown on this page.",
    "all_good": "All Good",
    "needs_attention": "Needs Attention",
    "being_watched": "Being Monitored",
    "areas_reviewed": "Areas Reviewed",
    "protected": "Protected",
    "monitoring": "Monitoring",
    "attention": "Action Needed",
    "last_reviewed": "Last reviewed",
    "see_detail": "See detail",
    "hide_detail": "Hide detail",
    "what_this_means": "What this means",
    "admin_only_note":
      "This page is only accessible to system administrators. It is not visible to regular staff.",
    "back_to_settings": "Back to Settings",

    // --- Area titles (plain language) ---
    "area_access_title": "Who Can Access What",
    "area_access_desc":
      "The system checks that every staff member only sees the data and features they are allowed to use. Access is controlled by their role.",
    "area_access_details": [
      "Every page and action is protected — staff can only do what their role allows.",
      "Access rules are applied on the server, not just on screen, so they cannot be bypassed.",
      "There is one known limitation being tracked by the team: login tokens are stored in a way that will be improved in a future update.",
    ],

    "area_software_title": "Software Safety",
    "area_software_desc":
      "The system's software components are checked regularly for known safety issues. This is a routine maintenance task.",
    "area_software_details": [
      "The technical team reviews software components before each major update.",
      "This check is done manually during every production release — it is not automated yet.",
      "Issue #83 adds a permanent checklist so this review is never skipped.",
    ],

    "area_data_title": "Data Protection",
    "area_data_desc":
      "All business data — employees, events, finances — is stored securely. Only the server can access the database directly.",
    "area_data_details": [
      "The database has strict rules that prevent unauthorised access even if someone tries to bypass the app.",
      "No web browser connects directly to the database — all data flows through the secure server.",
      "Data protection rules have been verified and documented.",
    ],

    "area_audit_title": "Activity History",
    "area_audit_desc":
      "Important actions in the system are recorded so that administrators can review what happened and who did it.",
    "area_audit_details": [
      "Events, payroll, proposals, and inventory changes are all tracked.",
      "Administrators can view a log of recent activity for each record.",
      "The team will extend this tracking to any new features added in the future.",
    ],

    "area_caveats_title": "Known Limitations",
    "area_caveats_desc":
      "The technical team is aware of a few areas that will be improved in upcoming updates. These are being actively tracked.",
    "area_caveats_details": [
      "Login sessions use a method that will be upgraded to a more secure approach in a future release.",
      "Some internal components will be reorganised as the system grows.",
      "These are planned improvements, not active problems.",
    ],
  },

  am: {
    "Security Review": "የደህንነት ግምገማ",
    "page_subtitle":
      "ስርዓቱ ምን ያህል ተጠብቆ እንዳለ ማጠቃለያ። የቴክኒካዊ ቡድን ለእርስዎ ሲሉ ይገመግማሉ።",
    "Go back": "ተመለስ",
    "no_secrets_note": "ምስጢሮች ወይም የግል ውሂቦች በዚህ ገጽ ላይ አይታዩም።",
    "all_good": "ጥሩ ሁኔታ",
    "needs_attention": "ትኩረት ያስፈልጋል",
    "being_watched": "እየተከታተለ ነው",
    "areas_reviewed": "የተገመገሙ ክፍሎች",
    "protected": "ተጠብቋል",
    "monitoring": "ክትትል",
    "attention": "ትኩረት ያስፈልጋል",
    "last_reviewed": "የተገመገመው",
    "see_detail": "ዝርዝር ይመልከቱ",
    "hide_detail": "ዝርዝር ይደብቁ",
    "what_this_means": "ትርጉሙ ምን ማለት ነው",
    "admin_only_note":
      "ይህ ገጽ ለስርዓት አስተዳዳሪዎች ብቻ ነው። ለተራ ሰራተኞች አይታይም።",
    "back_to_settings": "ወደ ቅንብሮች ተመለስ",

    "area_access_title": "누가 ምን ሊደርስ ይችላል",
    "area_access_desc":
      "ስርዓቱ እያንዳንዱ ሰራተኛ የሚፈቀደው ውሂብ እና ባህሪያት ብቻ እንደሚያዩ ያረጋግጣል። ይህ በሚና ቁጥጥር ይደረጋል።",
    "area_access_details": [
      "እያንዳንዱ ገጽ እና ድርጊት ተጠብቋል — ሰራተኞች ሚናቸው የሚፈቅደውን ብቻ ማድረግ ይችላሉ።",
      "ደህንነት ህጎቹ በሰርቨሩ ላይ ተፈጻሚ ናቸው ስለዚህ ሊዘለሉ አይችሉም።",
      "ቡድኑ የሚከታተለው አንድ ገደብ አለ - ወደፊት በሚደረግ ዝማኔ ይሻሻላል።",
    ],

    "area_software_title": "የሶፍትዌር ደህንነት",
    "area_software_desc":
      "የስርዓቱ ሶፍትዌር ክፍሎች ለሚታወቁ ደህንነት ጉዳዮች በመደበኛነት ይፈተናሉ።",
    "area_software_details": [
      "የቴክኒካዊ ቡድን ሶፍትዌር ክፍሎቹን ከእያንዳንዱ ዋና ዝማኔ በፊት ይፈትሻቸዋል።",
      "ይህ ፍተሻ በእያንዳንዱ ምርት ልቀት ወቅት ይካሄዳል።",
      "ጉዳይ #83 ይህን ፍተሻ ሁልጊዜ እንዳይዘለል ቋሚ ዝርዝር ይጨምራል።",
    ],

    "area_data_title": "የውሂብ ጥበቃ",
    "area_data_desc":
      "ሁሉም ዝርዝሮች — ሰራተኞች፣ ዝግጅቶች፣ ፋይናንስ — በጥብቅ ይጠበቃሉ። ሰርቨሩ ብቻ ዳታቤዙን ቀጥታ ማግኘት ይችላል።",
    "area_data_details": [
      "ዳታቤዙ ፕሮግራሙን ለማለፍ ቢሞከርም ያልተፈቀደ ጋ ሊደርሱ የሚከለክሉ ጥብቅ ህጎች አሉት።",
      "ምንም ድር አሳሽ ዳታቤዙን ቀጥታ አይደርስም — ሁሉም ውሂብ በደህና ሰርቨሩ ይፈስሳል።",
      "የውሂብ ጥበቃ ህጎቹ ተረጋግጠው ተመዝግበዋል።",
    ],

    "area_audit_title": "የተግባር ታሪክ",
    "area_audit_desc":
      "አስተዳዳሪዎች ምን እንደተሰራ እና ማን እንደሰራው እንዲያዩ ስርዓቱ ውስጥ አስፈላጊ ድርጊቶች ይቀዳሉ።",
    "area_audit_details": [
      "ዝግጅቶች፣ ደሞዝ፣ ሀሳቦች እና የዕቃ ለውጦች ሁሉ ይቀዳሉ።",
      "አስተዳዳሪዎች ለእያንዳንዱ መዛግብ የቅርብ ጊዜ ተግባሮች ዝርዝር ማየት ይችላሉ።",
      "ቡድኑ ወደፊት ለሚጨመሩ ባህሪያትም ይህን ክትትል ያራዝማል።",
    ],

    "area_caveats_title": "የሚታወቁ ገደቦች",
    "area_caveats_desc":
      "የቴክኒካዊ ቡድን ወደፊት ዝማኔዎች ውስጥ የሚሻሻሉ ጥቂት ቦታዎችን ያውቃል።",
    "area_caveats_details": [
      "ወደፊት ዝማኔ ውስጥ ለበለጠ ደህና አካሄድ ይሻሻላል።",
      "ስርዓቱ እያደገ ሲሄድ አንዳንድ ክፍሎች ይደራጃሉ።",
      "እነዚህ የታቀዱ ማሻሻያዎች ናቸው፣ ንቁ ችግሮች አይደሉም።",
    ],
  },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type StatusTone = "healthy" | "monitoring" | "attention";

type AreaRow = {
  id: string;
  titleKey: string;
  descKey: string;
  detailsKey: string;
  status: StatusTone;
};

// ---------------------------------------------------------------------------
// Static status area definitions (no jargon exposed to UI)
// ---------------------------------------------------------------------------
const AREAS: AreaRow[] = [
  {
    id: "access",
    titleKey: "area_access_title",
    descKey: "area_access_desc",
    detailsKey: "area_access_details",
    status: "monitoring",
  },
  {
    id: "software",
    titleKey: "area_software_title",
    descKey: "area_software_desc",
    detailsKey: "area_software_details",
    status: "monitoring",
  },
  {
    id: "data",
    titleKey: "area_data_title",
    descKey: "area_data_desc",
    detailsKey: "area_data_details",
    status: "healthy",
  },
  {
    id: "audit",
    titleKey: "area_audit_title",
    descKey: "area_audit_desc",
    detailsKey: "area_audit_details",
    status: "healthy",
  },
  {
    id: "caveats",
    titleKey: "area_caveats_title",
    descKey: "area_caveats_desc",
    detailsKey: "area_caveats_details",
    status: "attention",
  },
];

const REVIEWED_DATE = "2026-06-30";

// ---------------------------------------------------------------------------
// Status config — visual only, no technical labels shown to user
// ---------------------------------------------------------------------------
const STATUS_CONFIG: Record<
  StatusTone,
  {
    labelKey: string;
    badge: string;
    iconBg: string;
    border: string;
    Icon: typeof ShieldCheck;
  }
> = {
  healthy: {
    labelKey: "protected",
    badge: "bg-success/10 text-success border-success/20",
    iconBg: "bg-success/10 text-success",
    border: "border-border/40 hover:border-success/30",
    Icon: ShieldCheck,
  },
  monitoring: {
    labelKey: "monitoring",
    badge: "bg-warning/10 text-warning border-warning/20",
    iconBg: "bg-warning/10 text-warning",
    border: "border-border/40 hover:border-warning/30",
    Icon: ShieldAlert,
  },
  attention: {
    labelKey: "attention",
    badge: "bg-danger/10 text-danger border-danger/20",
    iconBg: "bg-danger/10 text-danger",
    border: "border-border/40 hover:border-danger/30",
    Icon: ShieldOff,
  },
};

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------
export default function SecurityPosturePage() {
  const router = useRouter();
  const { lang } = useLanguage();
  const { hasPermission, isAuthenticated, isLoading: authLoading } = useAuth();

  const t = useCallback(
    (key: string): string => {
      const val = TRANSLATIONS[lang]?.[key] || TRANSLATIONS["en"]?.[key] || key;
      return typeof val === "string" ? val : val[0] || "";
    },
    [lang],
  );
  const tArr = useCallback(
    (key: string): string[] => {
      const val = TRANSLATIONS[lang]?.[key] || TRANSLATIONS["en"]?.[key];
      return Array.isArray(val) ? val : [];
    },
    [lang],
  );

  const [expandedId, setExpandedId] = useState<string>("access");

  const canAccess = hasPermission("users:manage") || hasPermission("settings:write");

  const counts = useMemo(
    () =>
      AREAS.reduce(
        (acc, a) => {
          acc.total += 1;
          acc[a.status] += 1;
          return acc;
        },
        { total: 0, healthy: 0, monitoring: 0, attention: 0 },
      ),
    [],
  );

  // ── Loading skeleton ─────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <AuthLayout>
        <div className="page-container pb-16 space-y-4">
          <div className="h-24 animate-pulse rounded-lg border border-border bg-card" />
          <div className="h-40 animate-pulse rounded-lg border border-border bg-card" />
        </div>
      </AuthLayout>
    );
  }

  // ── Permission gate ───────────────────────────────────────────────────────
  if (!isAuthenticated || !canAccess) {
    return (
      <AuthLayout>
        <ForbiddenState
          title={t("Restricted to security reviewers")}
          description={t("Only security reviewers, system managers, and administrators can access this page.")}
        />
      </AuthLayout>
    );
  }

  // ── Overall posture banner ───────────────────────────────────────────────
  const overallStatus: StatusTone =
    counts.attention > 0 ? "attention" : counts.monitoring > 0 ? "monitoring" : "healthy";
  const OverallIcon = STATUS_CONFIG[overallStatus].Icon;

  return (
    <AuthLayout>
      <div className="page-container pb-16 space-y-6 pt-2 md:py-4 2xl:py-8 px-3 sm:px-4 2xl:px-8">

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              aria-label={t("Go back")}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/40 bg-card text-muted transition-colors [@media(hover:hover)]:hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground leading-tight">
                {t("Security Review")}
              </h1>
              <p className="text-[11px] text-muted leading-tight max-w-sm">
                {t("page_subtitle")}
              </p>
            </div>
          </div>

          {/* Reassurance note */}
          <div className="self-start sm:self-auto flex items-center gap-2 rounded-lg border border-border/30 bg-card-alt px-3 py-2 text-[11px] font-medium text-muted">
            <Info className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span>{t("no_secrets_note")}</span>
          </div>
        </header>

        {/* ── Overall status banner ────────────────────────────────────────── */}
        <div
          data-testid="overall-status-banner"
          className={`flex items-center gap-4 rounded-xl border p-5 ${
            overallStatus === "healthy"
              ? "border-success/20 bg-success/5"
              : overallStatus === "monitoring"
                ? "border-warning/20 bg-warning/5"
                : "border-danger/20 bg-danger/5"
          }`}
        >
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${STATUS_CONFIG[overallStatus].iconBg}`}
          >
            <OverallIcon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              {t("last_reviewed")}: {REVIEWED_DATE}
            </p>
            <p className="mt-0.5 text-base font-bold text-foreground">
              {overallStatus === "healthy"
                ? t("all_good")
                : overallStatus === "monitoring"
                  ? t("being_watched")
                  : t("needs_attention")}
            </p>
          </div>

          {/* KPI strip */}
          <div className="hidden sm:flex items-center gap-6">
            <KpiChip
              value={counts.healthy}
              label={t("protected")}
              color="text-success"
              Icon={CheckCircle2}
            />
            <KpiChip
              value={counts.monitoring}
              label={t("monitoring")}
              color="text-warning"
              Icon={AlertCircle}
            />
            <KpiChip
              value={counts.attention}
              label={t("attention")}
              color="text-danger"
              Icon={ShieldOff}
            />
          </div>
        </div>

        {/* ── Review area cards ────────────────────────────────────────────── */}
        <div className="space-y-3">
          {AREAS.map((area) => {
            const cfg = STATUS_CONFIG[area.status];
            const isOpen = expandedId === area.id;
            const details = tArr(area.detailsKey);

            return (
              <div
                key={area.id}
                data-testid={`area-card-${area.id}`}
                className={`rounded-xl border bg-card transition-colors ${cfg.border}`}
              >
                {/* Collapsed row / toggle */}
                <button
                  type="button"
                  data-testid={`area-toggle-${area.id}`}
                  onClick={() =>
                    setExpandedId((cur) => (cur === area.id ? "" : area.id))
                  }
                  className="flex w-full items-center gap-4 px-5 py-4 text-left"
                >
                  {/* Icon */}
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${cfg.iconBg}`}
                  >
                    <cfg.Icon className="h-4.5 w-4.5" />
                  </div>

                  {/* Title + desc */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground leading-tight">
                      {t(area.titleKey)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted leading-snug line-clamp-2">
                      {t(area.descKey)}
                    </p>
                  </div>

                  {/* Status badge */}
                  <span
                    className={`hidden sm:inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[11px] font-semibold ${cfg.badge}`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {t(cfg.labelKey)}
                  </span>

                  {/* Chevron */}
                  <span className="shrink-0 text-muted">
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </span>
                </button>

                {/* Expanded detail */}
                {isOpen && (
                  <div
                    data-testid={`area-detail-${area.id}`}
                    className="border-t border-border/30 bg-card-alt/50 px-5 py-4 space-y-4"
                  >
                    {/* Detail points */}
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-2">
                        {t("what_this_means")}
                      </p>
                      <ul className="space-y-2">
                        {details.map((d, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 text-sm text-foreground"
                          >
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                            <span>{d}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Footer note ─────────────────────────────────────────────────── */}
        <footer className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-border/30 bg-card-alt px-5 py-4">
          <p className="text-[11px] text-muted">{t("admin_only_note")}</p>
          <Link
            href="/settings"
            className="self-start sm:self-auto inline-flex items-center gap-2 rounded-lg border border-border/40 bg-card px-4 py-2 text-xs font-semibold text-foreground transition-colors [@media(hover:hover)]:hover:border-primary/40 [@media(hover:hover)]:hover:text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("back_to_settings")}
          </Link>
        </footer>
      </div>
    </AuthLayout>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function KpiChip({
  value,
  label,
  color,
  Icon,
}: {
  value: number;
  label: string;
  color: string;
  Icon: typeof CheckCircle2;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className={`flex items-center gap-1 text-2xl font-black tabular-nums tracking-tight ${color}`}>
        <Icon className="h-4 w-4" />
        {value}
      </div>
      <span className="text-[10px] font-medium text-muted uppercase tracking-wide">{label}</span>
    </div>
  );
}
