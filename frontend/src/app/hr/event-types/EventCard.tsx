"use client";

import React from "react";
import { EventType } from "@/lib/types";
import { HiOutlineTrash, HiPencilSquare, HiCheck, HiXMark } from "react-icons/hi2";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";

interface EventCardProps {
  event: EventType;
  onUpdate: (id: string, data: Partial<EventType>) => Promise<void>;
  onDelete: (id: string) => void;
  isUpdating: boolean;
  isEditing: boolean;
  onEditStateChange: (config: { isEditing: boolean }) => void;
}

export default function EventCard({ 
  event, 
  onUpdate, 
  onDelete,
  isUpdating,
  isEditing,
  onEditStateChange 
}: EventCardProps) {
  const [editForm, setEditForm] = React.useState({
    event_name: event.event_name,
    description: event.description || ""
  });

  const handleSave = async () => {
    try {
      await onUpdate(event.id, {
        event_name: editForm.event_name,
        description: editForm.description || ""
      });
      onEditStateChange({ isEditing: false });
    } catch {
      toast.error("Failed to update event");
    }
  };

  const handleCancel = () => {
    setEditForm({
      event_name: event.event_name,
      description: event.description || ""
    });
    onEditStateChange({ isEditing: false });
  };

  return (
    <motion.div 
      layout
      className="bg-card rounded-[2.5rem] border border-border/60 flex flex-col shadow-premium relative group overflow-hidden transition-all duration-500 hover:shadow-2xl hover:border-primary/30 h-full"
    >
      {/* Visual Flair */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-[4rem] z-0 pointer-events-none group-hover:bg-primary/10 transition-colors" />
      
      <div className="p-8 relative z-10 flex flex-col h-full">
        <AnimatePresence mode="wait">
          {!isEditing ? (
            <motion.div 
              key="view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col h-full"
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <h3 className="text-xl font-black tracking-tight uppercase leading-tight text-foreground line-clamp-2">
                  {event.event_name}
                </h3>
              </div>
              
              {event.description && (
                <div className="mt-2 text-xs font-medium text-muted-foreground leading-relaxed flex-1">
                  {event.description}
                </div>
              )}

              <div className="mt-auto pt-6 border-t border-border/40 flex justify-between items-center">
                <div className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">
                  Metadata
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => onEditStateChange({ isEditing: true })} 
                    aria-label="Edit"
                    className="p-3 bg-primary/10 rounded-xl text-primary hover:bg-primary hover:text-background transition-all active:scale-90"
                  >
                    <HiPencilSquare className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => onDelete(event.id)} 
                    aria-label="Delete"
                    className="p-3 bg-danger/10 rounded-xl text-danger hover:bg-danger hover:text-white transition-all active:scale-90"
                  >
                    <HiOutlineTrash className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="edit"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col gap-4"
            >
              <div>
                <label className="block text-[10px] font-black uppercase text-muted-foreground mb-2 tracking-widest leading-none">Event Name</label>
                <input 
                  type="text" 
                  value={editForm.event_name}
                  onChange={e => setEditForm({ ...editForm, event_name: e.target.value })}
                  className="w-full px-4 py-2 bg-card-alt border border-border/80 rounded-xl text-xs font-black uppercase outline-none focus:border-primary/50 text-foreground"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-muted-foreground mb-2 tracking-widest leading-none">Description</label>
                <textarea 
                  value={editForm.description}
                  onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full px-4 py-2 bg-card-alt border border-border/80 rounded-xl text-xs font-medium outline-none focus:border-primary/50 text-foreground resize-none"
                  rows={4}
                  placeholder="Optional description..."
                />
              </div>

              <div className="flex gap-2 mt-4">
                <button 
                  onClick={handleSave}
                  disabled={isUpdating}
                  className="flex-1 py-3 bg-primary text-on-primary rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-dark transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <HiCheck className="w-4 h-4" /> SAVE
                </button>
                <button 
                  onClick={handleCancel}
                  className="p-3 bg-muted/10 text-foreground rounded-2xl hover:bg-muted/20 transition-all"
                >
                  <HiXMark className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
