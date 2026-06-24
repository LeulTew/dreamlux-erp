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
                <h3 className="text-xl font-bold text-foreground tracking-tight">Audit Review</h3>
                <p className="text-sm text-muted font-semibold">Review discrepancies before finalizing</p>
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
                  <div key={item.id} className="p-4 rounded-xl bg-card-alt/50 border border-border/30 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">{item.name}</p>
                      <div className="flex items-center gap-4 mt-1">
                        <div className="text-sm font-bold text-foreground">
                          Exp: <span className="text-muted">{item.expected}</span>
                        </div>
                        <div className="text-sm font-bold text-foreground">
                          Act: <span className="text-primary">{item.actual}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold text-[10px] uppercase ${
                      diff === 0 ? "bg-muted/10 text-muted" :
                      diff > 0 ? "bg-green-500/10 text-success" : "bg-red-500/10 text-danger"
                    }`}>
                      {diff > 0 && <HiArrowTrendingUp className="w-3.5 h-3.5" />}
                      {diff < 0 && <HiArrowTrendingDown className="w-3.5 h-3.5" />}
                      {diff === 0 ? "MATCH" : `${diff > 0 ? "+" : ""}${diff} DISCREPANCY`}
                    </div>
                  </div>
                );
              })}
            </div>

            <footer className="mt-8 pt-6 border-t border-border/50 space-y-4">
              <div className="flex items-center justify-between px-4 py-2.5 bg-primary-light rounded-xl text-primary font-semibold uppercase text-xs tracking-wider">
                <span>Net Change to Inventory</span>
                <span className={totalDiff < 0 ? "text-danger" : totalDiff > 0 ? "text-success" : ""}>
                  {totalDiff > 0 ? `+${totalDiff}` : totalDiff} Items
                </span>
              </div>

              <div className="flex gap-3">
                 <button
                  onClick={onConfirm}
                  disabled={isSubmitting}
                  className="flex-1 h-11 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-md shadow-amber-500/10 hover:from-amber-600 hover:via-amber-700 hover:to-amber-800 hover:shadow-lg hover:scale-[1.02] active:scale-[0.97] transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
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
                  className="h-11 px-6 bg-card-alt text-foreground rounded-xl font-semibold text-sm hover:bg-border transition-all active:scale-[0.98]"
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
