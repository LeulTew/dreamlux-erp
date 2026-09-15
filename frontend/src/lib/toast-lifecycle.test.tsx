import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster, toast as sonnerToast } from "sonner";
import toast, { notify } from "./toast";
import ToastTestSupportPage from "@/app/test-support/toast/page";

async function advance(milliseconds: number) {
  // Let React commit Sonner's animation-frame dismissal before its exit timeout.
  let remaining = milliseconds;
  do {
    const step = Math.min(100, remaining);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(step);
    });
    remaining -= step;
  } while (remaining > 0);
}

async function show(create: () => void) {
  await act(async () => {
    create();
    await vi.advanceTimersByTimeAsync(0);
  });
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["Date", "performance", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame"],
  });
  render(
    <>
      <button type="button">Outside notification</button>
      <Toaster position="bottom-right" expand={false} visibleToasts={6} closeButton />
    </>,
  );
});

afterEach(async () => {
  await show(() => { sonnerToast.dismiss(); });
  await advance(500);
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("notification lifetime with the real Sonner host", () => {
  const variants = [
    { type: "success", duration: 4_000 },
    { type: "error", duration: 5_000 },
    { type: "info", duration: 4_000 },
  ] as const;

  it("retains a paused notification outside focus and resumes only the remaining budget", async () => {
    await show(() => { toast.success("Inventory saved"); });
    expect(screen.getByText(/close in 4 seconds/)).toBeVisible();
    await advance(1_000);
    expect(screen.getByText(/close in 3 seconds/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Pause notification countdown" }));
    screen.getByRole("button", { name: "Outside notification" }).focus();
    await advance(5_000);
    expect(screen.getByText("Inventory saved")).toBeVisible();
    expect(screen.getByRole("button", { name: "Resume notification countdown" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Resume notification countdown" }));
    await advance(2_000);
    expect(screen.getByText(/close in 1 seconds/)).toBeVisible();
    await advance(1_500);
    expect(screen.queryByText("Inventory saved")).not.toBeInTheDocument();
  });

  it.each(variants)("$type preserves its default duration and ID contract", async ({ type, duration }) => {
    let id: string | number = "";
    await show(() => { id = toast[type]("Default", "Details"); });
    expect(id).not.toBe("");
    expect(sonnerToast.getToasts().find((item) => item.id === id)).toMatchObject({ duration: Infinity });
    expect(screen.getByText("Details")).toBeVisible();
    expect(screen.getByText(`This message will close in ${duration / 1_000} seconds.`)).toBeVisible();
    await advance(duration - 1);
    expect(screen.getByText("Default")).toBeVisible();
    await advance(501);
    expect(screen.queryByText("Default")).not.toBeInTheDocument();
  });

  it.each(variants)("$type respects a custom finite duration without enabling unrelated options", async ({ type }) => {
    let id: string | number = "";
    await show(() => {
      id = toast[type]("Custom duration", { duration: 1_700, id: "ignored-id", description: "Not previously forwarded" });
    });
    expect(id).not.toBe("ignored-id");
    expect(screen.queryByText("Not previously forwarded")).not.toBeInTheDocument();
    await advance(1_699);
    expect(screen.getByText("Custom duration")).toBeVisible();
    await advance(501);
    expect(screen.queryByText("Custom duration")).not.toBeInTheDocument();
  });

  it.each(variants)("notify.$type retains its non-action default and void return", async ({ type, duration }) => {
    await show(() => {
      expect(notify[type]("Notification", "Details")).toBeUndefined();
    });
    expect(screen.getByText(`This message will close in ${duration / 1_000} seconds.`)).toBeVisible();
    await advance(duration + 500);
    expect(screen.queryByText("Notification")).not.toBeInTheDocument();
  });

  it.each(variants)("notify.$type keeps the 12000ms action budget and invokes its action once", async ({ type }) => {
    const action = vi.fn();
    await show(() => {
      expect(notify[type]("Action available", "Details", "Review", action)).toBeUndefined();
    });
    expect(screen.getByText(/close in 12 seconds/)).toBeVisible();
    await advance(4_000);
    fireEvent.click(screen.getByRole("button", { name: "Pause notification countdown" }));
    screen.getByRole("button", { name: "Outside notification" }).focus();
    await advance(13_000);
    expect(screen.getByText("Action available")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Resume notification countdown" }));
    expect(screen.getByText(/close in 8 seconds/)).toBeVisible();
    const review = screen.getByRole("button", { name: "Review" });
    fireEvent.click(review);
    fireEvent.click(review);
    await advance(20_000);
    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Action available")).not.toBeInTheDocument();
  });

  it.each([0, NaN])("keeps Sonner's effective 4000ms fallback for premium duration %s", async (duration) => {
    await show(() => { toast.error("Fallback", { duration }); });
    expect(screen.getByText(/close in 4 seconds/)).toBeVisible();
    await advance(3_999);
    expect(screen.getByText("Fallback")).toBeVisible();
    await advance(501);
    expect(screen.queryByText("Fallback")).not.toBeInTheDocument();
  });

  it.each(variants)("$type supports explicitly permanent notifications and public dismissal", async ({ type }) => {
    let id: string | number = "";
    await show(() => { id = toast[type]("Permanent", { duration: Infinity }); });
    expect(screen.getByText("This message stays open until dismissed.")).toBeVisible();
    await advance(60_000);
    expect(screen.getByText("Permanent")).toBeVisible();
    await show(() => { expect(toast.dismiss(id)).toBe(id); });
    await advance(500);
    expect(screen.queryByText("Permanent")).not.toBeInTheDocument();
  });

  it.each([
    { duration: undefined, effective: 4_000 },
    { duration: 1_700, effective: 1_700 },
    { duration: 0, effective: 4_000 },
  ])("leaves generic custom duration $duration under Sonner ownership", async ({ duration, effective }) => {
    const renderer = vi.fn(() => <div>Generic content</div>);
    let id: string | number = "";
    await show(() => { id = toast.custom(renderer, { duration }); });
    expect(renderer).toHaveBeenCalledWith({ id, visible: true, duration: duration ?? 4_000 });
    expect(sonnerToast.getToasts().find((item) => item.id === id)).toMatchObject({ duration: duration ?? 4_000 });
    await advance(effective - 1);
    expect(screen.getByText("Generic content")).toBeVisible();
    await advance(501);
    expect(screen.queryByText("Generic content")).not.toBeInTheDocument();
  });

  it("keeps generic permanent content until explicit dismissal", async () => {
    let id: string | number = "";
    await show(() => { id = toast.custom(() => <div>Generic permanent</div>, { duration: Infinity }); });
    await advance(60_000);
    expect(screen.getByText("Generic permanent")).toBeVisible();
    await show(() => { expect(toast.dismiss(id)).toBe(id); });
    await advance(500);
    expect(screen.queryByText("Generic permanent")).not.toBeInTheDocument();
  });

  it("preserves Sonner's hover pause and remaining-time resume for generic content", async () => {
    await show(() => { toast.custom(() => <div>Hover content</div>, { duration: 2_500 }); });
    await advance(1_000);
    const list = screen.getByRole("list");
    fireEvent.mouseEnter(list);
    await advance(5_000);
    expect(screen.getByText("Hover content")).toBeVisible();
    fireEvent.mouseLeave(list);
    await advance(1_499);
    expect(screen.getByText("Hover content")).toBeVisible();
    await advance(501);
    expect(screen.queryByText("Hover content")).not.toBeInTheDocument();
  });

  it("preserves dismiss-all across finite premium and generic content", async () => {
    await show(() => {
      toast.info("Premium dismiss-all");
      toast.custom(() => <div>Generic dismiss-all</div>);
    });
    await show(() => { toast.dismiss(); });
    await advance(500);
    expect(screen.queryByText("Premium dismiss-all")).not.toBeInTheDocument();
    expect(screen.queryByText("Generic dismiss-all")).not.toBeInTheDocument();
  });

  it("wires the development support route to the same renderer-owned lifetime", async () => {
    render(<ToastTestSupportPage />);
    fireEvent.click(screen.getByRole("button", { name: "Show toast" }));
    await advance(0);
    await advance(1_000);
    fireEvent.click(screen.getByRole("button", { name: "Pause notification countdown" }));
    screen.getByRole("button", { name: "Show toast" }).focus();
    await advance(5_000);
    expect(screen.getByText("Inventory saved")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    await advance(500);
    expect(window.localStorage.getItem("toast-e2e-action")).toBe("reviewed");
    expect(screen.queryByText("Inventory saved")).not.toBeInTheDocument();
  });
});
