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
    options?: {
      duration?: number;
      /** Renderer ownership requires content that implements its own expiry and cleanup. */
      durationOwner?: "sonner" | "renderer";
    }
  ) => {
    const duration = options?.duration ?? 4000;
    const rendererOwnsDuration = options?.durationOwner === "renderer";
    // Sonner treats zero and NaN as its 4000ms default, not immediate expiry.
    const rendererDuration = rendererOwnsDuration ? duration || 4000 : duration;
    return sonnerToast.custom(
      (id) => <>{renderFn({ id, visible: true, duration: rendererDuration })}</>,
      { duration: rendererOwnsDuration ? Infinity : duration }
    );
  },
  success: (message: string, description?: string | ExternalToast) => {
    if (typeof description === "string") {
      return premiumToast((t) => (
        <PremiumToast t={t} title={message} description={description} type="success" />
      ));
    }
    return premiumToast((t) => (
      <PremiumToast t={t} title={message} type="success" />
    ), { duration: description?.duration });
  },
  error: (message: string, description?: string | ExternalToast) => {
    if (typeof description === "string") {
      return premiumToast((t) => (
        <PremiumToast t={t} title={message} description={description} type="error" />
      ), { duration: 5000 });
    }
    return premiumToast((t) => (
      <PremiumToast t={t} title={message} type="error" />
    ), { duration: description?.duration ?? 5000 });
  },
  info: (message: string, description?: string | ExternalToast) => {
    if (typeof description === "string") {
      return premiumToast((t) => (
        <PremiumToast t={t} title={message} description={description} type="info" />
      ));
    }
    return premiumToast((t) => (
      <PremiumToast t={t} title={message} type="info" />
    ), { duration: description?.duration });
  },
  dismiss: (id?: string | number) => {
    return sonnerToast.dismiss(id);
  }
};

function premiumToast(
  renderFn: (t: CompatToast) => React.ReactNode,
  options?: { duration?: number },
) {
  return toast.custom(renderFn, { ...options, durationOwner: "renderer" });
}

export const notify = {
  success: (title: string, description?: string, actionLabel?: string, onAction?: () => void) => {
    premiumToast((t) => (
      <PremiumToast t={t} title={title} description={description} type="success" actionLabel={actionLabel} onAction={onAction} />
    ), { duration: actionLabel ? 12000 : 4000 });
  },
  error: (title: string, description?: string, actionLabel?: string, onAction?: () => void) => {
    premiumToast((t) => (
      <PremiumToast t={t} title={title} description={description} type="error" actionLabel={actionLabel} onAction={onAction} />
    ), { duration: actionLabel ? 12000 : 5000 });
  },
  info: (title: string, description?: string, actionLabel?: string, onAction?: () => void) => {
    premiumToast((t) => (
      <PremiumToast t={t} title={title} description={description} type="info" actionLabel={actionLabel} onAction={onAction} />
    ), { duration: actionLabel ? 12000 : 4000 });
  },
};

export default toast;
