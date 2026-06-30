"use client";

import { useEffect, useState } from "react";
import {
  getSyncQueueSnapshot,
  registerSyncQueueOnlineListeners,
  subscribeSyncQueue,
  type SyncQueueSnapshot,
} from "@/lib/sync-queue";

type BeforeInstallPromptEvent = Event & {
  readonly platforms?: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const STORAGE_KEY = "dreamlux_pwa_install_dismissed";

function getInitialSnapshot(): SyncQueueSnapshot {
  return getSyncQueueSnapshot();
}

export default function PwaLifecycle() {
  const [syncSnapshot, setSyncSnapshot] = useState<SyncQueueSnapshot>(getInitialSnapshot);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installDismissed, setInstallDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const cleanupSync = registerSyncQueueOnlineListeners();
    const unsubscribe = subscribeSyncQueue(() => {
      setSyncSnapshot(getSyncQueueSnapshot());
    });

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstallEvent(null);
      window.localStorage.setItem(STORAGE_KEY, "1");
      setInstallDismissed(true);
    };

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        // registration failure should not break the app shell
      });
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      cleanupSync();
      unsubscribe();
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const showInstallPrompt = Boolean(installEvent) && !installDismissed;
  const showOfflineNotice = syncSnapshot.status === "offline" || syncSnapshot.pendingCount > 0;

  const handleInstall = async () => {
    if (!installEvent) {
      return;
    }

    await installEvent.prompt();
    const result = await installEvent.userChoice;
    if (result.outcome !== "accepted") {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, "1");
      }
      setInstallDismissed(true);
    }
    setInstallEvent(null);
  };

  const handleDismissInstall = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "1");
    }
    setInstallDismissed(true);
    setInstallEvent(null);
  };

  return (
    <>
      {showInstallPrompt ? (
        <div className="fixed bottom-4 left-4 right-4 z-[75] md:left-auto md:right-6 md:w-[360px]">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Install Dream Lux ERP</p>
            <p className="mt-1 text-sm text-foreground">
              Add the app to this device for a faster launch, an offline shell, and consistent notification readiness.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleInstall}
                className="min-h-12 flex-1 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary transition-colors [@media(hover:hover)]:hover:border-primary/50 [@media(hover:hover)]:hover:bg-primary/15"
              >
                Install app
              </button>
              <button
                type="button"
                onClick={handleDismissInstall}
                className="min-h-12 rounded-xl border border-border bg-card-alt px-4 py-3 text-sm font-semibold text-foreground transition-colors [@media(hover:hover)]:hover:border-primary/30"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showOfflineNotice ? (
        <div className="pointer-events-none fixed bottom-4 left-4 z-[70] md:bottom-6 md:left-6">
          <div className="rounded-xl border border-border bg-card px-3 py-2 text-[11px] font-semibold text-foreground shadow-sm">
            <span className="tabular-nums">
              {syncSnapshot.status === "offline"
                ? "Offline shell active"
                : `${syncSnapshot.pendingCount} queued ${syncSnapshot.pendingCount === 1 ? "change" : "changes"}`}
            </span>
          </div>
        </div>
      ) : null}
    </>
  );
}
