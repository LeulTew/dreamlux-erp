"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import PayrollReminder from "@/components/PayrollReminder";
import Breadcrumbs from "@/components/Breadcrumbs";
import { useTheme } from "@/hooks/use-theme";
import { useLanguage } from "@/hooks/use-language";
import { 
  HiOutlineSun, 
  HiOutlineMoon, 
  HiChevronDown, 
  HiArrowRightOnRectangle, 
  HiOutlineUser, 
  HiOutlineInformationCircle, 
  HiArrowsRightLeft,
  HiMagnifyingGlass
} from "react-icons/hi2";
import UserAvatar from "@/components/UserAvatar";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Sign Out": "Sign Out",
    Cancel: "Cancel",
    "Are you sure you want to sign out?": "Are you sure you want to sign out?",
    Language: "Language",
    Theme: "Theme",
    "Page Width": "Page Width",
    "Profile Settings": "Profile Settings",
    "About ERP": "About ERP",
    Full: "Full Canvas",
    Normal: "Contained Canvas",
    "About Dream Lux ERP": "About Dream Lux ERP",
    "Dream Lux ERP Description": "Enterprise Resource Planning for premium event logistics, HR, payroll, and asset management.",
    Close: "Close",
    Version: "Version",
    "Database Status": "Database Connected",
  },
  am: {
    "Sign Out": "ውጣ",
    Cancel: "ተመለስ",
    "Are you sure you want to sign out?": "በእርግጥ መውጣት ይፈልጋሉ?",
    Language: "ቋንቋ",
    Theme: "ገጽታ",
    "Page Width": "የገጽ ስፋት",
    "Profile Settings": "የመገለጫ ቅንብሮች",
    "About ERP": "ስለ ሲስተሙ",
    Full: "ሙሉ ስፋት",
    Normal: "መደበኛ ስፋት",
    "About Dream Lux ERP": "ስለ ድሪም ላክስ ERP",
    "Dream Lux ERP Description": "የላቀ የዝግጅት ዝግጅት፣ የሰው ኃይል አስተዳደር፣ የደመወዝ እና የንብረት ቁጥጥር አስተዳደር ሲስተም።",
    Close: "ዝጋ",
    Version: "ስሪት",
    "Database Status": "ዳታቤዝ ተገናኝቷል",
  },
};

const SEARCH_ITEMS = [
  { label: "Employees List", amLabel: "የሰራተኞች ዝርዝር", href: "/", category: "HR" },
  { label: "Add Employee", amLabel: "ሰራተኛ መዝግብ", href: "/insert", category: "HR" },
  { label: "Events Calendar", amLabel: "ዝግጅቶች", href: "/events", category: "Events" },
  { label: "Payroll Dashboard", amLabel: "ደመወዝ", href: "/hr/payments", category: "HR" },
  { label: "Salary Levels", amLabel: "የደመወዝ ደረጃዎች", href: "/hr/salary-levels", category: "HR" },
  { label: "Event Types Settings", amLabel: "የዝግጅት አይነቶች", href: "/hr/event-types", category: "Events" },
  { label: "Inventory Dashboard", amLabel: "የዕቃዎች ዋና ገጽ", href: "/assets/dashboard", category: "Inventory" },
  { label: "Inventory Items List", amLabel: "የዕቃዎች ዝርዝር", href: "/assets", category: "Inventory" },
  { label: "Add Inventory Item", amLabel: "ዕቃ መዝግብ", href: "/assets/insert", category: "Inventory" },
  { label: "Stock Reconciliation", amLabel: "ቆጠራ ማመሳከሪያ", href: "/assets/reconcile", category: "Inventory" },
  { label: "Audit Log History", amLabel: "የቆጠራ ታሪክ", href: "/assets/history", category: "Inventory" },
  { label: "Inventory Reports", amLabel: "ዕቃዎች ሪፖርቶች", href: "/assets/reports", category: "Inventory" },
  { label: "Admin Settings", amLabel: "አስተዳዳሪ ቅንብሮች", href: "/settings", category: "Admin" },
];

function SearchDialog({
  isOpen,
  onClose,
  lang,
}: {
  isOpen: boolean;
  onClose: () => void;
  lang: string;
}) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = SEARCH_ITEMS.filter((item) => {
    const term = query.toLowerCase();
    return (
      item.label.toLowerCase().includes(term) ||
      item.amLabel.toLowerCase().includes(term) ||
      item.category.toLowerCase().includes(term)
    );
  });

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        setQuery("");
        setSelectedIndex(0);
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          router.push(filtered[selectedIndex].href);
          onClose();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, filtered, selectedIndex, router, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-80 bg-black/60 backdrop-blur-sm pointer-events-auto animate-fade-in"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-80 flex items-start justify-center pointer-events-none p-4 pt-[15vh]">
        <div className="pointer-events-auto bg-card border border-border w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[50vh] animate-scale-in">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60">
            <HiMagnifyingGlass className="w-5 h-5 text-muted shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              placeholder={lang === "en" ? "Search pages, tools or settings..." : "ገጾችን፣ ዕቃዎችን ወይም ቅንብሮችን ይፈልጉ..."}
              className="w-full bg-transparent border-none text-foreground text-sm focus:outline-none placeholder-muted"
            />
            <span className="text-[10px] text-muted border border-border px-1.5 py-0.5 rounded-md font-mono shrink-0 select-none">ESC</span>
          </div>

          <div className="flex-1 overflow-y-auto p-2 no-scrollbar">
            {filtered.length > 0 ? (
              <div className="flex flex-col gap-0.5">
                {filtered.map((item, idx) => {
                  const isSelected = idx === selectedIndex;
                  return (
                    <button
                      key={item.href}
                      onClick={() => {
                        router.push(item.href);
                        onClose();
                      }}
                      className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center justify-between cursor-pointer ${
                        isSelected ? "bg-primary/10 text-primary" : "hover:bg-card-alt text-foreground"
                      }`}
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-bold">{lang === "en" ? item.label : item.amLabel}</span>
                        <span className="text-[9px] text-muted">{item.href}</span>
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-wider text-muted bg-border/40 px-2 py-0.5 rounded-md">
                        {item.category}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-muted font-medium">
                {lang === "en" ? "No results found for your query." : "ምንም ውጤት አልተገኘም።"}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function HeaderUserMenu({
  pageWidth,
  togglePageWidth,
  setShowAbout,
}: {
  pageWidth: "full" | "contained";
  togglePageWidth: () => void;
  setShowAbout: (show: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const { lang, toggle: toggleLang } = useLanguage();
  const { dark, toggle: toggleTheme } = useTheme();
  const [showConfirm, setShowConfirm] = useState(false);

  // Sync user details
  const [user] = useState(() => {
    if (typeof window !== "undefined") {
      const userStr = localStorage.getItem("user");
      if (userStr) {
        try {
          const parsed = JSON.parse(userStr);
          return {
            full_name: parsed.full_name || parsed.username || "User",
            role_name: parsed.role_name || parsed.role || "admin",
            profile_image_url: parsed.profile_image_url || null,
          };
        } catch {
          // ignore
        }
      }
    }
    return {
      full_name: "User",
      role_name: "admin",
      profile_image_url: null,
    };
  });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;

  return (
    <div className="relative flex items-center" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 p-1 rounded-xl hover:bg-card-alt transition-all cursor-pointer select-none"
      >
        <UserAvatar
          fullName={user.full_name}
          imageUrl={user.profile_image_url}
          sizeClassName="w-7 h-7"
          className="border border-border shrink-0 shadow-none"
          textClassName="text-[8px] font-black text-muted"
        />
        <HiChevronDown className="w-3.5 h-3.5 text-muted shrink-0" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 bg-card border border-border rounded-xl p-3 min-w-[220px] shadow-lg flex flex-col gap-1.5 animate-scale-in">
          <div className="px-2 py-1.5 border-b border-border/50 pb-2.5 mb-1">
            <p className="text-xs font-semibold text-foreground truncate">{user.full_name}</p>
            <p className="text-[9px] font-medium text-muted uppercase tracking-wider mt-0.5">{user.role_name}</p>
          </div>

          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="w-full text-left py-2 px-2.5 rounded-lg text-foreground hover:bg-sidebar-accent transition-all flex items-center gap-2 text-xs font-semibold cursor-pointer"
          >
            <HiOutlineUser className="w-4 h-4 shrink-0 text-muted" />
            <span>{t("Profile Settings")}</span>
          </Link>

          <button
            onClick={toggleLang}
            className="w-full text-left py-2 px-2.5 rounded-lg text-foreground hover:bg-sidebar-accent transition-all flex items-center justify-between text-xs font-semibold cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs w-4 text-center shrink-0 font-black text-muted">
                {lang === "en" ? "EN" : "አማ"}
              </span>
              <span>{t("Language")}</span>
            </div>
            <span className="text-[9px] text-primary font-black uppercase bg-primary-light px-2 py-0.5 rounded-md">
              {lang === "en" ? "English" : "አማርኛ"}
            </span>
          </button>

          <button
            onClick={toggleTheme}
            className="w-full text-left py-2 px-2.5 rounded-lg text-foreground hover:bg-sidebar-accent transition-all flex items-center justify-between text-xs font-semibold cursor-pointer"
          >
            <div className="flex items-center gap-2">
              {dark ? (
                <HiOutlineSun className="w-4 h-4 shrink-0 text-muted" />
              ) : (
                <HiOutlineMoon className="w-4 h-4 shrink-0 text-muted" />
              )}
              <span>{t("Theme")}</span>
            </div>
            <span className="text-[9px] text-muted font-bold capitalize">
              {dark ? "Dark" : "Light"}
            </span>
          </button>

          <button
            onClick={togglePageWidth}
            className="w-full text-left py-2 px-2.5 rounded-lg text-foreground hover:bg-sidebar-accent transition-all flex items-center justify-between text-xs font-semibold cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <HiArrowsRightLeft className="w-4 h-4 shrink-0 text-muted" />
              <span>{t("Page Width")}</span>
            </div>
            <span className="text-[9px] text-primary font-black uppercase bg-primary-light px-2 py-0.5 rounded-md">
              {pageWidth === "contained" ? "Normal" : "Full"}
            </span>
          </button>

          <button
            onClick={() => {
              setOpen(false);
              setShowAbout(true);
            }}
            className="w-full text-left py-2 px-2.5 rounded-lg text-foreground hover:bg-sidebar-accent transition-all flex items-center gap-2 text-xs font-semibold cursor-pointer"
          >
            <HiOutlineInformationCircle className="w-4 h-4 shrink-0 text-muted" />
            <span>{t("About ERP")}</span>
          </button>

          <div className="border-t border-border/50 my-1" />

          <button
            onClick={() => {
              setOpen(false);
              setShowConfirm(true);
            }}
            className="w-full text-left py-2 px-2.5 rounded-lg text-danger hover:bg-danger/10 transition-all flex items-center gap-2 text-xs font-semibold cursor-pointer"
          >
            <HiArrowRightOnRectangle className="w-4 h-4 shrink-0" />
            <span>{t("Sign Out")}</span>
          </button>
        </div>
      )}

      {showConfirm && (
        <>
          <div
            className="fixed inset-0 z-70 bg-black/40 backdrop-blur-sm pointer-events-auto"
            onClick={() => setShowConfirm(false)}
          />
          <div className="fixed inset-0 z-70 flex items-center justify-center pointer-events-none p-4">
            <div className="pointer-events-auto bg-card rounded-xl border border-border p-6 w-full max-w-sm flex flex-col items-center shadow-2xl">
              <div className="w-12 h-12 rounded-xl bg-danger/10 flex items-center justify-center text-danger mb-4 shrink-0">
                <HiArrowRightOnRectangle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-foreground mb-1">
                {t("Sign Out")}
              </h3>
              <p className="text-xs text-muted text-center leading-relaxed mb-6">
                {t("Are you sure you want to sign out?")}
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl bg-card-alt border border-border text-foreground font-bold hover:bg-border transition-all text-xs active:scale-95 cursor-pointer"
                >
                  {t("Cancel")}
                </button>
                <button
                  onClick={handleLogout}
                  className="flex-1 py-2.5 rounded-xl bg-danger text-white font-bold hover:opacity-90 transition-all text-xs active:scale-95 cursor-pointer"
                >
                  {t("Sign Out")}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [status] = useState<
    "checking" | "authenticated" | "unauthenticated"
  >(() => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("token");
      if (token) return "authenticated";
      return "unauthenticated";
    }
    return "checking";
  });
  const { lang } = useLanguage();
  const [pageWidth, setPageWidth] = useState<"full" | "contained">(() => {
    if (typeof window !== "undefined") {
      const savedWidth = localStorage.getItem("dreamlux_page_width");
      if (savedWidth === "full" || savedWidth === "contained") {
        return savedWidth;
      }
    }
    return "full";
  });
  const [showAbout, setShowAbout] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  // Handle Ctrl+K shortcut globally
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Sync page width setting with DOM attribute
  useEffect(() => {
    if (typeof window !== "undefined") {
      document.documentElement.setAttribute("data-page-width", pageWidth);
    }
  }, [pageWidth]);

  const togglePageWidth = () => {
    const next = pageWidth === "full" ? "contained" : "full";
    setPageWidth(next);
    localStorage.setItem("dreamlux_page_width", next);
  };

  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;

  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (status !== "authenticated") return null;

  return (
    <SidebarProvider className="h-screen overflow-hidden">
      <div className="flex h-full w-full bg-background overflow-hidden">
        <AppSidebar />
        <SidebarInset className="flex flex-col flex-1 w-full overflow-hidden">
          {/* Header - Flat borderless design */}
          <header className="flex h-16 shrink-0 items-center gap-3 px-4 md:px-6 bg-transparent select-none">
            <SidebarTrigger className="text-muted hover:text-foreground transition-all cursor-pointer" />
            <div className="h-4 w-px bg-border/50 shrink-0" />
            <Breadcrumbs />
            
            {/* Top Right Controls */}
            <div className="ml-auto shrink-0 flex items-center gap-3">
              {/* Search Trigger Button */}
              <button
                onClick={() => setShowSearch(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border bg-card-alt/50 text-muted hover:text-foreground hover:bg-card-alt hover:border-primary/30 transition-all cursor-pointer text-xs font-semibold shrink-0"
                title="Search (Ctrl+K)"
              >
                <HiMagnifyingGlass className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Search...</span>
                <kbd className="hidden sm:inline-flex h-4 select-none items-center gap-0.5 rounded border border-border bg-card px-1.5 font-mono text-[9px] font-bold text-muted/80 leading-none">
                  <span>Ctrl</span><span>K</span>
                </kbd>
              </button>

              <PayrollReminder />
              
              <div className="h-4 w-px bg-border/50 shrink-0 mx-0.5" />

              {/* User Dropdown */}
              <HeaderUserMenu 
                pageWidth={pageWidth}
                togglePageWidth={togglePageWidth}
                setShowAbout={setShowAbout}
              />
            </div>
          </header>

          {/* Main View Area - page content in a curved container on desktop */}
          <main className="flex-1 flex flex-col min-h-0 overflow-hidden p-0 md:pl-0 md:pr-6 md:pb-6">
            <div className="flex-1 flex flex-col min-h-0 bg-background md:bg-card md:border md:border-border/10 md:rounded-[2rem] p-4 md:p-8 overflow-y-auto">
              <div className="flex-1 flex flex-col min-h-0 w-full">
                {children}
              </div>
            </div>
          </main>
        </SidebarInset>
      </div>

      {/* About Modal Dialog */}
      {showAbout && (
        <>
          <div
            className="fixed inset-0 z-70 bg-black/60 backdrop-blur-sm pointer-events-auto"
            onClick={() => setShowAbout(false)}
          />
          <div className="fixed inset-0 z-70 flex items-center justify-center pointer-events-none p-4">
            <div className="pointer-events-auto bg-card rounded-2xl border border-border p-6 w-full max-w-md flex flex-col shadow-2xl relative animate-scale-in text-center">
              <div className="w-16 h-16 rounded-[1.25rem] bg-foreground text-background flex items-center justify-center text-2xl font-black mx-auto mb-4">
                D
              </div>
              <h3 className="text-lg font-black text-foreground mb-1">
                {t("About Dream Lux ERP")}
              </h3>
              <p className="text-[10px] text-primary font-black uppercase tracking-widest mb-3">
                {t("Version")} 1.0.0 (Gold Release)
              </p>
              
              <p className="text-xs text-muted leading-relaxed mb-6 px-2">
                {t("Dream Lux ERP Description")}
              </p>
              
              <div className="bg-card-alt border border-border rounded-xl p-3 text-left space-y-2 mb-6 text-xs text-foreground font-medium">
                <div className="flex justify-between">
                  <span className="text-muted">Architecture:</span>
                  <span>Next.js 16 + React 19</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Database Engine:</span>
                  <span className="text-emerald-500 font-bold">{t("Database Status")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Accent Spectrum:</span>
                  <span className="font-mono text-primary text-[10px]">oklch(78% 0.12 82)</span>
                </div>
              </div>

              <button
                onClick={() => setShowAbout(false)}
                className="w-full py-2.5 rounded-xl bg-foreground text-background font-bold hover:opacity-90 transition-all text-xs cursor-pointer active:scale-95"
              >
                {t("Close")}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Command Search Overlay Modal */}
      <SearchDialog
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        lang={lang}
      />
    </SidebarProvider>
  );
}
