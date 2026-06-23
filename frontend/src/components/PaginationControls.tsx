import * as React from "react";
import { HiChevronLeft, HiChevronRight } from "react-icons/hi2";

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
  onPageSizeChange?: (pageSize: number) => void;
  totalItems?: number;
  pageSizeOptions?: number[];
}

function buildPageItems(page: number, totalPages: number): Array<number | string> {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const items: Array<number | string> = [1];

  if (page > 3) {
    items.push("...");
  }

  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);

  for (let value = start; value <= end; value += 1) {
    items.push(value);
  }

  if (page < totalPages - 2) {
    items.push("...");
  }

  items.push(totalPages);
  return items;
}

export default function PaginationControls({
  page,
  totalPages,
  onPageChange,
  pageSize = 10,
  onPageSizeChange,
  totalItems,
  pageSizeOptions = [10, 20, 50, 100],
}: PaginationControlsProps) {
  if (totalPages <= 1 && (!totalItems || totalItems <= pageSizeOptions[0])) return null;

  const pageItems = buildPageItems(page, totalPages);

  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalItems || 0);

  return (
    <div className="mt-4 2xl:mt-8 flex flex-col md:flex-row items-center justify-between gap-4 bg-card px-6 py-3.5 rounded-full border border-border shadow-soft w-full">
      
      {/* Left: Page Size Selector & Results Text */}
      <div className="flex items-center gap-4 flex-wrap justify-center md:justify-start">
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">Show:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="bg-card-alt border border-border rounded-full text-xs font-bold px-3 py-1 outline-none focus:ring-2 focus:ring-primary/25 cursor-pointer text-foreground"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}

        {(totalItems !== undefined || onPageSizeChange) && (
          <div className="hidden md:block w-px h-5 bg-border/60" />
        )}

        {totalItems !== undefined && totalItems > 0 && (
          <span className="text-xs font-medium text-muted-foreground">
            Showing <strong className="text-foreground">{startItem}</strong> - <strong className="text-foreground">{endItem}</strong> of <strong className="text-foreground">{totalItems.toLocaleString()}</strong> results
          </span>
        )}
      </div>

      {/* Right/Center: Prev + Numbers + Next grouped closely */}
      <div className="flex items-center gap-3">
        {/* Previous Button */}
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="inline-flex items-center gap-1 text-sm font-semibold text-foreground/80 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-all px-2 py-1"
        >
          <HiChevronLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Previous</span>
        </button>

        {/* Page Numbers */}
        {totalPages > 1 && (
          <div className="flex items-center gap-1 sm:gap-1.5">
            {pageItems.map((item, index) => {
              if (typeof item !== "number") {
                return (
                  <span key={`dots-${index}`} className="px-1 text-sm text-muted/60 select-none">
                    ...
                  </span>
                );
              }

              const isActive = item === page;

              return (
                <button
                  key={item}
                  onClick={() => onPageChange(item)}
                  className={`w-8 h-8 flex items-center justify-center rounded-full text-xs sm:text-sm font-bold transition-all ${
                    isActive
                      ? "bg-primary text-on-primary shadow-md shadow-primary/20 scale-105"
                      : "text-foreground/80 hover:bg-card-alt border border-transparent hover:border-border"
                  }`}
                >
                  {item}
                </button>
              );
            })}
          </div>
        )}

        {/* Next Button */}
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="inline-flex items-center gap-1 text-sm font-semibold text-foreground/80 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-all px-2 py-1"
        >
          <span className="hidden sm:inline">Next</span>
          <HiChevronRight className="w-4 h-4" />
        </button>
      </div>
      
    </div>
  );
}
