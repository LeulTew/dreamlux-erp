import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useModalFocus } from "./use-modal-focus";

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

function openEvent(content: HTMLElement) {
  const event = new Event("open", { cancelable: true });
  Object.defineProperty(event, "target", { value: content });
  return event;
}

describe("existing modal focus ownership", () => {
  it("keeps the existing no-argument opener behavior", () => {
    const opener = document.createElement("button");
    const content = document.createElement("div");
    document.body.append(opener, content);
    opener.focus();
    const focus = vi.spyOn(opener, "focus");
    const { result } = renderHook(() => useModalFocus());
    act(() => result.current.onOpenAutoFocus(openEvent(content)));
    content.tabIndex = -1;
    content.focus();
    act(() => result.current.onCloseAutoFocus(new Event("close", { cancelable: true })));
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(opener);
  });

  it("returns to an explicit replacement only when the original owner disappeared", () => {
    const opener = document.createElement("button");
    const replacement = document.createElement("button");
    const content = document.createElement("div");
    document.body.append(opener, replacement, content);
    opener.focus();
    const { result } = renderHook(() => useModalFocus(() => opener.isConnected ? opener : replacement));
    act(() => result.current.onOpenAutoFocus(openEvent(content)));
    opener.remove();
    const focus = vi.spyOn(replacement, "focus");
    act(() => result.current.onCloseAutoFocus(new Event("close", { cancelable: true })));
    expect(focus).toHaveBeenCalledWith({ preventScroll: false });
    expect(document.activeElement).toBe(replacement);
  });

  it("does not steal focus from a newer unrelated dialog", () => {
    const opener = document.createElement("button");
    const oldContent = document.createElement("div");
    const newer = document.createElement("div");
    newer.setAttribute("role", "dialog");
    const active = document.createElement("button");
    newer.append(active);
    document.body.append(opener, oldContent, newer);
    opener.focus();
    const { result } = renderHook(() => useModalFocus(() => opener));
    act(() => result.current.onOpenAutoFocus(openEvent(oldContent)));
    active.focus();
    act(() => result.current.onCloseAutoFocus(new Event("close", { cancelable: true })));
    expect(document.activeElement).toBe(active);
  });

  it("leaves Escape with an expanded child combobox", () => {
    const content = document.createElement("div");
    const combo = document.createElement("button");
    combo.setAttribute("role", "combobox");
    combo.setAttribute("aria-expanded", "true");
    content.append(combo);
    document.body.append(content);
    const { result } = renderHook(() => useModalFocus());
    act(() => result.current.onOpenAutoFocus(openEvent(content)));
    combo.focus();
    const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    Object.defineProperty(event, "target", { value: combo });
    act(() => result.current.onEscapeKeyDown(event));
    expect(event.defaultPrevented).toBe(true);
  });
});
