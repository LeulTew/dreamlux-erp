"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Check, ChevronDown, Layers, X, AlertCircle, RefreshCw } from "lucide-react";
import { ServiceScope } from "@/lib/types";
import { getServiceScopes } from "@/lib/api";
import { useLanguage } from "@/hooks/use-language";

export interface ServiceScopeSelectProps {
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  scopes?: ServiceScope[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  error?: string;
  label?: string;
  id?: string;
}

export function ServiceScopeSelect({
  selectedIds = [],
  onChange,
  scopes: initialScopes,
  disabled = false,
  placeholder,
  className = "",
  error,
  label,
  id = "service-scope-select",
}: ServiceScopeSelectProps) {
  const { lang } = useLanguage();
  const isAmharic = lang === "am";
  const [availableScopes, setAvailableScopes] = useState<ServiceScope[]>(initialScopes || []);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const fetchScopes = useCallback(async () => {
    if (initialScopes && initialScopes.length > 0) {
      setAvailableScopes(initialScopes);
      setFetchError(null);
      return;
    }

    setLoading(true);
    setFetchError(null);
    try {
      const res = await getServiceScopes();
      if (res?.service_scopes) {
        setAvailableScopes(res.service_scopes);
      }
    } catch (err: any) {
      console.error("[ServiceScopeSelect] Failed to load scopes:", err);
      setFetchError(err.message || (isAmharic ? "የአገልግሎት ዓይነቶችን መጫን አልተቻለም" : "Failed to load service scopes"));
    } finally {
      setLoading(false);
    }
  }, [initialScopes, isAmharic]);

  useEffect(() => {
    fetchScopes();
  }, [fetchScopes]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const defaultPlaceholder = isAmharic
    ? "የአገልግሎት ዓይነቶችን ይምረጡ..."
    : "Select Service Scopes...";

  const defaultLabel = isAmharic ? "የአገልግሎት ዓይነቶች (Service Scopes)" : "Service Scopes";

  const handleToggleScope = (scopeId: string) => {
    if (disabled) return;
    if (selectedIds.includes(scopeId)) {
      onChange(selectedIds.filter((id) => id !== scopeId));
    } else {
      onChange([...selectedIds, scopeId]);
    }
  };

  const handleRemoveScope = (e: React.MouseEvent, scopeId: string) => {
    e.stopPropagation();
    if (disabled) return;
    onChange(selectedIds.filter((id) => id !== scopeId));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setActiveIndex(0);
      } else {
        setActiveIndex((prev) => (prev < availableScopes.length - 1 ? prev + 1 : 0));
      }
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setActiveIndex(availableScopes.length - 1);
      } else {
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : availableScopes.length - 1));
      }
      return;
    }

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setActiveIndex(0);
      } else if (activeIndex >= 0 && activeIndex < availableScopes.length) {
        handleToggleScope(availableScopes[activeIndex].id);
      }
      return;
    }

    if (e.key === "Escape") {
      if (isOpen) {
        e.preventDefault();
        setIsOpen(false);
        setActiveIndex(-1);
        triggerRef.current?.focus();
      }
      return;
    }

    if (e.key === "Tab") {
      if (isOpen) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    }
  };

  const selectedScopes = availableScopes.filter((s) => selectedIds.includes(s.id) || selectedIds.includes(s.code));
  const activeOptionId = activeIndex >= 0 && availableScopes[activeIndex] ? `${id}-option-${availableScopes[activeIndex].id}` : undefined;

  return (
    <div className={`relative w-full ${className}`} ref={dropdownRef}>
      {label !== null && (
        <label htmlFor={id} className="block text-xs font-bold uppercase tracking-wider text-amber-300/90 dark:text-amber-400/90 mb-1.5 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-amber-400" />
          {label || defaultLabel}
        </label>
      )}

      {fetchError && (
        <div className="mb-2 p-2.5 bg-rose-950/60 border border-rose-500/40 rounded-lg text-rose-300 text-xs flex items-center justify-between gap-2 shadow-md">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="truncate">{fetchError}</span>
          </div>
          <button
            type="button"
            onClick={fetchScopes}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-rose-900/80 hover:bg-rose-800 text-rose-100 rounded-md font-semibold text-xs min-h-[36px] transition-all shrink-0"
          >
            <RefreshCw className="w-3 h-3" />
            <span>{isAmharic ? "ድጋሚ ሞክር" : "Retry"}</span>
          </button>
        </div>
      )}

      <div
        id={id}
        ref={triggerRef}
        tabIndex={disabled ? -1 : 0}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={`${id}-listbox`}
        aria-activedescendant={activeOptionId}
        aria-disabled={disabled}
        aria-label={label || defaultLabel}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className={`min-h-[48px] w-full cursor-pointer rounded-lg border px-3 py-2 text-sm transition-all flex items-center justify-between gap-2 select-none ${
          disabled
            ? "bg-slate-900/40 border-slate-800 text-slate-500 cursor-not-allowed"
            : isOpen
            ? "border-amber-500/80 bg-slate-900/95 shadow-[0_0_15px_rgba(212,175,55,0.15)] ring-2 ring-amber-500/50"
            : error
            ? "border-rose-500/80 bg-rose-950/20 text-rose-200"
            : "border-amber-500/30 bg-slate-950/80 text-slate-100 hover:border-amber-500/60 hover:bg-slate-900/90"
        }`}
      >
        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0 py-0.5">
          {selectedScopes.length > 0 ? (
            selectedScopes.map((scope) => {
              const displayName = isAmharic ? scope.name_am : scope.name_en;
              return (
                <span
                  key={scope.id}
                  className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/20 text-amber-200 border border-amber-500/40 px-2.5 py-1 text-xs font-semibold shadow-xs transition-all hover:bg-amber-500/30"
                >
                  <span>{displayName}</span>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={(e) => handleRemoveScope(e, scope.id)}
                      className="inline-flex items-center justify-center rounded p-1 min-w-[24px] min-h-[24px] hover:bg-amber-500/40 hover:text-amber-100 transition-colors"
                      title={isAmharic ? "አስወግድ" : "Remove"}
                      aria-label={`${isAmharic ? "አስወግድ" : "Remove"} ${displayName}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </span>
              );
            })
          ) : (
            <span className="text-slate-400 italic">
              {loading ? (isAmharic ? "እየጫነ ነው..." : "Loading scopes...") : (placeholder || defaultPlaceholder)}
            </span>
          )}
        </div>

        <ChevronDown
          className={`w-4 h-4 text-amber-400 transition-transform duration-200 shrink-0 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </div>

      {error && <p className="mt-1 text-xs text-rose-400 font-semibold">{error}</p>}

      {isOpen && !disabled && (
        <div
          id={`${id}-listbox`}
          role="listbox"
          aria-multiselectable="true"
          aria-label={label || defaultLabel}
          className="absolute z-50 mt-1.5 w-full rounded-xl border border-amber-500/40 bg-slate-950/95 p-1.5 shadow-2xl backdrop-blur-md animate-in fade-in-50 zoom-in-95"
        >
          <div className="px-3 py-2 text-[11px] font-bold text-amber-400/90 uppercase tracking-wider border-b border-slate-800/80 mb-1 flex items-center justify-between">
            <span>{isAmharic ? "የአገልግሎት አማራጮች" : "Available Service Scopes"}</span>
            <span className="text-amber-300/80 font-mono text-[10px]">
              {selectedIds.length} {isAmharic ? "ተመርጧል" : "selected"}
            </span>
          </div>

          <div className="max-h-64 overflow-y-auto space-y-1 custom-scrollbar">
            {availableScopes.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-slate-400 italic">
                {loading ? (isAmharic ? "እየጫነ ነው..." : "Loading scopes...") : (isAmharic ? "ምንም የአገልግሎት ዓይነት አልተገኘም" : "No service scopes available")}
              </div>
            ) : (
              availableScopes.map((scope, idx) => {
                const isSelected = selectedIds.includes(scope.id) || selectedIds.includes(scope.code);
                const isActive = idx === activeIndex;
                const name = isAmharic ? scope.name_am : scope.name_en;
                const optionId = `${id}-option-${scope.id}`;

                return (
                  <div
                    key={scope.id}
                    id={optionId}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleToggleScope(scope.id)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={`group relative flex items-center gap-3 rounded-lg px-3 py-3 min-h-[48px] text-sm cursor-pointer transition-all ${
                      isActive
                        ? "bg-amber-500/25 text-amber-200 ring-1 ring-amber-500/50"
                        : isSelected
                        ? "bg-amber-500/15 text-amber-300 font-medium border border-amber-500/30"
                        : "text-slate-300 hover:bg-slate-900/90 hover:text-amber-300"
                    }`}
                  >
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                        isSelected
                          ? "border-amber-400 bg-amber-500 text-slate-950 font-bold"
                          : "border-slate-700 bg-slate-900 group-hover:border-amber-500/60"
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="truncate font-semibold">{name}</span>
                        <span className="text-[10px] font-mono text-amber-400/80 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-500/30">
                          {scope.code}
                        </span>
                      </div>
                      {scope.description && (
                        <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5 font-normal">
                          {scope.description}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
