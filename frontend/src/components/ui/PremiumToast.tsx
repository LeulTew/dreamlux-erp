"use client";
import React, { useState, useEffect, useRef } from "react";
import toast from "@/lib/toast";
import {
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineInformationCircle,
  HiXMark,
  HiChevronDown,
} from "react-icons/hi2";

interface CompatToast {
  id: string | number;
  visible?: boolean;
  duration?: number;
}

interface PremiumToastProps {
  t: CompatToast;
  title: string;
  description?: string;
  type: "success" | "error" | "info";
  actionLabel?: string;
  onAction?: () => void;
}

export function PremiumToast({ t, title, description, type, actionLabel, onAction }: PremiumToastProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isPaused, setIsPaused] = useState(false);

  // Use the toast's duration if defined, otherwise default to 6000ms
  const duration = t.duration || 6000;
  const [timeLeft, setTimeLeft] = useState(duration);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isPaused) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const interval = 100;
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= interval) {
          clearInterval(timerRef.current!);
          toast.dismiss(t.id);
          return 0;
        }
        return prev - interval;
      });
    }, interval);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPaused, t.id]);

  const secondsRemaining = Math.max(0, Math.ceil(timeLeft / 1000));
  const progressPercent = (timeLeft / duration) * 100;

  return (
    <div
      className={`max-w-md w-full bg-white/95 dark:bg-card/95 backdrop-blur-md border border-neutral-200/80 dark:border-border/80 shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.4)] rounded-[20px] overflow-hidden pointer-events-auto flex flex-col transition-all duration-300 ease-out transform ${
        t.visible ? "animate-in fade-in slide-in-from-top-4" : "animate-out fade-out slide-out-to-top-4"
      }`}
    >
      <div className="p-4 flex gap-3.5 items-start">
        {/* Status Icon */}
        <div className="shrink-0 pt-0.5">
          {type === "success" ? (
            <HiOutlineCheckCircle className="w-6 h-6 text-emerald-500" />
          ) : type === "error" ? (
            <HiOutlineXCircle className="w-6 h-6 text-red-500" />
          ) : (
            <HiOutlineInformationCircle className="w-6 h-6 text-indigo-500" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-foreground leading-tight">{title}</h4>
            <div className="flex items-center gap-1.5 shrink-0">
              {description && (
                <button
                  type="button"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-1 rounded-lg text-muted hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all cursor-pointer"
                  aria-label={isExpanded ? "Collapse description" : "Expand description"}
                >
                  <HiChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                </button>
              )}
              <button
                type="button"
                onClick={() => toast.dismiss(t.id)}
                className="p-1 rounded-lg text-muted hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all cursor-pointer"
                aria-label="Dismiss notification"
              >
                <HiXMark className="w-4 h-4" />
              </button>
            </div>
          </div>

          {description && isExpanded && (
            <p className="text-xs font-medium text-muted-foreground leading-relaxed transition-all">
              {description}
            </p>
          )}

          {actionLabel && onAction && (isExpanded || !description) && (
            <div className="pt-0.5">
              <button
                type="button"
                onClick={() => {
                  onAction();
                  toast.dismiss(t.id);
                }}
                className="px-4 py-1.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-850 text-xs font-semibold text-foreground rounded-lg shadow-sm transition-all active:scale-[0.98] cursor-pointer"
              >
                {actionLabel}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Progress Bar & Countdown Hint Footer */}
      <button
        type="button"
        onClick={() => setIsPaused(!isPaused)}
        className="w-full bg-neutral-50 dark:bg-card-alt hover:bg-neutral-100 dark:hover:bg-border/20 px-4 py-2.5 border-t border-neutral-100 dark:border-border/40 flex justify-between items-center text-left text-[11px] text-muted-foreground select-none cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        aria-label={isPaused ? "Resume notification countdown" : "Pause notification countdown"}
      >
        <span>
          {isPaused ? (
            <>
              Paused. <span className="font-bold text-foreground">Click to resume.</span>
            </>
          ) : (
            <>
              This message will close in {secondsRemaining} seconds.{" "}
              <span className="font-bold text-foreground">Click to stop.</span>
            </>
          )}
        </span>
      </button>

      {/* Full Width Progress Bar at the very bottom */}
      <div className="w-full h-[3px] bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
        <div
          className={`h-full transition-all duration-105 ${
            type === "success" ? "bg-emerald-500" : type === "error" ? "bg-red-500" : "bg-indigo-500"
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}
