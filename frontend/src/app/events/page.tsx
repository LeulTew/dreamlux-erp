"use client";
import { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getEvents, getEventTypes } from "@/lib/api";
import { Event, EventsResponse, EventType } from "@/lib/types";
import AuthLayout from "@/components/AuthLayout";
import { HiCalendar, HiPlus, HiMagnifyingGlass, HiPencilSquare, HiArrowTopRightOnSquare } from "react-icons/hi2";
import Select from "@/components/ui/Select";
import EditEventSheet from "@/components/EditEventSheet";
import PaginationControls from "@/components/PaginationControls";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    Events: "Events",
    Planned: "Planned",
    Ongoing: "Ongoing",
    Completed: "Completed",
    "Total Records": "Total Records",
    "Add Event": "Add Event",
    Search: "Search...",
    "All Statuses": "All Statuses",
    "Select Status": "Select Status",
    "Event Title": "Event Title",
    "Client Name": "Client Name",
    "Client Phone": "Client Phone",
    "Date": "Date",
    "Venue": "Venue",
    "Price": "Price",
    "Status": "Status",
    "Actions": "Actions",
    "Logs": "Logs",
    "No events found": "No events found",
    "Managing event directory": "Managing event directory",
    "Loading Events...": "Loading Events..."
  },
  am: {
    Events: "ዝግጅቶች",
    Planned: "ቀጠሮ የተያዘ",
    Ongoing: "በሂደት ላይ",
    Completed: "የተጠናቀቀ",
    "Total Records": "ጠቅላላ መዝገቦች",
    "Add Event": "ዝግጅት መዝግብ",
    Search: "ፈልግ...",
    "All Statuses": "ሁሉንም ሁኔታዎች",
    "Select Status": "ሁኔታ ምረጥ",
    "Event Title": "የዝግጅቱ ርዕስ",
    "Client Name": "የደንበኛ ስም",
    "Client Phone": "የደንበኛ ስልክ",
    "Date": "ቀን",
    "Venue": "ቦታ",
    "Price": "ዋጋ",
    "Status": "ሁኔታ",
    "Actions": "ክንውኖች",
    "Logs": "ታሪክ",
    "No events found": "ምንም ዝግጅት አልተገኘም",
    "Managing event directory": "የዝግጅቶች መዝገብ መቆጣጠሪያ",
    "Loading Events...": "ዝግጅቶች በመጫን ላይ..."
  }
};

function useLanguage() {
  const [lang, setLang] = useState("en");
  useEffect(() => {
    const stored = localStorage.getItem("lang");
    if (stored) setLang(stored);

    const handleStorage = () => {
      const updated = localStorage.getItem("lang");
      if (updated) setLang(updated);
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);
  return lang;
}

function EventsPageContent() {
  const lang = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;

  const searchParams = useSearchParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const limit = 10;

  const { data, isLoading } = useQuery<EventsResponse>({
    queryKey: ["events", page, search, status],
    queryFn: () => getEvents(page, limit, search, status === "all" ? undefined : status),
  });

  const events = useMemo(() => data?.events || [], [data?.events]);
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  // Status badge style helper
  const getStatusBadgeClass = (statusStr: string) => {
    switch (statusStr) {
      case "Planned":
        return "bg-primary-light text-primary-dark border border-primary/20";
      case "Ongoing":
        return "bg-warning/10 text-warning border border-warning/20";
      case "Completed":
        return "bg-success/10 text-success border border-success/20";
      default:
        return "bg-card-alt text-muted border border-border";
    }
  };

  return (
    <AuthLayout>
      <div className="max-w-6xl mx-auto pt-4 md:py-8 px-4 sm:px-6 md:px-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 dark:bg-primary/20 rounded-lg text-primary border border-primary/20">
              <HiCalendar className="w-6 h-6 md:w-7 md:h-7" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-foreground tracking-tight">
                {t("Events")}
              </h1>
              <p className="text-xs md:text-sm text-muted font-medium">
                {total} {t("Total Records")}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] md:max-w-xs">
              <HiMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                type="text"
                placeholder={t("Search")}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-card-alt text-sm focus:ring-1 focus:ring-primary/30 outline-none border border-border/50 transition-all"
              />
            </div>

            <Select
              options={[
                { id: "all", label: t("All Statuses") },
                { id: "Planned", label: t("Planned") },
                { id: "Ongoing", label: t("Ongoing") },
                { id: "Completed", label: t("Completed") },
              ]}
              value={status}
              onChange={(val) => {
                setStatus(val);
                setPage(1);
              }}
              className="min-w-[140px] rounded-lg border-border"
            />

            <button
              onClick={() => setIsAddOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-black bg-primary text-on-primary hover:opacity-90 active:scale-[0.98] transition-all border border-primary/20"
            >
              <HiPlus className="w-4 h-4" />
              {t("Add Event")}
            </button>
          </div>
        </header>

        {isLoading ? (
          <div className="space-y-4 animate-pulse">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-card-alt rounded-lg border border-border" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-card rounded-lg border border-dashed border-border text-center px-4">
            <HiCalendar className="w-16 h-16 text-muted mb-4 opacity-10" />
            <h3 className="text-lg font-bold text-foreground opacity-50">
              {t("No events found")}
            </h3>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-hidden bg-card border border-border rounded-lg">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-card-alt/30 border-b border-border text-[10px] uppercase tracking-[0.2em] text-muted font-black">
                    <th className="px-6 py-4">#</th>
                    <th className="px-6 py-4">{t("Event Title")}</th>
                    <th className="px-6 py-4">{t("Client Name")}</th>
                    <th className="px-6 py-4">{t("Date")}</th>
                    <th className="px-6 py-4">{t("Venue")}</th>
                    <th className="px-6 py-4">{t("Price")}</th>
                    <th className="px-6 py-4">{t("Status")}</th>
                    <th className="px-6 py-4 text-right">{t("Actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event, index) => (
                    <tr
                      key={event.id}
                      className="border-b border-border/50 hover:bg-primary-light/5 transition-all text-sm"
                    >
                      <td className="px-6 py-4 text-xs font-mono text-muted">
                        {(page - 1) * limit + index + 1}
                      </td>
                      <td className="px-6 py-4 font-bold text-foreground">
                        {event.name}
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <div className="font-semibold">{event.client_name}</div>
                          {event.client_phone && (
                            <div className="text-xs text-muted font-mono">{event.client_phone}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-mono text-muted">
                        <div>{event.start_date.split("T")[0]}</div>
                        {event.start_date !== event.end_date && (
                          <div className="mt-0.5 text-[10px] text-muted opacity-70">
                            to {event.end_date.split("T")[0]}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs">{event.venue_location}</td>
                      <td className="px-6 py-4 font-bold text-foreground">
                        ETB {Number(event.contract_price).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2 py-1 rounded text-xs font-bold ${getStatusBadgeClass(
                            event.status
                          )}`}
                        >
                          {t(event.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setEditingEvent(event)}
                            className="p-1.5 rounded bg-card-alt border border-border text-muted hover:text-primary hover:border-primary/30 transition-all"
                            title="Edit Event"
                          >
                            <HiPencilSquare className="w-4 h-4" />
                          </button>
                          <Link
                            href={`/settings?tab=logs&eventId=${event.id}`}
                            className="p-1.5 rounded bg-card-alt border border-border text-muted hover:text-foreground hover:border-border transition-all flex items-center gap-1 text-xs font-black uppercase tracking-wider px-2.5"
                            title="View Change Logs"
                          >
                            <HiArrowTopRightOnSquare className="w-3.5 h-3.5" />
                            {t("Logs")}
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="md:hidden space-y-3">
              {events.map((event) => (
                <div
                  key={event.id}
                  onClick={() => setEditingEvent(event)}
                  className="p-4 bg-card border border-border rounded-lg space-y-3 active:scale-[0.98] transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-foreground text-base leading-snug">
                        {event.name}
                      </h4>
                      <p className="text-xs text-muted font-medium mt-0.5">
                        {event.client_name}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${getStatusBadgeClass(
                        event.status
                      )}`}
                    >
                      {t(event.status)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs border-t border-border/50 pt-2.5">
                    <div>
                      <span className="text-[10px] text-muted block uppercase tracking-wider font-bold">
                        {t("Date")}
                      </span>
                      <span className="font-mono text-muted-dark">
                        {event.start_date.split("T")[0]}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted block uppercase tracking-wider font-bold">
                        {t("Venue")}
                      </span>
                      <span className="text-muted-dark truncate block">
                        {event.venue_location}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-1">
                    <div>
                      <span className="text-[10px] text-muted block uppercase tracking-wider font-bold">
                        {t("Price")}
                      </span>
                      <span className="font-black text-foreground">
                        ETB {Number(event.contract_price).toLocaleString()}
                      </span>
                    </div>
                    <Link
                      href={`/settings?tab=logs&eventId=${event.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px] font-black uppercase tracking-wider bg-card-alt border border-border px-2.5 py-1 rounded text-muted hover:text-foreground flex items-center gap-1"
                    >
                      <HiArrowTopRightOnSquare className="w-3 h-3" />
                      {t("Logs")}
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            <PaginationControls
              page={page}
              totalPages={Math.max(1, totalPages)}
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      <AnimatePresence>
        {isAddOpen && (
          <EditEventSheet
            onClose={() => setIsAddOpen(false)}
            onSuccess={() => setPage(1)}
          />
        )}
        {editingEvent && (
          <EditEventSheet
            event={editingEvent}
            onClose={() => setEditingEvent(null)}
          />
        )}
      </AnimatePresence>
    </AuthLayout>
  );
}

export default function EventsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-muted-foreground animate-pulse text-[10px] font-black uppercase tracking-widest">
          {TRANSLATIONS.en["Loading Events..."]}
        </div>
      }
    >
      <EventsPageContent />
    </Suspense>
  );
}
