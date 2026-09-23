"use client";

import { useState, useRef, useEffect, useLayoutEffect, useMemo, useId } from "react";
import { HiChevronDown, HiMagnifyingGlass } from "react-icons/hi2";
import { motion, useReducedMotion } from "framer-motion";
import { useLanguage } from "@/hooks/use-language";

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
  /** Optional name for hidden form input / test label binding. */
  name?: string;
  /** Optional id for the active control's label binding. */
  id?: string;
  /** Optional aria-label for accessibility / testing-library query binding. */
  "aria-label"?: string;
}

export default function Select({
  options,
  value,
  onChange,
  placeholder,
  className = "",
  onAdd,
  addLabel,
  triggerClassName = "",
  valueClassName = "",
  icon: CustomIcon,
  searchable = false,
  searchPlaceholder,
  disabled = false,
  emptyMessage,
  name,
  id,
  "aria-label": ariaLabel,
}: SelectProps) {
  const { lang } = useLanguage();
  const labels = lang === "am"
    ? { select: "ይምረጡ...", search: "ፈልግ...", empty: "ምርጫዎች የሉም", add: "+ አዲስ ጨምር..." }
    : { select: "Select...", search: "Search...", empty: "No options", add: "+ Add New..." };
  const placeholderText = placeholder ?? labels.select;
  // Stable across SSR and hydration, and unique per instance, so several selects
  // on one page do not all claim to control the same listbox.
  const listboxId = useId();
  const valueLabelId = `${listboxId}-value`;
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const menuOpen = isOpen && !disabled;

  if (isOpen && disabled) {
    setIsOpen(false);
    setQuery("");
    setActiveId(null);
  }

  const selectedOption = options.find((opt) => String(opt.id) === String(value));

  const filteredOptions = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((opt) => opt.label.toLowerCase().includes(q));
  }, [options, query, searchable]);
  const enabledOptions = filteredOptions.filter((option) => !option.disabled);
  const activeOption = enabledOptions.find((option) => String(option.id) === activeId) ?? enabledOptions[0];
  const optionDomId = (optionId: string | number) => `${listboxId}-option-${encodeURIComponent(String(optionId))}`;
  const activeDescendant = menuOpen && activeOption ? optionDomId(activeOption.id) : undefined;
  const optionLayoutKey = JSON.stringify(filteredOptions.map((option) => [
    String(option.id), option.label, option.hint ?? null, Boolean(option.disabled),
  ]));

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
    if (menuOpen && searchable) {
      // Focus the search field once the dropdown mounts.
      const raf = requestAnimationFrame(() => searchRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
  }, [menuOpen, searchable]);

  useLayoutEffect(() => {
    const listbox = listboxRef.current;
    const option = activeDescendant ? document.getElementById(activeDescendant) : null;
    if (!listbox || !option) return;
    // Popup transforms affect viewport rectangles, but not these scroll units.
    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;
    if (top < listbox.scrollTop) listbox.scrollTop = top;
    else if (bottom > listbox.scrollTop + listbox.clientHeight) listbox.scrollTop = bottom - listbox.clientHeight;
  }, [activeDescendant, optionLayoutKey]);

  const openMenu = (fromEnd = false) => {
    const enabled = options.filter((option) => !option.disabled);
    const initial = selectedOption && !selectedOption.disabled ? selectedOption
      : fromEnd ? enabled.at(-1) : enabled[0];
    setActiveId(initial ? String(initial.id) : null);
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
    triggerRef.current?.focus({ preventScroll: true });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled || e.nativeEvent.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!menuOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        openMenu(e.key === "ArrowUp");
      }
      return;
    }
    const index = enabledOptions.findIndex((option) => option === activeOption);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = enabledOptions[Math.min(index + 1, enabledOptions.length - 1)];
      setActiveId(next ? String(next.id) : null);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const previous = enabledOptions[Math.max(index - 1, 0)];
      setActiveId(previous ? String(previous.id) : null);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeOption) commit(activeOption.id);
    } else if (!searchable && (e.key === "Home" || e.key === "End")) {
      e.preventDefault();
      const edge = e.key === "Home" ? enabledOptions[0] : enabledOptions.at(-1);
      setActiveId(edge ? String(edge.id) : null);
    }
  };

  return (
    <div className={`relative ${className}`} ref={containerRef} data-modal-escape={menuOpen || undefined} onBlur={(event) => {
      if (menuOpen && event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) closeMenu();
    }} onKeyDown={(event) => {
      if (!menuOpen || event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      triggerRef.current?.focus({ preventScroll: true });
    }}>
      {name && (
        <select
          name={name}
          aria-hidden="true"
          tabIndex={-1}
          disabled={disabled}
          className="sr-only absolute inset-0 opacity-0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {!selectedOption && <option value={value} />}
          {options.map((opt) => (
            <option key={opt.id} value={opt.id} />
          ))}
        </select>
      )}
      <button
        type="button"
        ref={triggerRef}
        id={searchable && menuOpen ? undefined : id}
        disabled={disabled}
        // A searchable popup transfers ownership to its focused input.
        role={searchable && menuOpen ? undefined : "combobox"}
        tabIndex={searchable && menuOpen ? -1 : undefined}
        aria-label={ariaLabel}
        aria-labelledby={!ariaLabel && !id ? valueLabelId : undefined}
        aria-haspopup="listbox"
        aria-expanded={menuOpen}
        aria-controls={listboxId}
        aria-activedescendant={!searchable ? activeDescendant : undefined}
        onClick={() => !disabled && (menuOpen ? closeMenu() : openMenu())}
        onKeyDown={handleKeyDown}
        className={
          triggerClassName ||
          "min-h-12 min-w-12 w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-card-alt border border-border/50 text-sm font-semibold text-foreground [@media(hover:hover)_and_(pointer:fine)]:enabled:hover:bg-secondary transition-colors duration-150 motion-reduce:transition-none outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
        }
      >
        <span id={valueLabelId} className={valueClassName || (selectedOption ? "min-w-0 text-foreground font-semibold truncate" : "min-w-0 text-muted font-medium truncate")}>
          {selectedOption ? selectedOption.label : placeholderText}
        </span>
        {CustomIcon ? (
          <CustomIcon className="w-4 h-4 text-muted shrink-0" />
        ) : (
          <HiChevronDown aria-hidden="true" className={`w-4 h-4 text-muted shrink-0 transition-transform duration-200 motion-reduce:transition-none ${menuOpen ? "rotate-180" : ""}`} />
        )}
      </button>

      {menuOpen && (
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 8, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: reducedMotion ? 0 : 0.15, ease: "easeOut" }}
          className="absolute z-[100] w-full mt-2 bg-card border border-border shadow-lg rounded-xl overflow-hidden py-1"
        >
          {searchable && (
            <div className="px-2 pt-1 pb-2 border-b border-border/40">
              <div className="relative">
                <HiMagnifyingGlass aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  ref={searchRef}
                  id={id}
                  type="text"
                  role="combobox"
                  aria-label={ariaLabel}
                  aria-labelledby={!ariaLabel && !id ? valueLabelId : undefined}
                  aria-autocomplete="list"
                  aria-expanded={menuOpen}
                  aria-controls={listboxId}
                  aria-activedescendant={activeDescendant}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActiveId(null);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={searchPlaceholder ?? labels.search}
                  className="min-h-12 w-full rounded-lg bg-card-alt border border-border/50 pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>
            </div>
          )}
          <div ref={listboxRef} role="listbox" id={listboxId} aria-label={ariaLabel ?? placeholderText}
            tabIndex={-1}
            className="relative max-h-60 overflow-y-auto custom-scrollbar flex flex-col gap-2">
            {filteredOptions.map((option) => (
              <button
                key={option.id}
                id={optionDomId(option.id)}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={String(option.id) === String(value)}
                aria-disabled={option.disabled || undefined}
                disabled={option.disabled}
                onMouseEnter={() => {
                  if (!option.disabled && window.matchMedia("(hover: hover) and (pointer: fine)").matches) setActiveId(String(option.id));
                }}
                onMouseDown={(event) => event.preventDefault()}
                onFocus={() => { if (!option.disabled) setActiveId(String(option.id)); }}
                onClick={() => !option.disabled && commit(option.id)}
                className={`min-h-12 w-full text-left px-4 py-2.5 text-sm font-semibold transition-colors motion-reduce:transition-none flex items-center justify-between gap-2 ${
                  option.disabled
                    ? "text-muted/60 cursor-not-allowed"
                    : String(option.id) === String(value)
                      ? "bg-secondary text-foreground"
                      : option === activeOption
                        ? "bg-card-alt text-foreground"
                        : "text-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:bg-card-alt"
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
          </div>
          {filteredOptions.length === 0 && <div role="status" className="px-4 py-2 text-xs text-muted">{emptyMessage ?? labels.empty}</div>}
          {onAdd && (
            <button
              type="button"
              onClick={() => {
                closeMenu();
                onAdd();
              }}
              className="mt-2 min-h-12 w-full text-left px-4 py-2.5 text-sm font-semibold text-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:bg-card-alt border-t border-border/40 transition-colors motion-reduce:transition-none flex items-center gap-2"
            >
              <span>{addLabel ?? labels.add}</span>
            </button>
          )}
        </motion.div>
      )}
    </div>
  );
}
