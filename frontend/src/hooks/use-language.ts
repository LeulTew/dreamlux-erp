"use client";
import { useSyncExternalStore } from "react";

export function useLanguage() {
  const lang = useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb);
      return () => window.removeEventListener("storage", cb);
    },
    (globalThis as Record<string, unknown>)._storedLangHook as (() => string) || (() => {
      const stored = localStorage.getItem("lang");
      return stored || "en";
    }),
    () => "en"
  );

  const toggle = () => {
    const next = lang === "en" ? "am" : "en";
    localStorage.setItem("lang", next);
    window.dispatchEvent(new StorageEvent("storage"));
  };

  return { lang, toggle };
}
