import React, { useLayoutEffect, useRef, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Select from "./Select";

const motionPreference = vi.hoisted(() => ({ reduced: true }));
vi.mock("framer-motion", async (original) => ({
  ...await original<typeof import("framer-motion")>(),
  useReducedMotion: () => motionPreference.reduced,
}));

const choices = Array.from({ length: 30 }, (_, index) => ({
  id: String(index + 1), label: `Event ${String(index + 1).padStart(2, "0")} - exact identity 00000286`,
}));

function Fixture({ add = false, searchable = true, options = choices, onChange }: {
  add?: boolean; searchable?: boolean; options?: typeof choices; onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState("30");
  return <><style>{`
    [data-select-popup] { border: 1px solid; padding-top: 4px; padding-bottom: 4px; }
    [data-select-popup] > button { margin-top: 8px; }
  `}</style><div data-testid="outer" style={{ overflow: "hidden" }}>
    <div data-testid="body" style={{ overflowX: "auto", overflowY: "auto" }}>
      <form>
        <Select aria-label="Event" value={value} onChange={(next) => { setValue(next); onChange?.(next); }} name="event_id"
          searchable={searchable} options={options} onAdd={add ? vi.fn() : undefined} addLabel="Add event" />
        <button type="button">Next field</button>
      </form>
    </div>
    <footer data-testid="footer"><button type="button">Save</button></footer>
  </div></>;
}

function holdAnimationFrames() {
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => { frames.delete(id); });
  return () => {
    const pending = [...frames.values()];
    frames.clear();
    return pending;
  };
}

function layout({
  width = 375, height = 844, clipTop = 400, clipBottom = 763, triggerTop = 435,
  outerBottom = height, withAdd = false, clipLeft = 12, clipRight = width - 12, triggerLeft = 20, border = 0,
  searchable = true, modelPopupMotion = false,
}: {
  width?: number; height?: number; clipTop?: number; clipBottom?: number;
  triggerTop?: number; outerBottom?: number; withAdd?: boolean; clipLeft?: number;
  clipRight?: number; triggerLeft?: number; border?: number; searchable?: boolean; modelPopupMotion?: boolean;
} = {}) {
  const geometry = { width, height, clipTop, clipBottom, triggerTop, outerBottom, clipLeft, clipRight, triggerLeft, border };
  const observerCallbacks: Array<() => void> = [];
  const disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { observerCallbacks.push(callback); }
    observe() {}
    unobserve() {}
    disconnect = disconnect;
  });
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  const rendered = render(<Fixture add={withAdd} searchable={searchable} />);
  const trigger = screen.getByRole("combobox", { name: "Event" });
  const anchor = trigger.parentElement;
  if (!anchor) throw new Error("Missing selector anchor");
  const body = screen.getByTestId("body");
  const outer = screen.getByTestId("outer");
  const footer = screen.getByTestId("footer");
  const searchHeaderHeight = searchable ? 4 + 48 + 8 + 1 : 0;
  const chrome = searchHeaderHeight + 10 + (withAdd ? 48 + 8 : 0);
  const list = () => anchor.querySelector<HTMLElement>('[role="listbox"]');
  const popup = () => list()?.parentElement ?? null;
  const pixels = (value: string | undefined, fallback: number) => value ? Number.parseFloat(value) : fallback;
  const rowsHeight = () => Math.max(0, (list()?.querySelectorAll('[role="option"]').length ?? 0) * 56 - 8);
  const listHeight = () => Math.min(240, pixels(list()?.style.maxHeight, 240), rowsHeight());
  const emptyHeight = () => popup()?.querySelector('[role="status"]') ? 32 : 0;
  const popupHeight = () => Math.min(chrome + listHeight() + emptyHeight(), pixels(popup()?.style.maxHeight, Number.POSITIVE_INFINITY));
  const popupTop = () => {
    const style = popup()?.style;
    if (style?.bottom && style.bottom !== "auto") return geometry.triggerTop + 48 - pixels(style.bottom, 0) - popupHeight();
    return geometry.triggerTop + pixels(style?.top, 56);
  };
  const popupLeft = () => geometry.triggerLeft + pixels(popup()?.style.left, 0);
  const popupWidth = () => pixels(popup()?.style.width, geometry.width - 40);
  const listOffset = 4 + searchHeaderHeight;
  const addOffset = () => listOffset + listHeight() + emptyHeight() + 8;
  const optionTop = (element: Element) => Array.from(list()?.querySelectorAll('[role="option"]') ?? []).indexOf(element) * 56;
  const popupMotion = () => {
    const transform = popup()?.style.transform ?? "";
    return {
      y: modelPopupMotion ? Number(transform.match(/translateY\(([-.\d]+)px\)/)?.[1] ?? 0) : 0,
      scale: modelPopupMotion ? Number(transform.match(/scale\(([-.\d]+)\)/)?.[1] ?? 1) : 1,
    };
  };
  const popupBounds = () => {
    const { y, scale } = popupMotion();
    const origin = popup()?.style.transformOrigin.startsWith("bottom") ? popupHeight() : 0;
    return new DOMRect(popupLeft() + popupWidth() * (1 - scale) / 2,
      popupTop() + origin * (1 - scale) + y, popupWidth() * scale, popupHeight() * scale);
  };
  const listTop = () => popupBounds().top + (1 + listOffset - (popup()?.scrollTop ?? 0)) * popupMotion().scale;
  const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this === body) return new DOMRect(geometry.clipLeft, geometry.clipTop, geometry.clipRight - geometry.clipLeft, geometry.clipBottom - geometry.clipTop);
    if (this === outer) return new DOMRect(0, 0, geometry.width, geometry.outerBottom);
    if (this === footer) return new DOMRect(0, geometry.clipBottom, geometry.width, geometry.height - geometry.clipBottom);
    if (this === anchor || this === trigger) return new DOMRect(geometry.triggerLeft, geometry.triggerTop, geometry.width - 40, 48);
    if (this === popup()) return popupBounds();
    if (this === list()) return new DOMRect(popupBounds().left, listTop(), popupBounds().width, listHeight() * popupMotion().scale);
    if (this.getAttribute("role") === "option") {
      return new DOMRect(popupBounds().left, listTop() + (optionTop(this) - (list()?.scrollTop ?? 0)) * popupMotion().scale,
        popupBounds().width, 48 * popupMotion().scale);
    }
    if (this.getAttribute("role") === "combobox") {
      return new DOMRect(popupBounds().left + 8 * popupMotion().scale,
        popupBounds().top + (1 + 8 - (popup()?.scrollTop ?? 0)) * popupMotion().scale,
        popupBounds().width - 16 * popupMotion().scale, 48 * popupMotion().scale);
    }
    if (this.textContent === "Add event") {
      return new DOMRect(popupBounds().left, popupBounds().top + (1 + addOffset() - (popup()?.scrollTop ?? 0)) * popupMotion().scale,
        popupBounds().width, 48 * popupMotion().scale);
    }
    return new DOMRect();
  });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
    if (this === outer) return geometry.width;
    if (this === body) return geometry.clipRight - geometry.clipLeft;
    return geometry.width - 40;
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    if (this === document.documentElement || this === outer) return geometry.width;
    if (this === body) return geometry.clipRight - geometry.clipLeft - geometry.border * 2;
    return geometry.width - 40;
  });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
    if (this.hasAttribute("data-select-search")) return searchHeaderHeight;
    if (this === popup()) return popupHeight();
    if (this === list()) return listHeight();
    if (this.getAttribute("role") === "status") return emptyHeight();
    if (this === body) return geometry.clipBottom - geometry.clipTop;
    if (this === outer) return geometry.outerBottom;
    return 48;
  });
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
    if (this === list()) return listHeight();
    if (this === popup()) return popupHeight() - 2;
    if (this === body) return geometry.clipBottom - geometry.clipTop - geometry.border * 2;
    if (this === outer) return geometry.outerBottom;
    if (this === document.documentElement) return geometry.height;
    return 48;
  });
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this === list() ? rowsHeight() : this.offsetHeight;
  });
  vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(function (this: HTMLElement) {
    if (this.hasAttribute("data-select-search")) return 4;
    if (this.textContent === "Add event") return addOffset();
    return this === list() ? listOffset : this.getAttribute("role") === "option" ? optionTop(this) : 0;
  });
  for (const edge of ["clientTop", "clientLeft"] as const) {
    vi.spyOn(HTMLElement.prototype, edge, "get").mockImplementation(function (this: HTMLElement) {
      return this === body ? geometry.border : this === popup() ? 1 : 0;
    });
  }
  return { geometry, anchor, trigger, body, outer, footer, list, popup, rect, popupMotion, observerCallbacks, disconnect, ...rendered };
}

function assertControlContained(model: ReturnType<typeof layout>, control: HTMLElement) {
  const popup = model.popup();
  if (!popup) throw new Error("Missing popup");
  const bounds = popup.getBoundingClientRect(), box = control.getBoundingClientRect();
  const scale = model.popupMotion().scale;
  const top = Math.max(bounds.top + popup.clientTop * scale, model.geometry.clipTop + model.geometry.border);
  const bottom = Math.min(bounds.top + (popup.clientTop + popup.clientHeight) * scale,
    model.geometry.clipBottom - model.geometry.border, model.geometry.outerBottom, model.geometry.height);
  expect(box.top).toBeGreaterThanOrEqual(top);
  expect(box.bottom).toBeLessThanOrEqual(bottom);
  expect(box.height).toBeGreaterThanOrEqual(48 * scale);
  expect(box.left).toBeGreaterThanOrEqual(model.geometry.clipLeft + model.geometry.border);
  expect(box.right).toBeLessThanOrEqual(model.geometry.clipRight - model.geometry.border);
  expect(model.body.scrollTop).toBe(0);
  expect(model.outer.scrollTop).toBe(0);
}

function assertFullyContained(model: ReturnType<typeof layout>) {
  const owner = screen.getByRole("combobox", { name: "Event" });
  const active = document.getElementById(owner.getAttribute("aria-activedescendant") ?? "");
  expect(active).not.toBeNull();
  if (!active) throw new Error("Missing owned active option");
  const popup = model.popup();
  if (!popup) throw new Error("Missing popup");
  const row = active.getBoundingClientRect(), bounds = popup.getBoundingClientRect();
  const top = Math.max(0, model.geometry.clipTop + model.geometry.border);
  const bottom = Math.min(model.geometry.height, model.geometry.clipBottom - model.geometry.border, model.geometry.outerBottom);
  expect(bounds.top).toBeGreaterThanOrEqual(top);
  expect(bounds.bottom).toBeLessThanOrEqual(bottom);
  expect(row.top).toBeGreaterThanOrEqual(top);
  expect(row.bottom).toBeLessThanOrEqual(bottom);
  expect(row.height).toBeGreaterThanOrEqual(48);
  expect(row.left).toBeGreaterThanOrEqual(model.geometry.clipLeft + model.geometry.border);
  expect(row.right).toBeLessThanOrEqual(model.geometry.clipRight - model.geometry.border);
  expect(row.top + row.height / 2).toBeLessThan(model.footer.getBoundingClientRect().top);
  expect(model.anchor).toContainElement(popup);
  expect(active).toHaveAttribute("aria-selected", "true");
  expect(model.body.scrollTop).toBe(0);
  expect(model.outer.scrollTop).toBe(0);
}

function assertAnimatedOptionContained(model: ReturnType<typeof layout>, option: HTMLElement) {
  const popup = model.popup()!, list = model.list()!;
  // Compare the popup's affine-transformed edges in their shared intrinsic space.
  const localTop = list.offsetTop + option.offsetTop - list.scrollTop - popup.scrollTop;
  expect(localTop).toBeGreaterThanOrEqual(0);
  expect(localTop + option.offsetHeight).toBeLessThanOrEqual(popup.clientHeight);
  const row = option.getBoundingClientRect();
  expect(row.top).toBeGreaterThanOrEqual(model.geometry.clipTop + model.geometry.border);
  expect(row.bottom).toBeLessThanOrEqual(Math.min(model.geometry.clipBottom - model.geometry.border, model.geometry.outerBottom, model.geometry.height));
  expect(row.left).toBeGreaterThanOrEqual(model.geometry.clipLeft + model.geometry.border);
  expect(row.right).toBeLessThanOrEqual(model.geometry.clipRight - model.geometry.border);
  expect(model.body.scrollTop).toBe(0);
  expect(model.outer.scrollTop).toBe(0);
}

beforeEach(() => { window.localStorage.clear(); motionPreference.reduced = true; });
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Dream Select popup clipping boundaries (modeled layout)", () => {
  it("caps the settled 30th option above the 375px drawer footer instead of merely inside its own listbox", async () => {
    const model = layout();
    fireEvent.click(model.trigger);
    await screen.findByRole("option", { name: choices[29].label });
    assertFullyContained(model);
    expect(model.popup()?.getAttribute("data-side")).toBe("below");
  });

  it.each([320, 375, 1280])("flips above a low trigger inside the clipping body at %spx", async (width) => {
    const model = layout({ width, clipTop: 120, triggerTop: 695 });
    fireEvent.click(model.trigger);
    await screen.findByRole("option", { name: choices[29].label });
    assertFullyContained(model);
    expect(model.popup()?.getAttribute("data-side")).toBe("above");
    const input = screen.getByRole("combobox", { name: "Event" });
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.keyDown(input, { key: "Enter" });
    expect(model.trigger).toHaveTextContent(choices[29].label);
    expect(new FormData(model.anchor.closest("form")!).get("event_id")).toBe("30");
  });

  it("intersects every clipping ancestor, not just the nearest scrollport", async () => {
    const model = layout({ clipTop: 300, clipBottom: 810, outerBottom: 700, triggerTop: 390 });
    fireEvent.click(model.trigger);
    await screen.findByRole("option", { name: choices[29].label });
    assertFullyContained(model);
  });

  it.each([350, 750])("keeps the popup within the clip when its trigger at y%s is partly scrolled behind a boundary", async (triggerTop) => {
    const model = layout({ triggerTop });
    fireEvent.click(model.trigger);
    await screen.findByRole("option", { name: choices[29].label });
    assertFullyContained(model);
  });

  it("uses the viewport limit even when the enclosing scrollport extends below it", async () => {
    const model = layout({ height: 600, clipTop: 120, clipBottom: 900, outerBottom: 900, triggerTop: 480 });
    fireEvent.click(model.trigger);
    await screen.findByRole("option", { name: choices[29].label });
    assertFullyContained(model);
    expect(model.popup()?.getAttribute("data-side")).toBe("above");
  });

  it("intersects horizontal clips and excludes ancestor borders in client-space sizing", async () => {
    const model = layout({ clipLeft: 60, clipRight: 300, border: 4, triggerLeft: 260 });
    fireEvent.click(model.trigger);
    await screen.findByRole("option", { name: choices[29].label });
    assertFullyContained(model);
    const bounds = model.popup()!.getBoundingClientRect();
    expect(bounds.left).toBe(64);
    expect(bounds.right).toBe(296);
  });

  it("reacts to the modeled visual viewport offset and height without scrolling an ancestor", async () => {
    const model = layout({ clipTop: 120, triggerTop: 400 });
    const viewport = Object.assign(new EventTarget(), { offsetTop: 200, offsetLeft: 0, height: 360, width: 375 });
    vi.stubGlobal("visualViewport", viewport);
    fireEvent.click(model.trigger);
    await screen.findByRole("option", { name: choices[29].label });
    expect(model.popup()!.getBoundingClientRect().top).toBeGreaterThanOrEqual(208);
    expect(model.popup()!.getBoundingClientRect().bottom).toBeLessThanOrEqual(552);
    act(() => {
      viewport.offsetTop = 180;
      viewport.height = 300;
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(model.popup()!.getBoundingClientRect().top).toBeGreaterThanOrEqual(188);
    expect(model.popup()!.getBoundingClientRect().bottom).toBeLessThanOrEqual(472);
    expect(model.body.scrollTop).toBe(0);
  });

  it("converts available space through the non-popup anchor scale, not the animated popup rectangle", async () => {
    const model = layout();
    const unscaled = model.rect.getMockImplementation()!;
    model.rect.mockImplementation(function (this: HTMLElement) {
      if (this === model.anchor || this === model.trigger) return new DOMRect(20, model.geometry.triggerTop, 335 * 0.8, 48 * 0.8);
      if (this === model.popup()) return new DOMRect(999, 999, 2, 2);
      return unscaled.call(this);
    });
    fireEvent.click(model.trigger);
    await screen.findByRole("option", { name: choices[29].label });
    expect(model.popup()!.style.width).toBe("335px");
    expect(Number.parseFloat(model.popup()!.style.top)).toBeCloseTo(56);
    expect(Number.parseFloat(model.popup()!.style.maxHeight)).toBeGreaterThanOrEqual(353);
    expect(Number.parseFloat(model.popup()!.style.maxHeight)).toBeLessThanOrEqual(354);
    expect(model.list()!.style.maxHeight).toBe("240px");
    expect(model.popup()!.style.transformOrigin).toBe("top center");
  });

  it("repositions when an ancestor scroll or resize changes the available region without scrolling the page", async () => {
    const model = layout({ clipTop: 200, triggerTop: 340 });
    fireEvent.click(model.trigger);
    await screen.findByRole("option", { name: choices[29].label });
    const initial = model.popup()?.style.maxHeight;
    act(() => { model.geometry.clipBottom = 600; fireEvent.resize(window); });
    assertFullyContained(model);
    expect(model.popup()?.style.maxHeight).not.toBe(initial);
    act(() => { model.geometry.triggerTop = 495; fireEvent.scroll(model.body); });
    assertFullyContained(model);
    expect(model.popup()?.getAttribute("data-side")).toBe("above");
  });

  it("keeps the committed selected ID and clipping containment through filtering, empty results and reopening", async () => {
    const model = layout();
    fireEvent.click(model.trigger);
    const input = await screen.findByRole("combobox", { name: "Event" });
    const activeId = input.getAttribute("aria-activedescendant");
    fireEvent.change(input, { target: { value: "Event 30" } });
    expect(input).toHaveAttribute("aria-activedescendant", activeId);
    assertFullyContained(model);
    fireEvent.change(input, { target: { value: "No matching event" } });
    expect(input).not.toHaveAttribute("aria-activedescendant");
    expect(screen.getByRole("status")).toHaveTextContent("No options");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(model.trigger).toHaveFocus();
    expect(model.trigger).toHaveTextContent(choices[29].label);
    fireEvent.click(model.trigger);
    expect(screen.getByRole("combobox", { name: "Event" })).toHaveAttribute("aria-activedescendant", activeId);
    assertFullyContained(model);
  });

  it("budgets for search and Add, expanding within the clip if neither adjacent side fits", async () => {
    const model = layout({ clipTop: 460, clipBottom: 690, triggerTop: 535, withAdd: true });
    fireEvent.click(model.trigger);
    await screen.findByRole("option", { name: choices[29].label });
    assertFullyContained(model);
    expect(model.popup()?.getAttribute("data-side")).toBe("overlap");
    await waitFor(() => expect(screen.getByRole("button", { name: "Add event" })).toBeVisible());
    expect(within(screen.getByRole("listbox")).queryByRole("button", { name: "Add event" })).not.toBeInTheDocument();
  });

  it("opens a short locally scrollable popup with its focused filter in view rather than the unrelated selected row", async () => {
    const model = layout({ clipTop: 500, clipBottom: 600, triggerTop: 525, withAdd: true });
    fireEvent.click(model.trigger);
    await screen.findByRole("option", { name: choices[29].label });
    const input = screen.getByRole("combobox", { name: "Event" });
    await waitFor(() => expect(input).toHaveFocus());
    assertControlContained(model, input);
    expect(model.popup()?.style.overflowY).toBe("auto");
    expect(model.popup()).toHaveAttribute("tabindex", "-1");
    expect(model.list()).toHaveAttribute("tabindex", "-1");
    expect(model.anchor).toContainElement(input);
    expect(model.anchor).toContainElement(screen.getByRole("button", { name: "Add event" }));
    expect(screen.getAllByRole("option")).toHaveLength(30);
    expect(new FormData(model.anchor.closest("form")!).get("event_id")).toBe("30");
  });

  it("reveals the arrow candidate before Enter, then reveals typing again without changing the committed value", async () => {
    const model = layout({ clipTop: 500, clipBottom: 600, triggerTop: 525, withAdd: true });
    fireEvent.click(model.trigger);
    const input = await screen.findByRole("combobox", { name: "Event" });
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const selected = screen.getByRole("option", { name: choices[29].label });
    expect(input).toHaveAttribute("aria-activedescendant", selected.id);
    assertControlContained(model, selected);
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: "Event" } });
    assertControlContained(model, input);
    expect(new FormData(model.anchor.closest("form")!).get("event_id")).toBe("30");
    act(() => model.observerCallbacks.forEach((callback) => callback()));
    assertControlContained(model, input);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const candidate = screen.getByRole("option", { name: choices[1].label });
    expect(input).toHaveAttribute("aria-activedescendant", candidate.id);
    expect(candidate).toHaveAttribute("aria-selected", "false");
    assertControlContained(model, candidate);
    expect(new FormData(model.anchor.closest("form")!).get("event_id")).toBe("30");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(model.trigger).toHaveFocus();
    expect(model.trigger).toHaveTextContent(choices[1].label);
    expect(new FormData(model.anchor.closest("form")!).get("event_id")).toBe("2");
  });

  it.each(["empty", "all-disabled"] as const)("reveals the still-focused compact filter after an external %s options update", async (state) => {
    const model = layout({ clipTop: 500, clipBottom: 600, triggerTop: 525, withAdd: true });
    const changed = vi.fn();
    fireEvent.click(model.trigger);
    const input = await screen.findByRole("combobox", { name: "Event" });
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.keyDown(input, { key: "ArrowUp" });
    assertControlContained(model, screen.getByRole("option", { name: choices[28].label }));
    expect(input.getBoundingClientRect().top).toBeLessThan(model.popup()!.getBoundingClientRect().top);
    const updated = state === "empty" ? [] : choices.map((option) => ({ ...option, disabled: true }));
    model.rerender(<Fixture add options={updated} onChange={changed} />);
    expect(screen.getByRole("combobox", { name: "Event" })).toBe(input);
    expect(input).toHaveFocus();
    expect(input).toHaveValue("");
    expect(input).not.toHaveAttribute("aria-activedescendant");
    assertControlContained(model, input);
    expect(new FormData(model.anchor.closest("form")!).get("event_id")).toBe("30");
    if (state === "empty") expect(screen.queryAllByRole("option")).toHaveLength(0);
    else expect(screen.getAllByRole("option").every((option) => option.matches(":disabled"))).toBe(true);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(changed).not.toHaveBeenCalled();
    model.rerender(<Fixture add options={choices} onChange={changed} />);
    expect(input).toHaveFocus();
    assertControlContained(model, input);
    expect(new FormData(model.anchor.closest("form")!).get("event_id")).toBe("30");
    expect(screen.getByRole("option", { name: choices[29].label })).toHaveAttribute("aria-selected", "true");
    expect(changed).not.toHaveBeenCalled();
  });

  it.each(["empty", "all-disabled"] as const)("preserves compact Add focus and visibility after an external %s options update", async (state) => {
    const model = layout({ clipTop: 500, clipBottom: 600, triggerTop: 525, withAdd: true });
    const changed = vi.fn();
    fireEvent.click(model.trigger);
    const input = await screen.findByRole("combobox", { name: "Event" });
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.keyDown(input, { key: "ArrowUp" });
    const add = screen.getByRole("button", { name: "Add event" });
    act(() => add.focus());
    assertControlContained(model, add);
    const updated = state === "empty" ? [] : choices.map((option) => ({ ...option, disabled: true }));
    model.rerender(<Fixture add options={updated} onChange={changed} />);
    expect(add).toHaveFocus();
    expect(input).not.toHaveAttribute("aria-activedescendant");
    assertControlContained(model, add);
    expect(new FormData(model.anchor.closest("form")!).get("event_id")).toBe("30");
    expect(changed).not.toHaveBeenCalled();
    model.rerender(<Fixture add options={choices} onChange={changed} />);
    expect(add).toHaveFocus();
    assertControlContained(model, add);
    expect(new FormData(model.anchor.closest("form")!).get("event_id")).toBe("30");
    expect(changed).not.toHaveBeenCalled();
  });

  it.each(["removed", "disabled"] as const)("restores the compact filter when only the active option is %s, then honors a new Arrow intent", async (state) => {
    const model = layout({ clipTop: 500, clipBottom: 600, triggerTop: 525, withAdd: true });
    const changed = vi.fn();
    fireEvent.click(model.trigger);
    const input = await screen.findByRole("combobox", { name: "Event" });
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.keyDown(input, { key: "ArrowUp" });
    const originalCandidate = screen.getByRole("option", { name: choices[28].label });
    expect(input).toHaveAttribute("aria-activedescendant", originalCandidate.id);
    assertControlContained(model, originalCandidate);
    expect(input.getBoundingClientRect().top).toBeLessThan(model.popup()!.getBoundingClientRect().top);
    const updated = state === "removed"
      ? choices.filter((option) => option.id !== "29")
      : choices.map((option) => option.id === "29" ? { ...option, disabled: true } : option);

    model.rerender(<Fixture add options={updated} onChange={changed} />);

    expect(screen.getByRole("combobox", { name: "Event" })).toBe(input);
    expect(input).toHaveFocus();
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("aria-activedescendant", screen.getByRole("option", { name: choices[0].label }).id);
    assertControlContained(model, input);
    expect(new FormData(model.anchor.closest("form")!).get("event_id")).toBe("30");
    expect(screen.getByRole("option", { name: choices[29].label })).toHaveAttribute("aria-selected", "true");
    expect(changed).not.toHaveBeenCalled();
    act(() => model.observerCallbacks.forEach((callback) => callback()));
    assertControlContained(model, input);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    const newCandidate = screen.getByRole("option", { name: choices[1].label });
    expect(input).toHaveAttribute("aria-activedescendant", newCandidate.id);
    expect(input).toHaveFocus();
    assertControlContained(model, newCandidate);
    act(() => model.observerCallbacks.forEach((callback) => callback()));
    assertControlContained(model, newCandidate);
    expect(newCandidate).toHaveAttribute("aria-selected", "false");
    expect(new FormData(model.anchor.closest("form")!).get("event_id")).toBe("30");
    expect(changed).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(changed).toHaveBeenCalledExactlyOnceWith("2");
    expect(new FormData(model.anchor.closest("form")!).get("event_id")).toBe("2");
  });

  it.each(["removed", "disabled"] as const)("preserves Add ownership when only the active option is %s", async (state) => {
    const model = layout({ clipTop: 500, clipBottom: 600, triggerTop: 525, withAdd: true });
    const changed = vi.fn();
    fireEvent.click(model.trigger);
    const input = await screen.findByRole("combobox", { name: "Event" });
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.keyDown(input, { key: "ArrowUp" });
    const add = screen.getByRole("button", { name: "Add event" });
    act(() => add.focus());
    assertControlContained(model, add);
    const updated = state === "removed"
      ? choices.filter((option) => option.id !== "29")
      : choices.map((option) => option.id === "29" ? { ...option, disabled: true } : option);

    model.rerender(<Fixture add options={updated} onChange={changed} />);

    expect(add).toHaveFocus();
    expect(input).toHaveAttribute("aria-activedescendant", screen.getByRole("option", { name: choices[0].label }).id);
    assertControlContained(model, add);
    act(() => model.observerCallbacks.forEach((callback) => callback()));
    assertControlContained(model, add);
    expect(new FormData(model.anchor.closest("form")!).get("event_id")).toBe("30");
    expect(changed).not.toHaveBeenCalled();
  });

  it.each(["Home", "End"])("reveals the clipped focused filter for native %s without intercepting editing", async (key) => {
    const model = layout({ clipTop: 500, clipBottom: 600, triggerTop: 525, withAdd: true });
    fireEvent.click(model.trigger);
    const input = await screen.findByRole("combobox", { name: "Event" });
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.keyDown(input, { key: "ArrowUp" });
    assertControlContained(model, screen.getByRole("option", { name: choices[28].label }));
    expect(fireEvent.keyDown(input, { key })).toBe(true);
    assertControlContained(model, input);
    expect(input).toHaveFocus();
    expect(new FormData(model.anchor.closest("form")!).get("event_id")).toBe("30");
  });

  it("keeps the focused Add action visible through resize and option reorder without committing a candidate", async () => {
    const model = layout({ clipTop: 500, clipBottom: 600, triggerTop: 525, withAdd: true });
    fireEvent.click(model.trigger);
    const input = await screen.findByRole("combobox", { name: "Event" });
    await waitFor(() => expect(input).toHaveFocus());
    expect(fireEvent.keyDown(input, { key: "Tab" })).toBe(true);
    const add = screen.getByRole("button", { name: "Add event" });
    act(() => add.focus());
    assertControlContained(model, add);
    model.rerender(<Fixture add options={[...choices].reverse()} />);
    expect(add).toHaveFocus();
    assertControlContained(model, add);
    act(() => { model.geometry.clipBottom = 590; fireEvent.resize(window); });
    assertControlContained(model, add);
    expect(new FormData(model.anchor.closest("form")!).get("event_id")).toBe("30");
    expect(fireEvent.keyDown(add, { key: "Tab", shiftKey: true })).toBe(true);
    act(() => input.focus());
    assertControlContained(model, input);
    fireEvent.change(input, { target: { value: "No matching event" } });
    assertControlContained(model, input);
    expect(input).not.toHaveAttribute("aria-activedescendant");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(model.trigger).toHaveFocus();
    expect(model.trigger).toHaveTextContent(choices[29].label);
  });

  it("restores the compact filter for composition without committing the highlighted candidate", async () => {
    const model = layout({ clipTop: 500, clipBottom: 600, triggerTop: 525, withAdd: true });
    fireEvent.click(model.trigger);
    const input = await screen.findByRole("combobox", { name: "Event" });
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.keyDown(input, { key: "ArrowUp" });
    const candidate = screen.getByRole("option", { name: choices[28].label });
    assertControlContained(model, candidate);
    fireEvent.compositionStart(input);
    assertControlContained(model, input);
    expect(fireEvent.keyDown(input, { key: "Enter", isComposing: true })).toBe(true);
    expect(input).toHaveAttribute("aria-activedescendant", candidate.id);
    expect(input).toHaveFocus();
    expect(new FormData(model.anchor.closest("form")!).get("event_id")).toBe("30");
    fireEvent.compositionEnd(input);
  });

  it("resets only local popup scrolling when a larger clip can show filter, candidate and Add together", async () => {
    const model = layout({ clipTop: 500, clipBottom: 600, triggerTop: 525, withAdd: true });
    fireEvent.click(model.trigger);
    const input = await screen.findByRole("combobox", { name: "Event" });
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(model.popup()!.scrollTop).toBeGreaterThan(0);
    act(() => { model.geometry.clipTop = 120; model.geometry.clipBottom = 800; fireEvent.resize(window); });
    expect(model.popup()?.style.overflowY).toBe("hidden");
    expect(model.popup()!.scrollTop).toBe(0);
    assertControlContained(model, input);
    assertControlContained(model, screen.getByRole("option", { name: choices[29].label }));
    assertControlContained(model, screen.getByRole("button", { name: "Add event" }));
    expect(new FormData(model.anchor.closest("form")!).get("event_id")).toBe("30");
  });

  it("remeasures transform-driven anchor movement before and after animation settles without permanent polling", async () => {
    const model = layout({ clipTop: 180, triggerTop: 350 });
    fireEvent.click(model.trigger);
    await screen.findByRole("option", { name: choices[29].label });
    assertFullyContained(model);
    act(() => { model.geometry.triggerTop = 700; model.body.style.transform = "translateY(12px)"; });
    await waitFor(() => expect(model.popup()?.getAttribute("data-side")).toBe("above"));
    assertFullyContained(model);
    act(() => { model.geometry.triggerTop = 250; model.body.style.transform = "none"; });
    await waitFor(() => expect(model.popup()?.getAttribute("data-side")).toBe("below"));
    assertFullyContained(model);
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Event" })).toHaveFocus());
    const frames = vi.spyOn(window, "requestAnimationFrame");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
    frames.mockClear();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 80)); });
    expect(frames).not.toHaveBeenCalled();
  });

  it("cleans up position observers and bounded animation sampling on close", async () => {
    const model = layout();
    const removed = vi.spyOn(window, "removeEventListener");
    fireEvent.click(model.trigger);
    await screen.findByRole("option", { name: choices[29].label });
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Event" }), { key: "Escape" });
    expect(model.disconnect).toHaveBeenCalled();
    expect(removed).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removed).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(model.popup()).toBeNull();
    model.unmount();
  });

  it.each([320, 375, 1280])("contains a real-caller-style nonsearchable selector at %spx without adding an input", async (width) => {
    const model = layout({ width, searchable: false, triggerTop: 670 });
    fireEvent.click(model.trigger);
    await screen.findByRole("option", { name: choices[29].label });
    expect(screen.getByRole("combobox", { name: "Event" })).toBe(model.trigger);
    expect(model.trigger.tagName).toBe("BUTTON");
    expect(model.popup()?.querySelector("input")).toBeNull();
    assertFullyContained(model);
    const id = model.trigger.getAttribute("aria-activedescendant");
    model.rerender(<Fixture searchable={false} options={[...choices].reverse()} />);
    expect(model.trigger).toHaveAttribute("aria-activedescendant", id);
    assertFullyContained(model);
  });

  it("leaves an external Add-like action outside popup budgeting and deferred blur ownership", async () => {
    const model = layout({ searchable: false, triggerTop: 670 });
    act(() => model.trigger.focus());
    fireEvent.click(model.trigger);
    await screen.findByRole("option", { name: choices[29].label });
    assertFullyContained(model);
    const external = screen.getByRole("button", { name: "Next field" });
    expect(model.popup()).not.toContainElement(external);
    expect(model.popup()?.querySelector('[data-select-search]')).toBeNull();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    act(() => external.focus());
    expect(external).toHaveFocus();
    expect(model.popup()).not.toBeNull();
    act(() => vi.advanceTimersByTime(0));
    expect(model.popup()).toBeNull();
    expect(external).toHaveFocus();
    expect(new FormData(model.anchor.closest("form")!).get("event_id")).toBe("30");
  });

  it("contains Dream's unchanged eight-pixel entrance in a compact clip and restores its full settled budget", async () => {
    motionPreference.reduced = false;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    const model = layout({ clipTop: 500, clipBottom: 600, triggerTop: 525, withAdd: true, modelPopupMotion: true });
    fireEvent.click(model.trigger);
    const popup = model.popup()!;
    expect(model.popupMotion()).toEqual({ y: 8, scale: 0.95 });
    expect(popup.getBoundingClientRect().top).toBeGreaterThanOrEqual(500);
    expect(popup.getBoundingClientRect().bottom).toBeLessThanOrEqual(600);
    await act(async () => { await vi.advanceTimersByTimeAsync(48); });
    const input = screen.getByRole("combobox", { name: "Event" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(model.popupMotion().scale).toBeLessThan(1);
    assertAnimatedOptionContained(model, screen.getByRole("option", { name: choices[29].label }));
    expect(popup.getBoundingClientRect().bottom).toBeLessThanOrEqual(600);
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(model.popupMotion()).toEqual({ y: 0, scale: 1 });
    expect(popup.style.maxHeight).toBe("100px");
    assertControlContained(model, screen.getByRole("option", { name: choices[29].label }));
    expect(new FormData(model.anchor.closest("form")!).get("event_id")).toBe("30");
  });

  it.each(["outside", "Add"] as const)("does not let scheduled mount focus steal newer %s focus", async (destination) => {
    const model = layout({ withAdd: destination === "Add" });
    const frames = new Map<number, FrameRequestCallback>();
    let frameId = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.set(++frameId, callback);
      return frameId;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => { frames.delete(id); });
    act(() => model.trigger.focus());
    fireEvent.click(model.trigger);
    const next = screen.getByRole("button", { name: destination === "Add" ? "Add event" : "Next field" });
    act(() => next.focus());
    act(() => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(performance.now()));
    });
    expect(next).toHaveFocus();
    if (destination === "outside") await waitFor(() => expect(model.popup()).toBeNull());
    else {
      expect(model.popup()).not.toBeNull();
      assertControlContained(model, next);
    }
    expect(next).toHaveFocus();
    expect(new FormData(model.anchor.closest("form")!).get("event_id")).toBe("30");
  });

  it.each(["bubbling handler", "layout effect"] as const)("keeps the parent's %s destination chosen before passive autofocus", (phase) => {
    const takeFrames = holdAnimationFrames();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    function ParentHandoff({ phase }: { phase: "bubbling handler" | "layout effect" }) {
      const destination = useRef<HTMLButtonElement>(null);
      const [handoff, setHandoff] = useState(false);
      useLayoutEffect(() => {
        if (handoff) destination.current?.focus();
      }, [handoff]);
      return <form>
        <div onClick={() => {
          if (phase === "bubbling handler") destination.current?.focus();
          else setHandoff(true);
        }}>
          <Select aria-label="Event" name="event_id" value="30" options={choices} onChange={vi.fn()} searchable />
        </div>
        <button type="button" ref={destination}>Parent destination</button>
      </form>;
    }
    render(<ParentHandoff phase={phase} />);
    const trigger = screen.getByRole("combobox", { name: "Event" });
    act(() => trigger.focus());
    fireEvent.click(trigger);
    const destination = screen.getByRole("button", { name: "Parent destination" });
    expect(destination).toHaveFocus();
    expect(screen.getByRole("combobox", { name: "Event" }).tagName).toBe("INPUT");
    act(() => takeFrames().forEach((callback) => callback(performance.now())));
    expect(destination).toHaveFocus();
    act(() => vi.advanceTimersByTime(0));
    expect(destination).toHaveFocus();
    expect(new FormData(destination.closest("form")!).get("event_id")).toBe("30");
  });

  it("does not let a retired open callback focus a new filter after close and reopen", () => {
    const takeFrames = holdAnimationFrames();
    render(<Fixture />);
    const trigger = screen.getByRole("combobox", { name: "Event" });
    act(() => trigger.focus());
    fireEvent.click(trigger);
    const oldInput = screen.getByRole("combobox", { name: "Event" });
    const retiredCallbacks = takeFrames();
    fireEvent.keyDown(oldInput, { key: "Escape" });
    expect(oldInput.isConnected).toBe(false);
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    const newInput = screen.getByRole("combobox", { name: "Event" });
    expect(newInput).not.toBe(oldInput);
    expect(newInput.isConnected).toBe(true);
    // Simulate a callback already dequeued before its open cycle was retired.
    act(() => retiredCallbacks.forEach((callback) => callback(performance.now())));
    expect(trigger).toHaveFocus();
    act(() => takeFrames().forEach((callback) => callback(performance.now())));
    expect(newInput).toHaveFocus();
    expect(new FormData(trigger.closest("form")!).get("event_id")).toBe("30");
  });

  it("does not focus a disconnected filter after its selector unmounts", () => {
    const takeFrames = holdAnimationFrames();
    const view = render(<Fixture />);
    const trigger = screen.getByRole("combobox", { name: "Event" });
    act(() => trigger.focus());
    fireEvent.click(trigger);
    const input = screen.getByRole("combobox", { name: "Event" });
    const focus = vi.spyOn(input, "focus");
    const retiredCallbacks = takeFrames();
    view.unmount();
    expect(input.isConnected).toBe(false);
    act(() => retiredCallbacks.forEach((callback) => callback(performance.now())));
    expect(focus).not.toHaveBeenCalled();
    expect(document.body).toHaveFocus();
  });
});
