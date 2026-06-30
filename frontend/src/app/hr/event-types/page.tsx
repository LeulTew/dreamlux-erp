"use client";

import React, { useState, useMemo, useEffect } from "react";
import AuthLayout from "@/components/AuthLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getEventTypes, createEventType, updateEventType, deleteEventType } from "@/lib/api";
import { EventType } from "@/lib/types";
import toast from "@/lib/toast";
import Link from "next/link";
import { HiOutlineTrash, HiPlus, HiXMark, HiChevronLeft, HiChevronRight } from "react-icons/hi2";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import EventCard from "./EventCard";
import { packMasonry } from "@/lib/masonry-engine";
import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/useAuth";
import ForbiddenState from "@/components/ForbiddenState";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Event Payments": "Event Payments",
    "Professional Rate Engine": "Professional Rate Engine",
    "TRASH": "TRASH",
    "CANCEL": "CANCEL",
    "ADD EVENT": "ADD EVENT",
    "New Event Setup": "New Event Setup",
    "Event Name": "Event Name",
    "Description": "Description",
    "CREATE EVENT": "CREATE EVENT",
    "Computing Layout...": "Computing Layout...",
    "Nothing here yet. Add an event above.": "Nothing here yet. Add an event above.",
    "Move to Trash": "Move to Trash",
    "Are you sure you want to soft-delete this event type?": "Are you sure you want to soft-delete this event type? It will be moved to the trash and can be restored later.",
    "of": "of",
    "Showing": "Showing",
    "items": "items"
  },
  am: {
    "Event Payments": "የክስተት ክፍያዎች",
    "Professional Rate Engine": "የደረጃ ማስላት ሞተር",
    "TRASH": "ቆሻሻ መጣያ",
    "CANCEL": "ሰርዝ",
    "ADD EVENT": "አዲስ ክስተት",
    "New Event Setup": "አዲስ የክስተት መዋቅር",
    "Event Name": "የክስተት ስም",
    "Description": "መግለጫ",
    "CREATE EVENT": "ክስተት ፍጠር",
    "Computing Layout...": "አቀማመጥ በመስራት ላይ...",
    "Nothing here yet. Add an event above.": "እስካሁን ምንም ነገር የለም። ከላይ ክስተት ይጨምሩ።",
    "Move to Trash": "ወደ መጣያ ውሰድ",
    "Are you sure you want to soft-delete this event type?": "ይህንን የክስተት አይነት ወደ መጣያ ለመውሰድ እርግጠኛ ነዎት? በኋላ መልሰው ሊያገኟቸው ይችላሉ።",
    "of": "ከ",
    "Showing": "እየታየ ያለው",
    "items": "አይነቶች"
  }
};

export default function EventTypesPage() {
  const { hasPermission, isLoading: authLoading, isAuthenticated } = useAuth();
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  const [editingConfigs, setEditingConfigs] = useState<Record<string, { isEditing: boolean }>>({});

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const hasEventWriteAccess = hasPermission("events:write");
  const hasEventDeleteAccess = hasPermission("events:delete");

  const { data: events, isLoading } = useQuery<EventType[]>({
    queryKey: ["event-types"],
    queryFn: getEventTypes,
    enabled: isAuthenticated && hasEventWriteAccess
  });

  const [form, setForm] = useState({
    event_name: "",
    description: ""
  });

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 6;

  const totalPages = useMemo(() => {
    if (!events) return 1;
    return Math.ceil(events.length / ITEMS_PER_PAGE);
  }, [events]);
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedEvents = useMemo(() => {
    if (!events) return [];
    const start = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
    return events.slice(start, start + ITEMS_PER_PAGE);
  }, [events, safeCurrentPage]);

  const masonryParams = useMemo(() => {
    let columns = 3;
    if (viewportWidth < 640) columns = 1;
    else if (viewportWidth < 1024) columns = 2;

    const containerWidth = Math.min(viewportWidth - 64, 1152); // max-w-6xl - padding
    const gap = 32;
    const columnWidth = (containerWidth - (columns - 1) * gap) / columns;

    return { columns, columnWidth, gap };
  }, [viewportWidth]);

  const masonryResult = useMemo(() => {
    if (!paginatedEvents) return { items: [], containerHeight: 0 };
    // We pass empty overrides or adjust masonry engine to ignore levelsCount
    return packMasonry(paginatedEvents, masonryParams, editingConfigs);
  }, [paginatedEvents, masonryParams, editingConfigs]);

  const createMut = useMutation({
    mutationFn: (data: { event_name: string; description: string }) => createEventType(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-types"] });
      setForm({ event_name: "", description: "" });
      setShowAddForm(false);
      toast.success("Event type created");
    }
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string, data: Partial<EventType> }) => updateEventType(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-types"] });
      toast.success("Event type updated");
    }
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteEventType(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-types"] });
      setDeleteId(null);
      toast.success("Moved to Trash");
    }
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Duplicate check
    const isDuplicate = events?.some(ev => ev.event_name.toLowerCase() === form.event_name.toLowerCase());
    if (isDuplicate) {
      toast.error(`"${form.event_name}" already exists!`);
      return;
    }

    createMut.mutate({
      event_name: form.event_name,
      description: form.description
    });
  };

  const handleEditStateChange = React.useCallback((id: string, config: { isEditing: boolean }) => {
    setEditingConfigs(prev => {
      if (prev[id]?.isEditing === config.isEditing) {
        return prev;
      }
      return { ...prev, [id]: config };
    });
  }, []);

  const activeDeleteEvent = events?.find(e => e.id === deleteId);

  if (authLoading) {
    return (
      <AuthLayout>
        <div className="flex h-[50vh] items-center justify-center">
          <span className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      </AuthLayout>
    );
  }

  if (!isAuthenticated || !hasEventWriteAccess) {
    return (
      <AuthLayout>
        <ForbiddenState
          title="Forbidden: Insufficient privileges"
          description="Only Owners, Administrators, and Operations Managers can manage event types."
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="page-container pt-4 md:py-8 px-4 sm:px-6 md:px-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-12">
          <div>
            <h1 className="text-xl sm:text-3xl font-black uppercase tracking-tight text-foreground">{t("Event Payments")}</h1>
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-muted-foreground mt-1 pl-1">{t("Professional Rate Engine")}</p>
          </div>
          <div className="flex gap-3 sm:gap-4 w-full sm:w-auto">
            {hasEventDeleteAccess && (
              <Link
                href="/hr/event-types/trash"
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-danger/10 text-danger rounded-xl font-black text-[9px] sm:text-[10px] uppercase tracking-widest [@media(hover:hover)]:hover:bg-danger/20 transition-all shadow-sm border border-danger/20 active:scale-[0.98]"
              >
                <HiOutlineTrash className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> {t("TRASH")}
              </Link>
            )}
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-black text-[9px] sm:text-[10px] uppercase tracking-widest transition-all shadow-lg active:scale-95 ${
                showAddForm ? 'bg-muted text-foreground' : 'bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white shadow-md shadow-amber-500/10 [@media(hover:hover)]:hover:from-amber-600 [@media(hover:hover)]:hover:via-amber-700 [@media(hover:hover)]:hover:to-amber-800'
              }`}
            >
              {showAddForm ? (
                <><HiXMark className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">{t("CANCEL")}</span><span className="sm:hidden">X</span></>
              ) : (
                <><HiPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">{t("ADD EVENT")}</span><span className="sm:hidden">ADD</span></>
              )}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {showAddForm && (
            <motion.div
              initial={{ height: 0, opacity: 0, marginBottom: 0 }}
              animate={{ height: "auto", opacity: 1, marginBottom: 40 }}
              exit={{ height: 0, opacity: 0, marginBottom: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-card p-8 rounded-xl shadow-premium border border-border relative">
                <div className="relative z-10 mb-6">
                  <h2 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2">
                    <HiPlus className="w-5 h-5 text-primary/40" />
                    {t("New Event Setup")}
                  </h2>
                </div>

                <form onSubmit={handleCreateSubmit} className="relative z-10 flex flex-col gap-8">
                  <div className="flex gap-6 items-end flex-wrap">
                    <div className="flex-2 min-w-70">
                      <label className="block text-[10px] font-black uppercase text-muted-foreground mb-3 tracking-widest leading-none">{t("Event Name")}</label>
                      <input
                        type="text" required value={form.event_name}
                        onChange={e => setForm({...form, event_name: e.target.value})}
                        className="w-full px-5 py-3.5 bg-card-alt border border-border/80 rounded-2xl text-sm font-black uppercase placeholder:text-muted-foreground/30 outline-none focus:ring-4 focus:ring-primary/10 transition-all focus:border-primary/50 text-foreground"
                        placeholder="e.g. Wedding Setup"
                      />
                    </div>
                    <div className="flex-3 min-w-70">
                      <label className="block text-[10px] font-black uppercase text-muted-foreground mb-3 tracking-widest leading-none">{t("Description")}</label>
                      <input
                        type="text" value={form.description}
                        onChange={e => setForm({...form, description: e.target.value})}
                        className="w-full px-5 py-3.5 bg-card-alt border border-border/80 rounded-2xl text-sm font-medium placeholder:text-muted-foreground/30 outline-none focus:ring-4 focus:ring-primary/10 transition-all focus:border-primary/50 text-foreground"
                        placeholder="Optional description..."
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={createMut.isPending}
                      className="px-10 py-3.5 h-12 rounded-2xl bg-primary text-on-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary-dark shadow-lg shadow-primary/20 active:scale-95 disabled:opacity-50"
                    >
                      {t("CREATE EVENT")}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative min-h-100">
          {isLoading ? (
            <div className="p-20 text-center text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground animate-pulse">{t("Computing Layout...")}</div>
          ) : events?.length === 0 ? (
             <div className="p-20 text-center text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground bg-card rounded-xl border-2 border-border border-dashed shadow-inner">{t("Nothing here yet. Add an event above.")}</div>
          ) : (
            <div style={{ height: masonryResult.containerHeight, position: "relative" }}>
              <AnimatePresence mode="popLayout">
                {masonryResult.items.map(({ id, x, y, height, event }) => (
                  <motion.div
                    key={id}
                    layout
                    initial={{ opacity: 0, scale: 0.9, y: y + 20 }}
                    animate={{ opacity: 1, scale: 1, x, y }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    style={{
                      position: "absolute",
                      width: masonryParams.columnWidth,
                      height
                    }}
                  >
                    <EventCard
                      event={event}
                      onUpdate={(id, data) => updateMut.mutateAsync({ id, data })}
                      onDelete={hasEventDeleteAccess ? (id) => setDeleteId(id) : undefined}
                      onDuplicate={(evt) => {
                        setForm({
                          event_name: evt.event_name + " (Copy)",
                          description: evt.description || ""
                        });
                        setShowAddForm(true);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                        toast.success(lang === "am" ? "የተገለበጠ መረጃ ተሞልቷል፤ ለመመዝገብ ክስተት ፍጠር የሚለውን ይጫኑ" : "Prefilled duplicate; click Create Event to save");
                      }}
                      isUpdating={updateMut.isPending}
                      isEditing={editingConfigs[event.id]?.isEditing || false}
                      onEditStateChange={(config) => handleEditStateChange(event.id, config)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-8 border-t border-border/50 pt-6">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
              {t("Showing")} {Math.min((safeCurrentPage - 1) * ITEMS_PER_PAGE + 1, events?.length || 0)} - {Math.min(safeCurrentPage * ITEMS_PER_PAGE, events?.length || 0)} {t("of")} {events?.length} {t("items")}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safeCurrentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                className="w-10 h-10 rounded-xl bg-card border border-border text-muted hover:text-foreground transition-all hover:bg-card-alt flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none active:scale-[0.98] shadow-sm cursor-pointer"
              >
                <HiChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }).map((_, idx) => {
                  const pageNum = idx + 1;
                  const isSelected = pageNum === safeCurrentPage;
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-10 h-10 rounded-xl text-xs font-black transition-all active:scale-[0.98] cursor-pointer ${
                        isSelected
                          ? "bg-primary text-on-primary shadow-premium"
                          : "bg-card border border-border text-muted hover:text-foreground hover:bg-card-alt"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                disabled={safeCurrentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                className="w-10 h-10 rounded-xl bg-card border border-border text-muted hover:text-foreground transition-all hover:bg-card-alt flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none active:scale-[0.98] shadow-sm cursor-pointer"
              >
                <HiChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

      </div>

      <DeleteConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title={t("Move to Trash")}
        message={t("Are you sure you want to soft-delete this event type?")}
        itemName={activeDeleteEvent?.event_name ?? ""}
        isDeleting={deleteMut.isPending}
      />
    </AuthLayout>
  );
}
