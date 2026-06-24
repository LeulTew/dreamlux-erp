"use client";
import { useState } from "react";
import { HiXMark, HiCheckCircle } from "react-icons/hi2";
import { motion, AnimatePresence } from "framer-motion";

interface QuantityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (quantity: number) => void;
  title: string;
  message: string;
  itemName: string;
  confirmLabel: string;
}

export default function QuantityModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  itemName,
  confirmLabel,
}: QuantityModalProps) {
  const [quantity, setQuantity] = useState("1");

  const handleConfirm = () => {
    const val = parseInt(quantity);
    if (!isNaN(val) && val >= 0) {
      onConfirm(val);
      onClose();
    }
  };

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
            initial={{ opacity: 0, scale: 0.95, x: "-50%", y: "-50%" }}
            animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
            exit={{ opacity: 0, scale: 0.95, x: "-50%", y: "-50%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed left-1/2 top-1/2 z-110 w-[calc(100%-2rem)] max-w-sm bg-card border-none rounded-xl shadow-premium p-8"
          >
            <button 
              onClick={onClose}
              className="absolute right-6 top-6 p-2 hover:bg-card-alt rounded-full text-muted transition-colors"
            >
              <HiXMark className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center text-center space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
                <HiCheckCircle className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-lg font-bold text-foreground tracking-tight">{title}</h3>
                <p className="mt-2 text-sm text-muted leading-relaxed font-semibold">
                  {message} <br/>
                  <span className="text-foreground font-bold italic">&quot;{itemName}&quot;</span>
                </p>
              </div>

              <div className="w-full space-y-4">
                <div className="flex items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => setQuantity(String(Math.max(0, parseInt(quantity || "0") - 1)))}
                    className="w-11 h-11 rounded-xl bg-card-alt border border-border flex items-center justify-center text-xl font-bold hover:bg-primary-light transition-all active:scale-[0.98]"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    min="0"
                    className="w-24 h-11 text-center px-4 rounded-xl border border-border bg-background text-foreground font-bold text-lg focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setQuantity(String(parseInt(quantity || "0") + 1))}
                    className="w-11 h-11 rounded-xl bg-card-alt border border-border flex items-center justify-center text-xl font-bold hover:bg-primary-light transition-all active:scale-[0.98]"
                  >
                    +
                  </button>
                </div>

                <div className="flex flex-col gap-3 pt-2">
                  <button
                    onClick={handleConfirm}
                    className="w-full h-11 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-md shadow-amber-500/10 hover:from-amber-600 hover:via-amber-700 hover:to-amber-800 hover:shadow-lg hover:scale-[1.02] active:scale-[0.97] transition-all duration-300 cursor-pointer"
                  >
                    {confirmLabel}
                  </button>
                  <button
                    onClick={onClose}
                    className="w-full h-11 bg-card-alt text-foreground rounded-xl font-semibold hover:bg-border transition-all active:scale-[0.98] text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
