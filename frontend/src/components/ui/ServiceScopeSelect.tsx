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
    } catch (err: unknown) {
      console.error("[ServiceScopeSelect] Failed to load scopes:", err);
      setFetchError(err instanceof Error && err.message ? err.message : (isAmharic ? "የአገልግሎት ዓይነቶችን መጫን አልተቻለም" : "Failed to load service scopes"));
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
        <label htmlFor={id} className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted">
          <Layers className="h-3.5 w-3.5 text-primary" />
          {label || defaultLabel}
        </label>
      )}

      {fetchError && (
        <div className="mb-2 flex items-center justify-between gap-3 border border-danger/30 bg-danger/5 p-3 text-xs text-danger dl-radius-lg">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="truncate">{fetchError}</span>
          </div>
          <button
            type="button"
            onClick={fetchScopes}
            className="inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center gap-1.5 border border-danger/40 bg-card px-3 py-2 text-xs font-semibold text-danger transition-colors dl-radius-md focus:outline-none focus:ring-2 focus:ring-ring [@media(hover:hover)_and_(pointer:fine)]:hover:bg-danger/10"
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
        className={`flex min-h-12 w-full cursor-pointer select-none items-center justify-between gap-2 border px-3 py-2 text-sm transition-colors dl-radius-lg ${
          disabled
            ? "cursor-not-allowed border-border bg-muted/10 text-muted"
            : isOpen
            ? "border-primary bg-card text-foreground ring-2 ring-ring/30"
            : error
            ? "border-danger bg-danger/5 text-foreground"
            : "border-input bg-card text-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:border-primary/60"
        }`}
      >
        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0 py-0.5">
          {selectedScopes.length > 0 ? (
            selectedScopes.map((scope) => {
              const displayName = isAmharic ? scope.name_am : scope.name_en;
              return (
                <span
                  key={scope.id}
                  className="inline-flex items-center gap-1.5 border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary-dark transition-colors dl-radius-md"
                >
                  <span>{displayName}</span>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={(e) => handleRemoveScope(e, scope.id)}
                      className="inline-flex min-h-12 min-w-12 items-center justify-center p-2 text-primary-dark transition-colors dl-radius-md focus:outline-none focus:ring-2 focus:ring-ring [@media(hover:hover)_and_(pointer:fine)]:hover:bg-primary/15"
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
            <span className="text-muted">
              {loading ? (isAmharic ? "እየጫነ ነው..." : "Loading scopes...") : (placeholder || defaultPlaceholder)}
            </span>
          )}
        </div>

        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted transition-transform duration-200 ${
            isOpen ? "rotate-180 text-primary" : ""
          }`}
        />
      </div>

      {error && <p className="mt-1.5 text-xs font-medium text-danger">{error}</p>}

      {isOpen && !disabled && (
        <div
          id={`${id}-listbox`}
          role="listbox"
          aria-multiselectable="true"
          aria-label={label || defaultLabel}
          className="absolute z-50 mt-1 w-full border border-border bg-popover p-1.5 text-popover-foreground shadow-md dl-radius-lg"
        >
          <div className="mb-1 flex items-center justify-between border-b border-border px-3 py-2 text-xs font-medium text-muted">
            <span>{isAmharic ? "የአገልግሎት አማራጮች" : "Available Service Scopes"}</span>
            <span className="font-mono text-[11px] text-muted">
              {selectedIds.length} {isAmharic ? "ተመርጧል" : "selected"}
            </span>
          </div>

          <div className="max-h-64 overflow-y-auto space-y-1">
            {availableScopes.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-muted">
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
                    className={`group relative flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition-colors dl-radius-md ${
                      isActive || isSelected
                        ? "border border-primary/30 bg-primary/10 font-medium text-foreground"
                        : "border border-transparent text-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:bg-card-alt active:bg-card-alt"
                    }`}
                  >
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                        isSelected
                          ? "border-primary bg-primary text-on-primary font-bold"
                          : "border-input bg-card [@media(hover:hover)_and_(pointer:fine)]:group-hover:border-primary/60"
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{name}</span>
                        <span className="border border-border bg-card-alt px-1.5 py-0.5 font-mono text-[10px] text-muted dl-radius-sm">
                          {scope.code}
                        </span>
                      </div>
                      {scope.description && (
                        <p className="mt-0.5 line-clamp-1 text-xs font-normal text-muted">
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
