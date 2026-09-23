"use client";

import { useCallback, useRef } from "react";

export function useModalFocus(getReturnFocus?: () => HTMLElement | null) {
  const opener = useRef<HTMLElement | null>(null);
  const content = useRef<HTMLElement | null>(null);

  const onOpenAutoFocus = useCallback((event: Event) => {
    content.current = event.target instanceof HTMLElement ? event.target : null;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, []);

  const onCloseAutoFocus = useCallback((event: Event) => {
    event.preventDefault();
    const target = getReturnFocus ? getReturnFocus() : opener.current;
    if (!target?.isConnected) return;
    const active = document.activeElement;
    const activeModal = active instanceof HTMLElement ? active.closest('[role="dialog"], [role="alertdialog"]') : null;
    if (activeModal && activeModal !== content.current && !activeModal.contains(target)) return;
    target.focus({ preventScroll: target === opener.current });
  }, [getReturnFocus]);

  const onEscapeKeyDown = useCallback((event: KeyboardEvent) => {
    const target = event.target;
    // Radix observes Escape before React's child handlers. Let the active child consume it.
    if (target instanceof HTMLElement && target === document.activeElement && content.current?.contains(target)
      && target.closest('[role="listbox"], [role="combobox"][aria-expanded="true"], [data-modal-escape]')) {
      event.preventDefault();
    }
  }, []);

  return { onOpenAutoFocus, onCloseAutoFocus, onEscapeKeyDown };
}
