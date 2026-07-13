"use client";

import { HiMagnifyingGlass } from "react-icons/hi2";
import { cn } from "@/lib/utils";

/**
 * Shared responsive filter toolbar (issue #150).
 * Stacks controls on mobile, flows to a single row on desktop with consistent
 * gaps and heights. Controls keep their own explicit widths; the search field
 * is bounded via ToolbarSearch so it never dominates the row.
 */
export function FilterToolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center border border-border/60 bg-card p-3 dl-radius-xl no-print",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Bounded search input for use inside FilterToolbar. Full width on mobile,
 * capped on desktop so dropdowns are not congested. 44px tall for touch.
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
    <div className={cn("relative w-full sm:w-56 lg:w-64 shrink-0", className)}>
      <HiMagnifyingGlass className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-11 pl-10 pr-4 text-xs font-semibold dl-radius-lg bg-card-alt border border-border/80 text-foreground outline-none focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}
