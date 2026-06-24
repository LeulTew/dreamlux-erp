"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { HiCalendarDays, HiChevronLeft, HiChevronRight, HiCheck, HiXMark } from "react-icons/hi2";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  value?: string; // YYYY-MM-DD or YYYY-MM-DDTHH:mm format
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  showTime?: boolean;
}

export default function DatePicker({
  value = "",
  onChange,
  placeholder = "Select date",
  className,
  showTime = false,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hourScrollRef = useRef<HTMLDivElement>(null);
  const minuteScrollRef = useRef<HTMLDivElement>(null);

  // Parse initial date or fallback to today
  const getParsedDate = (dateStr: string) => {
    if (!dateStr) return null;
    const isDateTime = dateStr.includes("T");
    const [datePart, timePart] = isDateTime ? dateStr.split("T") : [dateStr, ""];
    const parts = datePart.split("-");
    if (parts.length !== 3) return null;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    
    let hours = 0;
    let minutes = 0;
    if (timePart) {
      const timeParts = timePart.split(":");
      if (timeParts.length >= 2) {
        hours = parseInt(timeParts[0], 10);
        minutes = parseInt(timeParts[1], 10);
      }
    }
    return new Date(year, month, day, hours, minutes);
  };

  const parsedDate = getParsedDate(value);
  const [viewDate, setViewDate] = useState(() => parsedDate || new Date());
  
  // 12-hour format states
  const getInitial12HourState = (): { hour12: number; minute: number; ampm: "AM" | "PM" } => {
    if (!parsedDate) return { hour12: 12, minute: 0, ampm: "AM" };
    const rawHour = parsedDate.getHours();
    const ampm: "AM" | "PM" = rawHour >= 12 ? "PM" : "AM";
    const hour12 = rawHour % 12 === 0 ? 12 : rawHour % 12;
    return { hour12, minute: parsedDate.getMinutes(), ampm };
  };

  const [timeState, setTimeState] = useState(getInitial12HourState);

  // Synchronize viewDate and time selection when value changes externally (done during render to avoid useEffect warnings)
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (parsedDate) {
      setViewDate(parsedDate);
      const rawHour = parsedDate.getHours();
      const ampm: "AM" | "PM" = rawHour >= 12 ? "PM" : "AM";
      const hour12 = rawHour % 12 === 0 ? 12 : rawHour % 12;
      setTimeState({ hour12, minute: parsedDate.getMinutes(), ampm });
    }
  }

  // Scroll active elements into view when calendar opens
  useEffect(() => {
    if (isOpen && showTime) {
      setTimeout(() => {
        if (hourScrollRef.current) {
          const activeHour = hourScrollRef.current.querySelector("[data-active='true']");
          if (activeHour) activeHour.scrollIntoView({ block: "center", behavior: "auto" });
        }
        if (minuteScrollRef.current) {
          const activeMinute = minuteScrollRef.current.querySelector("[data-active='true']");
          if (activeMinute) activeMinute.scrollIntoView({ block: "center", behavior: "auto" });
        }
      }, 50);
    }
  }, [isOpen, showTime]);

  // Click outside listener to close calendar
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // Calendar calculations
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const prevMonthDays = [];
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    prevMonthDays.push(daysInPrevMonth - i);
  }

  const currentMonthDays = [];
  for (let i = 1; i <= daysInMonth; i++) {
    currentMonthDays.push(i);
  }

  // Total grid items = 42
  const totalDaysSoFar = prevMonthDays.length + currentMonthDays.length;
  const nextMonthDays = [];
  const remainingCells = 42 - totalDaysSoFar;
  for (let i = 1; i <= remainingCells; i++) {
    nextMonthDays.push(i);
  }

  const monthsList = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const handlePrevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  // Convert 12h representation back to 24h hour
  const get24Hour = (h12: number, ampm: "AM" | "PM") => {
    if (ampm === "PM") {
      return h12 === 12 ? 12 : h12 + 12;
    }
    return h12 === 12 ? 0 : h12;
  };

  // Helper to construct formatted value string
  const getFormattedValue = (dateObj: Date, h12: number, m: number, ampm: "AM" | "PM") => {
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
    const dd = String(dateObj.getDate()).padStart(2, "0");
    
    if (showTime) {
      const h24 = get24Hour(h12, ampm);
      const hh = String(h24).padStart(2, "0");
      const min = String(m).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
    }
    return `${yyyy}-${mm}-${dd}`;
  };

  const selectDate = (day: number, monthOffset = 0) => {
    const targetMonth = month + monthOffset;
    const selectedDate = new Date(year, targetMonth, day);
    setViewDate(selectedDate);
    
    const formatted = getFormattedValue(selectedDate, timeState.hour12, timeState.minute, timeState.ampm);
    onChange(formatted);

    // If time is not shown, we close immediately on date select
    if (!showTime) {
      setIsOpen(false);
    }
  };

  const handleTimeSelect = (type: "hour" | "minute" | "ampm", val: number | "AM" | "PM") => {
    const nextState = { ...timeState };
    if (type === "hour") nextState.hour12 = val;
    if (type === "minute") nextState.minute = val;
    if (type === "ampm") nextState.ampm = val;
    
    setTimeState(nextState);
    
    const baseDate = parsedDate || new Date();
    const formatted = getFormattedValue(baseDate, nextState.hour12, nextState.minute, nextState.ampm);
    onChange(formatted);
  };

  // Format display string
  const formatTime = (date: Date) => {
    let h = date.getHours();
    const m = String(date.getMinutes()).padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12;
    h = h ? h : 12; // '0' becomes '12'
    return `${String(h).padStart(2, "0")}:${m} ${ampm}`;
  };

  const displayValue = parsedDate
    ? showTime
      ? `${String(parsedDate.getMonth() + 1).padStart(2, "0")}/${String(
          parsedDate.getDate()
        ).padStart(2, "0")}/${parsedDate.getFullYear()} ${formatTime(parsedDate)}`
      : `${String(parsedDate.getMonth() + 1).padStart(2, "0")}/${String(
          parsedDate.getDate()
        ).padStart(2, "0")}/${parsedDate.getFullYear()}`
    : "";

  const isToday = (day: number, monthOffset = 0) => {
    const today = new Date();
    const targetMonth = month + monthOffset;
    const testDate = new Date(year, targetMonth, day);
    return (
      testDate.getDate() === today.getDate() &&
      testDate.getMonth() === today.getMonth() &&
      testDate.getFullYear() === today.getFullYear()
    );
  };

  const isSelected = (day: number, monthOffset = 0) => {
    if (!parsedDate) return false;
    const targetMonth = month + monthOffset;
    const testDate = new Date(year, targetMonth, day);
    return (
      testDate.getDate() === parsedDate.getDate() &&
      testDate.getMonth() === parsedDate.getMonth() &&
      testDate.getFullYear() === parsedDate.getFullYear()
    );
  };

  // 12-hour lists
  const hoursList = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const minutesList = Array.from({ length: 60 }, (_, i) => i);

  return (
    <div ref={containerRef} className={cn("relative inline-block w-full", className)}>
      <style>{`
        .datepicker-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: rgba(217, 119, 6, 0.35) transparent !important;
        }
        .datepicker-scrollbar::-webkit-scrollbar {
          width: 3px !important;
        }
        .datepicker-scrollbar::-webkit-scrollbar-track {
          background: transparent !important;
        }
        .datepicker-scrollbar::-webkit-scrollbar-thumb {
          background-color: rgba(217, 119, 6, 0.35) !important;
          border-radius: 9999px !important;
        }
      `}</style>
      <div className="relative w-full">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "w-full flex items-center justify-between h-[44px] pl-3.5 pr-10 rounded-xl border border-border bg-card-alt text-foreground text-xs font-semibold tracking-wide transition-all duration-200 outline-none hover:bg-border/30 focus:border-primary/50 focus:ring-2 focus:ring-primary/10 select-none text-left cursor-pointer",
            displayValue ? "pr-14" : "pr-10"
          )}
        >
          <span className={cn(!displayValue && "text-muted-foreground/60")}>
            {displayValue || placeholder}
          </span>
        </button>
        
        {/* Remove/Clear Button */}
        {value && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            className="absolute right-9 top-1/2 -translate-y-1/2 p-1 text-muted-foreground/40 hover:text-foreground/80 rounded-full hover:bg-border/60 transition-all cursor-pointer z-10"
            title="Clear date"
          >
            <HiXMark className="w-3.5 h-3.5" />
          </button>
        )}
        
        <HiCalendarDays className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/75 pointer-events-none" />
      </div>

      {isOpen && (
        <div
          className={cn(
            "absolute left-0 mt-2 bg-card border border-border rounded-xl shadow-massive z-50 animate-in fade-in slide-in-from-top-1 duration-150 flex flex-row divide-x divide-border/60 overflow-hidden",
            showTime ? "w-[440px]" : "w-[280px]"
          )}
        >
          {/* Calendar Panel */}
          <div className="p-4 w-[280px] shrink-0">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1.5 rounded-lg border border-border hover:bg-card-alt text-foreground/80 hover:text-foreground transition-all cursor-pointer"
              >
                <HiChevronLeft className="w-4 h-4" />
              </button>
              <div className="text-xs font-black uppercase tracking-wider text-foreground select-none">
                {monthsList[month]} {year}
              </div>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1.5 rounded-lg border border-border hover:bg-card-alt text-foreground/80 hover:text-foreground transition-all cursor-pointer"
              >
                <HiChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black text-muted-foreground/65 uppercase tracking-wider mb-2 select-none">
              <span>Su</span>
              <span>Mo</span>
              <span>Tu</span>
              <span>We</span>
              <span>Th</span>
              <span>Fr</span>
              <span>Sa</span>
            </div>

            {/* Day Grid */}
            <div className="grid grid-cols-7 gap-1">
              {/* Prev month days */}
              {prevMonthDays.map((day) => (
                <button
                  key={`prev-${day}`}
                  type="button"
                  onClick={() => selectDate(day, -1)}
                  className="w-8 h-8 rounded-lg text-xs font-medium text-muted-foreground/30 hover:bg-card-alt hover:text-foreground/50 transition-all cursor-pointer"
                >
                  {day}
                </button>
              ))}

              {/* Current month days */}
              {currentMonthDays.map((day) => {
                const active = isSelected(day);
                const today = isToday(day);
                return (
                  <button
                    key={`curr-${day}`}
                    type="button"
                    onClick={() => selectDate(day)}
                    className={cn(
                      "w-8 h-8 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center relative",
                      active
                        ? "bg-amber-600 text-white hover:bg-amber-700 shadow-sm"
                        : today
                        ? "border border-primary text-primary hover:bg-primary/5"
                        : "text-foreground hover:bg-card-alt"
                    )}
                  >
                    {day}
                    {today && !active && (
                      <span className="absolute bottom-1 w-1 h-1 rounded-full bg-primary" />
                    )}
                  </button>
                );
              })}

              {/* Next month days */}
              {nextMonthDays.map((day) => (
                <button
                  key={`next-${day}`}
                  type="button"
                  onClick={() => selectDate(day, 1)}
                  className="w-8 h-8 rounded-lg text-xs font-medium text-muted-foreground/30 hover:bg-card-alt hover:text-foreground/50 transition-all cursor-pointer"
                >
                  {day}
                </button>
              ))}
            </div>
            {/* Action Buttons: Today / Reset */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/40 select-none">
              <button
                type="button"
                onClick={() => {
                  const today = new Date();
                  setViewDate(today);
                  const formatted = getFormattedValue(today, timeState.hour12, timeState.minute, timeState.ampm);
                  onChange(formatted);
                  if (!showTime) {
                    setIsOpen(false);
                  }
                }}
                className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-500 hover:text-amber-700 dark:hover:text-amber-400 transition-colors cursor-pointer"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setIsOpen(false);
                }}
                className="text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-500 hover:text-rose-700 dark:hover:text-rose-400 transition-colors cursor-pointer"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Time Picker Panel (Side-by-Side) */}
          {showTime && (
            <div className="w-[160px] p-4 flex flex-col justify-between bg-card-alt/30 select-none">
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/80 mb-3 text-center border-b border-border pb-1.5">
                Time Picker
              </div>
              
              <div className="flex gap-1 h-[145px] overflow-hidden justify-center items-center">
                {/* Hours column (thin scrollbar) */}
                <div 
                  ref={hourScrollRef} 
                  className="h-full overflow-y-auto flex flex-col gap-1 w-10 text-center datepicker-scrollbar"
                >
                  {hoursList.map((h) => {
                    const isSel = timeState.hour12 === h;
                    return (
                      <button
                        key={h}
                        type="button"
                        data-active={isSel}
                        onClick={() => handleTimeSelect("hour", h)}
                        className={cn(
                          "py-1.5 text-xs font-bold rounded-lg transition-all shrink-0 cursor-pointer block w-full",
                          isSel
                            ? "bg-amber-600 text-white shadow-sm"
                            : "text-muted-foreground hover:bg-card-alt hover:text-foreground"
                        )}
                      >
                        {String(h).padStart(2, "0")}
                      </button>
                    );
                  })}
                </div>

                <span className="text-foreground font-black pb-1 shrink-0">:</span>

                {/* Minutes column (thin scrollbar) */}
                <div 
                  ref={minuteScrollRef} 
                  className="h-full overflow-y-auto flex flex-col gap-1 w-10 text-center datepicker-scrollbar"
                >
                  {minutesList.map((m) => {
                    const isSel = timeState.minute === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        data-active={isSel}
                        onClick={() => handleTimeSelect("minute", m)}
                        className={cn(
                          "py-1.5 text-xs font-bold rounded-lg transition-all shrink-0 cursor-pointer block w-full",
                          isSel
                            ? "bg-amber-600 text-white shadow-sm"
                            : "text-muted-foreground hover:bg-card-alt hover:text-foreground"
                        )}
                      >
                        {String(m).padStart(2, "0")}
                      </button>
                    );
                  })}
                </div>

                {/* AM/PM Column */}
                <div className="flex flex-col gap-1 w-10 text-center justify-center shrink-0">
                  {(["AM", "PM"] as const).map((ap) => {
                    const isSel = timeState.ampm === ap;
                    return (
                      <button
                        key={ap}
                        type="button"
                        onClick={() => handleTimeSelect("ampm", ap)}
                        className={cn(
                          "py-2 text-xs font-black rounded-lg transition-all cursor-pointer block w-full",
                          isSel
                            ? "bg-amber-600 text-white shadow-sm"
                            : "text-muted-foreground hover:bg-card-alt hover:text-foreground"
                        )}
                      >
                        {ap}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Done button (Toned down soft styling) */}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-full h-8 mt-3 rounded-lg text-xs font-semibold uppercase tracking-wider bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/20 hover:border-amber-500/35 active:scale-[0.97] transition-all duration-200 flex items-center justify-center gap-1 cursor-pointer"
              >
                <HiCheck className="w-3.5 h-3.5 animate-pulse" />
                Done
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
