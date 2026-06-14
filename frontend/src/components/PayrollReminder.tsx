"use client";

import { useEffect } from "react";
import { format } from "date-fns";
import { isPayrollDay } from "@/utils/payroll-formatting";

export default function PayrollReminder() {
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    const checkAndNotify = () => {
      const now = new Date();
      if (isPayrollDay(now)) {
        const day = now.getDate();
        const lastNotified = localStorage.getItem("payroll_notified_date");
        const todayStr = format(now, "yyyy-MM-dd");

        if (lastNotified !== todayStr) {
          if (Notification.permission === "granted") {
            const n = new Notification("Payroll Reminder", {
              body: `Today is ${day === 1 ? "the 1st" : day === 15 ? "the 15th" : "the last day"} of the month. Don't forget to run or finalize the payroll!`,
              icon: "/favicon.ico",
            });
            n.onclick = () => {
              window.focus();
              const type = day === 15 ? "h1" : "h2";
              window.location.href = `/hr/payments/run?period_type=${type}`;
            };
            localStorage.setItem("payroll_notified_date", todayStr);
          } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then((permission) => {
              if (permission === "granted") {
                new Notification("Payroll Reminder", {
                  body: "Reminders enabled! We'll notify you on payroll days (1st, 15th, and 30th).",
                });
                localStorage.setItem("payroll_notified_date", todayStr);
              }
            });
          }
        }
      }
    };

    // Check on mount and then every hour
    checkAndNotify();
    const interval = setInterval(checkAndNotify, 3600000);

    return () => clearInterval(interval);
  }, []);

  return null;
}
