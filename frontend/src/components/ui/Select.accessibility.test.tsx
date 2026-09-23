import React, { useState } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Select from "./Select";

vi.mock("framer-motion", async (original) => ({
  ...await original<typeof import("framer-motion")>(),
  useReducedMotion: () => true,
}));

const options = [
  { id: "one", label: "First item" },
  { id: "disabled", label: "Disabled item", disabled: true },
  { id: "two", label: "Second item" },
  { id: "three", label: "Third item" },
];

function choose(control: HTMLElement) {
  act(() => control.focus());
  fireEvent.click(control);
}

function expectActive(owner: HTMLElement, label: string) {
  const id = owner.getAttribute("aria-activedescendant");
  expect(id).toBeTruthy();
  const active = document.getElementById(id!);
  expect(active).toHaveRole("option");
  expect(active).toHaveTextContent(label);
  expect(active).not.toBeDisabled();
  return id;
}

beforeEach(() => window.localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Dream Select accessible ownership", () => {
  it.each(["reorder", "content"] as const)("review: reconciles active-option scrolling after %s without changing identity or selection", async (change) => {
    const choices = Array.from({ length: 12 }, (_, index) => ({ id: `item-${index}`, label: `Stock ${index}` }));
    const changed = vi.fn();
    const panel = (items: Array<{ id: string; label: string; hint?: string }>) => (
      <Select aria-label="Stock" value="item-1" options={items} onChange={changed} />
    );
    const view = render(panel(choices));
    const trigger = screen.getByRole("combobox", { name: "Stock" });
    choose(trigger);
    const listbox = await screen.findByRole("listbox");
    const rows = within(listbox).getAllByRole("option");
    vi.spyOn(listbox, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, 100, 300, 168));
    const height = (row: Element) => row.textContent?.includes("Expanded context") ? 96 : 48;
    rows.forEach((row) => {
      vi.spyOn(row, "getBoundingClientRect").mockImplementation(() => {
        const current = [...listbox.querySelectorAll('[role="option"]')];
        const offset = current.slice(0, current.indexOf(row)).reduce((sum, previous) => sum + height(previous) + 8, 0);
        return new DOMRect(0, 100 + offset - listbox.scrollTop, 300, height(row));
      });
    });
    fireEvent.keyDown(trigger, { key: "Home" });
    if (change === "content") {
      for (let index = 0; index < 4; index += 1) fireEvent.keyDown(trigger, { key: "ArrowDown" });
    }
    const active = change === "reorder" ? rows[0] : rows[4];
    const id = active.id;
    const previousScroll = listbox.scrollTop;
    view.rerender(panel(change === "reorder"
      ? [...choices.slice(1), choices[0]]
      : choices.map((option) => option.id === "item-2" ? { ...option, hint: "Expanded context" } : option)));
    expect(active.id).toBe(id);
    expect(trigger).toHaveAttribute("aria-activedescendant", id);
    expect(rows[1]).toHaveAttribute("aria-selected", "true");
    expect(active).toHaveAttribute("aria-selected", "false");
    expect(listbox.scrollTop).toBeGreaterThan(previousScroll);
    expect(active.getBoundingClientRect().top).toBeGreaterThanOrEqual(100);
    expect(active.getBoundingClientRect().bottom).toBeLessThanOrEqual(268);
    expect(changed).not.toHaveBeenCalled();
  });

  it("transfers one combobox owner and its field label to searchable input", async () => {
    render(<>
      <label htmlFor="item-choice">Item choice</label>
      <Select id="item-choice" name="item" value="two" options={options} onChange={vi.fn()} searchable />
    </>);
    const trigger = screen.getByRole("combobox", { name: "Item choice" });
    expect(trigger).toBe(screen.getByLabelText("Item choice"));
    choose(trigger);
    const owner = await screen.findByRole("combobox", { name: "Item choice" });
    await waitFor(() => expect(owner).toHaveFocus());
    expect(owner.tagName).toBe("INPUT");
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    expect(owner).toHaveAttribute("aria-autocomplete", "list");
    expect(owner.getAttribute("aria-controls")).toBe(screen.getByRole("listbox").id);
    expectActive(owner, "Second item");
  });

  it("keeps enabled active identity through reorder without changing committed selection", async () => {
    const changed = vi.fn();
    const panel = (items: typeof options) => <Select aria-label="Item choice" value="one"
      options={items} onChange={changed} searchable />;
    const view = render(panel(options));
    choose(screen.getByRole("combobox"));
    const owner = await screen.findByRole("combobox");
    await waitFor(() => expect(owner.tagName).toBe("INPUT"));
    fireEvent.keyDown(owner, { key: "ArrowDown" });
    const secondId = expectActive(owner, "Second item");
    expect(screen.getByRole("option", { name: "First item" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "Second item" })).toHaveAttribute("aria-selected", "false");
    view.rerender(panel([options[3], options[2], options[0], options[1]]));
    expectActive(owner, "Second item");
    expect(owner).toHaveAttribute("aria-activedescendant", secondId);
    expect(changed).not.toHaveBeenCalled();
  });

  it("skips disabled options on Arrow, Home and End and commits only on Enter", async () => {
    const changed = vi.fn();
    render(<Select aria-label="Item choice" value="one" options={options} onChange={changed} />);
    choose(screen.getByRole("combobox"));
    const owner = await screen.findByRole("combobox");
    fireEvent.keyDown(owner, { key: "ArrowDown" });
    expectActive(owner, "Second item");
    fireEvent.keyDown(owner, { key: "End" });
    expectActive(owner, "Third item");
    fireEvent.keyDown(owner, { key: "Home" });
    expectActive(owner, "First item");
    fireEvent.keyDown(owner, { key: "ArrowDown" });
    expect(changed).not.toHaveBeenCalled();
    fireEvent.keyDown(owner, { key: "Enter" });
    expect(changed).toHaveBeenCalledExactlyOnceWith("two");
  });

  it("preserves native filter editing and does not commit during composition", async () => {
    const changed = vi.fn();
    render(<Select aria-label="Item choice" value="one" options={options} onChange={changed} searchable />);
    choose(screen.getByRole("combobox"));
    const owner = await screen.findByRole("combobox");
    await waitFor(() => expect(owner.tagName).toBe("INPUT"));
    expect(fireEvent.keyDown(owner, { key: "Home" })).toBe(true);
    expect(fireEvent.keyDown(owner, { key: "End" })).toBe(true);
    expect(fireEvent.keyDown(owner, { key: "ArrowLeft" })).toBe(true);
    fireEvent.keyDown(owner, { key: "Enter", isComposing: true });
    expect(changed).not.toHaveBeenCalled();
  });

  it("reconciles filter, disabled and removed active options without a dangling ID", async () => {
    const panel = (items: typeof options) => <Select aria-label="Item choice" value="one"
      options={items} onChange={vi.fn()} searchable />;
    const view = render(panel(options));
    choose(screen.getByRole("combobox"));
    const owner = await screen.findByRole("combobox");
    await waitFor(() => expect(owner.tagName).toBe("INPUT"));
    fireEvent.change(owner, { target: { value: "Second" } });
    expectActive(owner, "Second item");
    view.rerender(panel(options.map((option) => option.id === "two" ? { ...option, disabled: true } : option)));
    expect(owner).not.toHaveAttribute("aria-activedescendant");
    view.rerender(panel(options.filter((option) => option.id !== "two")));
    expect(owner).not.toHaveAttribute("aria-activedescendant");
    fireEvent.change(owner, { target: { value: "" } });
    expectActive(owner, "First item");
  });

  it("reopens at the committed option, not the uncommitted search highlight", async () => {
    render(<Select aria-label="Item choice" value="two" options={options} onChange={vi.fn()} searchable />);
    const trigger = screen.getByRole("combobox");
    choose(trigger);
    const owner = await screen.findByRole("combobox");
    await waitFor(() => expect(owner.tagName).toBe("INPUT"));
    fireEvent.keyDown(owner, { key: "ArrowDown" });
    expectActive(owner, "Third item");
    fireEvent.keyDown(owner, { key: "Escape" });
    await waitFor(() => expect(trigger).toHaveFocus());
    choose(trigger);
    const reopened = await screen.findByRole("combobox");
    await waitFor(() => expect(reopened.tagName).toBe("INPUT"));
    expectActive(reopened, "Second item");
  });

  it("closes when disabled and does not reopen itself when enabled again", async () => {
    const panel = (disabled: boolean) => <Select aria-label="Item choice" value="one"
      options={options} onChange={vi.fn()} searchable disabled={disabled} />;
    const view = render(panel(false));
    choose(screen.getByRole("combobox"));
    await screen.findByRole("listbox");
    view.rerender(panel(true));
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    expect(screen.getByRole("combobox")).toBeDisabled();
    view.rerender(panel(false));
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("serializes exact numeric and retained values without making the hidden form field the label target", async () => {
    function Harness() {
      const [value, setValue] = useState("0042");
      return <form aria-label="Form">
        <label htmlFor="number-choice">Number choice</label>
        <Select id="number-choice" name="choice" value={value} onChange={setValue}
          options={[{ id: "0042", label: "Padded identifier" }, { id: 0, label: "Zero identifier" }]} />
      </form>;
    }
    render(<Harness />);
    const trigger = screen.getByRole("combobox", { name: "Number choice" });
    expect(screen.getByLabelText("Number choice")).toBe(trigger);
    const form = screen.getByRole("form") as HTMLFormElement;
    expect(new FormData(form).get("choice")).toBe("0042");
    choose(trigger);
    choose(await screen.findByRole("option", { name: "Zero identifier" }));
    expect(new FormData(form).get("choice")).toBe("0");
  });

  it("keeps native option and Add activation separate from active-option Enter", async () => {
    const changed = vi.fn(), added = vi.fn();
    render(<Select aria-label="Item choice" value="one" options={options} onChange={changed}
      searchable onAdd={added} addLabel="Add item" />);
    const trigger = screen.getByRole("combobox");
    choose(trigger);
    const option = await screen.findByRole("option", { name: "Third item" });
    act(() => option.focus());
    expect(fireEvent.keyDown(option, { key: "Enter" })).toBe(true);
    fireEvent.click(option);
    expect(changed).toHaveBeenCalledExactlyOnceWith("three");
    choose(trigger);
    const add = await screen.findByRole("button", { name: "Add item" });
    act(() => add.focus());
    expect(fireEvent.keyDown(add, { key: "Enter" })).toBe(true);
    fireEvent.click(add);
    expect(added).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("clears filtering on Add Escape and does not let it escape the active selector", async () => {
    render(<Select aria-label="Item choice" value="one" options={options} onChange={vi.fn()}
      searchable onAdd={vi.fn()} addLabel="Add item" />);
    const trigger = screen.getByRole("combobox");
    choose(trigger);
    const owner = await screen.findByRole("combobox");
    await waitFor(() => expect(owner.tagName).toBe("INPUT"));
    fireEvent.change(owner, { target: { value: "no matches" } });
    const add = screen.getByRole("button", { name: "Add item" });
    act(() => add.focus());
    expect(fireEvent.keyDown(add, { key: "Escape", bubbles: true, cancelable: true })).toBe(false);
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    choose(trigger);
    await waitFor(() => expect(screen.getByRole("combobox").tagName).toBe("INPUT"));
    expect(screen.getByRole("combobox")).toHaveValue("");
  });

  it("localizes generated defaults without translating record labels or values", async () => {
    window.localStorage.setItem("lang", "am");
    render(<Select value="" options={[]} onChange={vi.fn()} searchable onAdd={vi.fn()} />);
    const trigger = screen.getByRole("combobox");
    expect(trigger).not.toHaveTextContent("Select...");
    choose(trigger);
    await waitFor(() => expect(screen.getByRole("combobox").tagName).toBe("INPUT"));
    expect(screen.getByRole("combobox")).not.toHaveAttribute("placeholder", "Search...");
    expect(screen.queryByRole("button", { name: "+ Add New..." })).not.toBeInTheDocument();
  });

  it("does not submit a disabled named control", () => {
    render(<form aria-label="Form"><Select name="choice" aria-label="Item choice" value="one"
      options={options} disabled onChange={vi.fn()} /></form>);
    const form = screen.getByRole("form") as HTMLFormElement;
    expect(new FormData(form).has("choice")).toBe(false);
  });

  it("preserves an unloaded committed form value until the operator chooses a replacement", () => {
    render(<form aria-label="Form"><Select name="choice" aria-label="Item choice" value="retained-00000286"
      options={options} onChange={vi.fn()} /></form>);
    expect(new FormData(screen.getByRole("form") as HTMLFormElement).get("choice")).toBe("retained-00000286");
  });

  it("keeps the visible selected label as the active input name without an external label", async () => {
    render(<Select value="two" options={options} onChange={vi.fn()} searchable />);
    choose(screen.getByRole("combobox", { name: "Second item" }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Second item" }).tagName).toBe("INPUT"));
    const listbox = screen.getByRole("listbox");
    expect(listbox).not.toContainElement(screen.getByRole("combobox"));
    expectActive(screen.getByRole("combobox"), "Second item");
  });

  it("closes for outside focus without moving focus back or changing selection", async () => {
    const changed = vi.fn();
    render(<>
      <Select aria-label="Item choice" value="two" options={options} onChange={changed} searchable />
      <button>Outside field</button>
    </>);
    const trigger = screen.getByRole("combobox");
    choose(trigger);
    await waitFor(() => expect(screen.getByRole("combobox").tagName).toBe("INPUT"));
    const outside = screen.getByRole("button", { name: "Outside field" });
    act(() => outside.focus());
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(outside).toHaveFocus();
    expect(changed).not.toHaveBeenCalled();
  });

  it("hydrates saved language with stable owner IDs and preserves exact labels and values", async () => {
    localStorage.setItem("lang", "am");
    const element = <><label htmlFor="hydrated-choice">Record 00000286</label>
      <Select id="hydrated-choice" name="choice" value="two" options={options} onChange={vi.fn()} searchable />
    </>;
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);
    document.body.append(container);
    const control = within(container).getByRole("combobox", { name: "Record 00000286" });
    const listboxId = control.getAttribute("aria-controls");
    const errors: unknown[] = [];
    let root: Root | undefined;
    try {
      await act(async () => { root = hydrateRoot(container, element, { onRecoverableError: (error) => errors.push(error) }); });
      expect(errors).toEqual([]);
      expect(within(container).getByRole("combobox")).toBe(control);
      expect(control).toHaveAttribute("aria-controls", listboxId);
      choose(control);
      const owner = within(container).getByRole("combobox", { name: "Record 00000286" });
      await waitFor(() => expect(owner).toHaveFocus());
      expect(owner).toHaveAttribute("aria-controls", listboxId);
      expect(container.querySelectorAll("#hydrated-choice")).toHaveLength(1);
      expectActive(owner, "Second item");
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  });

  it("keeps instances' list and option IDs disjoint", async () => {
    const view = render(<div>
      <section aria-label="First"><Select aria-label="Item choice" value="one" options={options} onChange={vi.fn()} searchable /></section>
      <section aria-label="Second"><Select aria-label="Item choice" value="two" options={options} onChange={vi.fn()} searchable /></section>
    </div>);
    const first = within(screen.getByRole("region", { name: "First" }));
    const second = within(screen.getByRole("region", { name: "Second" }));
    choose(first.getByRole("combobox"));
    choose(second.getByRole("combobox"));
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(resolve)); });
    const ids = [...view.container.querySelectorAll('[role="option"]')].map((option) => option.id);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(first.getByRole("combobox").getAttribute("aria-controls"))
      .not.toBe(second.getByRole("combobox").getAttribute("aria-controls"));
  });
});
