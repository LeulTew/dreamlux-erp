"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  HiArrowLeft,
  HiChevronDown,
  HiChevronUp,
  HiDocumentText,
  HiExclamationTriangle,
  HiLockClosed,
  HiQueueList,
  HiShieldCheck,
} from "react-icons/hi2";
import AuthLayout from "@/components/AuthLayout";
import ForbiddenState from "@/components/ForbiddenState";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/use-language";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Security Posture": "Security Posture",
    "Operational security coverage for admin review. This page summarizes current control status without exposing secrets or live credentials.": "Operational security coverage for admin review. This page summarizes current control status without exposing secrets or live credentials.",
    "Go back": "Go back",
    "Restricted to security reviewers": "Restricted to security reviewers",
    "Only security reviewers, system managers, and administrators can access this page.": "Only security reviewers, system managers, and administrators can access this page.",
    "Current Posture": "Current Posture",
    "Tracked Areas": "Tracked Areas",
    "Open Follow-ups": "Open Follow-ups",
    "Security Notes": "Security Notes",
    "Hidden admin surface": "Hidden admin surface",
    "This route is intentionally kept out of the main sidebar. Reach it from Settings when conducting an admin or QA security review.": "This route is intentionally kept out of the main sidebar. Reach it from Settings when conducting an admin or QA security review.",
    "Healthy": "Healthy",
    "Needs Monitoring": "Needs Monitoring",
    "Attention Needed": "Attention Needed",
    "View Doc": "View Doc",
    "View Issue": "View Issue",
    "Security review pack": "Security review pack",
    "Status Summary": "Status Summary",
    "Control": "Control",
    "State": "State",
    "Evidence": "Evidence",
    "Route hardening and permissions are enforced in the backend, and this page is a reporting surface only.": "Route hardening and permissions are enforced in the backend, and this page is a reporting surface only.",
    "Review Areas": "Review Areas",
    "Source Links": "Source Links",
    "Last reviewed in-code": "Last reviewed in-code",
    "Security issue tracker": "Security issue tracker",
    "No runtime secrets, environment values, hashes, or credentials are displayed here.": "No runtime secrets, environment values, hashes, or credentials are displayed here.",
    "OWASP and API controls": "OWASP and API controls",
    "Dependency and CVE watch": "Dependency and CVE watch",
    "Database and RLS posture": "Database and RLS posture",
    "Audit and activity coverage": "Audit and activity coverage",
    "Open platform caveats": "Open platform caveats",
    "Expand": "Expand",
    "Collapse": "Collapse",
    "Review the senior prompt, audit reports, and active follow-up issues before production sign-off.": "Review the senior prompt, audit reports, and active follow-up issues before production sign-off.",
    "Review in Settings": "Review in Settings",
  },
  am: {
    "Security Posture": "የደህንነት ሁኔታ",
    "Operational security coverage for admin review. This page summarizes current control status without exposing secrets or live credentials.": "ለአስተዳዳሪ ግምገማ የደህንነት ሽፋንን ያሳያል። ይህ ገጽ ሚስጥሮችን ወይም የቀጥታ መግቢያ መረጃን ሳያሳይ የአሁኑን ቁጥጥር ሁኔታ ያጠቃልላል።",
    "Go back": "ተመለስ",
    "Restricted to security reviewers": "ለደህንነት ግምገማ ብቻ",
    "Only security reviewers, system managers, and administrators can access this page.": "ይህን ገጽ መድረስ የሚችሉት የደህንነት ግምገማ አካላት፣ የስርዓት አስተዳዳሪዎች እና አስተዳዳሪዎች ብቻ ናቸው።",
    "Current Posture": "የአሁኑ ሁኔታ",
    "Tracked Areas": "የሚከታተሉ ክፍሎች",
    "Open Follow-ups": "ክፍት ቀጣይ ስራዎች",
    "Security Notes": "የደህንነት ማስታወሻዎች",
    "Hidden admin surface": "የተደበቀ የአስተዳዳሪ ገጽ",
    "This route is intentionally kept out of the main sidebar. Reach it from Settings when conducting an admin or QA security review.": "ይህ መንገድ በዋናው የጎን አሰሳ ውስጥ ሆን ተብሎ አልተጨመረም። የአስተዳዳሪ ወይም QA የደህንነት ግምገማ ሲደረግ ከቅንብሮች ውስጥ ይድረሱበት።",
    "Healthy": "ጤናማ",
    "Needs Monitoring": "ክትትል ይፈልጋል",
    "Attention Needed": "ትኩረት ያስፈልጋል",
    "View Doc": "ሰነድ እይ",
    "View Issue": "ጉዳይ እይ",
    "Security review pack": "የደህንነት ግምገማ ጥቅል",
    "Status Summary": "የሁኔታ ማጠቃለያ",
    "Control": "መቆጣጠሪያ",
    "State": "ሁኔታ",
    "Evidence": "ማስረጃ",
    "Route hardening and permissions are enforced in the backend, and this page is a reporting surface only.": "የመንገድ ጠንካራነት እና ፈቃዶች በጀርባ አገልግሎት ይፈጸማሉ፣ እና ይህ ገጽ ሪፖርት ለማቅረብ ብቻ ነው።",
    "Review Areas": "የግምገማ ክፍሎች",
    "Source Links": "የምንጭ አገናኞች",
    "Last reviewed in-code": "በኮድ ውስጥ የተገመገመበት ጊዜ",
    "Security issue tracker": "የደህንነት ጉዳይ መከታተያ",
    "No runtime secrets, environment values, hashes, or credentials are displayed here.": "እዚህ የሚታዩት የስርዓት ሚስጥሮች፣ የአካባቢ እሴቶች፣ ሃሽ ወይም የመግቢያ መረጃዎች አይደሉም።",
    "OWASP and API controls": "የ OWASP እና API መቆጣጠሪያዎች",
    "Dependency and CVE watch": "የጥገኞች እና CVE ክትትል",
    "Database and RLS posture": "የዳታቤዝ እና RLS ሁኔታ",
    "Audit and activity coverage": "የኦዲት እና እንቅስቃሴ ሽፋን",
    "Open platform caveats": "ክፍት የመድረክ ማስጠንቀቂያዎች",
    "Expand": "ክፈት",
    "Collapse": "ዝጋ",
    "Review the senior prompt, audit reports, and active follow-up issues before production sign-off.": "ወደ ፕሮዳክሽን ከመላክ በፊት የከፍተኛ ግምገማ ፕሮምፕቱን፣ የኦዲት ሪፖርቶችን እና ክፍት ቀጣይ ጉዳዮችን ይመልከቱ።",
    "Review in Settings": "በቅንብሮች ውስጥ ይመልከቱ",
  },
};

type StatusTone = "healthy" | "monitoring" | "attention";

type StatusRow = {
  id: string;
  title: string;
  status: StatusTone;
  evidence: string;
  details: string[];
  links: Array<{ label: string; href: string; type: "doc" | "issue" }>;
};

const STATUS_STYLES: Record<StatusTone, { label: string; badge: string; dot: string }> = {
  healthy: {
    label: "Healthy",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    dot: "bg-emerald-400",
  },
  monitoring: {
    label: "Needs Monitoring",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    dot: "bg-amber-400",
  },
  attention: {
    label: "Attention Needed",
    badge: "border-rose-500/30 bg-rose-500/10 text-rose-300",
    dot: "bg-rose-400",
  },
};

const REVIEWED_DATE = "2026-06-30";

export default function SecurityPosturePage() {
  const router = useRouter();
  const { lang } = useLanguage();
  const { hasPermission, isAuthenticated, isLoading: authLoading } = useAuth();
  const [expandedId, setExpandedId] = useState<string>("owasp-api");
  const t = useCallback((key: string) => TRANSLATIONS[lang]?.[key] || key, [lang]);

  const canAccessSecurity = hasPermission("users:manage") || hasPermission("settings:write");

  const statusRows = useMemo<StatusRow[]>(
    () => [
      {
        id: "owasp-api",
        title: t("OWASP and API controls"),
        status: "monitoring",
        evidence:
          "Backend permission middleware and permission-aware UI are in place, but localStorage JWT remains an open XSS blast-radius caveat documented in project context and audit reports.",
        details: [
          "Dynamic permission slugs gate direct URLs and backend routes across HR, events, assets, payroll, and settings surfaces.",
          "The senior review process explicitly audits BOLA, BFLA, sensitive response leakage, and frontend/backend permission parity.",
          "Known caveat: JWT storage in localStorage is still tracked as a risk until the auth model is upgraded.",
        ],
        links: [
          {
            label: t("View Doc"),
            href: "https://github.com/LeulTew/dreamlux-erp/blob/main/docs/SENIOR_ISSUE_REVIEW_PROMPT.md",
            type: "doc",
          },
          {
            label: t("View Doc"),
            href: "https://github.com/LeulTew/dreamlux-erp/blob/main/project-context.md",
            type: "doc",
          },
        ],
      },
      {
        id: "dependency-cve",
        title: t("Dependency and CVE watch"),
        status: "monitoring",
        evidence:
          "Security review guidance exists, but dependency/CVE review is still a manual cadence item rather than a live in-app feed.",
        details: [
          "This page intentionally links to the review pack and active GitHub follow-up issues instead of attempting to surface unverified live CVE data.",
          "The operational expectation is to run dependency and release checks during senior review and before production sign-off.",
          "Issue #83 adds a stable admin checkpoint so the review does not depend on tribal knowledge.",
        ],
        links: [
          {
            label: t("View Issue"),
            href: "https://github.com/LeulTew/dreamlux-erp/issues/83",
            type: "issue",
          },
          {
            label: t("View Doc"),
            href: "https://github.com/LeulTew/dreamlux-erp/blob/main/docs/CODEX_AUDIT_REPORT.md",
            type: "doc",
          },
        ],
      },
      {
        id: "db-rls",
        title: t("Database and RLS posture"),
        status: "healthy",
        evidence:
          "RLS hardening and public privilege revocation are already established. The backend remains the sole data-access gatekeeper.",
        details: [
          "The database review documents row-level security coverage across the application tables.",
          "The frontend does not connect directly to privileged data stores; privileged reads flow through the Express API.",
          "Security checks for assignment integrity and row-scope boundaries are already covered by backend tests.",
        ],
        links: [
          {
            label: t("View Doc"),
            href: "https://github.com/LeulTew/dreamlux-erp/blob/main/docs/issues/issue_31_db_rls_hardening.md",
            type: "doc",
          },
        ],
      },
      {
        id: "audit-coverage",
        title: t("Audit and activity coverage"),
        status: "healthy",
        evidence:
          "Shared activity feed, proposal/event audit logs, notification hooks, and setup-doctype notifications are present for the current tracked surfaces.",
        details: [
          "Activity drawer and normalized activity APIs now cover cross-record review flows.",
          "Financial, setup, inventory, payroll, and proposal/event changes are expected to remain inside the senior review and audit trail process.",
          "Future new doctypes should extend the same actor, source, and redaction model rather than inventing a second audit path.",
        ],
        links: [
          {
            label: t("View Issue"),
            href: "https://github.com/LeulTew/dreamlux-erp/issues/82",
            type: "issue",
          },
          {
            label: t("View Issue"),
            href: "https://github.com/LeulTew/dreamlux-erp/issues/81",
            type: "issue",
          },
        ],
      },
      {
        id: "open-caveats",
        title: t("Open platform caveats"),
        status: "attention",
        evidence:
          "The codebase still carries known architecture caveats: localStorage JWT usage, in-memory permission cache limits, and the oversized events route file.",
        details: [
          "These are not regressions introduced by this issue, but they remain relevant for security posture tracking and production planning.",
          "This page keeps those caveats visible to admins without exposing any sensitive runtime values.",
          "Treat these as follow-up hardening targets during future auth and backend modularization work.",
        ],
        links: [
          {
            label: t("View Doc"),
            href: "https://github.com/LeulTew/dreamlux-erp/blob/main/project-context.md",
            type: "doc",
          },
        ],
      },
    ],
    [t],
  );

  const counts = statusRows.reduce(
    (acc, row) => {
      acc.total += 1;
      acc[row.status] += 1;
      return acc;
    },
    { total: 0, healthy: 0, monitoring: 0, attention: 0 },
  );

  if (authLoading) {
    return (
      <AuthLayout>
        <div className="page-container pb-16">
          <div className="h-40 animate-pulse rounded-md border border-border bg-card" />
        </div>
      </AuthLayout>
    );
  }

  if (!isAuthenticated || !canAccessSecurity) {
    return (
      <AuthLayout>
        <ForbiddenState
          title="Restricted to security reviewers"
          description="Only security reviewers, system managers, and administrators can access this page."
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="page-container pb-16 space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <button
              onClick={() => router.back()}
              className="flex h-12 w-12 items-center justify-center rounded-md border border-border bg-card text-muted transition-colors [@media(hover:hover)]:hover:text-foreground"
              title={t("Go back")}
            >
              <HiArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex h-12 w-12 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
              <HiLockClosed className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("Security Posture")}</h1>
              <p className="max-w-3xl text-sm text-muted">
                {t(
                  "Operational security coverage for admin review. This page summarizes current control status without exposing secrets or live credentials.",
                )}
              </p>
            </div>
          </div>

          <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs font-semibold text-amber-200">
            <div className="flex items-center gap-2">
              <HiExclamationTriangle className="h-4 w-4 shrink-0" />
              <span>{t("No runtime secrets, environment values, hashes, or credentials are displayed here.")}</span>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <MetricCard label={t("Tracked Areas")} value={counts.total} tone="neutral" />
          <MetricCard label={t("Current Posture")} value={counts.healthy} note={t("Healthy")} tone="healthy" />
          <MetricCard label={t("Open Follow-ups")} value={counts.monitoring} note={t("Needs Monitoring")} tone="monitoring" />
          <MetricCard label={t("Security Notes")} value={counts.attention} note={t("Attention Needed")} tone="attention" />
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
          <div className="space-y-4 rounded-md border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">{t("Status Summary")}</h2>
                <p className="mt-1 text-xs text-muted">
                  {t("Route hardening and permissions are enforced in the backend, and this page is a reporting surface only.")}
                </p>
              </div>
              <span className="rounded-sm border border-border bg-card-alt px-2 py-1 text-[11px] font-semibold text-muted">
                {t("Last reviewed in-code")}: {REVIEWED_DATE}
              </span>
            </div>

            <div className="overflow-hidden rounded-md border border-border">
              <div className="grid grid-cols-[minmax(0,1.2fr)_140px_minmax(0,1.7fr)] border-b border-border bg-card-alt px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
                <span>{t("Control")}</span>
                <span>{t("State")}</span>
                <span>{t("Evidence")}</span>
              </div>
              {statusRows.map((row) => {
                const open = expandedId === row.id;
                const statusStyle = STATUS_STYLES[row.status];
                return (
                  <div key={row.id} className="border-b border-border last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setExpandedId((current) => (current === row.id ? "" : row.id))}
                      className="grid min-h-[72px] w-full grid-cols-[minmax(0,1.2fr)_140px_minmax(0,1.7fr)] items-center gap-3 px-4 py-3 text-left transition-colors [@media(hover:hover)]:hover:bg-card-alt/60"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{row.title}</p>
                        <p className="mt-1 text-[11px] text-muted">{open ? t("Collapse") : t("Expand")}</p>
                      </div>
                      <div>
                        <span className={`inline-flex items-center gap-2 rounded-sm border px-2 py-1 text-[11px] font-semibold ${statusStyle.badge}`}>
                          <span className={`h-2 w-2 rounded-full ${statusStyle.dot}`} />
                          {t(statusStyle.label)}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs leading-5 text-muted">{row.evidence}</p>
                        {open ? <HiChevronUp className="mt-0.5 h-4 w-4 shrink-0 text-muted" /> : <HiChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted" />}
                      </div>
                    </button>

                    {open && (
                      <div className="grid gap-4 border-t border-border bg-card-alt/30 px-4 py-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(240px,0.8fr)]">
                        <div>
                          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{t("Review Areas")}</h3>
                          <ul className="mt-3 space-y-2">
                            {row.details.map((detail) => (
                              <li key={detail} className="flex items-start gap-2 text-sm text-foreground">
                                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                                <span>{detail}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{t("Source Links")}</h3>
                          <div className="mt-3 flex flex-col gap-2">
                            {row.links.map((link) => (
                              <Link
                                key={`${row.id}-${link.href}`}
                                href={link.href}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex min-h-12 items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-3 text-sm font-semibold text-foreground transition-colors [@media(hover:hover)]:hover:border-primary/40 [@media(hover:hover)]:hover:text-primary"
                              >
                                <span className="flex items-center gap-2">
                                  {link.type === "doc" ? <HiDocumentText className="h-4 w-4" /> : <HiQueueList className="h-4 w-4" />}
                                  <span>{link.label}</span>
                                </span>
                                <span className="text-xs text-muted">{link.type === "doc" ? "GitHub doc" : "GitHub issue"}</span>
                              </Link>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-md border border-border bg-card p-5">
              <div className="flex items-center gap-2">
                <HiShieldCheck className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">{t("Security review pack")}</h2>
              </div>
              <p className="mt-2 text-sm text-muted">
                {t("Review the senior prompt, audit reports, and active follow-up issues before production sign-off.")}
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <Link
                  href="https://github.com/LeulTew/dreamlux-erp/blob/main/docs/SENIOR_ISSUE_REVIEW_PROMPT.md"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-12 items-center justify-between rounded-md border border-border bg-card-alt px-3 py-3 text-sm font-semibold text-foreground transition-colors [@media(hover:hover)]:hover:border-primary/40 [@media(hover:hover)]:hover:text-primary"
                >
                  <span>docs/SENIOR_ISSUE_REVIEW_PROMPT.md</span>
                  <HiDocumentText className="h-4 w-4 shrink-0" />
                </Link>
                <Link
                  href="https://github.com/LeulTew/dreamlux-erp/blob/main/docs/FINAL_SRD_AUDIT_REPORT.md"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-12 items-center justify-between rounded-md border border-border bg-card-alt px-3 py-3 text-sm font-semibold text-foreground transition-colors [@media(hover:hover)]:hover:border-primary/40 [@media(hover:hover)]:hover:text-primary"
                >
                  <span>docs/FINAL_SRD_AUDIT_REPORT.md</span>
                  <HiDocumentText className="h-4 w-4 shrink-0" />
                </Link>
                <Link
                  href="https://github.com/LeulTew/dreamlux-erp/blob/main/docs/CODEX_AUDIT_REPORT.md"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-12 items-center justify-between rounded-md border border-border bg-card-alt px-3 py-3 text-sm font-semibold text-foreground transition-colors [@media(hover:hover)]:hover:border-primary/40 [@media(hover:hover)]:hover:text-primary"
                >
                  <span>docs/CODEX_AUDIT_REPORT.md</span>
                  <HiDocumentText className="h-4 w-4 shrink-0" />
                </Link>
              </div>
            </div>

            <div className="rounded-md border border-border bg-card p-5">
              <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">{t("Hidden admin surface")}</h2>
              <p className="mt-2 text-sm text-muted">
                {t(
                  "This route is intentionally kept out of the main sidebar. Reach it from Settings when conducting an admin or QA security review.",
                )}
              </p>
              <Link
                href="/settings"
                className="mt-4 inline-flex min-h-12 items-center justify-center rounded-md border border-border bg-card-alt px-4 py-3 text-sm font-semibold text-foreground transition-colors [@media(hover:hover)]:hover:border-primary/40 [@media(hover:hover)]:hover:text-primary"
              >
                {t("Review in Settings")}
              </Link>
            </div>
          </aside>
        </section>
      </div>
    </AuthLayout>
  );
}

function MetricCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: number;
  note?: string;
  tone: "neutral" | "healthy" | "monitoring" | "attention";
}) {
  const toneClasses =
    tone === "healthy"
      ? "border-emerald-500/20 bg-emerald-500/5"
      : tone === "monitoring"
        ? "border-amber-500/20 bg-amber-500/5"
        : tone === "attention"
          ? "border-rose-500/20 bg-rose-500/5"
          : "border-border bg-card";

  return (
    <div className={`rounded-md border p-4 ${toneClasses}`}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 text-4xl font-black tabular-nums tracking-tight text-foreground">{value}</p>
      {note ? <p className="mt-1 text-xs font-medium text-muted">{note}</p> : null}
    </div>
  );
}
