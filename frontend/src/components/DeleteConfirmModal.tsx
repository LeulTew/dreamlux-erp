"use client";
import { HiExclamationTriangle, HiXMark } from "react-icons/hi2";
import { AnimatePresence, motion } from "framer-motion";

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  itemName: string;
  isDeleting: boolean;
  variant?: "danger" | "primary";
  confirmLabel?: string;
}

export default function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  itemName,
  isDeleting,
  variant = "danger",
  confirmLabel
}: DeleteConfirmModalProps) {
  const isDanger = variant === "danger";

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-100 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div 
            initial={{ y: "100%", x: "-50%" }}
            animate={{ 
              y: (typeof window !== 'undefined' && window.innerWidth >= 768) ? "-50%" : 0,
              x: "-50%" 
            }}
            exit={{ y: "100%", x: "-50%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed z-110 bottom-0 left-1/2 right-auto md:top-1/2 md:bottom-auto w-full md:max-w-sm bg-card border-none rounded-t-[2.5rem] md:rounded-[3rem] shadow-premium p-8"
          >
            <button 
              onClick={onClose}
              className="absolute right-6 top-6 md:right-4 md:top-4 p-2 hover:bg-card-alt rounded-full text-muted transition-colors"
            >
              <HiXMark className="w-6 h-6 md:w-5 md:h-5" />
            </button>

            <div className="flex flex-col items-center text-center space-y-4 pt-4 md:pt-0">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-2 shadow-inner ${isDanger ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                <HiExclamationTriangle className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-xl font-black text-foreground tracking-tight">{title}</h3>
                <p className="mt-2 text-sm text-muted leading-relaxed font-bold">
                  {message} <br/>
                  <span className="text-foreground font-black italic">&quot;{itemName}&quot;</span>
                </p>
              </div>

              <div className="w-full flex flex-col gap-3 pt-4">
                <button
                  onClick={onConfirm}
                  disabled={isDeleting}
                  className={`w-full py-4 text-white rounded-3xl font-black uppercase tracking-[0.2em] shadow-premium hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 ${isDanger ? 'bg-danger' : 'bg-emerald-600'}`}
                >
                  {isDeleting ? (isDanger ? "Deleting..." : "Restoring...") : (confirmLabel || (isDanger ? "Confirm Delete" : "Confirm Restore"))}
                </button>
                <button
                  onClick={onClose}
                  disabled={isDeleting}
                  className="w-full py-4 bg-card-alt text-foreground border border-border rounded-3xl font-black uppercase tracking-[0.2em] shadow-sm hover:bg-border active:scale-95 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
