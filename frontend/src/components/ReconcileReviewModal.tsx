"use client";
import { HiXMark, HiCheckCircle, HiArrowTrendingDown, HiArrowTrendingUp } from "react-icons/hi2";
import { motion, AnimatePresence } from "framer-motion";

interface ReconcileReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
  counts: { id: string; name: string; expected: number; actual: number }[];
}

export default function ReconcileReviewModal({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting,
  counts,
}: ReconcileReviewModalProps) {
  const totalDiff = counts.reduce((acc, curr) => acc + (curr.actual - curr.expected), 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-100 bg-black/60 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, x: "-50%", y: "-50%" }}
            animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
            exit={{ opacity: 0, scale: 0.95, x: "-50%", y: "-50%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed left-1/2 top-1/2 z-110 w-[calc(100%-2rem)] max-w-lg bg-card border-none rounded-xl shadow-premium p-8 flex flex-col max-h-[85vh] overflow-hidden"
          >
            
            <header className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-2xl font-black text-foreground tracking-tight">Audit Review</h3>
                <p className="text-sm text-muted font-bold">Review discrepancies before finalizing</p>
              </div>
              <button 
                onClick={onClose}
                className="p-3 hover:bg-card-alt rounded-full text-muted transition-colors"
              >
                <HiXMark className="w-6 h-6" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-premium">
              {counts.map((item) => {
                const diff = item.actual - item.expected;
                return (
                  <div key={item.id} className="p-4 rounded-2xl bg-card-alt/50 border border-border/30 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-muted uppercase tracking-widest truncate">{item.name}</p>
                      <div className="flex items-center gap-4 mt-1">
                        <div className="text-sm font-bold text-foreground">
                          Exp: <span className="text-muted">{item.expected}</span>
                        </div>
                        <div className="text-sm font-black text-foreground">
                          Act: <span className="text-primary">{item.actual}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-black text-[10px] uppercase ${
                      diff === 0 ? "bg-muted/10 text-muted" :
                      diff > 0 ? "bg-green-500/10 text-success" : "bg-red-500/10 text-danger"
                    }`}>
                      {diff > 0 && <HiArrowTrendingUp className="w-4 h-4" />}
                      {diff < 0 && <HiArrowTrendingDown className="w-4 h-4" />}
                      {diff === 0 ? "MATCH" : `${diff > 0 ? "+" : ""}${diff} DISCREPANCY`}
                    </div>
                  </div>
                );
              })}
            </div>

            <footer className="mt-8 pt-6 border-t border-border/50 space-y-4">
              <div className="flex items-center justify-between px-4 py-3 bg-primary-light rounded-2xl text-primary font-black uppercase text-xs tracking-widest">
                <span>Net Change to Inventory</span>
                <span className={totalDiff < 0 ? "text-danger" : totalDiff > 0 ? "text-success" : ""}>
                  {totalDiff > 0 ? `+${totalDiff}` : totalDiff} Items
                </span>
              </div>

              <div className="flex gap-3">
                 <button
                  onClick={onConfirm}
                  disabled={isSubmitting}
                  className="flex-1 py-5 bg-primary text-on-primary rounded-3xl font-black uppercase tracking-[0.2em] shadow-premium hover:opacity-95 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? "Syncing..." : (
                    <>
                      <HiCheckCircle className="w-5 h-5" />
                      Apply Audit
                    </>
                  )}
                </button>
                <button
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-8 py-5 bg-card-alt text-foreground rounded-[1.25rem] font-black uppercase tracking-[0.15em] hover:bg-border transition-all active:scale-95 text-[10px]"
                >
                  Cancel
                </button>
              </div>
            </footer>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
