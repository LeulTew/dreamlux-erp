import React, { StrictMode, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ResponsiveDrawer from "./ResponsiveDrawer";
import Select from "./Select";
import ActivityDrawer from "../ActivityDrawer";
import DeleteConfirmModal from "../DeleteConfirmModal";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
let reducedMotion = true;
vi.mock("framer-motion", async (original) => ({
  ...await original<typeof import("framer-motion")>(),
  useReducedMotion: () => reducedMotion,
}));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ lang: "en" }) }));
vi.mock("@/lib/api", () => ({ api: { get } }));

const clients: QueryClient[] = [];
const settle = (milliseconds = 850) => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
});

function click(control: HTMLElement) {
  control.focus();
  fireEvent.click(control);
}

function escape() {
  const target = document.activeElement;
  if (!(target instanceof HTMLElement)) throw new Error("Expected an active keyboard target");
  fireEvent.keyDown(target, { key: "Escape", code: "Escape" });
}

beforeEach(() => {
  reducedMotion = true;
  get.mockReset().mockResolvedValue({ data: { activity: [], page: 1, limit: 100, hasMore: false } });
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
});

afterEach(async () => {
  cleanup();
  await settle(10);
  clients.splice(0).forEach((client) => client.clear());
  document.body.style.overflow = "";
});

describe("Dream controlled drawer lifecycle (real motion and modal primitives)", () => {
  it.each([390, 1280])("honors an external false at %ipx without reporting a user dismissal", async (width) => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    const onClose = vi.fn();
    const panel = (open: boolean) => <ResponsiveDrawer isOpen={open} onClose={onClose} title="Controlled drawer">
      <p>Controlled record contents</p>
    </ResponsiveDrawer>;
    const view = render(panel(true));
    await screen.findByText("Controlled record contents");
    view.rerender(panel(false));
    expect(screen.queryByText("Controlled record contents")).not.toBeInTheDocument();
    await settle();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps user-dismissal animation and calls the current callback exactly once", async () => {
    reducedMotion = false;
    const oldClose = vi.fn(), latestClose = vi.fn();
    const panel = (onClose: () => void) => <ResponsiveDrawer isOpen onClose={onClose} title="Animated drawer">
      <input aria-label="Draft" defaultValue="Unsubmitted draft" />
    </ResponsiveDrawer>;
    const view = render(panel(oldClose));
    const close = await screen.findByRole("button");
    await settle();
    fireEvent.click(close);
    fireEvent.click(close);
    expect(screen.getByLabelText("Draft")).toBeInTheDocument();
    expect(oldClose).not.toHaveBeenCalled();
    view.rerender(panel(latestClose));
    await waitFor(() => expect(latestClose).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(oldClose).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Draft")).not.toBeInTheDocument();
  });

  it("cancels a user-close cycle when the parent reopens during its exit", async () => {
    reducedMotion = false;
    const onClose = vi.fn();
    const panel = (open: boolean) => <ResponsiveDrawer isOpen={open} onClose={onClose} title="Reopened drawer">
      <input aria-label="Current draft" defaultValue="Current value" />
    </ResponsiveDrawer>;
    const view = render(panel(true));
    await settle();
    fireEvent.click(screen.getByRole("button"));
    view.rerender(panel(false));
    view.rerender(panel(true));
    await settle();
    expect(screen.getByLabelText("Current draft")).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not report a late callback after unmounting an exiting drawer", async () => {
    reducedMotion = false;
    document.body.style.overflow = "scroll";
    const onClose = vi.fn();
    const view = render(<ResponsiveDrawer isOpen onClose={onClose} title="Unmounted drawer">
      <p>Unmounted record</p>
    </ResponsiveDrawer>);
    await settle();
    fireEvent.click(screen.getByRole("button"));
    view.unmount();
    await settle();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText("Unmounted record")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("scroll");
    expect(document.body).not.toHaveAttribute("data-scroll-locked");
  });

  it("dismisses with Escape from existing child content, not just new dialog selectors", async () => {
    const onClose = vi.fn();
    render(<ResponsiveDrawer isOpen onClose={onClose} title="Escape drawer">
      <input aria-label="Existing content" />
    </ResponsiveDrawer>);
    (await screen.findByLabelText("Existing content")).focus();
    escape();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("labels the modal, contains Tab in both directions, and restores its opener", async () => {
    const onClose = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(false);
      return <>
        <button onClick={() => setOpen(true)}>Open drawer</button>
        <button>Outside action</button>
        <ResponsiveDrawer isOpen={open} title="Keyboard drawer" subtitle="Record context"
          onClose={() => { onClose(); setOpen(false); }} footer={<button>Save draft</button>}>
          <input aria-label="Record name" />
        </ResponsiveDrawer>
      </>;
    }
    render(<StrictMode><Harness /></StrictMode>);
    const opener = screen.getByRole("button", { name: "Open drawer" });
    click(opener);
    const dialog = await screen.findByRole("dialog", { name: "Keyboard drawer" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("Record context");
    const close = within(dialog).getByRole("button", { name: "Close drawer" });
    const save = within(dialog).getByRole("button", { name: "Save draft" });
    await waitFor(() => expect(close).toHaveFocus());
    fireEvent.keyDown(close, { key: "Tab", code: "Tab", shiftKey: true });
    expect(save).toHaveFocus();
    fireEvent.keyDown(save, { key: "Tab", code: "Tab" });
    expect(close).toHaveFocus();
    escape();
    await waitFor(() => expect(opener).toHaveFocus());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps multiple overlay ownership and the original inline scroll style", async () => {
    document.body.style.overflow = "scroll";
    const panels = (first: boolean, second: boolean) => <>
      <ResponsiveDrawer isOpen={first} onClose={vi.fn()} title="First drawer"><input aria-label="First input" /></ResponsiveDrawer>
      <ResponsiveDrawer isOpen={second} onClose={vi.fn()} title="Second drawer"><input aria-label="Second input" /></ResponsiveDrawer>
    </>;
    const view = render(panels(false, true));
    await screen.findByLabelText("Second input");
    expect(document.body).toHaveAttribute("data-scroll-locked");
    expect(document.body.style.overflow).toBe("scroll");
    view.rerender(panels(true, true));
    await screen.findByLabelText("First input");
    view.rerender(panels(true, false));
    expect(document.body).toHaveAttribute("data-scroll-locked");
    view.rerender(panels(false, false));
    await waitFor(() => expect(document.body).not.toHaveAttribute("data-scroll-locked"));
    expect(document.body.style.overflow).toBe("scroll");
  });

  it("does not steal focus from a surviving topmost modal when its parent closes externally", async () => {
    const panels = (parent: boolean, child: boolean) => <>
      <button>Page opener</button>
      <ResponsiveDrawer isOpen={parent} onClose={vi.fn()} title="Parent drawer">
        <button>Child opener</button>
      </ResponsiveDrawer>
      <ResponsiveDrawer isOpen={child} onClose={vi.fn()} title="Child drawer">
        <input aria-label="Child draft" />
      </ResponsiveDrawer>
    </>;
    const view = render(panels(false, false));
    screen.getByRole("button", { name: "Page opener" }).focus();
    view.rerender(panels(true, false));
    (await screen.findByRole("button", { name: "Child opener" })).focus();
    view.rerender(panels(true, true));
    const input = await screen.findByLabelText("Child draft");
    input.focus();
    view.rerender(panels(false, true));
    await settle(20);
    expect(input).toHaveFocus();
    expect(document.body).toHaveAttribute("data-scroll-locked");
    view.rerender(panels(false, false));
    await waitFor(() => expect(document.body).not.toHaveAttribute("data-scroll-locked"));
  });
});

describe("actual sibling activity and confirmation dialogs", () => {
  function Nested({ closed, confirmed }: { closed: () => void; confirmed: () => void }) {
    const [open, setOpen] = useState(true);
    const [activity, setActivity] = useState(false);
    const [deleting, setDeleting] = useState(false);
    return <>
      <ResponsiveDrawer isOpen={open} title="Employee editor" onClose={() => { closed(); setOpen(false); }}>
        <input aria-label="Employee draft" defaultValue="Unsaved employee" />
        <button onClick={() => setActivity(true)}>View activity</button>
        <button onClick={() => setDeleting(true)}>Delete employee</button>
      </ResponsiveDrawer>
      <ActivityDrawer isOpen={activity} onClose={() => setActivity(false)} entityType="employee" entityId="synthetic-234" />
      <DeleteConfirmModal isOpen={deleting} onClose={() => setDeleting(false)} onConfirm={confirmed}
        title="Delete employee?" message="Move to trash?" itemName="Unsaved employee" isDeleting={false} />
    </>;
  }

  it("closes only the topmost sibling and returns focus without losing the parent draft or body lock", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    const closed = vi.fn(), confirmed = vi.fn();
    render(<QueryClientProvider client={client}><Nested closed={closed} confirmed={confirmed} /></QueryClientProvider>);
    const activity = await screen.findByRole("button", { name: "View activity" });
    click(activity);
    const timeline = await screen.findByRole("dialog", { name: "Activity Timeline" });
    expect(timeline).toHaveAttribute("aria-modal", "true");
    await within(timeline).findByText("No activity logged for this record yet.");
    expect(get).toHaveBeenCalledWith("/api/activity", {
      params: { entity_type: "employee", entity_id: "synthetic-234", page: 1, limit: 100 },
    });
    escape();
    await waitFor(() => expect(activity).toHaveFocus());
    expect(document.body).toHaveAttribute("data-scroll-locked");
    const deleteTrigger = screen.getByRole("button", { name: "Delete employee" });
    click(deleteTrigger);
    expect(await screen.findByRole("dialog", { name: "Delete employee?" })).toHaveAttribute("aria-modal", "true");
    escape();
    await waitFor(() => expect(deleteTrigger).toHaveFocus());
    expect(screen.getByLabelText("Employee draft")).toHaveValue("Unsaved employee");
    expect(closed).not.toHaveBeenCalled();
    expect(confirmed).not.toHaveBeenCalled();
    expect(document.body).toHaveAttribute("data-scroll-locked");
  });

  it("preserves pending labels, blocks pending dismissal, and retains hidden-confirm behavior", async () => {
    const confirmed = vi.fn(), closed = vi.fn();
    const props = { isOpen: true, title: "Pending action", message: "Review.", itemName: "Record",
      onClose: closed, onConfirm: confirmed };
    const view = render(<DeleteConfirmModal {...props} isDeleting pendingLabel="Verifying action..." />);
    const pending = await screen.findByRole("button", { name: "Verifying action..." });
    expect(pending).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close confirmation" })).toBeDisabled();
    fireEvent.click(pending);
    escape();
    expect(closed).not.toHaveBeenCalled();
    expect(confirmed).not.toHaveBeenCalled();
    view.rerender(<DeleteConfirmModal {...props} isDeleting={false} confirmDisabled />);
    expect(screen.queryByRole("button", { name: "Confirm Delete" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("runs the existing restore action once without treating it as a dismissal", async () => {
    const confirmed = vi.fn(), closed = vi.fn();
    render(<DeleteConfirmModal isOpen title="Restore record" message="Restore?" itemName="Synthetic record"
      onConfirm={confirmed} onClose={closed} isDeleting={false} variant="primary" confirmLabel="Restore selected" />);
    click(await screen.findByRole("button", { name: "Restore selected" }));
    expect(confirmed).toHaveBeenCalledTimes(1);
    expect(closed).not.toHaveBeenCalled();
  });
});

describe("Select delegates only Escape", () => {
  function Selection({ changed, added, closed }: { changed: (value: string) => void; added: () => void; closed: () => void }) {
    const [value, setValue] = useState("one");
    return <ResponsiveDrawer isOpen onClose={closed} title="Selection drawer">
      <Select value={value} name="choice" aria-label="Choice" searchable
        onChange={(next) => { setValue(next); changed(next); }} onAdd={added} addLabel="Add choice"
        options={[{ id: "one", label: "First choice" }, { id: "two", label: "Second choice" },
          { id: "disabled", label: "Disabled choice", disabled: true }]} />
    </ResponsiveDrawer>;
  }

  it.each(["search", "option", "add"])("gives the %s child first Escape and the parent the second", async (target) => {
    const closed = vi.fn();
    render(<Selection changed={vi.fn()} added={vi.fn()} closed={closed} />);
    const trigger = await screen.findByRole("combobox", { name: "Choice" });
    click(trigger);
    await screen.findByRole("listbox");
    const control = target === "search" ? screen.getByRole("textbox")
      : target === "option" ? screen.getByRole("option", { name: "Second choice" })
        : screen.getByRole("button", { name: "Add choice" });
    control.focus();
    escape();
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));
    expect(trigger).toHaveFocus();
    expect(closed).not.toHaveBeenCalled();
    escape();
    await waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
  });

  it("retains search Arrow/Enter, native option/Add New Enter, and hidden form values", async () => {
    const changed = vi.fn(), added = vi.fn();
    render(<Selection changed={changed} added={added} closed={vi.fn()} />);
    const trigger = await screen.findByRole("combobox", { name: "Choice" });
    click(trigger);
    const search = await screen.findByRole("textbox");
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(changed).toHaveBeenLastCalledWith("two");
    expect(document.querySelector('select[name="choice"]')).toHaveValue("two");
    click(trigger);
    const first = await screen.findByRole("option", { name: "First choice" });
    first.focus();
    expect(fireEvent.keyDown(first, { key: "Enter" })).toBe(true);
    fireEvent.click(first);
    expect(changed).toHaveBeenLastCalledWith("one");
    click(trigger);
    const add = await screen.findByRole("button", { name: "Add choice" });
    add.focus();
    expect(fireEvent.keyDown(add, { key: "Enter" })).toBe(true);
    fireEvent.click(add);
    expect(added).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledTimes(2);
  });
});
