"use client";

import { motion, AnimatePresence } from "framer-motion";
import { HiPrinter, HiXMark } from "react-icons/hi2";
import { useState } from "react";

interface PrintOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPrint: (options: { includeImages: boolean; includeEvents: boolean }) => void;
  title?: string;
  description?: string;
  showIncludeEvents?: boolean;
}

export default function PrintOptionsModal({
  isOpen,
  onClose,
  onPrint,
  title = "Print PDF Report",
  description = "Configure your document layout before printing or saving to PDF.",
  showIncludeEvents = false,
}: PrintOptionsModalProps) {
  const [includeImages, setIncludeImages] = useState(true);
  const [includeEvents, setIncludeEvents] = useState(false);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-100 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <div className="fixed inset-0 z-110 flex items-end justify-center md:items-center pointer-events-none p-0 md:p-6">
            <motion.div
              initial={{ y: "100%", opacity: 0.5 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0.5 }}
              transition={{ type: "spring", damping: 30, stiffness: 350 }}
              className="pointer-events-auto w-full md:max-w-md bg-card rounded-t-xl md:rounded-xl shadow-premium overflow-hidden border border-border/50"
            >
              <div className="p-8 pb-6 border-b border-border/50 relative">
                <button
                  onClick={onClose}
                  className="absolute top-8 right-8 p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors"
                >
                  <HiXMark className="w-6 h-6" />
                </button>
                <div className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center mb-6">
                  <HiPrinter className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-2xl font-black text-foreground mb-2">{title}</h2>
                <p className="text-muted-foreground font-medium text-sm">{description}</p>
              </div>

              <div className="p-8 flex flex-col gap-6">
                <label className="flex items-center justify-between cursor-pointer p-4 rounded-2xl border border-border hover:bg-muted/50 transition-colors group">
                  <div className="flex flex-col gap-1">
                    <span className="font-bold text-foreground text-sm">Include Images</span>
                    <span className="text-xs font-medium text-muted-foreground text-balance">Show item thumbnails in the document</span>
                  </div>
                  <div className={`w-14 h-7 flex items-center rounded-full p-1 transition-all duration-300 ${includeImages ? "bg-primary" : "bg-muted"}`}>
                    <div className={`w-5 h-5 rounded-full shadow-lg transform transition-transform duration-300 ${includeImages ? "translate-x-7 bg-background" : "translate-x-0 bg-foreground/60"}`} />
                  </div>
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={includeImages}
                    onChange={(e) => setIncludeImages(e.target.checked)}
                  />
                </label>

                {showIncludeEvents && (
                  <label className="flex items-center justify-between cursor-pointer p-4 rounded-2xl border border-border hover:bg-muted/50 transition-colors group">
                    <div className="flex flex-col gap-1">
                      <span className="font-bold text-foreground text-sm">Include Event Prices</span>
                      <span className="text-xs font-medium text-muted-foreground text-balance">Print each employee&apos;s configured event pricing on the card</span>
                    </div>
                    <div className={`w-14 h-7 flex items-center rounded-full p-1 transition-all duration-300 ${includeEvents ? "bg-primary" : "bg-muted"}`}>
                      <div className={`w-5 h-5 rounded-full shadow-lg transform transition-transform duration-300 ${includeEvents ? "translate-x-7 bg-background" : "translate-x-0 bg-foreground/60"}`} />
                    </div>
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={includeEvents}
                      onChange={(e) => setIncludeEvents(e.target.checked)}
                    />
                  </label>
                )}
              </div>

              <div className="p-6 bg-card-alt border-t border-border/50 flex justify-end gap-3 px-8">
                <button
                  onClick={onClose}
                  className="px-6 py-3 rounded-2xl font-bold text-sm bg-card border border-border text-foreground hover:bg-muted transition-all active:scale-95"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onPrint({ includeImages, includeEvents });
                    onClose();
                  }}
                  className="px-8 py-3 rounded-2xl font-black text-sm bg-primary text-on-primary shadow-premium hover:opacity-90 active:scale-95 transition-all flex items-center gap-2 group"
                >
                  <HiPrinter className="w-5 h-5 opacity-90 group-hover:opacity-100" />
                  <span>Generate PDF</span>
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
