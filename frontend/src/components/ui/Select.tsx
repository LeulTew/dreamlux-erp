"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { HiChevronDown, HiMagnifyingGlass } from "react-icons/hi2";
import { motion, AnimatePresence } from "framer-motion";

interface Option {
  id: string | number;
  label: string;
  hint?: string;
  disabled?: boolean;
}

interface SelectProps {
  options: Option[];
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onAdd?: () => void;
  addLabel?: string;
  triggerClassName?: string;
  valueClassName?: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** Show a search input inside the dropdown to filter options by label. */
  searchable?: boolean;
  /** Placeholder for the in-dropdown search field. */
  searchPlaceholder?: string;
  /** Disable the whole control. */
  disabled?: boolean;
  /** Message shown when there are no options (or no search matches). */
  emptyMessage?: string;
}

export default function Select({
  options,
  value,
  onChange,
  placeholder = "Select...",
  className = "",
  onAdd,
  addLabel,
  triggerClassName = "",
  valueClassName = "",
  icon: CustomIcon,
  searchable = false,
  searchPlaceholder = "Search...",
  disabled = false,
  emptyMessage = "No options",
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((opt) => String(opt.id) === String(value));

  const filteredOptions = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((opt) => opt.label.toLowerCase().includes(q));
  }, [options, query, searchable]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && searchable) {
      // Focus the search field once the dropdown mounts.
      const raf = requestAnimationFrame(() => searchRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
  }, [isOpen, searchable]);

  const openMenu = () => {
    setActiveIndex(0);
    setQuery("");
    setIsOpen(true);
  };

  const closeMenu = () => {
    setQuery("");
    setIsOpen(false);
  };

  const commit = (optId: string | number) => {
    onChange(String(optId));
    closeMenu();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filteredOptions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filteredOptions[activeIndex];
      if (opt && !opt.disabled) commit(opt.id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeMenu();
    }
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => !disabled && (isOpen ? closeMenu() : openMenu())}
        onKeyDown={handleKeyDown}
        className={
          triggerClassName ||
          "w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-card-alt border border-border/50 text-sm font-semibold text-foreground hover:bg-primary-light hover:text-primary-dark hover:border-primary/30 dark:hover:bg-primary-light/10 dark:hover:text-primary dark:hover:border-primary/30 transition-all duration-300 ease-out outline-none focus:ring-2 focus:ring-primary/20 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-card-alt disabled:hover:text-foreground"
        }
      >
        <span className={valueClassName || (selectedOption ? "text-foreground font-semibold truncate" : "text-muted font-medium truncate")}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        {CustomIcon ? (
          <CustomIcon className="w-4 h-4 text-muted shrink-0" />
        ) : (
          <HiChevronDown className={`w-4 h-4 text-muted shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
        )}
      </button>

      <AnimatePresence>
        {isOpen && !disabled && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute z-[100] w-full mt-2 bg-card border border-border shadow-lg rounded-xl overflow-hidden py-1"
            role="listbox"
          >
            {searchable && (
              <div className="px-2 pt-1 pb-2 border-b border-border/40">
                <div className="relative">
                  <HiMagnifyingGlass className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                  <input
                    ref={searchRef}
                    type="text"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setActiveIndex(0);
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={searchPlaceholder}
                    className="w-full rounded-lg bg-card-alt border border-border/50 pl-8 pr-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
            )}
            <div className="max-h-60 overflow-y-auto custom-scrollbar flex flex-col">
              {filteredOptions.length === 0 && !onAdd ? (
                <div className="px-4 py-2 text-xs text-muted italic">{emptyMessage}</div>
              ) : (
                <>
                  {filteredOptions.map((option, idx) => (
                    <button
                      key={option.id}
                      type="button"
                      role="option"
                      aria-selected={String(option.id) === String(value)}
                      disabled={option.disabled}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => !option.disabled && commit(option.id)}
                      className={`w-full text-left px-4 py-2.5 text-sm font-semibold transition-all flex items-center justify-between gap-2 ${
                        option.disabled
                          ? "text-muted/60 cursor-not-allowed"
                          : String(option.id) === String(value)
                            ? "bg-primary/10 text-primary"
                            : idx === activeIndex
                              ? "bg-card-alt text-foreground"
                              : "text-foreground hover:bg-card-alt"
                      }`}
                    >
                      <span className="min-w-0 flex flex-col">
                        <span className="truncate">{option.label}</span>
                        {option.hint && <span className="text-[11px] font-medium text-muted truncate">{option.hint}</span>}
                      </span>
                      {String(option.id) === String(value) && !option.disabled && (
                        <div className="w-1.5 h-1.5 shrink-0 rounded-full bg-primary" />
                      )}
                    </button>
                  ))}
                  {onAdd && (
                    <button
                      type="button"
                      onClick={() => {
                        onAdd();
                        setIsOpen(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm font-black text-primary hover:bg-primary/10 border-t border-border/40 transition-all flex items-center gap-1.5"
                    >
                      <span>{addLabel || "+ Add New..."}</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
