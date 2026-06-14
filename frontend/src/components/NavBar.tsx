"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { HiOutlineBanknotes, HiOutlineCurrencyDollar, HiOutlineCalendar, HiUsers, HiUserPlus, HiOutlineClipboardDocumentCheck, HiBuildingOffice, HiTableCells, HiCog6Tooth, HiOutlineDocumentChartBar, HiArrowRightOnRectangle, HiSun, HiMoon, HiBars3BottomRight, HiPlus } from "react-icons/hi2";
import { motion, AnimatePresence } from "framer-motion";
import UserAvatar from "@/components/UserAvatar";

type AppMode = "hr" | "inventory";

const MODE_STORAGE_KEY = "erp_mode";

const HR_LINKS = [
  { href: "/", label: "Employees", icon: HiUsers, roles: ["SUPER_ADMIN", "HR_ADMIN", "admin"] },
  { href: "/hr/payments", label: "Payroll", icon: HiOutlineBanknotes, roles: ["SUPER_ADMIN", "HR_ADMIN", "admin"] },
  { href: "/hr/salary-levels", label: "Salary", icon: HiOutlineCurrencyDollar, roles: ["SUPER_ADMIN", "HR_ADMIN", "admin"] },
  { href: "/hr/event-types", label: "Events", icon: HiOutlineCalendar, roles: ["SUPER_ADMIN", "HR_ADMIN", "admin"] },
  { href: "/insert", label: "Add Employee", icon: HiUserPlus, roles: ["SUPER_ADMIN", "HR_ADMIN", "admin"] },
];

const INVENTORY_LINKS = [
  { href: "/assets/dashboard", label: "Dashboard", icon: HiBuildingOffice, roles: ["SUPER_ADMIN", "INVENTORY_CONTROLLER", "admin"] },
  { href: "/assets", label: "Inventory", icon: HiTableCells, roles: ["SUPER_ADMIN", "INVENTORY_CONTROLLER", "admin"] },
  { href: "/assets/reconcile", label: "Reconcile", icon: HiOutlineClipboardDocumentCheck, roles: ["SUPER_ADMIN", "INVENTORY_CONTROLLER", "admin"] },
  { href: "/assets/history", label: "Audit Log", icon: HiCog6Tooth, roles: ["SUPER_ADMIN", "INVENTORY_CONTROLLER", "admin"] },
  { href: "/assets/reports", label: "Reports", icon: HiOutlineDocumentChartBar, roles: ["SUPER_ADMIN", "INVENTORY_CONTROLLER", "admin"] },
  { href: "/assets/insert", label: "Add Item", icon: HiUserPlus, roles: ["SUPER_ADMIN", "INVENTORY_CONTROLLER", "admin"] },
];

const GLOBAL_LINKS = [
  { href: "/settings", label: "Admin", icon: HiCog6Tooth, roles: ["SUPER_ADMIN", "admin", "SYSTEM_MANAGER", "system_manager"] },
];

function inferModeFromPath(pathname: string): AppMode {
  if (pathname.startsWith("/assets") || pathname.startsWith("/report")) {
    return "inventory";
  }
  return "hr";
}

function isLinkActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/assets") return pathname === "/assets";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function LogoutConfirm({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-60 bg-black/40 backdrop-blur-sm md:hidden"
        onClick={onCancel}
      />
      
      {/* Backdrop for Desktop */}
      <div 
        className="hidden md:block fixed inset-0 z-60 bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
      />

      {/* Desktop: Centered Modal */}
      <div className="hidden md:flex fixed inset-0 z-70 items-center justify-center pointer-events-none">
        <div className="pointer-events-auto bg-card rounded-4xl border border-border shadow-premium p-8 w-full max-w-sm animate-scale-in">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-card-alt flex items-center justify-center mx-auto shadow-sm">
              <HiArrowRightOnRectangle className="w-8 h-8 text-danger" />
            </div>
            <h3 className="text-lg font-bold text-foreground">Sign Out</h3>
            <p className="text-sm text-muted leading-relaxed">
              Are you sure you want to sign out?
            </p>
          </div>
          <div className="flex gap-3 mt-8">
            <button
              onClick={onCancel}
              className="flex-1 py-3 rounded-2xl bg-card-alt text-foreground font-bold hover:bg-border transition-all text-sm active:scale-95"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-3 rounded-2xl bg-danger text-white font-bold hover:opacity-90 transition-all text-sm active:scale-95 shadow-premium"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Mobile: Bottom Sheet */}
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="md:hidden fixed bottom-0 left-0 right-0 z-70 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="bg-card rounded-t-3xl border-t border-border shadow-2xl px-6 pt-5 pb-6">
          <div className="flex justify-center mb-4">
            <div className="w-10 h-1 rounded-full bg-border" />
          </div>
          <div className="text-center space-y-2 mb-6">
            <div className="w-16 h-16 rounded-2xl bg-card-alt flex items-center justify-center mx-auto shadow-sm">
              <HiArrowRightOnRectangle className="w-8 h-8 text-danger" />
            </div>
            <h3 className="text-lg font-bold text-foreground">Sign Out</h3>
            <p className="text-sm text-muted">
              Are you sure you want to sign out?
            </p>
          </div>
          <div className="space-y-2.5">
            <button
              onClick={onConfirm}
              className="w-full py-3.5 rounded-2xl bg-danger text-white font-semibold hover:bg-red-600 transition-all text-[15px]"
            >
              Sign Out
            </button>
            <button
              onClick={onCancel}
              className="w-full py-3.5 rounded-2xl bg-card-alt text-foreground font-medium hover:bg-border transition-all text-[15px]"
            >
              Cancel
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}

function useTheme() {
  const dark = useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb);
      return () => window.removeEventListener("storage", cb);
    },
    () => {
      const stored = localStorage.getItem("theme");
      if (stored) return stored === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    },
    () => false,
  );

  // Sync DOM class with the reactive value
  if (typeof window !== "undefined") {
    document.documentElement.classList.toggle("dark", dark);
  }

  const toggle = () => {
    const next = !dark;
    localStorage.setItem("theme", next ? "dark" : "light");
    document.documentElement.classList.toggle("dark", next);
    // Trigger useSyncExternalStore subscribers
    window.dispatchEvent(new StorageEvent("storage"));
  };

  return { dark, toggle };
}

function useLanguage() {
  const lang = useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb);
      return () => window.removeEventListener("storage", cb);
    },
    (globalThis as any)._storedLangHook || (() => {
      const stored = localStorage.getItem("lang");
      return stored || "en";
    }),
    () => "en",
  );

  const toggle = () => {
    const next = lang === "en" ? "am" : "en";
    localStorage.setItem("lang", next);
    window.dispatchEvent(new StorageEvent("storage"));
  };

  return { lang, toggle };
}

function ActionsMenu({
  onClose,
  mode,
  switchMode,
  dark,
  toggleTheme,
  lang,
  toggleLang,
  onLogout,
  currentUser,
}: {
  onClose: () => void;
  mode: AppMode;
  switchMode: (m: AppMode) => void;
  dark: boolean;
  toggleTheme: () => void;
  lang: string;
  toggleLang: () => void;
  onLogout: () => void;
  currentUser: {
    role: string;
    role_name: string;
    full_name: string;
    profile_image_url: string | null;
    permission_slugs: string[];
  };
}) {
  const isInventory = mode === "inventory";
  const addAction = isInventory
    ? { href: "/assets/insert", label: "Add Item", icon: HiPlus }
    : { href: "/insert", label: "Add Employee", icon: HiUserPlus };

  const canAccessSettings = currentUser.role === "SUPER_ADMIN" || currentUser.role === "admin" || currentUser.role === "SYSTEM_MANAGER" || currentUser.role === "system_manager";

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-60 bg-black/40 backdrop-blur-sm md:hidden"
        onClick={onClose}
      />
      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="md:hidden fixed bottom-0 left-0 right-0 z-70 pb-[env(safe-area-inset-bottom)] text-left"
      >
        <div className="bg-card rounded-t-[2.5rem] border-t border-border shadow-2xl px-6 pt-6 pb-8">
          <div className="flex justify-center mb-6">
            <div className="w-12 h-1.5 rounded-full bg-border" />
          </div>

          <div className="grid grid-cols-1 gap-3 mb-8">
            {/* Mode Switcher */}
            <div className="flex p-1.5 bg-card-alt rounded-2xl border border-border">
              <button
                onClick={() => { switchMode("hr"); onClose(); }}
                className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                  mode === "hr" ? "bg-primary text-background shadow-premium" : "text-muted"
                }`}
              >
                <HiUsers className="w-4 h-4" />
                HR Mode
              </button>
              <button
                onClick={() => { switchMode("inventory"); onClose(); }}
                className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                  mode === "inventory" ? "bg-primary text-background shadow-premium" : "text-muted"
                }`}
              >
                <HiTableCells className="w-4 h-4" />
                Inventory
              </button>
            </div>

            {/* Main Action (Add Employee/Item) */}
            <Link
              href={addAction.href}
              onClick={onClose}
              className="flex items-center gap-4 p-4 rounded-2xl bg-card-alt border border-border group active:scale-[0.98] transition-all"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-background transition-colors">
                <addAction.icon className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-foreground">{addAction.label}</h4>
                <p className="text-[11px] text-muted font-medium">Create a new entry in {mode} module</p>
              </div>
            </Link>

            <div className="grid grid-cols-3 gap-2">
              {/* Settings */}
              {canAccessSettings ? (
                <Link
                  href="/settings"
                  onClick={onClose}
                  className="flex flex-col items-center justify-center gap-2 p-3 rounded-2xl bg-card-alt border border-border active:scale-95 transition-all text-center"
                >
                  <div className="w-9 h-9 rounded-xl bg-muted/10 flex items-center justify-center text-muted">
                    <HiCog6Tooth className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-bold text-foreground">Settings</span>
                </Link>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 p-3 rounded-2xl bg-card-alt/50 border border-border/50 text-center opacity-40">
                  <div className="w-9 h-9 rounded-xl bg-muted/10 flex items-center justify-center text-muted">
                    <HiCog6Tooth className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-bold text-foreground">Settings</span>
                </div>
              )}

              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="flex flex-col items-center justify-center gap-2 p-3 rounded-2xl bg-card-alt border border-border active:scale-95 transition-all text-center"
              >
                <div className="w-9 h-9 rounded-xl bg-muted/10 flex items-center justify-center text-muted">
                  {dark ? <HiSun className="w-5 h-5" /> : <HiMoon className="w-5 h-5" />}
                </div>
                <span className="text-[11px] font-bold text-foreground">{dark ? "Light" : "Dark"}</span>
              </button>

              {/* Language Toggle */}
              <button
                onClick={toggleLang}
                className="flex flex-col items-center justify-center gap-2 p-3 rounded-2xl bg-card-alt border border-border active:scale-95 transition-all text-center"
              >
                <div className="w-9 h-9 rounded-xl bg-muted/10 flex items-center justify-center text-muted font-bold text-xs">
                  {lang === "en" ? "EN" : "አማ"}
                </div>
                <span className="text-[11px] font-bold text-foreground">{lang === "en" ? "English" : "አማርኛ"}</span>
              </button>
            </div>
          </div>

          {/* Logout Button */}
          <button
            onClick={() => { onLogout(); onClose(); }}
            className="w-full py-4 rounded-2xl bg-danger/10 text-danger font-bold hover:bg-danger hover:text-white active:scale-[0.98] transition-all flex items-center justify-center gap-3 border border-danger/20"
          >
            <HiArrowRightOnRectangle className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </motion.div>
    </>
  );
}

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [showLogout, setShowLogout] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);

  const userSnapshot = useSyncExternalStore(
    (callback) => {
      window.addEventListener("storage", callback);
      return () => window.removeEventListener("storage", callback);
    },
    () => localStorage.getItem("user") || "",
    () => ""
  );

  const currentUser = useMemo(() => {
    const fallback = { role: "admin", role_name: "admin", full_name: "User", profile_image_url: null as string | null, permission_slugs: [] as string[] };
    if (!userSnapshot) return fallback;

    try {
      const parsed = JSON.parse(userSnapshot) as {
        role?: string;
        role_name?: string;
        full_name?: string;
        username?: string;
        profile_image_url?: string | null;
        permission_slugs?: string[];
      };

      const resolvedRole = parsed.role_name || parsed.role || "admin";

      return {
        role: resolvedRole,
        role_name: resolvedRole,
        full_name: parsed.full_name || parsed.username || "User",
        profile_image_url: parsed.profile_image_url || null,
        permission_slugs: parsed.permission_slugs || [],
      };
    } catch {
      return fallback;
    }
  }, [userSnapshot]);

  const mode = inferModeFromPath(pathname);
  const { dark, toggle: toggleTheme } = useTheme();
  const { lang, toggle: toggleLang } = useLanguage();
  const userRole = currentUser.role;

  // RBAC Gating: filter links based on user's active role from session
  const links = useMemo(() => {
    const currentModuleLinks = mode === "inventory" ? INVENTORY_LINKS : HR_LINKS;
    return [...currentModuleLinks, ...GLOBAL_LINKS].filter(
      (link) => !link.roles || link.roles.includes(userRole)
    );
  }, [mode, userRole]);

  const navMobileLinks = useMemo(() => {
    if (mode === "inventory") {
      const preferredOrder = [
        "/assets/dashboard",
        "/assets",
        "/assets/reconcile",
        "/assets/history",
        "/assets/reports",
      ];
      const selected = preferredOrder
        .map((href) => links.find((link) => link.href === href))
        .filter((link): link is (typeof links)[number] => Boolean(link));
      return selected;
    }

    return links.slice(0, 4);
  }, [links, mode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const inferred = inferModeFromPath(pathname);
    localStorage.setItem(MODE_STORAGE_KEY, inferred);
  }, [pathname]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  const switchMode = (nextMode: AppMode) => {
    if (nextMode === mode) return;

    localStorage.setItem(MODE_STORAGE_KEY, nextMode);
    router.push(nextMode === "inventory" ? "/assets/dashboard" : "/");
  };

  return (
    <>
      {/* ─── Desktop Top Nav ─── */}
      <nav className="hidden md:block sticky top-0 z-50 bg-card/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-3 group">
              <UserAvatar
                fullName={currentUser.full_name}
                imageUrl={currentUser.profile_image_url}
                sizeClassName="w-10 h-10"
                className="shadow-premium group-hover:scale-105 transition-transform"
                textClassName="text-[10px] font-black text-muted"
              />
              <span className="font-black text-xl text-foreground tracking-tighter">
                DREAM LUX
              </span>
            </Link>

            <div className="flex items-center gap-1">
              <div className="flex items-center rounded-xl bg-card-alt p-1 mr-1 border border-border">
                <button
                  onClick={() => switchMode("hr")}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${
                    mode === "hr"
                      ? "bg-primary text-background shadow-premium"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  HR
                </button>
                <button
                  onClick={() => switchMode("inventory")}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${
                    mode === "inventory"
                      ? "bg-primary text-background shadow-premium"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  Inventory
                </button>
              </div>

              {links.map((link) => {
                const isActive = isLinkActive(pathname, link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    title={link.label}
                    className={`group/navlink flex items-center justify-start overflow-hidden h-10 rounded-2xl text-[10px] font-bold uppercase tracking-wider transition-all duration-300 ${
                      isActive
                        ? "w-44 bg-primary text-background shadow-premium px-3"
                        : "w-10 px-3 text-muted hover:w-44 hover:text-foreground hover:bg-card-alt"
                    }`}
                  >
                    <link.icon className="w-4 h-4 shrink-0" />
                    <span
                      className={`ml-2 whitespace-nowrap transition-all duration-200 ${
                        isActive
                          ? "max-w-28 opacity-100"
                          : "max-w-0 opacity-0 group-hover/navlink:max-w-28 group-hover/navlink:opacity-100"
                      }`}
                    >
                      {link.label}
                    </span>
                  </Link>
                );
              })}

              {/* Dark mode toggle — desktop */}
              <button
                onClick={toggleTheme}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-muted hover:text-foreground hover:bg-card-alt transition-all ml-1"
                aria-label="Toggle dark mode"
              >
                {dark ? (
                  <HiSun className="w-4.5 h-4.5" />
                ) : (
                  <HiMoon className="w-4.5 h-4.5" />
                )}
              </button>

              {/* Language toggle — desktop */}
              <button
                onClick={toggleLang}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black text-muted hover:text-foreground hover:bg-card-alt transition-all ml-1"
                aria-label="Toggle language"
              >
                {lang === "en" ? "EN" : "አማ"}
              </button>

              <button
                onClick={() => setShowLogout(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-muted hover:text-danger hover:bg-red-50 dark:hover:bg-red-950/20 transition-all ml-1"
              >
                <HiArrowRightOnRectangle className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* ─── Mobile: Top Nav Removed ─── */}

      {/* ─── Mobile Bottom Tab Bar ─── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/90 backdrop-blur-2xl border-t border-border/50 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch justify-around h-16 px-2 overflow-x-auto">
          {navMobileLinks.map((link) => {
            const isActive = isLinkActive(pathname, link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex flex-col items-center justify-center flex-1 min-w-16 gap-0.5 transition-all duration-200 ${
                  isActive ? "text-primary" : "text-muted"
                }`}
              >
                <div
                  className={`p-1.5 rounded-2xl transition-all duration-200 ${isActive ? "bg-primary/10" : ""}`}
                >
                  <Icon
                    className={`w-6 h-6 transition-transform duration-200 ${isActive ? "scale-105" : ""}`}
                  />
                </div>
                <span
                  className={`text-[10px] font-semibold tracking-wide ${isActive ? "opacity-100" : "opacity-60"}`}
                >
                  {link.label === "Dashboard"
                    ? "Home"
                    : link.label === "Inventory"
                      ? "Items"
                      : link.label === "Audit Log"
                        ? "History"
                        : link.label}
                </span>
              </Link>
            );
          })}
          <button
            onClick={() => setShowActionsMenu(true)}
            className={`flex flex-col items-center justify-center flex-1 gap-0.5 transition-all duration-200 ${showActionsMenu ? "text-primary" : "text-muted"}`}
          >
            <div className={`p-1.5 rounded-2xl transition-all duration-200 ${showActionsMenu ? "bg-primary/10" : ""}`}>
              <HiBars3BottomRight className={`w-6 h-6 transition-transform duration-200 ${showActionsMenu ? "scale-105" : ""}`} />
            </div>
            <span className={`text-[10px] font-semibold tracking-wide ${showActionsMenu ? "opacity-100" : "opacity-60"}`}>
              More
            </span>
          </button>
        </div>
      </nav>



      <AnimatePresence>
        {showLogout && (
          <LogoutConfirm
            onConfirm={handleLogout}
            onCancel={() => setShowLogout(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showActionsMenu && (
          <ActionsMenu
            onClose={() => setShowActionsMenu(false)}
            mode={mode}
            switchMode={switchMode}
            dark={dark}
            toggleTheme={toggleTheme}
            lang={lang}
            toggleLang={toggleLang}
            onLogout={() => setShowLogout(true)}
            currentUser={currentUser}
          />
        )}
      </AnimatePresence>
    </>
  );
}
