// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";
import { PremiumToast } from "./PremiumToast";

const { dismissMock } = vi.hoisted(() => ({
  dismissMock: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    dismiss: dismissMock,
  },
}));

function clickExpectingError(button: HTMLElement, expected: Error) {
  const observed: unknown[] = [];
  const captureExpectedError = (event: ErrorEvent) => {
    if (event.error === expected) {
      observed.push(event.error);
      event.preventDefault();
    }
  };
  window.addEventListener("error", captureExpectedError);
  try {
    fireEvent.click(button);
  } finally {
    window.removeEventListener("error", captureExpectedError);
  }
  expect(observed).toEqual([expected]);
}

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
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
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
    fireEvent.click(actionButton);
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(handleAction).toHaveBeenCalledTimes(1);
    expect(dismissMock).toHaveBeenCalledTimes(1);
    expect(dismissMock).toHaveBeenCalledWith("toast-123");
  });

  it.each([
    { state: "paused", duration: 4_000 },
    { state: "running", duration: 4_000 },
    { state: "permanent", duration: Infinity },
  ])("keeps a failed $state action visible and retryable while propagating its error", ({ state, duration }) => {
    const failure = new Error("Review failed");
    const onAction = vi.fn().mockImplementationOnce(() => { throw failure; });
    render(
      <PremiumToast
        t={{ ...mockToast, duration }}
        title="Retry review"
        description="Keep this context"
        type="info"
        actionLabel="Review"
        onAction={onAction}
      />,
    );
    act(() => { vi.advanceTimersByTime(1_000); });
    if (state === "paused") {
      fireEvent.click(screen.getByRole("button", { name: "Pause notification countdown" }));
    }
    const review = screen.getByRole("button", { name: "Review" });
    clickExpectingError(review, failure);
    expect(dismissMock).not.toHaveBeenCalled();
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Keep this context")).toBeVisible();
    expect(review).toBeEnabled();

    act(() => { vi.advanceTimersByTime(state === "running" ? 1_000 : 5_000); });
    expect(dismissMock).not.toHaveBeenCalled();
    if (state === "running") {
      expect(screen.getByText(/close in 2 seconds/)).toBeVisible();
      expect(vi.getTimerCount()).toBe(1);
    } else {
      expect(vi.getTimerCount()).toBe(0);
    }
    if (state === "paused") {
      expect(screen.getByRole("button", { name: "Resume notification countdown" })).toBeVisible();
    }

    fireEvent.click(review);
    fireEvent.click(review);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(onAction).toHaveBeenCalledTimes(2);
    expect(dismissMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("lets a running notification expire normally after an action failure without a retry", () => {
    const failure = new Error("Action unavailable");
    const onAction = vi.fn(() => { throw failure; });
    render(<PremiumToast t={mockToast} title="Still running" type="info" actionLabel="Review" onAction={onAction} />);
    act(() => { vi.advanceTimersByTime(1_000); });
    clickExpectingError(screen.getByRole("button", { name: "Review" }), failure);
    act(() => { vi.advanceTimersByTime(2_999); });
    expect(dismissMock).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(dismissMock).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("prevents a successful action from reentering itself before dismissal", () => {
    const onAction = vi.fn(() => {
      fireEvent.click(screen.getByRole("button", { name: "Review" }));
    });
    render(<PremiumToast t={mockToast} title="Reentrant action" type="info" actionLabel="Review" onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(dismissMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([0, 3_600_000, -3_600_000])("ignores a wall-clock jump of %sms when measuring elapsed duration", (jump) => {
    render(<PremiumToast t={mockToast} title="Monotonic countdown" type="info" />);
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(screen.getByText(/close in 3 seconds/)).toBeVisible();
    vi.setSystemTime(Date.now() + jump);
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(dismissMock).not.toHaveBeenCalled();
    expect(screen.getByText(/close in 2 seconds/)).toBeVisible();
    act(() => { vi.advanceTimersByTime(1_999); });
    expect(dismissMock).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(dismissMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
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

    expect(dismissMock).toHaveBeenCalledWith("toast-123");
    expect(dismissMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the exact remaining budget across pauses, rerenders, and description toggles", () => {
    const { rerender } = render(
      <PremiumToast t={mockToast} title="Stable" description="Details" type="info" />,
    );
    act(() => { vi.advanceTimersByTime(1_050); });
    fireEvent.click(screen.getByRole("button", { name: "Pause notification countdown" }));
    expect(vi.getTimerCount()).toBe(0);
    act(() => { vi.advanceTimersByTime(10_000); });
    rerender(<PremiumToast t={{ ...mockToast }} title="Updated" description="New details" type="info" />);
    fireEvent.click(screen.getByRole("button", { name: "Collapse description" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand description" }));
    expect(dismissMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Resume notification countdown" }));
    act(() => { vi.advanceTimersByTime(2_949); });
    expect(dismissMock).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(dismissMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not restart an actively running countdown on rerender", () => {
    const { rerender } = render(<PremiumToast t={mockToast} title="First" type="info" />);
    act(() => { vi.advanceTimersByTime(2_000); });
    rerender(<PremiumToast t={{ ...mockToast }} title="Second" type="info" />);
    expect(screen.getByText(/close in 2 seconds/)).toBeVisible();
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(dismissMock).toHaveBeenCalledTimes(1);
  });

  it("cancels expiry on repeated manual dismissal without invoking the action", () => {
    const onAction = vi.fn();
    render(<PremiumToast t={mockToast} title="Manual" type="info" actionLabel="Review" onAction={onAction} />);
    const close = screen.getByRole("button", { name: "Dismiss notification" });
    fireEvent.click(close);
    fireEvent.click(close);
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(dismissMock).toHaveBeenCalledTimes(1);
    expect(onAction).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([false, true])("releases all timers on unmount (paused: %s)", (paused) => {
    const { unmount } = render(<PremiumToast t={mockToast} title="Unmount" type="info" />);
    act(() => { vi.advanceTimersByTime(550); });
    if (paused) {
      fireEvent.click(screen.getByRole("button", { name: "Pause notification countdown" }));
    }
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(dismissMock).not.toHaveBeenCalled();
  });

  it("expires once under StrictMode without render-phase effects or late callbacks", () => {
    const consoleError = vi.spyOn(console, "error");
    const onAction = vi.fn();
    render(
      <React.StrictMode>
        <PremiumToast t={mockToast} title="Strict" type="success" actionLabel="Review" onAction={onAction} />
      </React.StrictMode>,
    );
    act(() => { vi.advanceTimersByTime(4_000); });
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(dismissMock).toHaveBeenCalledTimes(1);
    expect(onAction).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("shows truthful permanent state with no countdown, progress, or timer", () => {
    const { container } = render(
      <PremiumToast t={{ ...mockToast, duration: Infinity }} title="Permanent" type="info" />,
    );
    expect(screen.getByText("This message stays open until dismissed.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /notification countdown/ })).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
    expect(container.querySelector("[style]")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(dismissMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(dismissMock).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, 0, NaN])("preserves the standalone fallback for %s", (duration) => {
    render(<PremiumToast t={{ ...mockToast, duration }} title="Fallback" type="info" />);
    expect(screen.getByText(/close in 6 seconds/)).toBeVisible();
    act(() => { vi.advanceTimersByTime(5_999); });
    expect(dismissMock).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(dismissMock).toHaveBeenCalledTimes(1);
  });

  it.each([-100, -Infinity])("expires negative duration %s without invalid progress", (duration) => {
    const { container } = render(
      <PremiumToast t={{ ...mockToast, duration }} title="Expired" type="info" />,
    );
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
    expect(container.querySelector("[style]")).toHaveStyle({ width: "0%" });
    act(() => { vi.advanceTimersByTime(0); });
    expect(dismissMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
