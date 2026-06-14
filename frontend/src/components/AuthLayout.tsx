"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import PayrollReminder from "@/components/PayrollReminder";
import Breadcrumbs from "@/components/Breadcrumbs";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<
    "checking" | "authenticated" | "unauthenticated"
  >("checking");
  const router = useRouter();

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
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/50 px-4 md:px-6 bg-card">
            <SidebarTrigger className="text-muted hover:text-foreground transition-all cursor-pointer" />
            <div className="h-4 w-px bg-border shrink-0" />
            <Breadcrumbs />
            <div className="ml-auto shrink-0">
              <PayrollReminder />
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
