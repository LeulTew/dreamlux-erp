"use client";
import { useState, useEffect } from "react";

export function useLanguage() {
  const [lang, setLang] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("lang") || "en";
    }
    return "en";
  });

  useEffect(() => {
    const handleLangChange = () => {
      const current = localStorage.getItem("lang") || "en";
      setLang(current);
    };

    window.addEventListener("lang-change", handleLangChange);
    window.addEventListener("storage", handleLangChange);

    // Initial check on mount to ensure synchronization
    handleLangChange();

    return () => {
      window.removeEventListener("lang-change", handleLangChange);
      window.removeEventListener("storage", handleLangChange);
    };
  }, []);

  const toggle = () => {
    const next = lang === "en" ? "am" : "en";
    localStorage.setItem("lang", next);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("lang-change"));
    }
  };

  return { lang, toggle };
}
