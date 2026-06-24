"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { HiCalendarDays, HiChevronLeft, HiChevronRight } from "react-icons/hi2";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  value?: string; // YYYY-MM-DD format
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function DatePicker({
  value = "",
  onChange,
  placeholder = "Select date",
  className,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse initial date or fallback to today
  const getParsedDate = (dateStr: string) => {
    if (!dateStr) return null;
    const parts = dateStr.split("-");
    if (parts.length !== 3) return null;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    return new Date(year, month, day);
  };

  const parsedDate = getParsedDate(value);
  const [viewDate, setViewDate] = useState(() => parsedDate || new Date());

  // Keep viewDate updated when value changes externally
  useEffect(() => {
    if (parsedDate) {
      setViewDate(parsedDate);
    }
  }, [value]);

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

  // Total grid items = 42 (6 rows of 7 days) to prevent height jumps
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

  const selectDate = (day: number, monthOffset = 0) => {
    const targetMonth = month + monthOffset;
    const selectedDate = new Date(year, targetMonth, day);
    
    // Format as YYYY-MM-DD
    const yyyy = selectedDate.getFullYear();
    const mm = String(selectedDate.getMonth() + 1).padStart(2, "0");
    const dd = String(selectedDate.getDate()).padStart(2, "0");
    const formatted = `${yyyy}-${mm}-${dd}`;
    
    onChange(formatted);
    setIsOpen(false);
  };

  // Format date for the input trigger: MM/DD/YYYY
  const displayValue = parsedDate
    ? `${String(parsedDate.getMonth() + 1).padStart(2, "0")}/${String(
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

  return (
    <div ref={containerRef} className={cn("relative inline-block", className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between h-[44px] px-3.5 rounded-xl border border-border bg-card-alt text-foreground text-xs font-semibold tracking-wide transition-all duration-200 outline-none hover:bg-border/30 focus:border-primary/50 focus:ring-2 focus:ring-primary/10 select-none text-left cursor-pointer"
      >
        <span className={cn(!displayValue && "text-muted-foreground/60")}>
          {displayValue || placeholder}
        </span>
        <HiCalendarDays className="w-4 h-4 text-muted-foreground/75" />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 p-4 w-[280px] bg-card border border-border rounded-xl shadow-massive z-50 animate-in fade-in slide-in-from-top-1 duration-150">
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
                      ? "bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white shadow-md shadow-amber-500/10 scale-105"
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
        </div>
      )}
    </div>
  );
}
