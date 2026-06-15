"use client";
import React, { useEffect, useState, useCallback } from "react";
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

const springConfig = { type: "spring" as const, damping: 28, stiffness: 260 };

export default function ResponsiveDrawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
}: ResponsiveDrawerProps) {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  // Internal "visible" flag — stays true during exit animation
  const [visible, setVisible] = useState(isOpen);

  // Detect viewport size
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    check();
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    mql.addEventListener("change", check);
    return () => mql.removeEventListener("change", check);
  }, []);

  // Sync "visible" when isOpen goes true
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isOpen) setVisible(true);
  }, [isOpen]);

  // Disable body scroll when drawer is open
  useEffect(() => {
    if (visible) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [visible]);

  // Close handler: start the exit animation
  const handleClose = useCallback(() => {
    setVisible(false);
  }, []);

  // Called when ALL exit animations are done
  const handleExitComplete = useCallback(() => {
    if (!visible) {
      onClose(); // Notify parent to unmount
    }
  }, [visible, onClose]);

  // Don't render until we know the viewport size
  if (isMobile === null) return null;

  return (
    <AnimatePresence onExitComplete={handleExitComplete}>
      {visible && (
        <div key="drawer-root">
          {/* Backdrop */}
          <motion.div
            key="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Drawer Sheet */}
          {isMobile ? (
            /* ─── Mobile: bottom slide-up ─── */
            <motion.div
              key="drawer-mobile"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={springConfig}
              drag="y"
              dragConstraints={{ top: 0 }}
              dragElastic={0.3}
              onDragEnd={(_, info) => {
                if (info.offset.y > 120) handleClose();
              }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-xl max-h-[92vh] flex flex-col focus:outline-none"
            >
              {/* Drag Handle */}
              <div className="flex justify-center py-3 shrink-0 cursor-grab active:cursor-grabbing">
                <div className="w-10 h-1 rounded-full bg-border" />
              </div>

              {/* Title & Close */}
              <div className="flex items-center justify-between px-5 pb-3 shrink-0 border-b border-border/50">
                <div>
                  <h3 className="text-base font-bold text-foreground">{title}</h3>
                  {subtitle && (
                    <p className="text-[10px] text-muted font-bold uppercase tracking-wider mt-0.5">
                      {subtitle}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleClose}
                  className="w-8 h-8 rounded-xl bg-card-alt border border-border flex items-center justify-center text-muted hover:text-foreground hover:bg-border transition-all"
                >
                  <HiXMark className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto px-5 py-5 pb-[calc(2rem+env(safe-area-inset-bottom))]">
                {children}
              </div>
            </motion.div>
          ) : (
            /* ─── Desktop: right slide-out, wide ─── */
            <motion.div
              key="drawer-desktop"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={springConfig}
              className="fixed top-0 right-0 bottom-0 z-50 w-[62vw] max-w-6xl min-w-[520px] bg-card border-l border-border flex flex-col focus:outline-none"
            >
              {/* Title Header */}
              <div className="flex items-center justify-between px-8 py-5 shrink-0 border-b border-border/50">
                <div>
                  <h3 className="text-lg font-bold text-foreground tracking-tight">{title}</h3>
                  {subtitle && (
                    <p className="text-[10px] text-muted font-bold uppercase tracking-widest mt-0.5">
                      {subtitle}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleClose}
                  className="w-9 h-9 rounded-xl bg-card-alt border border-border flex items-center justify-center text-muted hover:text-foreground hover:bg-border transition-all"
                >
                  <HiXMark className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto px-8 py-6">
                {children}
              </div>
            </motion.div>
          )}
        </div>
      )}
    </AnimatePresence>
  );
}
