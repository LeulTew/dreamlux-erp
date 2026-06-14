"use client";
import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HiXMark } from "react-icons/hi2";

interface ResponsiveDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

const MOBILE_BREAKPOINT = 768;

export default function ResponsiveDrawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
}: ResponsiveDrawerProps) {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  // Detect viewport size
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    check();
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    mql.addEventListener("change", check);
    return () => mql.removeEventListener("change", check);
  }, []);

  // Disable body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Don't render until we know the viewport size
  if (isMobile === null) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Drawer Sheet */}
          {isMobile ? (
            /* Mobile: bottom slide-up drawer (draggable to close) */
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              drag="y"
              dragConstraints={{ top: 0 }}
              dragElastic={0.4}
              onDragEnd={(_, info) => {
                if (info.offset.y > 140) {
                  onClose();
                }
              }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-lg max-h-[90vh] flex flex-col focus:outline-none"
            >
              {/* Drag Handle Indicator */}
              <div className="flex justify-center py-3 shrink-0 cursor-grab active:cursor-grabbing">
                <div className="w-12 h-1.5 rounded-full bg-border" />
              </div>

              {/* Title & Close */}
              <div className="flex items-center justify-between px-6 pb-4 shrink-0 border-b border-border/50">
                <div>
                  <h3 className="text-lg font-bold text-foreground">{title}</h3>
                  {subtitle && (
                    <p className="text-[10px] text-muted font-bold uppercase tracking-wider mt-0.5">
                      {subtitle}
                    </p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg bg-card-alt border border-border flex items-center justify-center text-muted hover:text-foreground hover:bg-border transition-all"
                >
                  <HiXMark className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto px-6 py-6 pb-[calc(2rem+env(safe-area-inset-bottom))]">
                {children}
              </div>
            </motion.div>
          ) : (
            /* Desktop: right slide-out pane */
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-2xl bg-card border-l border-border rounded-l-lg flex flex-col focus:outline-none shadow-none"
            >
              {/* Title Header */}
              <div className="flex items-center justify-between px-8 py-6 shrink-0 border-b border-border/50">
                <div>
                  <h3 className="text-xl font-black text-foreground tracking-tight">{title}</h3>
                  {subtitle && (
                    <p className="text-[10px] text-muted font-black uppercase tracking-widest mt-1">
                      {subtitle}
                    </p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="w-10 h-10 rounded-lg bg-card-alt border border-border flex items-center justify-center text-muted hover:text-foreground hover:bg-border transition-all"
                >
                  <HiXMark className="w-6 h-6" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto px-8 py-8">
                {children}
              </div>
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}

