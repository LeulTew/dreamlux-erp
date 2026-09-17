"use client";
import { useSyncExternalStore } from "react";

function getLanguageSnapshot() {
  return localStorage.getItem("lang") || "en";
}

// Hydration shares the server default; client-only mounts read storage immediately.
function getServerLanguageSnapshot() {
  return "en";
}

function subscribe(onChange: () => void) {
  window.addEventListener("lang-change", onChange);
  window.addEventListener("storage", onChange);

  return () => {
    window.removeEventListener("lang-change", onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useLanguage() {
  const lang = useSyncExternalStore(subscribe, getLanguageSnapshot, getServerLanguageSnapshot);
  const toggle = () => {
    const next = lang === "en" ? "am" : "en";
    localStorage.setItem("lang", next);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("lang-change"));
    }
  };

  return { lang, toggle };
}
