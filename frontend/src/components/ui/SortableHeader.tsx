import * as React from "react";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SortableHeaderProps {
  label: string;
  sortKey: string;
  currentSortBy?: string;
  currentSortOrder?: "asc" | "desc" | string;
  onSort: (key: string, order: "asc" | "desc") => void;
  className?: string;
  align?: "left" | "center" | "right";
}

export function SortableHeader({
  label,
  sortKey,
  currentSortBy,
  currentSortOrder = "asc",
  onSort,
  className,
  align = "left",
}: SortableHeaderProps) {
  const isSorted = currentSortBy === sortKey;
  const isAsc = isSorted && currentSortOrder === "asc";
  const isDesc = isSorted && currentSortOrder === "desc";

  const handleToggle = () => {
    const nextOrder = isAsc ? "desc" : "asc";
    onSort(sortKey, nextOrder);
  };

  const getAriaLabel = () => {
    if (isAsc) {
      return `Sorted by ${label} ascending. Click to sort descending.`;
    }
    if (isDesc) {
      return `Sorted by ${label} descending. Click to sort ascending.`;
    }
    return `Not sorted by ${label}. Click to sort ascending.`;
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={cn(
        "group inline-flex items-center gap-1.5 font-semibold text-[10px] uppercase tracking-[0.2em] text-muted-foreground outline-none select-none cursor-pointer transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm py-1 px-1.5 -ml-1.5",
        "[@media(hover:hover)]:hover:text-foreground",
        isSorted && "text-foreground font-black",
        align === "center" && "justify-center mx-auto",
        align === "right" && "justify-end ml-auto",
        className
      )}
      aria-label={getAriaLabel()}
    >
      <span>{label}</span>
      <span className={cn(
        "transition-transform duration-200 shrink-0",
        isSorted ? "text-primary dark:text-primary" : "text-muted-foreground/40 group-hover:text-muted-foreground/75"
      )}>
        {isAsc && <ArrowUp className="size-3.5" aria-hidden="true" />}
        {isDesc && <ArrowDown className="size-3.5" aria-hidden="true" />}
        {!isSorted && <ArrowUpDown className="size-3.5" aria-hidden="true" />}
      </span>
    </button>
  );
}
