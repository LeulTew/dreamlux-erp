"use client";
import React from "react";
import toast from "react-hot-toast";
import { PremiumToast } from "@/components/ui/PremiumToast";

export const notify = {
  success: (title: string, description?: string) => {
    toast.custom((t) => (
      <PremiumToast t={t} title={title} description={description} type="success" />
    ), { duration: 4000 });
  },
  error: (title: string, description?: string) => {
    toast.custom((t) => (
      <PremiumToast t={t} title={title} description={description} type="error" />
    ), { duration: 5000 });
  },
  info: (title: string, description?: string) => {
    toast.custom((t) => (
      <PremiumToast t={t} title={title} description={description} type="info" />
    ), { duration: 4000 });
  },
};
