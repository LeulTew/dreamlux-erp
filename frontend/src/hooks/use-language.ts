"use client";
import { useSyncExternalStore } from "react";

const getSnapshot = () => {
  if (typeof window === "undefined") return "en";
  return localStorage.getItem("lang") || "en";
};

const getServerSnapshot = () => "en";

const listeners = new Set<() => void>();

const subscribe = (callback: () => void) => {
  listeners.add(callback);
  
  const handleStorage = (e: StorageEvent) => {
    if (e.key === "lang") {
      callback();
    }
  };
  
  const handleCustomLang = () => {
    callback();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("storage", handleStorage);
    window.addEventListener("lang-change", handleCustomLang);
  }
  
  return () => {
    listeners.delete(callback);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("lang-change", handleCustomLang);
    }
  };
};

export function useLanguage() {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = () => {
    const next = lang === "en" ? "am" : "en";
    localStorage.setItem("lang", next);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("lang-change"));
    }
    listeners.forEach((listener) => listener());
  };

  return { lang, toggle };
}
