"use client";

import { notFound } from "next/navigation";
import toast from "@/lib/toast";
import { PremiumToast } from "@/components/ui/PremiumToast";

export default function ToastTestSupportPage() {
  // E2E-only support route (phase5-access-polish.spec.ts). Playwright serves
  // the app via `next dev`, so this stays reachable in tests but 404s in
  // production builds (issue #181).
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <main className="min-h-screen bg-background p-6">
      <button
        type="button"
        onClick={() => {
          toast.custom(
            (t) => (
              <PremiumToast
                t={{ ...t, duration: 4_000 }}
                title="Inventory saved"
                description="The e2e toast can be paused and resumed."
                type="success"
                actionLabel="Review"
                onAction={() => {
                  window.localStorage.setItem("toast-e2e-action", "reviewed");
                }}
              />
            ),
            { duration: 4_000 },
          );
        }}
      >
        Show toast
      </button>
    </main>
  );
}
