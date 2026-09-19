"use client";
import { HiExclamationTriangle, HiXMark } from "react-icons/hi2";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Dialog } from "radix-ui";
import { useModalFocus } from "@/hooks/use-modal-focus";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLanguage } from "@/hooks/use-language";

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
  pendingLabel?: string;
  confirmDisabled?: boolean;
  errorMessage?: string | null;
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
  confirmLabel,
  pendingLabel,
  confirmDisabled = false,
  errorMessage,
}: DeleteConfirmModalProps) {
  const isDanger = variant === "danger";
  const modalFocus = useModalFocus();
  const reducedMotion = useReducedMotion();
  const isMobile = useIsMobile();
  const { lang } = useLanguage();
  const dismiss = () => { if (!isDeleting) onClose(); };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) dismiss(); }}>
    <AnimatePresence>
      {isOpen && (
        <Dialog.Portal key="delete-confirmation" forceMount>
          <Dialog.Overlay asChild forceMount>
          <motion.div
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.2 }}
            className="fixed inset-0 z-100 bg-black/40 backdrop-blur-sm"
            data-confirmation-backdrop
          />
          </Dialog.Overlay>
          <Dialog.Content asChild forceMount {...modalFocus} aria-modal="true" aria-busy={isDeleting}
            onEscapeKeyDown={(event) => {
              modalFocus.onEscapeKeyDown(event);
              if (isDeleting) event.preventDefault();
            }}
            onPointerDownOutside={(event) => { if (isDeleting) event.preventDefault(); }}>
          <motion.div
            initial={reducedMotion ? false : { y: "100%", x: "-50%" }}
            animate={{
              y: isMobile ? 0 : "-50%",
              x: "-50%"
            }}
            exit={{ y: reducedMotion ? (isMobile ? 0 : "-50%") : "100%", x: "-50%" }}
            transition={reducedMotion ? { duration: 0 } : { type: "spring", damping: 25, stiffness: 300 }}
            className="fixed z-110 bottom-0 left-1/2 right-auto md:top-1/2 md:bottom-auto w-full md:max-w-sm bg-card border-none rounded-t-xl md:rounded-xl shadow-premium p-8"
          >
            <button
              type="button"
              onClick={dismiss}
              disabled={isDeleting}
              aria-label={lang === "am" ? "ማረጋገጫውን ዝጋ" : "Close confirmation"}
              className="absolute right-6 top-6 md:right-4 md:top-4 min-h-12 min-w-12 flex items-center justify-center p-2 [@media(hover:hover)]:hover:bg-card-alt rounded-xl text-muted transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
            >
              <HiXMark className="w-6 h-6 md:w-5 md:h-5" aria-hidden="true" />
            </button>

            <div className="flex flex-col items-center text-center space-y-4 pt-4 md:pt-0">
              <div className={`w-16 h-16 rounded-xl flex items-center justify-center mb-2 shadow-inner ${isDanger ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                <HiExclamationTriangle className="w-8 h-8" />
              </div>

              <div>
                <Dialog.Title asChild>
                  <h3 className="text-xl font-bold text-foreground tracking-tight">{title}</h3>
                </Dialog.Title>
                <Dialog.Description className="mt-2 text-sm text-muted leading-relaxed font-medium">
                  {message} <br/>
                  <span className="text-foreground font-semibold">&quot;{itemName}&quot;</span>
                </Dialog.Description>
              </div>

              {errorMessage && (
                <p role="alert" className="w-full break-words rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm font-medium text-danger">
                  {errorMessage}
                </p>
              )}

              <div className="w-full flex flex-col gap-3 pt-4">
                {!confirmDisabled && (
                  <button
                    type="button"
                    onClick={onConfirm}
                    disabled={isDeleting}
                    className={`w-full min-h-12 rounded-xl font-semibold text-sm [@media(hover:hover)_and_(pointer:fine)]:hover:opacity-90 transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${isDanger ? 'bg-danger text-background disabled:cursor-wait' : 'bg-emerald-600 text-white disabled:opacity-50'}`}
                  >
                    {isDeleting ? (pendingLabel || (isDanger ? "Deleting..." : "Restoring...")) : (confirmLabel || (isDanger ? "Confirm Delete" : "Confirm Restore"))}
                  </button>
                )}
                <button
                  type="button"
                  onClick={dismiss}
                  disabled={isDeleting}
                  className="w-full min-h-12 bg-card-alt text-foreground border border-border rounded-xl font-semibold text-sm [@media(hover:hover)]:hover:bg-primary-light [@media(hover:hover)]:hover:text-primary-dark dark:[@media(hover:hover)]:hover:text-primary [@media(hover:hover)]:hover:border-primary/30 transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
          </Dialog.Content>
        </Dialog.Portal>
      )}
    </AnimatePresence>
    </Dialog.Root>
  );
}
