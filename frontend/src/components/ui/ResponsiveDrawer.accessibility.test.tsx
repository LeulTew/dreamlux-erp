import React, { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ResponsiveDrawer from "./ResponsiveDrawer";

let reducedMotion = true;
vi.mock("framer-motion", async (original) => ({
  ...await original<typeof import("framer-motion")>(),
  useReducedMotion: () => reducedMotion,
}));

beforeEach(() => {
  reducedMotion = true;
  localStorage.clear();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Dream directly owned pending-drawer focus", () => {
  it("cancels an exiting dismissal when a write lock arrives and preserves the mounted draft", async () => {
    reducedMotion = false;
    const closed = vi.fn();
    const panel = (locked: boolean) => <ResponsiveDrawer isOpen dismissDisabled={locked}
      onClose={closed} title="Saving editor"><input aria-label="Draft" defaultValue="Record 00000286" /></ResponsiveDrawer>;
    const view = render(panel(false));
    const input = await screen.findByRole("textbox", { name: "Draft" });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 850)); });
    const close = screen.getByRole("button", { name: "Close drawer" });
    act(() => close.focus());
    fireEvent.click(close);
    view.rerender(panel(true));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 850)); });
    expect(closed).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Draft" })).toBe(input);
    expect(input).toHaveValue("Record 00000286");
    expect(close).toBeDisabled();
    view.rerender(panel(false));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(closed).toHaveBeenCalledTimes(1), { timeout: 2000 });
  });

  it.each([
    { width: 390, fieldset: false }, { width: 1280, fieldset: false },
    { width: 390, fieldset: true }, { width: 1280, fieldset: true },
  ])("retains its disabled focus at $width with fieldset=$fieldset", async ({ width, fieldset }) => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    const closed = vi.fn(), saved = vi.fn();
    function Harness({ pending }: { pending: boolean }) {
      const [open, setOpen] = useState(false);
      return <>
        <button onClick={() => setOpen(true)}>Open editor</button>
        <ResponsiveDrawer isOpen={open} dismissDisabled={pending} title="Owned editor"
          onClose={() => { closed(); setOpen(false); }}
          footer={<fieldset disabled={pending && fieldset}>
            <button disabled={pending && !fieldset} onClick={saved}>Save draft</button>
          </fieldset>}>
          <input aria-label="Record draft" defaultValue="Record 00000286" disabled={pending} />
        </ResponsiveDrawer>
      </>;
    }
    const view = render(<Harness pending={false} />);
    const opener = screen.getByRole("button", { name: "Open editor" });
    act(() => opener.focus());
    fireEvent.click(opener);
    const panel = await screen.findByRole("dialog", { name: "Owned editor" });
    const save = within(panel).getByRole("button", { name: "Save draft" });
    act(() => save.focus());
    fireEvent.click(save);
    const focus = vi.spyOn(panel, "focus");
    view.rerender(<Harness pending />);
    expect(save).toBeDisabled();
    expect(panel).toHaveFocus();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(within(panel).getByRole("button", { name: "Close drawer" })).toBeDisabled();
    fireEvent.keyDown(panel, { key: "Escape" });
    fireEvent.keyDown(panel, { key: "Tab" });
    expect(panel).toHaveFocus();
    expect(closed).not.toHaveBeenCalled();
    expect(within(panel).getByRole("textbox")).toHaveValue("Record 00000286");
    view.rerender(<Harness pending={false} />);
    expect(panel).toHaveFocus();
    fireEvent.keyDown(panel, { key: "Escape" });
    await waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(opener).toHaveFocus());
    expect(saved).toHaveBeenCalledTimes(1);
  });

  it("does not move focus from an enabled reader when locking", async () => {
    const panel = (locked: boolean) => <ResponsiveDrawer isOpen dismissDisabled={locked}
      onClose={vi.fn()} title="Read while saving"><button>Read details</button></ResponsiveDrawer>;
    const view = render(panel(false));
    const reader = await screen.findByRole("button", { name: "Read details" });
    act(() => reader.focus());
    view.rerender(panel(true));
    expect(reader).toHaveFocus();
  });

  it("does not reclaim an intentionally blurred control", async () => {
    const panel = (locked: boolean) => <ResponsiveDrawer isOpen dismissDisabled={locked}
      onClose={vi.fn()} title="Blurred editor"><input aria-label="Draft" disabled={locked} /></ResponsiveDrawer>;
    const view = render(panel(false));
    const input = await screen.findByRole("textbox");
    act(() => { input.focus(); input.blur(); });
    const focus = vi.spyOn(screen.getByRole("dialog"), "focus");
    view.rerender(panel(true));
    expect(focus).not.toHaveBeenCalled();
    expect(document.body).toHaveFocus();
  });

  it("does not reclaim focus when its document is inactive", async () => {
    const panel = (locked: boolean) => <ResponsiveDrawer isOpen dismissDisabled={locked}
      onClose={vi.fn()} title="Inactive editor"><input aria-label="Draft" disabled={locked} /></ResponsiveDrawer>;
    const view = render(panel(false));
    const input = await screen.findByRole("textbox");
    act(() => input.focus());
    vi.mocked(document.hasFocus).mockReturnValue(false);
    const focus = vi.spyOn(screen.getByRole("dialog"), "focus");
    view.rerender(panel(true));
    expect(focus).not.toHaveBeenCalled();
    expect(input).toBeDisabled();
  });

  it("does not claim a nested dialog's focus even when that child control is disabled", async () => {
    const panel = (locked: boolean) => <ResponsiveDrawer isOpen dismissDisabled={locked}
      onClose={vi.fn()} title="Parent editor">
      <ResponsiveDrawer isOpen onClose={vi.fn()} title="Nested reader">
        <input aria-label="Nested draft" disabled={locked} />
      </ResponsiveDrawer>
    </ResponsiveDrawer>;
    const view = render(panel(false));
    const input = await screen.findByRole("textbox", { name: "Nested draft" });
    act(() => input.focus());
    const parent = [...document.querySelectorAll<HTMLElement>("[data-drawer-panel]")]
      .find((element) => element.querySelector("h3")?.textContent === "Parent editor")!;
    const focus = vi.spyOn(parent, "focus");
    view.rerender(panel(true));
    expect(focus).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Nested reader" })).toBeVisible();
  });

  it.each([
    { lang: "en", label: "Close drawer" }, { lang: "am", label: "መስኮቱን ዝጋ" },
    { lang: "unsupported", label: "Close drawer" },
  ])("keeps the saved $lang default close name", async ({ lang, label }) => {
    localStorage.setItem("lang", lang);
    render(<ResponsiveDrawer isOpen onClose={vi.fn()} title="Label"><p>Record</p></ResponsiveDrawer>);
    expect(await screen.findByRole("button", { name: label })).toBeVisible();
  });

  it("updates the default name without replacing a draft and honors a caller override", async () => {
    const panel = (closeLabel?: string) => <ResponsiveDrawer isOpen onClose={vi.fn()} title="Label" closeLabel={closeLabel}>
      <input aria-label="Record" defaultValue="Untranslated 00000286" />
    </ResponsiveDrawer>;
    const view = render(panel());
    const input = await screen.findByRole("textbox");
    act(() => {
      localStorage.setItem("lang", "am");
      window.dispatchEvent(new Event("lang-change"));
    });
    expect(screen.getByRole("button", { name: "መስኮቱን ዝጋ" })).toBeVisible();
    view.rerender(panel("Close this record"));
    expect(screen.getByRole("button", { name: "Close this record" })).toBeVisible();
    expect(screen.getByRole("textbox")).toBe(input);
    expect(input).toHaveValue("Untranslated 00000286");
  });
});
