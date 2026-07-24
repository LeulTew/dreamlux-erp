"use client";

import React, { useState, useEffect, useRef } from "react";
import { Check, ChevronDown, Layers, X, Info } from "lucide-react";
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
}: ServiceScopeSelectProps) {
  const { lang } = useLanguage();
  const isAmharic = lang === "am";
  const [availableScopes, setAvailableScopes] = useState<ServiceScope[]>(initialScopes || []);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialScopes && initialScopes.length > 0) {
      setAvailableScopes(initialScopes);
      return;
    }

    let isMounted = true;
    setLoading(true);
    getServiceScopes()
      .then((res) => {
        if (isMounted && res?.service_scopes) {
          setAvailableScopes(res.service_scopes);
        }
      })
      .catch((err) => console.error("Failed to load service scopes:", err))
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [initialScopes]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
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

  const selectedScopes = availableScopes.filter((s) => selectedIds.includes(s.id) || selectedIds.includes(s.code));

  return (
    <div className={`relative w-full ${className}`} ref={dropdownRef}>
      {label !== null && (
        <label className="block text-xs font-semibold uppercase tracking-wider text-amber-300/90 dark:text-amber-400/90 mb-1.5 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-amber-400" />
          {label || defaultLabel}
        </label>
      )}

      <div
        tabIndex={disabled ? -1 : 0}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsOpen(!isOpen);
          } else if (e.key === "Escape") {
            setIsOpen(false);
          }
        }}
        className={`min-h-[42px] w-full cursor-pointer rounded-lg border px-3 py-2 text-sm transition-all flex items-center justify-between gap-2 ${
          disabled
            ? "bg-slate-900/40 border-slate-800 text-slate-500 cursor-not-allowed"
            : isOpen
            ? "border-amber-500/80 bg-slate-900/90 shadow-[0_0_15px_rgba(212,175,55,0.15)] ring-1 ring-amber-500/50"
            : error
            ? "border-rose-500/80 bg-rose-950/20 text-rose-200"
            : "border-amber-500/30 bg-slate-950/70 text-slate-100 hover:border-amber-500/50 hover:bg-slate-900/80"
        }`}
      >
        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
          {selectedScopes.length > 0 ? (
            selectedScopes.map((scope) => {
              const displayName = isAmharic ? scope.name_am : scope.name_en;
              return (
                <span
                  key={scope.id}
                  className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 text-xs font-medium shadow-sm transition-all hover:bg-amber-500/25"
                >
                  <span>{displayName}</span>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={(e) => handleRemoveScope(e, scope.id)}
                      className="rounded p-0.5 hover:bg-amber-500/30 hover:text-amber-100 transition-colors"
                      title={isAmharic ? "አስወግድ" : "Remove"}
                    >
                      <X className="w-3 h-3" />
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
          className={`w-4 h-4 text-amber-400/80 transition-transform duration-200 shrink-0 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </div>

      {error && <p className="mt-1 text-xs text-rose-400 font-medium">{error}</p>}

      {isOpen && !disabled && (
        <div
          role="listbox"
          className="absolute z-50 mt-1.5 w-full rounded-xl border border-amber-500/40 bg-slate-950/95 p-1.5 shadow-2xl backdrop-blur-md animate-in fade-in-50 zoom-in-95"
        >
          <div className="px-2 py-1 text-[11px] font-semibold text-amber-400/80 uppercase tracking-wider border-b border-slate-800/80 mb-1 flex items-center justify-between">
            <span>{isAmharic ? "የአገልግሎት አማራጮች" : "Available Service Scopes"}</span>
            <span className="text-slate-500 font-normal text-[10px]">
              {selectedIds.length} {isAmharic ? "ተመርጧል" : "selected"}
            </span>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-0.5 custom-scrollbar">
            {availableScopes.map((scope) => {
              const isSelected = selectedIds.includes(scope.id) || selectedIds.includes(scope.code);
              const name = isAmharic ? scope.name_am : scope.name_en;
              return (
                <div
                  key={scope.id}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleToggleScope(scope.id)}
                  className={`group relative flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-sm cursor-pointer transition-all ${
                    isSelected
                      ? "bg-amber-500/20 text-amber-200 font-medium border border-amber-500/30"
                      : "text-slate-300 hover:bg-slate-900 hover:text-amber-300"
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                      isSelected
                        ? "border-amber-400 bg-amber-500 text-slate-950"
                        : "border-slate-700 bg-slate-900 group-hover:border-amber-500/50"
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="truncate">{name}</span>
                      <span className="text-[10px] font-mono text-amber-400/60 bg-amber-950/40 px-1.5 py-0.2 rounded border border-amber-500/20">
                        {scope.code}
                      </span>
                    </div>
                    {scope.description && (
                      <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                        {scope.description}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
