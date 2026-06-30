"use client";
import React from "react";
import { toast as sonnerToast } from "sonner";
import { PremiumToast } from "@/components/ui/PremiumToast";
import type { ExternalToast } from "sonner";

export interface CompatToast {
  id: string | number;
  visible?: boolean;
  duration?: number;
}

const toast = {
  custom: (
    renderFn: (t: CompatToast) => React.ReactNode,
    options?: { duration?: number }
  ) => {
    const duration = options?.duration ?? 4000;
    return sonnerToast.custom(
      (id) => <>{renderFn({ id, visible: true, duration })}</>,
      { duration }
    );
  },
  success: (message: string, description?: string | ExternalToast) => {
    if (typeof description === "string") {
      return sonnerToast.success(message, { description });
    }
    return sonnerToast.success(message, description);
  },
  error: (message: string, description?: string | ExternalToast) => {
    if (typeof description === "string") {
      return sonnerToast.error(message, { description });
    }
    return sonnerToast.error(message, description);
  },
  info: (message: string, description?: string | ExternalToast) => {
    if (typeof description === "string") {
      return sonnerToast.info(message, { description });
    }
    return sonnerToast.info(message, description);
  },
  dismiss: (id?: string | number) => {
    return sonnerToast.dismiss(id);
  }
};

export const notify = {
  success: (title: string, description?: string, actionLabel?: string, onAction?: () => void) => {
    toast.custom((t) => (
      <PremiumToast t={t} title={title} description={description} type="success" actionLabel={actionLabel} onAction={onAction} />
    ), { duration: actionLabel ? 12000 : 4000 });
  },
  error: (title: string, description?: string, actionLabel?: string, onAction?: () => void) => {
    toast.custom((t) => (
      <PremiumToast t={t} title={title} description={description} type="error" actionLabel={actionLabel} onAction={onAction} />
    ), { duration: actionLabel ? 12000 : 5000 });
  },
  info: (title: string, description?: string, actionLabel?: string, onAction?: () => void) => {
    toast.custom((t) => (
      <PremiumToast t={t} title={title} description={description} type="info" actionLabel={actionLabel} onAction={onAction} />
    ), { duration: actionLabel ? 12000 : 4000 });
  },
};

export default toast;
