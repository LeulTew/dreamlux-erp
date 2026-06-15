"use client";

import React, { useState, useMemo, useEffect } from "react";
import AuthLayout from "@/components/AuthLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getEventTypes, createEventType, updateEventType, deleteEventType } from "@/lib/api";
import { EventType } from "@/lib/types";
import toast from "react-hot-toast";
import Link from "next/link";
import { HiOutlineTrash, HiPlus, HiXMark } from "react-icons/hi2";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import EventCard from "./EventCard";
import { packMasonry } from "@/lib/masonry-engine";
import { motion, AnimatePresence } from "framer-motion";

export default function EventTypesPage() {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  const [editingConfigs, setEditingConfigs] = useState<Record<string, { isEditing: boolean }>>({});

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const { data: events, isLoading } = useQuery<EventType[]>({
    queryKey: ["event-types"],
    queryFn: getEventTypes
  });

  const [form, setForm] = useState({ 
    event_name: "", 
    description: ""
  });
  
  const [deleteId, setDeleteId] = useState<string | null>(null);

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
    if (!events) return { items: [], containerHeight: 0 };
    // We pass empty overrides or adjust masonry engine to ignore levelsCount
    return packMasonry(events, masonryParams, editingConfigs);
  }, [events, masonryParams, editingConfigs]);

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

  return (
    <AuthLayout>
      <div className="page-container pt-4 md:py-8 px-4 sm:px-6 md:px-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-12">
          <div>
            <h1 className="text-xl sm:text-3xl font-black uppercase tracking-tight text-foreground">Event Payments</h1>
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-muted-foreground mt-1 pl-1">Professional Rate Engine</p>
          </div>
          <div className="flex gap-3 sm:gap-4 w-full sm:w-auto">
            <Link 
              href="/hr/event-types/trash" 
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-danger/10 text-danger rounded-2xl font-black text-[9px] sm:text-[10px] uppercase tracking-widest hover:bg-danger/20 transition-all shadow-sm border border-danger/20"
            >
              <HiOutlineTrash className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> TRASH
            </Link>
            <button 
              onClick={() => setShowAddForm(!showAddForm)}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-2xl font-black text-[9px] sm:text-[10px] uppercase tracking-widest transition-all shadow-lg active:scale-95 ${
                showAddForm ? 'bg-muted text-foreground' : 'bg-primary text-on-primary hover:bg-primary-dark shadow-primary/20'
              }`}
            >
              {showAddForm ? (
                <><HiXMark className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">CANCEL</span><span className="sm:hidden">X</span></>
              ) : (
                <><HiPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">ADD EVENT</span><span className="sm:hidden">ADD</span></>
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
                    New Event Setup
                  </h2>
                </div>

                <form onSubmit={handleCreateSubmit} className="relative z-10 flex flex-col gap-8">
                  <div className="flex gap-6 items-end flex-wrap">
                    <div className="flex-2 min-w-70">
                      <label className="block text-[10px] font-black uppercase text-muted-foreground mb-3 tracking-widest leading-none">Event Name</label>
                      <input 
                        type="text" required value={form.event_name} 
                        onChange={e => setForm({...form, event_name: e.target.value})} 
                        className="w-full px-5 py-3.5 bg-card-alt border border-border/80 rounded-2xl text-sm font-black uppercase placeholder:text-muted-foreground/30 outline-none focus:ring-4 focus:ring-primary/10 transition-all focus:border-primary/50 text-foreground" 
                        placeholder="e.g. Wedding Setup" 
                      />
                    </div>
                    <div className="flex-3 min-w-70">
                      <label className="block text-[10px] font-black uppercase text-muted-foreground mb-3 tracking-widest leading-none">Description</label>
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
                      CREATE EVENT
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative min-h-100">
          {isLoading ? (
            <div className="p-20 text-center text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground animate-pulse">Computing Layout...</div>
          ) : events?.length === 0 ? (
             <div className="p-20 text-center text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground bg-card rounded-xl border-2 border-border border-dashed shadow-inner">Nothing here yet. Add an event above.</div>
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
                      onDelete={(id) => setDeleteId(id)}
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

      </div>

      <DeleteConfirmModal 
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title="Move to Trash"
        message="Are you sure you want to soft-delete this event type? It will be moved to the trash and can be restored later."
        itemName={activeDeleteEvent?.event_name ?? ""}
        isDeleting={deleteMut.isPending}
      />
    </AuthLayout>
  );
}
