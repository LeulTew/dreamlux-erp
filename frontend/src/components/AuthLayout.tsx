"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import PayrollReminder from "@/components/PayrollReminder";
import Breadcrumbs from "@/components/Breadcrumbs";
import { useTheme } from "@/hooks/use-theme";
import { useLanguage } from "@/hooks/use-language";
import { HiSun, HiMoon, HiChevronDown, HiArrowRightOnRectangle } from "react-icons/hi2";
import UserAvatar from "@/components/UserAvatar";

const LOGOUT_TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Sign Out": "Sign Out",
    Cancel: "Cancel",
    "Are you sure you want to sign out?": "Are you sure you want to sign out?",
  },
  am: {
    "Sign Out": "ውጣ",
    Cancel: "ተመለስ",
    "Are you sure you want to sign out?": "በእርግጥ መውጣት ይፈልጋሉ?",
  },
};

function HeaderUserMenu() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const { lang } = useLanguage();
  const [showConfirm, setShowConfirm] = useState(false);

  // Sync user details
  const [user, setUser] = useState({
    full_name: "User",
    role_name: "admin",
    profile_image_url: null as string | null,
  });

  useEffect(() => {
    const userStr = localStorage.getItem("user");
    if (userStr) {
      try {
        const parsed = JSON.parse(userStr);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setUser({
          full_name: parsed.full_name || parsed.username || "User",
          role_name: parsed.role_name || parsed.role || "admin",
          profile_image_url: parsed.profile_image_url || null,
        });
      } catch {
        // ignore
      }
    }
  }, []);

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

  const t = (key: string) => LOGOUT_TRANSLATIONS[lang]?.[key] || key;

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
        <div className="absolute right-0 top-full mt-2 z-50 bg-card border border-border rounded-xl p-3 min-w-[200px] shadow-lg flex flex-col gap-2">
          <div className="px-2 py-1.5 border-b border-border/50 pb-2.5">
            <p className="text-xs font-semibold text-foreground truncate">{user.full_name}</p>
            <p className="text-[9px] font-medium text-muted uppercase tracking-wider mt-0.5">{user.role_name}</p>
          </div>
          
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
            <div className="pointer-events-auto bg-card rounded-xl border border-border p-6 w-full max-w-sm flex flex-col items-center">
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
  const [status, setStatus] = useState<
    "checking" | "authenticated" | "unauthenticated"
  >("checking");
  const router = useRouter();
  const { dark, toggle: toggleTheme } = useTheme();
  const { lang, toggle: toggleLang } = useLanguage();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("unauthenticated");
      router.replace("/login");
    } else {
      setStatus("authenticated");
    }
  }, [router]);

  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (status !== "authenticated") return null;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex flex-col flex-1 w-full overflow-hidden">
          <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border/50 px-4 md:px-6 bg-sidebar select-none">
            <SidebarTrigger className="text-muted hover:text-foreground transition-all cursor-pointer" />
            <div className="h-4 w-px bg-border/50 shrink-0" />
            <Breadcrumbs />
            
            {/* Top Right Controls */}
            <div className="ml-auto shrink-0 flex items-center gap-1.5 md:gap-2">
              <PayrollReminder />
              
              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-muted hover:text-foreground hover:bg-card-alt transition-all cursor-pointer"
                title={dark ? "Switch to Light Mode" : "Switch to Dark Mode"}
              >
                {dark ? (
                  <HiSun className="w-4 h-4" />
                ) : (
                  <HiMoon className="w-4 h-4" />
                )}
              </button>

              {/* Language Selector */}
              <button
                onClick={toggleLang}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black text-muted hover:text-foreground hover:bg-card-alt transition-all cursor-pointer font-mono"
                title={lang === "en" ? "Switch to Amharic" : "Switch to English"}
              >
                {lang === "en" ? "EN" : "አማ"}
              </button>
              
              <div className="h-4 w-px bg-border/50 shrink-0 mx-0.5" />

              {/* User Dropdown */}
              <HeaderUserMenu />
            </div>
          </header>
          <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6 pb-[calc(100px+env(safe-area-inset-bottom))]">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
