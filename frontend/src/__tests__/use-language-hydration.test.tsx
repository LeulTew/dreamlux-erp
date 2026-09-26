import React, { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLanguage } from "@/hooks/use-language";
import ForbiddenState from "@/components/ForbiddenState";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

function LanguageLabel() {
  const { lang } = useLanguage();
  return <span data-testid="language">{lang}</span>;
}

function serverMarkup(element: React.ReactNode): string {
  // Exercise server semantics, not JSDOM's available browser globals.
  vi.stubGlobal("window", undefined);
  vi.stubGlobal("localStorage", undefined);
  try {
    return renderToString(element);
  } finally {
    vi.unstubAllGlobals();
  }
}

async function hydrateAndCheck(
  element: React.ReactNode,
  check: (container: HTMLElement, errors: unknown[]) => void,
) {
  const container = document.createElement("div");
  container.innerHTML = serverMarkup(element);
  const serverNode = container.firstChild;
  document.body.appendChild(container);
  const errors: unknown[] = [];
  let root: Root | undefined;
  try {
    await act(async () => {
      root = hydrateRoot(container, element, {
        onRecoverableError: error => errors.push(error),
      });
    });
    check(container, errors);
    expect(container.firstChild).toBe(serverNode);
  } finally {
    await act(async () => root?.unmount());
    container.remove();
  }
}

describe("saved language hydration", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    { stored: null, expected: "en" },
    { stored: "en", expected: "en" },
    { stored: "am", expected: "am" },
  ])("hydrates a saved $stored language without rebuilding the server tree", async ({ stored, expected }) => {
    if (stored !== null) localStorage.setItem("lang", stored);
    expect(serverMarkup(<LanguageLabel />)).toContain(">en<");
    await hydrateAndCheck(<LanguageLabel />, (container, errors) => {
      expect(container.textContent).toBe(expected);
      expect(errors).toEqual([]);
    });
  });

  it("hydrates the real denied-permission surface and caller action with saved Amharic", async () => {
    localStorage.setItem("lang", "am");
    const element = <ForbiddenState onAction={() => push("/")} />;
    expect(serverMarkup(element)).toContain("Forbidden: Insufficient privileges");
    await hydrateAndCheck(element, (container, errors) => {
      expect(container.querySelector("h2")?.textContent).toBe("ክልክል ነው: በቂ ፈቃድ የለዎትም");
      const button = container.querySelector("button");
      expect(button?.textContent).toBe("ወደ ዳሽቦርድ ተመለስ");
      expect(errors).toEqual([]);
      if (!button) throw new Error("The real ForbiddenState navigation action is missing");
      fireEvent.click(button);
      expect(push).toHaveBeenCalledWith("/");
    });
  });

  it("uses the saved language on the first client-only render", () => {
    localStorage.setItem("lang", "am");
    const rendered: string[] = [];
    function ClientOnlyLabel() {
      const { lang } = useLanguage();
      rendered.push(lang);
      return <span>{lang}</span>;
    }
    render(<ClientOnlyLabel />);
    expect(rendered[0]).toBe("am");
    expect(screen.getByText("am")).toBeInTheDocument();
  });

  it("keeps separate consumers synchronized through both toggle directions", () => {
    const first = renderHook(() => useLanguage());
    const second = renderHook(() => useLanguage());
    act(() => first.result.current.toggle());
    expect(localStorage.getItem("lang")).toBe("am");
    expect(first.result.current.lang).toBe("am");
    expect(second.result.current.lang).toBe("am");
    act(() => second.result.current.toggle());
    expect(localStorage.getItem("lang")).toBe("en");
    expect(first.result.current.lang).toBe("en");
    expect(second.result.current.lang).toBe("en");
  });

  it("responds to the existing same-document language event", () => {
    const { result } = renderHook(() => useLanguage());
    act(() => {
      localStorage.setItem("lang", "am");
      window.dispatchEvent(new CustomEvent("lang-change"));
    });
    expect(result.current.lang).toBe("am");
  });

  it("responds to cross-document storage changes and preference removal", () => {
    const { result } = renderHook(() => useLanguage());
    act(() => {
      localStorage.setItem("lang", "am");
      window.dispatchEvent(new StorageEvent("storage", { key: "lang", newValue: "am" }));
    });
    expect(result.current.lang).toBe("am");
    act(() => {
      localStorage.removeItem("lang");
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(result.current.lang).toBe("en");
  });

  it.each([
    { stored: null, expected: "en" },
    { stored: "", expected: "en" },
    { stored: "legacy-locale", expected: "legacy-locale" },
  ])("preserves the existing client preference semantics for $stored", ({ stored, expected }) => {
    if (stored !== null) localStorage.setItem("lang", stored);
    const { result } = renderHook(() => useLanguage());
    expect(result.current.lang).toBe(expected);
  });

  it("removes its own event listeners on unmount", () => {
    const added = vi.spyOn(window, "addEventListener");
    const removed = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useLanguage());
    const listeners = added.mock.calls.filter(([type]) => type === "lang-change" || type === "storage");
    expect(listeners.map(([type]) => type).sort()).toEqual(["lang-change", "storage"]);
    unmount();
    for (const [type, listener] of listeners) {
      expect(removed).toHaveBeenCalledWith(type, listener);
    }
    vi.mocked(localStorage.getItem).mockClear();
    window.dispatchEvent(new CustomEvent("lang-change"));
    window.dispatchEvent(new StorageEvent("storage", { key: "lang" }));
    expect(localStorage.getItem).not.toHaveBeenCalled();
  });
});
