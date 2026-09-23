"use client";
import React, { useEffect, useState, useCallback, useLayoutEffect, useRef } from "react";
import { motion, AnimatePresence, useDragControls, useReducedMotion } from "framer-motion";
import { Dialog } from "radix-ui";
import { HiXMark } from "react-icons/hi2";
import { useModalFocus } from "@/hooks/use-modal-focus";
import { useLanguage } from "@/hooks/use-language";

interface ResponsiveDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  dismissDisabled?: boolean;
  closeLabel?: string;
}

const MOBILE_BREAKPOINT = 768;

const springConfig = { type: "spring" as const, damping: 28, stiffness: 260 };

export default function ResponsiveDrawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  dismissDisabled = false,
  closeLabel,
}: ResponsiveDrawerProps) {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [visible, setVisible] = useState(isOpen);
  const reducedMotion = useReducedMotion();
  const dragControls = useDragControls();
  const modalFocus = useModalFocus();
  const panelRef = useRef<HTMLDivElement>(null);
  const focusedControl = useRef<HTMLElement | null>(null);
  const wasLocked = useRef(false);
  const { lang } = useLanguage();
  const openCycle = useRef(0);
  const closingCycle = useRef<number | null>(null);
  const closeCallback = useRef(onClose);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    check();
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    mql.addEventListener("change", check);
    return () => mql.removeEventListener("change", check);
  }, []);

  useLayoutEffect(() => {
    closeCallback.current = onClose;
  }, [onClose]);

  useLayoutEffect(() => {
    openCycle.current += 1;
    closingCycle.current = null;
    return () => { closingCycle.current = null; };
  }, [isOpen, dismissDisabled]);

  // Parent closure removes content immediately; only a user dismissal owns an exit callback.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(isOpen);
  }, [isOpen, dismissDisabled]);

  useLayoutEffect(() => {
    const locked = isOpen && visible && dismissDisabled;
    const newlyLocked = locked && !wasLocked.current;
    wasLocked.current = locked;
    const panel = panelRef.current;
    if (!newlyLocked || !panel || !document.hasFocus()
      || panel.closest('[aria-hidden="true"], [inert]')) return;
    const active = document.activeElement;
    const previous = focusedControl.current;
    // Native disabling may move focus to body before the layout effect runs.
    if (previous?.isConnected && panel.contains(previous) && previous.matches(":disabled")
      && previous.closest('[role="dialog"], [role="alertdialog"]') === panel
      && (active === previous || active === document.body)) {
      panel.focus({ preventScroll: true });
    }
  }, [isOpen, visible, dismissDisabled]);

  const handleClose = useCallback(() => {
    if (!isOpen || !visible || dismissDisabled || closingCycle.current !== null) return;
    closingCycle.current = openCycle.current;
    setVisible(false);
  }, [isOpen, visible, dismissDisabled]);

  const handleExitComplete = useCallback(() => {
    if (dismissDisabled || closingCycle.current === null || closingCycle.current !== openCycle.current) return;
    closingCycle.current = null;
    closeCallback.current();
  }, [dismissDisabled]);

  if (!isOpen || isMobile === null) return null;

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <AnimatePresence onExitComplete={handleExitComplete}>
        {visible && (
          <Dialog.Portal key="drawer-root" forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                initial={reducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reducedMotion ? 0 : 0.2 }}
                className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
                data-drawer-backdrop
                onClick={handleClose}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount {...modalFocus} aria-modal="true"
              onEscapeKeyDown={(event) => {
                if (dismissDisabled) event.preventDefault();
                else modalFocus.onEscapeKeyDown(event);
              }}
              onInteractOutside={(event) => { if (dismissDisabled) event.preventDefault(); }}
              {...(subtitle ? {} : { "aria-describedby": undefined })}>
              <motion.div
                ref={panelRef}
                onFocusCapture={(event) => {
                  const target = event.target;
                  if (target instanceof HTMLElement && event.currentTarget.contains(target)
                    && target.closest('[role="dialog"], [role="alertdialog"]') === event.currentTarget) {
                    focusedControl.current = target;
                  }
                }}
                onBlurCapture={(event) => {
                  if (event.target === focusedControl.current && !event.target.matches(":disabled")) focusedControl.current = null;
                }}
                initial={reducedMotion ? false : isMobile ? { x: 0, y: "100%" } : { x: "100%", y: 0 }}
                animate={{ x: 0, y: 0 }}
                exit={reducedMotion ? { x: 0, y: 0 } : isMobile ? { x: 0, y: "100%" } : { x: "100%", y: 0 }}
                transition={reducedMotion ? { duration: 0 } : springConfig}
                drag={isMobile && !dismissDisabled ? "y" : false}
                dragControls={dragControls}
                dragListener={false}
                dragConstraints={{ top: 0 }}
                dragElastic={0.3}
                onDragEnd={(_, info) => { if (info.offset.y > 120) handleClose(); }}
                className={isMobile
                  ? "fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-xl max-h-[92vh] flex flex-col focus:outline-none"
                  : "fixed top-0 right-0 bottom-0 z-50 w-[62vw] max-w-6xl min-w-[520px] bg-card border-l border-border flex flex-col focus:outline-none"}
                data-drawer-panel
              >
                {isMobile && (
                  <div aria-hidden="true" data-drawer-drag-handle
                    onPointerDown={(event) => { if (!dismissDisabled) dragControls.start(event); }}
                    className="flex min-h-12 shrink-0 touch-none items-center justify-center cursor-grab active:cursor-grabbing">
                    <div className="w-10 h-1 rounded-full bg-border" />
                  </div>
                )}
                <div className={`flex items-center justify-between gap-3 shrink-0 border-b border-border/50 ${isMobile ? "px-5 pb-3" : "px-8 py-5"}`}>
                  <div className="min-w-0">
                    <Dialog.Title asChild>
                      <h3 className={`${isMobile ? "text-base" : "text-lg tracking-tight"} break-words font-bold text-foreground`}>{title}</h3>
                    </Dialog.Title>
                    {subtitle && (
                      <Dialog.Description className={`text-[10px] text-muted font-bold uppercase mt-0.5 break-words ${isMobile ? "tracking-wider" : "tracking-widest"}`}>
                        {subtitle}
                      </Dialog.Description>
                    )}
                  </div>
                  <button type="button" onClick={handleClose} disabled={dismissDisabled}
                    aria-label={closeLabel ?? (lang === "am" ? "መስኮቱን ዝጋ" : "Close drawer")}
                    className="min-h-12 min-w-12 shrink-0 rounded-xl bg-card-alt border border-border flex items-center justify-center text-muted [@media(hover:hover)_and_(pointer:fine)]:enabled:hover:text-foreground [@media(hover:hover)_and_(pointer:fine)]:enabled:hover:bg-border transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50">
                    <HiXMark className="w-5 h-5" aria-hidden="true" />
                  </button>
                </div>
                <div className={`min-h-0 flex-1 overflow-y-auto ${isMobile ? "px-5 py-5 pb-[calc(2rem+env(safe-area-inset-bottom))]" : "px-8 py-6"}`}>
                  {children}
                </div>
                {footer && (
                  <div className={`border-t border-border shrink-0 ${isMobile ? "px-5 py-4 bg-card" : "px-8 py-5 bg-card-alt/30"}`}>
                    {footer}
                  </div>
                )}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
