"use client";
import { useSyncExternalStore } from "react";

export function useTheme() {
  const dark = useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb);
      return () => window.removeEventListener("storage", cb);
    },
    () => {
      const stored = localStorage.getItem("theme");
      if (stored) return stored === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    },
    () => false
  );

  // Sync DOM class with the reactive value
  if (typeof window !== "undefined") {
    document.documentElement.classList.toggle("dark", dark);
  }

  const toggle = () => {
    const next = !dark;
    localStorage.setItem("theme", next ? "dark" : "light");
    document.documentElement.classList.toggle("dark", next);
    window.dispatchEvent(new StorageEvent("storage"));
  };

  return { dark, toggle };
}
