"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { toast as sonnerDismiss } from "sonner";
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

  const duration = Math.max(0, t.duration || 6000);
  const [timeLeft, setTimeLeft] = useState(duration);
  const remainingRef = useRef(duration);
  const stopTimerRef = useRef<() => void>(() => {});
  const dismissedRef = useRef(false);
  const actionInFlightRef = useRef(false);

  const dismiss = useCallback((action?: () => void) => {
    if (dismissedRef.current || actionInFlightRef.current) return;
    if (action) {
      actionInFlightRef.current = true;
      try {
        action();
      } finally {
        actionInFlightRef.current = false;
      }
    }
    dismissedRef.current = true;
    stopTimerRef.current();
    sonnerDismiss.dismiss(t.id);
  }, [t.id]);

  useEffect(() => {
    if (isPaused || duration === Infinity || dismissedRef.current) return;

    let lastTick = performance.now();
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const updateRemaining = () => {
      const now = performance.now();
      remainingRef.current = Math.max(0, remainingRef.current - Math.max(0, now - lastTick));
      lastTick = now;
    };
    const stop = () => {
      if (!active) return;
      active = false;
      clearTimeout(timer);
      updateRemaining();
    };
    const tick = () => {
      if (!active) return;
      updateRemaining();
      setTimeLeft(remainingRef.current);
      if (remainingRef.current === 0) {
        dismiss();
      } else {
        timer = setTimeout(tick, Math.min(100, remainingRef.current));
      }
    };

    stopTimerRef.current = stop;
    timer = setTimeout(tick, Math.min(100, remainingRef.current));
    return stop;
  }, [isPaused, duration, dismiss]);

  const togglePaused = () => {
    stopTimerRef.current();
    setTimeLeft(remainingRef.current);
    setIsPaused(!isPaused);
  };

  const isPermanent = duration === Infinity;
  const secondsRemaining = Math.max(0, Math.ceil(timeLeft / 1000));
  const progressPercent = duration > 0 && !isPermanent ? (timeLeft / duration) * 100 : 0;

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
                onClick={() => dismiss()}
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
                onClick={() => dismiss(onAction)}
                className="px-4 py-1.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-850 text-xs font-semibold text-foreground rounded-lg shadow-sm transition-all active:scale-[0.98] cursor-pointer"
              >
                {actionLabel}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Progress Bar & Countdown Hint Footer */}
      {isPermanent ? (
        <div className="w-full bg-neutral-50 dark:bg-card-alt px-4 py-2.5 border-t border-neutral-100 dark:border-border/40 text-[11px] text-muted-foreground">
          This message stays open until dismissed.
        </div>
      ) : (
        <button
          type="button"
          onClick={togglePaused}
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
      )}

      {/* Full Width Progress Bar at the very bottom */}
      {!isPermanent && (
        <div className="w-full h-[3px] bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
          <div
            className={`h-full transition-all duration-105 ${
              type === "success" ? "bg-emerald-500" : type === "error" ? "bg-red-500" : "bg-indigo-500"
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
    </div>
  );
}
