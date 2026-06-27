"use client";
import React from "react";
import toast from "react-hot-toast";
import { PremiumToast } from "@/components/ui/PremiumToast";

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
