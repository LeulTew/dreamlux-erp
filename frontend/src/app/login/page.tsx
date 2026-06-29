"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api";
import toast from "@/lib/toast";
import { HiLockClosed, HiUser, HiEye, HiEyeSlash } from "react-icons/hi2";
import { useLanguage } from "@/hooks/use-language";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Username": "Username",
    "Password": "Password",
    "Signing in...": "Signing in...",
    "Access System": "Access System",
    "Invalid username or password": "Invalid username or password",
    "Welcome back": "Welcome back"
  },
  am: {
    "Username": "የተጠቃሚ ስም",
    "Password": "የይለፍ ቃል",
    "Signing in...": "በመግባት ላይ...",
    "Access System": "ወደ ስርዓቱ ግባ",
    "Invalid username or password": "የተሳሳተ የተጠቃሚ ስም ወይም የይለፍ ቃል",
    "Welcome back": "እንኳን ደህና መጡ"
  }
};

export default function LoginPage() {
  const { lang, toggle: toggleLanguage } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    setLoading(true);
    try {
      const response = await login(username, password);
      localStorage.setItem("token", response.token);
      localStorage.setItem("user", JSON.stringify(response.user));
      toast.success(`${t("Welcome back")}, ${response.user.full_name || response.user.username}!`);
      router.push("/");
    } catch {
      toast.error(t("Invalid username or password"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Floating Language Toggle */}
      <div className="absolute top-4 right-4 z-50">
        <button
          type="button"
          onClick={toggleLanguage}
          className="px-3 py-1.5 rounded-lg border border-border bg-card-alt text-xs font-bold uppercase tracking-wider hover:bg-muted transition-all text-foreground"
        >
          {lang === "en" ? "AM" : "EN"}
        </button>
      </div>

      {/* Subtle Abstract Background Elements */}
      <div className="absolute top-[-10%] right-[-10%] w-[40%] aspect-square bg-primary/5 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] aspect-square bg-accent/5 rounded-full blur-[120px]" />

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-foreground text-background font-bold text-3xl shadow-premium mb-6 select-none">
            D
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight uppercase mb-1">Dream Lux</h1>
          <p className="text-[10px] text-primary font-bold uppercase tracking-wider">Event Logistics · HR · Payroll</p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="glass-card rounded-2xl shadow-premium p-8 space-y-6"
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block px-1">
                {t("Username")}
              </label>
              <div className="relative">
                <HiUser className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted/50" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className="w-full pl-12 pr-4 h-11 rounded-xl border border-border/50 bg-card-alt text-foreground placeholder:text-muted/30 focus:ring-1 focus:ring-muted/30 transition-all outline-none"
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block px-1">
                {t("Password")}
              </label>
              <div className="relative">
                <HiLockClosed className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted/50" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-12 pr-12 h-11 rounded-xl border border-border/50 bg-card-alt text-foreground placeholder:text-muted/30 focus:ring-1 focus:ring-muted/30 transition-all outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted/50 hover:text-muted transition-colors"
                >
                  {showPassword ? <HiEyeSlash className="w-5 h-5" /> : <HiEye className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !username.trim() || !password.trim()}
            className="w-full h-11 rounded-xl bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white font-extrabold uppercase tracking-widest text-xs shadow-md shadow-amber-500/10 hover:from-amber-600 hover:via-amber-700 hover:to-amber-800 hover:shadow-lg hover:scale-[1.02] active:scale-[0.97] transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t("Signing in...")}
              </>
            ) : (
              t("Access System")
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

