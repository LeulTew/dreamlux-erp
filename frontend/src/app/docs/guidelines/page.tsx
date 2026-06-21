"use client";
import React, { useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/hooks/use-language";
import { HiBookOpen, HiChevronRight, HiArrowLeft } from "react-icons/hi2";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Document Guidelines": "DreamLux System Guidelines",
    "Back to Dashboard": "Back to Dashboard",
    "TOC": "Table of Contents",
    "Section 1": "1. Business Overview",
    "Section 2": "2. User Roles & Permissions",
    "Section 3": "3. Pillars & System Modules",
    "Section 4": "4. Event Lifecycle & Workflow States",
    "Section 5": "5. Profitability & Target Margins",
    "Section 6": "6. Conflict & Resource Warnings",
    "Business Overview Text": "DreamLux PLC is a premium event decoration and management company based in Addis Ababa, Ethiopia. The system serves as a central ERP to coordinate HR, payroll, inventory, and events planning.",
    "Current Pain Points": "Pain Points Addressed:",
    "Point 1": "Manual base salary and commission calculation errors.",
    "Point 2": "Lack of centralized inventory tracking leading to lost assets.",
    "Point 3": "Ad-hoc employee assignment causing resource scheduling conflicts.",
    "Point 4": "Untracked fuel and vehicle logs, preventing true event profitability analysis.",
    "Roles Table Title": "Roles & Permission Matrix",
    "Role": "Role",
    "Permissions": "Allowed Scopes / Actions",
    "CEO Desc": "Full system visibility, view financial and profit analytics, approve/reject proposals and expenses.",
    "Ops Desc": "Manage employee database, oversee assets/recounts, configure salary levels, view operations.",
    "Acct Desc": "Process payroll runs, verify expense receipts, view financials, export reports.",
    "EvMgr Desc": "Submit new proposal intakes, plan events, assign staff/vehicles, manage checklist items.",
    "InvDesc": "Track asset stocks, check-out items, execute recounts, log damaged inventory.",
    "Lifecycle Title": "Event & Proposal Lifecycle Workflow",
    "Draft State": "Draft: Created by Event Manager, editable, calculations remain local.",
    "Sub State": "Submitted: Locked for editing, sent to CEO & Ops Manager for review.",
    "App State": "Approved: Authorized for planning. Triggers client design package selection.",
    "Rej State": "Rejected: Returned to Event Manager for adjustment. Requires rejection reason.",
    "Conv State": "Converted: Real active event created atomically. Links back to the original proposal.",
    "Cancel State": "Canceled: Archival state, indicates event will not proceed.",
    "Profit Title": "Profitability & Margin Target Targets",
    "Target Rules": "The ERP enforces a strict 25% minimum profit margin target on all events and proposals:",
    "Rule A": "Margin Calculation: ((Revenue - Total Estimated Cost) / Revenue) * 100",
    "Rule B": "Warnings: Proactively highlighted in orange/yellow (10%-25%) or red (<10% or negative profit) in the intake form.",
    "Rule C": "Verification: System logs a low-margin warning tag on submissions below 25% to require CEO override.",
    "Resource Title": "Conflict & Resource Warnings",
    "Conflict Rules": "Pillar 3 monitors conflicts during employee and vehicle assignments:",
    "Conflict A": "Employee Double-Booking: Warns if a decorator/manager is assigned to overlapping events.",
    "Conflict B": "Vehicle Shifts: Restricts assignment if the vehicle is already checked out or on an active trip log.",
    "Conflict C": "Inventory Hardening: Reconciles allocated quantities against actual store counts to prevent double-allocation of same decor items.",
  },
  am: {
    "Document Guidelines": "የDreamLux የሥራ መመሪያዎች",
    "Back to Dashboard": "ወደ ዳሽቦርድ ተመለስ",
    "TOC": "ማውጫ",
    "Section 1": "1. የንግድ ሥራ አጠቃላይ እይታ",
    "Section 2": "2. የተጠቃሚ ሚናዎች እና ፈቃዶች",
    "Section 3": "3. አውታሮች እና የሥራ ክፍሎች",
    "Section 4": "4. የዝግጅቶች የሕይወት ዑደት እና ደረጃዎች",
    "Section 5": "5. ትርፋማነት እና የህዳግ ግቦች",
    "Section 6": "6. የተደራራቢነት እና የሀብት ማስጠንቀቂያዎች",
    "Business Overview Text": "ድሪም ላክስ ኃ.የተ.የግ.ማህበር አዲስ አበባ፣ ኢትዮጵያ ውስጥ የሚገኝ የዝግጅቶች ማስጌጥ እና ማስተናገድ ድርጅት ነው። ይህ የሶፍትዌር ሥርዓት የሰው ኃይልን፣ ክፍያን፣ መጋዘንን እና የዝግጅቶች እቅድን ለማስተባበር የሚያገለግል ማዕከላዊ ERP ነው።",
    "Current Pain Points": "በሥርዓቱ የተፈቱ ተግዳሮቶች፡",
    "Point 1": "በእጅ የሚሰሩ የኮሚሽን እና የመሠረታዊ ደመወዝ ስሌት ስህተቶች።",
    "Point 2": "ማዕከላዊ የእቃ ክትትል ባለመኖሩ ንብረቶች መጥፋት።",
    "Point 3": "ያለዕቅድ የሠራተኞች ምደባ ምክንያት የሚከሰቱ የሰዓት መደራረቦች።",
    "Point 4": "ያልተመዘገቡ የነዳጅ እና የትራንስፖርት ወጪዎች ትክክለኛውን የዝግጅት ትርፍ ማወቅ አለማስቻላቸው።",
    "Roles Table Title": "የሚናዎች እና ፈቃዶች ዝርዝር",
    "Role": "ሚና",
    "Permissions": "የተፈቀዱ ተግባራት / ወሰኖች",
    "CEO Desc": "ሙሉ የስርዓቱ ታይነት፣ የፋይናንስ እና ትርፍ ትንታኔዎችን ማየት፣ ጥያቄዎችን እና ወጪዎችን ማጽደቅ/ውድቅ ማድረግ።",
    "Ops Desc": "የሰራተኞች ዳታቤዝ ማስተዳደር፣ እቃዎች እና ቆጠራዎች መቆጣጠር፣ የደመወዝ ደረጃዎችን ማዋቀር፣ ስራዎችን መከታተል።",
    "Acct Desc": "የደመወዝ ክፍያዎችን ማስኬድ፣ የወጪ ደረሰኞችን ማረጋገጥ፣ ፋይናንስ ማየት፣ ሪፖርቶችን መላክ።",
    "EvMgr Desc": "አዲስ የዝግጅት ጥያቄዎችን ማቅረብ፣ ማቀድ፣ ሰራተኞች እና ተሽከርካሪዎችን መመደብ፣ የቼክ ሊስት ስራዎችን መከታተል።",
    "InvDesc": "የእቃ ክምችቶችን መከታተል፣ እቃዎችን ማውጣት፣ ቆጠራዎችን ማካሄድ፣ የተበላሹ ንብረቶችን መመዝገብ።",
    "Lifecycle Title": "የዝግጅት እና የጥያቄዎች የሕይወት ዑደት",
    "Draft State": "ረቂቅ (Draft)፡ በዝግጅት አስተዳዳሪው የተፈጠረ፣ ሊስተካከል የሚችል፣ ስሌቶች በአካባቢው ብቻ የሚቀመጡበት።",
    "Sub State": "የቀረበ (Submitted)፡ ለአስተያየት የተቆለፈ፣ ለዋና ስራ አስኪያጅ እና ለስራዎች ስራ አስኪያጅ ለግምገማ የሚላክበት።",
    "App State": "የጸደቀ (Approved)፡ ለእቅድ የተፈቀደ። የደንበኛ ዲዛይን ጥቅል ምርጫን የሚጀምርበት።",
    "Rej State": "ውድቅ የተደረገ (Rejected)፡ ለአስተያየት እና ማሻሻያ ወደ ዝግጅት አስተዳዳሪው የሚመለስበት። የውድቅ ማድረጊያ ምክንያት ያስፈልገዋል።",
    "Conv State": "የተለወጠ (Converted)፡ አዲስ ንቁ ዝግጅት የሚፈጠርበት እና ከዋናው ጥያቄ ጋር የሚያያዝበት።",
    "Cancel State": "የተሰረዘ (Canceled)፡ ዝግጅቱ እንደማይቀጥል የሚያመለክትበት ደረጃ።",
    "Profit Title": "ትርፋማነት እና የህዳግ ግቦች",
    "Target Rules": "ERP በሁሉም ዝግጅቶች እና ጥያቄዎች ላይ ጥብቅ የ 25% አነስተኛ የትርፍ ህዳግ ግብን ያስገድዳል፡",
    "Rule A": "የህዳግ አሰራር ስሌት፡ ((ጠቅላላ ገቢ - ግምታዊ ወጪ) / ጠቅላላ ገቢ) * 100",
    "Rule B": "ማስጠንቀቂያዎች፡ በፎርሙ ላይ ከ10%-25% (ቢጫ/ብርቱካን) ወይም ከ10% በታች (ቀይ) ህዳግ በግልጽ ምልክት ይደረግባቸዋል።",
    "Rule C": "ማረጋገጫ፡ ስርዓቱ ከ25% በታች ለሆኑ ጥያቄዎች የዋና ስራ አስኪያጅን ፈቂያድ የሚጠይቅ ልዩ ማስጠንቀቂያ ይመዘግባል።",
    "Resource Title": "የሀብት መደራረብ ማስጠንቀቂያዎች",
    "Conflict Rules": "Pillar 3 በሰራተኞች እና ተሽከርካሪዎች ምደባ ወቅት ግጭቶችን ይቆጣጠራል፡",
    "Conflict A": "የሰራተኛ መደራረብ፡ አንድ ሰራተኛ በተመሳሳይ ጊዜ በሌላ ዝግጅት ላይ ከተመደበ ማስጠንቀቂያ ይሰጣል።",
    "Conflict B": "የተሽከርካሪ ፈረቃ፡ ተሽከርካሪው አስቀድሞ በስራ ላይ ከሆነ ወይም የጉዞ ሎግ ከተመዘገበበት ምደባውን ይከለክላል።",
    "Conflict C": "የእቃ ክምችት ማረጋገጫ፡ የጌጣጌጥ እቃዎች በአንድ ጊዜ ለሁለት ዝግጅቶች እንዳይመደቡ ከቆጠራው ጋር ያጣራል።",
  }
};

export default function GuidelinesPage() {
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;

  const [activeSection, setActiveSection] = useState("sec1");

  const sections = [
    { id: "sec1", label: t("Section 1") },
    { id: "sec2", label: t("Section 2") },
    { id: "sec3", label: t("Section 3") },
    { id: "sec4", label: t("Section 4") },
    { id: "sec5", label: t("Section 5") },
    { id: "sec6", label: t("Section 6") }
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col no-print">
      {/* Header Banner */}
      <header className="border-b border-border bg-card p-4 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-lg text-primary border border-primary/20">
              <HiBookOpen className="w-6 h-6" />
            </div>
            <h1 className="text-lg font-black tracking-tight uppercase text-foreground">
              {t("Document Guidelines")}
            </h1>
          </div>
          <Link
            href="/events"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider bg-card-alt text-muted border border-border [@media(hover:hover)]:hover:text-foreground transition-all"
          >
            <HiArrowLeft className="w-4 h-4" />
            {t("Back to Dashboard")}
          </Link>
        </div>
      </header>

      {/* Content Layout */}
      <main className="max-w-6xl w-full mx-auto flex-1 flex flex-col md:flex-row gap-6 p-4 md:p-6 items-stretch">
        
        {/* Sidebar Index */}
        <aside className="w-full md:w-64 shrink-0 flex flex-col gap-4">
          <div className="bg-card border border-border rounded-lg p-4 sticky top-24">
            <h3 className="text-xs font-black text-muted uppercase tracking-wider mb-3">
              {t("TOC")}
            </h3>
            <nav className="space-y-1">
              {sections.map((sec) => (
                <button
                  key={sec.id}
                  onClick={() => {
                    setActiveSection(sec.id);
                    document.getElementById(sec.id)?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center justify-between ${
                    activeSection === sec.id
                      ? "bg-primary/10 text-primary border-l-2 border-l-primary"
                      : "text-muted [@media(hover:hover)]:hover:bg-card-alt [@media(hover:hover)]:hover:text-foreground"
                  }`}
                >
                  <span>{sec.label}</span>
                  <HiChevronRight className="w-3 h-3" />
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Sections Content */}
        <div className="flex-1 space-y-6">
          
          {/* Section 1: Business Overview */}
          <section id="sec1" className="bg-card border border-border rounded-lg p-5 sm:p-6 space-y-4 scroll-mt-24">
            <h2 className="text-base font-black text-foreground uppercase tracking-wider border-b border-border/50 pb-2 text-primary">
              {t("Section 1")}
            </h2>
            <p className="text-sm font-semibold text-foreground/80 leading-relaxed">
              {t("Business Overview Text")}
            </p>
            <div className="mt-4 space-y-2.5">
              <h4 className="text-xs font-black text-muted uppercase tracking-wider">
                {t("Current Pain Points")}
              </h4>
              <ul className="list-disc pl-5 text-xs text-foreground/70 font-semibold space-y-1.5">
                <li>{t("Point 1")}</li>
                <li>{t("Point 2")}</li>
                <li>{t("Point 3")}</li>
                <li>{t("Point 4")}</li>
              </ul>
            </div>
          </section>

          {/* Section 2: Roles Matrix */}
          <section id="sec2" className="bg-card border border-border rounded-lg p-5 sm:p-6 space-y-4 scroll-mt-24">
            <h2 className="text-base font-black text-foreground uppercase tracking-wider border-b border-border/50 pb-2 text-primary">
              {t("Section 2")}
            </h2>
            <h3 className="text-xs font-black text-muted uppercase tracking-wider">
              {t("Roles Table Title")}
            </h3>
            <div className="overflow-x-auto border border-border rounded-lg">
              <table className="w-full border-collapse text-left text-xs font-semibold">
                <thead>
                  <tr className="bg-card-alt border-b border-border text-muted">
                    <th className="p-3 uppercase tracking-wider font-black">{t("Role")}</th>
                    <th className="p-3 uppercase tracking-wider font-black">{t("Permissions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50 text-foreground/80">
                  <tr>
                    <td className="p-3 font-black text-primary">Owner / CEO</td>
                    <td className="p-3">{t("CEO Desc")}</td>
                  </tr>
                  <tr className="bg-card-alt/30">
                    <td className="p-3 font-black text-primary">Ops Manager</td>
                    <td className="p-3">{t("Ops Desc")}</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-black text-primary">Accountant</td>
                    <td className="p-3">{t("Acct Desc")}</td>
                  </tr>
                  <tr className="bg-card-alt/30">
                    <td className="p-3 font-black text-primary">Event Manager</td>
                    <td className="p-3">{t("EvMgr Desc")}</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-black text-primary">Inventory Officer</td>
                    <td className="p-3">{t("InvDesc")}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 3: Pillars */}
          <section id="sec3" className="bg-card border border-border rounded-lg p-5 sm:p-6 space-y-4 scroll-mt-24">
            <h2 className="text-base font-black text-foreground uppercase tracking-wider border-b border-border/50 pb-2 text-primary">
              {t("Section 3")}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-card-alt border border-border rounded-lg space-y-2">
                <h4 className="text-xs font-black text-primary uppercase tracking-wider">PILLAR 1: HR & Payroll</h4>
                <p className="text-[11px] text-muted font-semibold leading-relaxed">
                  Coordinates employee records, job paygrade levels, base salaries, attendance sheets, and commission-based payments.
                </p>
              </div>
              <div className="p-4 bg-card-alt border border-border rounded-lg space-y-2">
                <h4 className="text-xs font-black text-primary uppercase tracking-wider">PILLAR 2: Store / Inventory</h4>
                <p className="text-[11px] text-muted font-semibold leading-relaxed">
                  Tracks equipment, decor items, and consumables with item photos, stock counts, low stock alerts, and reconciliation logs.
                </p>
              </div>
              <div className="p-4 bg-card-alt border border-border rounded-lg space-y-2">
                <h4 className="text-xs font-black text-primary uppercase tracking-wider">PILLAR 3: Event Operations</h4>
                <p className="text-[11px] text-muted font-semibold leading-relaxed">
                  Orchestrates event planning, budget proposals, staff/vehicle assignments, fuel tracking, and real-time profit analytics.
                </p>
              </div>
            </div>
          </section>

          {/* Section 4: Lifecycle */}
          <section id="sec4" className="bg-card border border-border rounded-lg p-5 sm:p-6 space-y-4 scroll-mt-24">
            <h2 className="text-base font-black text-foreground uppercase tracking-wider border-b border-border/50 pb-2 text-primary">
              {t("Section 4")}
            </h2>
            <h3 className="text-xs font-black text-muted uppercase tracking-wider">
              {t("Lifecycle Title")}
            </h3>
            <div className="space-y-3">
              {[
                { label: "Draft", desc: t("Draft State"), color: "bg-muted/10 border-border text-muted" },
                { label: "Submitted", desc: t("Sub State"), color: "bg-warning/10 border-warning/20 text-warning" },
                { label: "Approved", desc: t("App State"), color: "bg-success/10 border-success/20 text-success" },
                { label: "Rejected", desc: t("Rej State"), color: "bg-danger/10 border-danger/20 text-danger" },
                { label: "Converted", desc: t("Conv State"), color: "bg-primary/10 border-primary/20 text-primary" },
                { label: "Canceled", desc: t("Cancel State"), color: "bg-muted/10 border-border text-muted-dark" }
              ].map((state) => (
                <div key={state.label} className="flex gap-3 items-start border-l-2 border-primary/30 pl-4 py-1">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${state.color}`}>
                    {state.label}
                  </span>
                  <p className="text-xs text-foreground/80 font-semibold leading-relaxed">
                    {state.desc}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Section 5: Profit & Margin */}
          <section id="sec5" className="bg-card border border-border rounded-lg p-5 sm:p-6 space-y-4 scroll-mt-24">
            <h2 className="text-base font-black text-foreground uppercase tracking-wider border-b border-border/50 pb-2 text-primary">
              {t("Section 5")}
            </h2>
            <div className="space-y-3">
              <p className="text-xs font-bold text-foreground/90">{t("Target Rules")}</p>
              <div className="p-4 bg-card-alt border border-border rounded-lg space-y-2 text-xs font-semibold">
                <p className="text-primary font-black">{t("Rule A")}</p>
                <p className="text-foreground/75 leading-relaxed">{t("Rule B")}</p>
                <p className="text-foreground/75 leading-relaxed">{t("Rule C")}</p>
              </div>
            </div>
          </section>

          {/* Section 6: Warnings & Conflicts */}
          <section id="sec6" className="bg-card border border-border rounded-lg p-5 sm:p-6 space-y-4 scroll-mt-24">
            <h2 className="text-base font-black text-foreground uppercase tracking-wider border-b border-border/50 pb-2 text-primary">
              {t("Section 6")}
            </h2>
            <div className="space-y-3">
              <p className="text-xs font-bold text-foreground/90">{t("Conflict Rules")}</p>
              <div className="p-4 bg-card-alt border border-border rounded-lg space-y-3 text-xs font-semibold">
                <div className="space-y-1">
                  <h4 className="font-black text-primary uppercase text-[11px]">{t("Conflict A")}</h4>
                  <p className="text-foreground/70">Staff availability is cross-checked against overlapping date ranges dynamically.</p>
                </div>
                <div className="space-y-1 border-t border-border/50 pt-2">
                  <h4 className="font-black text-primary uppercase text-[11px]">{t("Conflict B")}</h4>
                  <p className="text-foreground/70">A warning tag triggers if active trips exist for the vehicle in the specified event slot.</p>
                </div>
                <div className="space-y-1 border-t border-border/50 pt-2">
                  <h4 className="font-black text-primary uppercase text-[11px]">{t("Conflict C")}</h4>
                  <p className="text-foreground/70">Store count logic restricts allocating quantities greater than physical store quantity subtract active event usage.</p>
                </div>
              </div>
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
