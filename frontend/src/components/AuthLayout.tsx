"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "@/components/NavBar";
import PayrollReminder from "@/components/PayrollReminder";

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
    <div className="min-h-screen bg-background">
      <NavBar />
      <PayrollReminder />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-2 md:pt-6 pb-[calc(120px+env(safe-area-inset-bottom))] md:pb-8">
        {children}
      </main>
    </div>
  );
}
