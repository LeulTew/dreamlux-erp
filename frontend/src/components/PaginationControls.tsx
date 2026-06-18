interface PaginationControlsProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
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
}: PaginationControlsProps) {
  if (totalPages <= 1) return null;

  const pageItems = buildPageItems(page, totalPages);

  return (
    <div className="mt-3 2xl:mt-8 flex flex-wrap items-center justify-between gap-2 2xl:gap-3 bg-card p-2.5 2xl:p-4 rounded-xl 2xl:rounded-2xl border border-border">
      <button
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="px-3 2xl:px-4 py-1.5 2xl:py-2 rounded-lg 2xl:rounded-xl bg-card-alt border border-border text-xs 2xl:text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-border transition-all"
      >
        Previous
      </button>

      <div className="flex items-center gap-1.5">
        {pageItems.map((item, index) => {
          if (typeof item !== "number") {
            return (
              <span key={`dots-${index}`} className="px-2 text-sm text-muted">
                ...
              </span>
            );
          }

          const isActive = item === page;

          return (
            <button
              key={item}
              onClick={() => onPageChange(item)}
              className={`min-w-7 2xl:min-w-9 h-7 2xl:h-9 px-2 rounded-lg text-xs 2xl:text-sm font-bold transition-all ${
                isActive
                  ? "bg-primary text-on-primary shadow-premium"
                  : "bg-card-alt border border-border text-foreground hover:bg-border"
              }`}
            >
              {item}
            </button>
          );
        })}
      </div>

      <button
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="px-3 2xl:px-4 py-1.5 2xl:py-2 rounded-lg 2xl:rounded-xl bg-card-alt border border-border text-xs 2xl:text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-border transition-all"
      >
        Next
      </button>
    </div>
  );
}
