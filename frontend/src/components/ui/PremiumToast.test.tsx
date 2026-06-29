// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import { PremiumToast } from "./PremiumToast";
import toast from "@/lib/toast";

// Mock toast.dismiss
vi.mock("@/lib/toast", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-hot-toast")>();
  return {
    ...original,
    default: {
      ...original.default,
      dismiss: vi.fn(),
    },
  };
});

describe("PremiumToast Component", () => {
  const mockToast = {
    id: "toast-123",
    visible: true,
    type: "custom" as const,
    message: "",
    duration: 4000,
    pauseOnHover: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the title and description correctly", () => {
    render(
      <PremiumToast
        t={mockToast}
        title="Toast Title"
        description="This is a test description."
        type="success"
      />
    );

    expect(screen.getByText("Toast Title")).toBeInTheDocument();
    expect(screen.getByText("This is a test description.")).toBeInTheDocument();
  });

  it("toggles description expansion when chevron is clicked", () => {
    render(
      <PremiumToast
        t={mockToast}
        title="Toast Title"
        description="Expanded description text."
        type="info"
      />
    );

    // Initial state: expanded is true
    expect(screen.getByText("Expanded description text.")).toBeInTheDocument();

    // Click chevron to collapse
    const collapseButton = screen.getAllByRole("button")[0];
    fireEvent.click(collapseButton);

    // Text should be removed from view
    expect(screen.queryByText("Expanded description text.")).not.toBeInTheDocument();
  });

  it("renders the action button and triggers onAction callback when clicked", () => {
    const handleAction = vi.fn();
    render(
      <PremiumToast
        t={mockToast}
        title="Save Changes"
        description="Are you sure?"
        type="success"
        actionLabel="Okay"
        onAction={handleAction}
      />
    );

    const actionButton = screen.getByRole("button", { name: "Okay" });
    expect(actionButton).toBeInTheDocument();

    fireEvent.click(actionButton);
    expect(handleAction).toHaveBeenCalledTimes(1);
    expect(toast.dismiss).toHaveBeenCalledWith("toast-123");
  });

  it("pauses and resumes the countdown when the footer is clicked", () => {
    render(
      <PremiumToast
        t={mockToast}
        title="Alert"
        type="error"
      />
    );

    const footer = screen.getByRole("button", { name: "Pause notification countdown" });
    expect(footer).toBeInTheDocument();

    // Click footer to pause
    fireEvent.click(footer);
    expect(screen.getByRole("button", { name: "Resume notification countdown" })).toBeInTheDocument();

    // Click again to resume
    fireEvent.click(screen.getByRole("button", { name: "Resume notification countdown" }));
    expect(screen.getByRole("button", { name: "Pause notification countdown" })).toBeInTheDocument();
  });

  it("triggers toast.dismiss automatically when countdown expires", () => {
    vi.useFakeTimers();

    render(
      <PremiumToast
        t={{ ...mockToast, duration: 1000 }}
        title="Quick alert"
        type="success"
      />
    );

    // Fast-forward time by 1.1 seconds (1100ms)
    act(() => {
      vi.advanceTimersByTime(1100);
    });

    expect(toast.dismiss).toHaveBeenCalledWith("toast-123");
    vi.useRealTimers();
  });
});
