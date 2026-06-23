"use client";
import { Item } from "@/lib/types";
import { HiExclamationTriangle, HiPencilSquare, HiTrash } from "react-icons/hi2";

interface Props {
  item: Item;
  onEdit?: (item: Item) => void;
  onDelete?: (item: Item) => void;
}

export default function MobileAssetCard({ item, onEdit, onDelete }: Props) {
  const isLowStock = item.quantity <= 5;

  return (
    <div className="w-full flex items-center gap-5 p-5 rounded-xl bg-card border border-border/50 shadow-premium group active:scale-[0.98] transition-all text-left">
      {/* Thumbnail */}
      <div className="relative shrink-0">
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image_url}
            alt={item.name}
            className="w-16 h-16 rounded-lg object-cover border border-border shadow-sm group-hover:scale-105 transition-transform"
          />
        ) : (
          <div className="w-16 h-16 rounded-lg bg-card-alt border border-border flex items-center justify-center text-muted">
            <HiExclamationTriangle className="w-6 h-6" />
          </div>
        )}
        {isLowStock && item.quantity > 0 && (
          <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-danger text-white flex items-center justify-center border-2 border-card shadow-soft font-bold text-[10px]">
            !
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-base font-semibold text-foreground truncate tracking-tight">{item.name}</p>
        <div className="flex items-center gap-3 mt-1.5">
          <span className={`text-xs font-bold uppercase tracking-wider ${isLowStock ? 'text-danger' : 'text-primary'}`}>
            QTY {item.quantity}
          </span>
          <span className="w-1 h-1 rounded-full bg-border" />
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate max-w-25">
            {item.store.name}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit?.(item);
          }}
          className="p-2.5 rounded-xl bg-card-alt border border-border hover:bg-primary hover:border-primary/20 hover:text-white transition-all active:scale-[0.95]"
        >
          <HiPencilSquare className="w-5 h-5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.(item);
          }}
          className="p-2.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 hover:bg-rose-600 hover:text-white transition-all shadow-sm active:scale-[0.95]"
        >
          <HiTrash className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
