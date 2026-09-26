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
  const popupRef = useRef<HTMLDivElement>(null);
  const searchHeaderRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const emptyRef = useRef<HTMLDivElement>(null);
  const reconcileRef = useRef<(() => void) | null>(null);
  const scrollIntent = useRef<"filter" | "option" | "add">("option");
  const popupShiftY = useRef(0);
  const openingFocus = useRef<{ owner: Element | null } | null>(null);
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
  const requestedActiveOption = enabledOptions.find((option) => String(option.id) === activeId);
  const activeOption = requestedActiveOption ?? enabledOptions[0];
  const activeOptionWithdrawn = activeId !== null && !requestedActiveOption;
  const optionDomId = (optionId: string | number) => `${listboxId}-option-${encodeURIComponent(String(optionId))}`;
  const activeDescendant = menuOpen && activeOption ? optionDomId(activeOption.id) : undefined;
  const optionLayoutKey = JSON.stringify(filteredOptions.map((option) => [
    String(option.id), option.label, option.hint ?? null, Boolean(option.disabled),
  ]));

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        openingFocus.current = null;
        setIsOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (menuOpen && searchable) {
      const intent = openingFocus.current;
      const input = searchRef.current;
      if (!intent || !input) return;
      const raf = requestAnimationFrame(() => {
        // The opener's intent must still own both focus and this mounted filter.
        if (openingFocus.current === intent && searchRef.current === input
          && input.isConnected && document.activeElement === intent.owner) input.focus({ preventScroll: true });
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [menuOpen, searchable]);

  useLayoutEffect(() => {
    const listbox = listboxRef.current;
    const popup = popupRef.current;
    const anchor = containerRef.current;
    const trigger = triggerRef.current;
    const option = activeDescendant ? document.getElementById(activeDescendant) : null;
    if (!menuOpen || !listbox || !popup || !anchor || !trigger) return;
    const ancestors: HTMLElement[] = [];
    for (let parent: HTMLElement | null = anchor; parent; parent = parent.parentElement) ancestors.push(parent);
    let geometry = "";
    const position = () => {
      const anchorBox = anchor.getBoundingClientRect();
      const triggerBox = trigger.getBoundingClientRect();
      if (!anchor.offsetWidth || !anchorBox.width || !triggerBox.height) return;
      const scaleX = anchorBox.width / anchor.offsetWidth;
      const scaleY = anchor.offsetHeight ? anchorBox.height / anchor.offsetHeight : 1;
      if (scaleX <= 0 || scaleY <= 0) return;
      const viewport = window.visualViewport;
      let top = (viewport?.offsetTop ?? 0) + 8;
      let bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - 8;
      let left = (viewport?.offsetLeft ?? 0) + 8;
      let right = (viewport?.offsetLeft ?? 0) + (viewport?.width ?? document.documentElement.clientWidth) - 8;
      for (const parent of ancestors) {
        const style = getComputedStyle(parent);
        const box = parent.getBoundingClientRect();
        const parentScaleX = parent.offsetWidth ? box.width / parent.offsetWidth : 1;
        const parentScaleY = parent.offsetHeight ? box.height / parent.offsetHeight : 1;
        if (/(auto|scroll|hidden|clip|overlay)/.test(style.overflowY || style.overflow)) {
          top = Math.max(top, box.top + parent.clientTop * parentScaleY);
          bottom = Math.min(bottom, box.top + (parent.clientTop + parent.clientHeight) * parentScaleY);
        }
        if (/(auto|scroll|hidden|clip|overlay)/.test(style.overflowX || style.overflow)) {
          left = Math.max(left, box.left + parent.clientLeft * parentScaleX);
          right = Math.min(right, box.left + (parent.clientLeft + parent.clientWidth) * parentScaleX);
        }
      }
      // Keep Dream's positive entrance travel inside the clip without changing its motion.
      bottom -= Math.max(0, popupShiftY.current) * scaleY;
      const width = Math.max(0, Math.min(triggerBox.width, right - left));
      popup.style.width = `${width / scaleX}px`;
      popup.style.left = `${(Math.max(left, Math.min(triggerBox.left, right - width)) - anchorBox.left) / scaleX - anchor.clientLeft + anchor.scrollLeft}px`;
      const style = getComputedStyle(popup);
      const px = (value: string) => Number.parseFloat(value) || 0;
      const chrome = (searchHeaderRef.current?.offsetHeight ?? 0) + (emptyRef.current?.offsetHeight ?? 0)
        + (addRef.current ? addRef.current.offsetHeight + px(getComputedStyle(addRef.current).marginTop) : 0)
        + px(style.paddingTop) + px(style.paddingBottom) + px(style.borderTopWidth) + px(style.borderBottomWidth);
      const gap = 8 * scaleY;
      const belowTop = Math.max(top, triggerBox.bottom + gap);
      const aboveBottom = Math.min(bottom, triggerBox.top - gap);
      const below = Math.max(0, bottom - belowTop);
      const above = Math.max(0, aboveBottom - top);
      const desired = (chrome + Math.min(240, listbox.scrollHeight)) * scaleY;
      const minimum = (chrome + (filteredOptions.length ? 56 : 0)) * scaleY;
      const side = Math.max(below, above) < minimum ? "overlap"
        : below >= desired || below >= above ? "below" : "above";
      const available = Math.max(0, side === "overlap" ? bottom - top : side === "above" ? above : below);
      const localHeight = Math.floor(available / scaleY);
      const compact = localHeight < chrome + 48;
      popup.dataset.side = side;
      popup.style.top = side === "above" ? "auto"
        : `${((side === "overlap" ? top : belowTop) - anchorBox.top) / scaleY - anchor.clientTop + anchor.scrollTop}px`;
      popup.style.bottom = side === "above"
        ? `${(anchorBox.top - aboveBottom) / scaleY + anchor.clientTop + anchor.clientHeight - anchor.scrollTop}px` : "auto";
      popup.style.maxHeight = `${localHeight}px`;
      popup.style.overflowY = compact ? "auto" : "hidden";
      popup.style.transformOrigin = side === "above" ? "bottom center" : "top center";
      listbox.style.maxHeight = `${Math.max(compact ? 48 : 0, Math.min(240, localHeight - chrome))}px`;
      geometry = [anchorBox.top, anchorBox.left, scaleX, scaleY, triggerBox.top, triggerBox.bottom,
        top, bottom, left, right, chrome, listbox.scrollHeight, popupShiftY.current].join(",");
    };
    const reconcile = (withdrawn = false) => {
      position();
      if (option) {
        // Popup transforms affect viewport rectangles, but not these scroll units.
        const top = option.offsetTop;
        const height = option.offsetHeight;
        const viewportHeight = listbox.clientHeight;
        if (top < listbox.scrollTop || height > viewportHeight) listbox.scrollTop = top;
        else if (top + height > listbox.scrollTop + viewportHeight) listbox.scrollTop = top + height - viewportHeight;
      }
      if (popup.style.overflowY !== "auto") {
        popup.scrollTop = 0;
        return;
      }
      // A short popup cannot show both filter and candidate; reveal the current interaction.
      if (scrollIntent.current === "option" && (!option || withdrawn) && searchHeaderRef.current) scrollIntent.current = "filter";
      const control = scrollIntent.current === "filter" ? searchHeaderRef.current
        : scrollIntent.current === "add" ? addRef.current : null;
      const target = control ?? option;
      if (!target) return;
      const top = control ? target.offsetTop : listbox.offsetTop + target.offsetTop - listbox.scrollTop;
      const height = target.offsetHeight;
      if (top < popup.scrollTop || height > popup.clientHeight) popup.scrollTop = top;
      else if (top + height > popup.scrollTop + popup.clientHeight) popup.scrollTop = top + height - popup.clientHeight;
    };
    reconcileRef.current = reconcile;
    // Apply withdrawal to this data update, not to a later explicit Arrow intent.
    reconcile(activeOptionWithdrawn);
    let frame: number | null = null;
    let stableFrames = 0;
    let previousGeometry = "";
    const sample = () => {
      frame = null;
      reconcile();
      stableFrames = geometry === previousGeometry ? stableFrames + 1 : 0;
      previousGeometry = geometry;
      if (stableFrames < 2) frame = requestAnimationFrame(sample);
    };
    const update = () => {
      reconcile();
      stableFrames = 0;
      if (frame === null) frame = requestAnimationFrame(sample);
    };
    const observer = new ResizeObserver(update);
    ancestors.forEach((ancestor) => observer.observe(ancestor));
    observer.observe(trigger);
    observer.observe(popup);
    observer.observe(listbox);
    for (const control of [searchHeaderRef.current, addRef.current, emptyRef.current]) {
      if (control) observer.observe(control);
    }
    if (option) observer.observe(option);
    const mutations = new MutationObserver(update);
    for (const ancestor of ancestors) {
      ancestor.addEventListener("scroll", update, { passive: true });
      ancestor.addEventListener("transitionstart", update);
      ancestor.addEventListener("animationstart", update);
      mutations.observe(ancestor, { attributes: true, attributeFilter: ["style", "class"] });
    }
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, { passive: true });
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    update();
    return () => {
      reconcileRef.current = null;
      if (frame !== null) cancelAnimationFrame(frame);
      observer.disconnect();
      mutations.disconnect();
      for (const ancestor of ancestors) {
        ancestor.removeEventListener("scroll", update);
        ancestor.removeEventListener("transitionstart", update);
        ancestor.removeEventListener("animationstart", update);
      }
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [activeDescendant, activeOptionWithdrawn, filteredOptions, optionLayoutKey, menuOpen, searchable, onAdd]);

  const reveal = (intent: "filter" | "option" | "add") => {
    scrollIntent.current = intent;
    reconcileRef.current?.();
  };

  const openMenu = (fromEnd = false) => {
    openingFocus.current = { owner: document.activeElement };
    const enabled = options.filter((option) => !option.disabled);
    const initial = selectedOption && !selectedOption.disabled ? selectedOption
      : fromEnd ? enabled.at(-1) : enabled[0];
    scrollIntent.current = searchable ? "filter" : "option";
    popupShiftY.current = reducedMotion ? 0 : 8;
    setActiveId(initial ? String(initial.id) : null);
    setQuery("");
    setIsOpen(true);
  };

  const closeMenu = () => {
    openingFocus.current = null;
    setQuery("");
    setIsOpen(false);
  };

  const commit = (optId: string | number) => {
    onChange(String(optId));
    closeMenu();
    triggerRef.current?.focus({ preventScroll: true });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.currentTarget === searchRef.current
      && (e.nativeEvent.isComposing || !["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(e.key))) reveal("filter");
    if (e.nativeEvent.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
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
      reveal("option");
      const next = enabledOptions[Math.min(index + 1, enabledOptions.length - 1)];
      setActiveId(next ? String(next.id) : null);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      reveal("option");
      const previous = enabledOptions[Math.max(index - 1, 0)];
      setActiveId(previous ? String(previous.id) : null);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeOption) commit(activeOption.id);
    } else if (!searchable && (e.key === "Home" || e.key === "End")) {
      e.preventDefault();
      reveal("option");
      const edge = e.key === "Home" ? enabledOptions[0] : enabledOptions.at(-1);
      setActiveId(edge ? String(edge.id) : null);
    }
  };

  return (
    <div className={`relative ${className}`} ref={containerRef} data-modal-escape={menuOpen || undefined} onBlur={(event) => {
      if (menuOpen && event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) {
        const container = event.currentTarget;
        // Let native focusin finish before removing popup nodes inside a focus scope.
        setTimeout(() => {
          if (container.isConnected && !container.contains(document.activeElement)) closeMenu();
        }, 0);
      }
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
          ref={popupRef}
          data-select-popup
          tabIndex={-1}
          initial={reducedMotion ? false : { opacity: 0, y: 8, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: reducedMotion ? 0 : 0.15, ease: "easeOut" }}
          onUpdate={(latest) => {
            if (typeof latest.y === "number") popupShiftY.current = latest.y;
            reconcileRef.current?.();
          }}
          className="absolute z-[100] flex w-full flex-col bg-card border border-border shadow-lg rounded-xl overflow-hidden py-1"
        >
          {searchable && (
            <div ref={searchHeaderRef} data-select-search className="shrink-0 px-2 pt-1 pb-2 border-b border-border/40">
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
                  onFocus={() => reveal("filter")}
                  onPointerDown={() => reveal("filter")}
                  onCompositionStart={() => reveal("filter")}
                  onChange={(e) => {
                    reveal("filter");
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
            className="relative max-h-60 shrink-0 overflow-y-auto custom-scrollbar flex flex-col gap-2">
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
                onFocus={() => {
                  if (!option.disabled) {
                    reveal("option");
                    setActiveId(String(option.id));
                  }
                }}
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
          {filteredOptions.length === 0 && <div ref={emptyRef} role="status" className="shrink-0 px-4 py-2 text-xs text-muted">{emptyMessage ?? labels.empty}</div>}
          {onAdd && (
            <button
              ref={addRef}
              type="button"
              onFocus={() => reveal("add")}
              onClick={() => {
                closeMenu();
                onAdd();
              }}
              className="mt-2 min-h-12 w-full shrink-0 text-left px-4 py-2.5 text-sm font-semibold text-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:bg-card-alt border-t border-border/40 transition-colors motion-reduce:transition-none flex items-center gap-2"
            >
              <span>{addLabel ?? labels.add}</span>
            </button>
          )}
        </motion.div>
      )}
    </div>
  );
}
