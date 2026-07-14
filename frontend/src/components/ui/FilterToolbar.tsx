"use client";

import { HiMagnifyingGlass } from "react-icons/hi2";
import { cn } from "@/lib/utils";

/**
 * Shared responsive filter toolbar (issues #150, follow-up).
 *
 * Layout contract: the search field gets its OWN full-width row on top; the
 * filter controls flow on a separate row BELOW so a long search can never
 * squeeze the filters into wrapping their labels. An underlined "Clear" text
 * button appears at the end of the filter row only when filters are active.
 */
export function FilterToolbar({
  search,
  children,
  onClear,
  showClear = false,
  clearLabel = "Clear",
  className,
}: {
  /** The search field node (rendered full-width on its own row). */
  search?: React.ReactNode;
  /** Filter controls, rendered on the row below the search. */
  children: React.ReactNode;
  onClear?: () => void;
  /** Show the Clear button (only when any filter is active). */
  showClear?: boolean;
  clearLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 border border-border/60 bg-card p-3 dl-radius-xl no-print", className)}>
      {search && <div className="w-full">{search}</div>}
      <div className="flex flex-wrap items-center gap-2">
        {children}
        {showClear && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="ml-auto h-9 px-1 text-xs font-semibold text-muted-foreground underline underline-offset-4 decoration-border [@media(hover:hover)]:hover:text-foreground [@media(hover:hover)]:hover:decoration-foreground transition-colors"
          >
            {clearLabel}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Full-width, 44px search input for the FilterToolbar search row.
 */
export function ToolbarSearch({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative w-full", className)}>
      <HiMagnifyingGlass className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-11 pl-10 pr-4 text-sm font-medium dl-radius-lg bg-card-alt border border-border/80 text-foreground outline-none focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}
