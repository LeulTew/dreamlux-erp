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
        <label htmlFor={id} className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-amber-400" />
          {label || defaultLabel}
        </label>
      )}

      {fetchError && (
        <div className="mb-2 p-3 bg-rose-950/80 border border-rose-600/50 rounded-lg text-rose-200 text-xs flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="truncate">{fetchError}</span>
          </div>
          <button
            type="button"
            onClick={fetchScopes}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-800 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-rose-700 active:bg-rose-900 text-rose-100 rounded-md font-semibold text-xs min-h-[48px] min-w-[48px] transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-rose-400"
          >
            <RefreshCw className="w-4 h-4" />
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
        className={`min-h-[48px] w-full cursor-pointer rounded-lg border px-3 py-2 text-sm transition-colors flex items-center justify-between gap-2 select-none ${
          disabled
            ? "bg-slate-900/50 border-slate-800 text-slate-500 cursor-not-allowed"
            : isOpen
            ? "border-amber-500 bg-slate-900 text-slate-100 ring-1 ring-amber-500/50"
            : error
            ? "border-rose-500 bg-rose-950/20 text-rose-200"
            : "border-slate-700 bg-slate-900 text-slate-100 [@media(hover:hover)_and_(pointer:fine)]:hover:border-slate-600"
        }`}
      >
        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0 py-0.5">
          {selectedScopes.length > 0 ? (
            selectedScopes.map((scope) => {
              const displayName = isAmharic ? scope.name_am : scope.name_en;
              return (
                <span
                  key={scope.id}
                  className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/15 text-amber-200 border border-amber-500/30 px-2.5 py-1 text-xs font-semibold transition-colors"
                >
                  <span>{displayName}</span>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={(e) => handleRemoveScope(e, scope.id)}
                      className="inline-flex items-center justify-center rounded-md min-w-[48px] min-h-[48px] p-2 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-amber-500/30 text-amber-200 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400"
                      title={isAmharic ? "አስወግድ" : "Remove"}
                      aria-label={`${isAmharic ? "አስወግድ" : "Remove"} ${displayName}`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </span>
              );
            })
          ) : (
            <span className="text-slate-400">
              {loading ? (isAmharic ? "እየጫነ ነው..." : "Loading scopes...") : (placeholder || defaultPlaceholder)}
            </span>
          )}
        </div>

        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ${
            isOpen ? "rotate-180 text-amber-400" : ""
          }`}
        />
      </div>

      {error && <p className="mt-1.5 text-xs text-rose-400 font-medium">{error}</p>}

      {isOpen && !disabled && (
        <div
          id={`${id}-listbox`}
          role="listbox"
          aria-multiselectable="true"
          aria-label={label || defaultLabel}
          className="absolute z-50 mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-1.5 shadow-lg"
        >
          <div className="px-3 py-2 text-xs font-medium text-slate-400 border-b border-slate-800 mb-1 flex items-center justify-between">
            <span>{isAmharic ? "የአገልግሎት አማራጮች" : "Available Service Scopes"}</span>
            <span className="text-slate-400 font-mono text-[11px]">
              {selectedIds.length} {isAmharic ? "ተመርጧል" : "selected"}
            </span>
          </div>

          <div className="max-h-64 overflow-y-auto space-y-1">
            {availableScopes.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-slate-400">
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
                    className={`group relative flex items-center gap-3 rounded-md px-3 py-2.5 min-h-[48px] text-sm cursor-pointer transition-colors ${
                      isActive || isSelected
                        ? "bg-slate-800 text-amber-300 font-medium border border-amber-500/30"
                        : "text-slate-200 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-slate-800 active:bg-slate-800"
                    }`}
                  >
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                        isSelected
                          ? "border-amber-400 bg-amber-500 text-slate-950 font-bold"
                          : "border-slate-600 bg-slate-900 [@media(hover:hover)_and_(pointer:fine)]:group-hover:border-slate-500"
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{name}</span>
                        <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                          {scope.code}
                        </span>
                      </div>
                      {scope.description && (
                        <p className="text-xs text-slate-400 line-clamp-1 mt-0.5 font-normal">
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
