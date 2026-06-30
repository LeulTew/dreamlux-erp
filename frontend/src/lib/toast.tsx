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
      return toast.custom((t) => (
        <PremiumToast t={t} title={message} description={description} type="success" />
      ));
    }
    return toast.custom((t) => (
      <PremiumToast t={t} title={message} type="success" />
    ), { duration: description?.duration });
  },
  error: (message: string, description?: string | ExternalToast) => {
    if (typeof description === "string") {
      return toast.custom((t) => (
        <PremiumToast t={t} title={message} description={description} type="error" />
      ), { duration: 5000 });
    }
    return toast.custom((t) => (
      <PremiumToast t={t} title={message} type="error" />
    ), { duration: description?.duration ?? 5000 });
  },
  info: (message: string, description?: string | ExternalToast) => {
    if (typeof description === "string") {
      return toast.custom((t) => (
        <PremiumToast t={t} title={message} description={description} type="info" />
      ));
    }
    return toast.custom((t) => (
      <PremiumToast t={t} title={message} type="info" />
    ), { duration: description?.duration });
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
