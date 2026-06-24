"use client";
import React, { useState } from "react";
import toast, { Toast } from "react-hot-toast";
import { HiCheckCircle, HiXCircle, HiXMark, HiChevronDown, HiInformationCircle } from "react-icons/hi2";

interface PremiumToastProps {
  t: Toast;
  title: string;
  description?: string;
  type: "success" | "error" | "info";
}

export function PremiumToast({ t, title, description, type }: PremiumToastProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isPaused, setIsPaused] = useState(false);

  return (
    <div
      className={`max-w-md w-full bg-card/95 backdrop-blur-md border border-border/80 shadow-premium rounded-2xl overflow-hidden pointer-events-auto flex flex-col transition-all duration-300 ease-out transform ${
        t.visible ? "animate-in fade-in slide-in-from-top-4" : "animate-out fade-out slide-out-to-top-4"
      }`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="p-4 flex gap-3 items-start">
        {/* Status Icon */}
        <div className="shrink-0 pt-0.5">
          {type === "success" ? (
            <HiCheckCircle className="w-6 h-6 text-emerald-500" />
          ) : type === "error" ? (
            <HiXCircle className="w-6 h-6 text-red-500" />
          ) : (
            <HiInformationCircle className="w-6 h-6 text-indigo-500" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-black text-foreground leading-tight">{title}</h4>
            <div className="flex items-center gap-1.5 shrink-0">
              {description && (
                <button
                  type="button"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-1 rounded-lg text-muted hover:text-foreground hover:bg-card-alt transition-all"
                >
                  <HiChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                </button>
              )}
              <button
                type="button"
                onClick={() => toast.dismiss(t.id)}
                className="p-1 rounded-lg text-muted hover:text-foreground hover:bg-card-alt transition-all"
              >
                <HiXMark className="w-4 h-4" />
              </button>
            </div>
          </div>

          {description && isExpanded && (
            <p className="text-xs font-semibold text-muted-foreground/90 leading-relaxed transition-all pt-0.5">
              {description}
            </p>
          )}
        </div>
      </div>

      {/* Progress Bar & Countdown Hint */}
      <div className="bg-card-alt px-4 py-1.5 border-t border-border/40 flex justify-between items-center text-[10px] font-bold text-muted-foreground select-none">
        <span>
          {isPaused ? "Paused" : "This message will close soon..."}
        </span>
        <div className="relative w-24 h-1 bg-border rounded-full overflow-hidden shrink-0">
          <div
            className={`absolute left-0 top-0 h-full rounded-full transition-all duration-100 ${
              type === "success" ? "bg-emerald-500" : type === "error" ? "bg-red-500" : "bg-indigo-500"
            }`}
            style={{
              width: "100%",
              animation: `shrink-progress ${t.duration || 4000}ms linear forwards`,
              animationPlayState: isPaused ? "paused" : "running",
            }}
          />
        </div>
      </div>
    </div>
  );
}
