import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PwaLifecycle from "../components/PwaLifecycle";

const registerMock = vi.fn(() => Promise.resolve({}));
const promptMock = vi.fn(() => Promise.resolve());
let syncSnapshot = {
  status: "idle",
  pendingCount: 0,
  isOnline: true,
};

vi.mock("@/lib/sync-queue", () => ({
  getSyncQueueSnapshot: () => syncSnapshot,
  registerSyncQueueOnlineListeners: () => vi.fn(),
  subscribeSyncQueue: () => vi.fn(),
}));

describe("PwaLifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncSnapshot = {
      status: "idle",
      pendingCount: 0,
      isOnline: true,
    };

    Object.defineProperty(window, "localStorage", {
      value: window.localStorage,
      configurable: true,
    });
    window.localStorage.clear();

    Object.defineProperty(window.navigator, "serviceWorker", {
      value: { register: registerMock },
      configurable: true,
    });
  });

  it("registers the service worker", async () => {
    render(<PwaLifecycle />);

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledWith("/sw.js");
    });
  });

  it("shows install prompt UI after beforeinstallprompt and dismisses it", async () => {
    render(<PwaLifecycle />);

    const installEvent = new Event("beforeinstallprompt") as Event & {
      prompt: typeof promptMock;
      userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
      preventDefault: () => void;
    };
    installEvent.prompt = promptMock;
    installEvent.preventDefault = vi.fn();
    installEvent.userChoice = Promise.resolve({ outcome: "dismissed", platform: "web" });

    window.dispatchEvent(installEvent);

    expect(await screen.findByText("Install Dream Lux ERP")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Later" }));

    expect(window.localStorage.getItem("dreamlux_pwa_install_dismissed")).toBe("1");
  });

  it("shows offline queue status when offline", () => {
    syncSnapshot = {
      status: "offline",
      pendingCount: 2,
      isOnline: false,
    };

    render(<PwaLifecycle />);

    expect(screen.getByText("Offline shell active")).toBeInTheDocument();
  });
});
