"use client";
import { useState } from "react";
import { AxiosError } from "axios";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";

import { createEvent, updateEvent, deleteEvent, getEventTypes } from "@/lib/api";
import { Event, EventType } from "@/lib/types";
import toast from "react-hot-toast";
import { HiExclamationCircle, HiTrash, HiCurrencyDollar, HiMapPin, HiUser } from "react-icons/hi2";
import Select from "./ui/Select";
import DeleteConfirmModal from "./DeleteConfirmModal";
import ResponsiveDrawer from "./ui/ResponsiveDrawer";
import { useAuth } from "@/hooks/useAuth";
import { z } from "zod";
import { useLanguage } from "@/hooks/use-language";
import { Button } from "./ui/button";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Edit Event": "Edit Event",
    "Create Event": "Create Event",
    "Save Changes": "Save Changes",
    "Delete Event": "Delete Event",
    "Managing event details": "Managing event details",
    "Register a new event schedule": "Register a new event schedule",
    "Required": "Required",
  },
  am: {
    "Edit Event": "ዝግጅት ማስተካከያ",
    "Create Event": "አዲስ ዝግጅት ፍጠር",
    "Save Changes": "ለውጦችን አስቀምጥ",
    "Delete Event": "ዝግጅቱን ሰርዝ",
    "Managing event details": "የዝግጅት ዝርዝሮችን ማስተዳደር",
    "Register a new event schedule": "አዲስ የዝግጅት መርሃግብር ይመዝግቡ",
    "Required": "አስፈላጊ",
  }
};

const eventValidationSchema = z.object({
  name: z.string().min(1, "Event name is required"),
  client_name: z.string().min(1, "Client name is required"),
  client_phone: z.string().optional().refine((val) => {
    if (!val) return true;
    const ethioRegex = /^(?:\+251|0)[79]\d{8}$/;
    return ethioRegex.test(val.replace(/\s+/g, ""));
  }, "Invalid Ethiopian phone number. Use +251... or 09.../07...").or(z.literal("")),
  start_date: z.string().min(1, "Start date is required"),
  end_date: z.string().min(1, "End date is required"),
  venue_location: z.string().min(1, "Venue location is required"),
  contract_price: z.coerce.number().min(0, "Contract price cannot be negative"),
}).refine((data) => {
  return new Date(data.start_date) <= new Date(data.end_date);
}, {
  message: "End date must be on or after start date",
  path: ["end_date"],
});

interface EditEventSheetProps {
  event?: Event; // If undefined, we are creating a new event
  onClose: () => void;
  onSuccess?: () => void;
}

export default function EditEventSheet({ event, onClose, onSuccess }: EditEventSheetProps) {
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const queryClient = useQueryClient();
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Parse current user role
  const { hasPermission } = useAuth();
  const isOverrideAllowed = hasPermission("events:override_completed");
  const isCompleted = event?.status === "Completed";
  const isReadOnly = isCompleted && !isOverrideAllowed;

  // Helper to format date string for input type="date"
  const formatDateForInput = (dateStr?: string) => {
    if (!dateStr) return "";
    return dateStr.split("T")[0];
  };

  // Helper to format time string for input type="time"
  const formatTimeForInput = (timeStr?: string | null) => {
    if (!timeStr) return "";
    return timeStr.slice(0, 5); // HH:MM:SS -> HH:MM
  };

  const [formData, setFormData] = useState({
    name: event?.name || "",
    client_name: event?.client_name || "",
    client_phone: event?.client_phone || "",
    event_type_id: event?.event_type_id || "",
    start_date: formatDateForInput(event?.start_date),
    end_date: formatDateForInput(event?.end_date),
    start_time: formatTimeForInput(event?.start_time),
    end_time: formatTimeForInput(event?.end_time),
    venue_location: event?.venue_location || "",
    contract_price: event?.contract_price || 0,
    status: event?.status || "Planned",
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const { data: eventTypes = [] } = useQuery<EventType[]>({
    queryKey: ["event-types"],
    queryFn: getEventTypes,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteEvent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast.success("Event deleted successfully");
      if (onSuccess) onSuccess();
      onClose();
    },
    onError: (err: AxiosError<{ error?: string }>) => {
      toast.error(err.response?.data?.error || "Failed to delete event");
    },
  });

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => {
      if (event) {
        return updateEvent(event.id, data);
      } else {
        return createEvent(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["event", event?.id] });
      toast.success(event ? "Event updated successfully" : "Event created successfully");
      if (onSuccess) onSuccess();
      onClose();
    },
    onError: (err: AxiosError<{ error?: string }>) => {
      toast.error(err.response?.data?.error || "Failed to save event");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;

    // Validate
    const validation = eventValidationSchema.safeParse(formData);
    if (!validation.success) {
      const errors: Record<string, string> = {};
      validation.error.issues.forEach((issue) => {
        const field = issue.path[0] as string;
        errors[field] = issue.message;
      });
      setFormErrors(errors);
      toast.error(validation.error.issues[0].message);
      return;
    }

    setFormErrors({});

    // Status transition validation rules client side
    if (event && formData.status !== event.status) {
      if (event.status === "Ongoing" && formData.status === "Planned" && !isOverrideAllowed) {
        toast.error("Cannot transition status from Ongoing back to Planned");
        return;
      }
    }

    // Call API
    const payload = {
      ...formData,
      event_type_id: formData.event_type_id || null,
      client_phone: formData.client_phone || null,
      start_time: formData.start_time || null,
      end_time: formData.end_time || null,
    };

    saveMutation.mutate(payload);
  };

  return (
    <>
      <ResponsiveDrawer
        isOpen={true}
        onClose={onClose}
        title={event ? t("Edit Event") : t("Create Event")}
        subtitle={event ? t("Managing event details") : t("Register a new event schedule")}
      >
        {/* Warning Banner for Completed Event Locks */}
        {isCompleted && (
          <div className={`mb-6 p-4 rounded-xl border flex items-start gap-3 text-xs leading-relaxed ${isReadOnly ? "bg-red-500/10 border-red-500/20 text-red-500 font-semibold" : "bg-warning/10 border-warning/20 text-warning font-semibold"}`}>
            <HiExclamationCircle className="w-5 h-5 shrink-0" />
            <div>
              {isReadOnly ? (
                <span>This event is Completed and locked. You do not have permissions to modify it. Only administrators and accountants can make changes.</span>
              ) : (
                <span>This event is Completed. You are editing with administrator/accountant override privileges.</span>
              )}
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 pb-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Left Column: General Info & Finance */}
            <div className="space-y-4">
              {/* Section 1: Client & General Info */}
              <div className="bg-card-alt/30 p-5 rounded-xl border border-border/50 space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">General Information</h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 mb-1.5 px-1">Event Title</label>
                    <input
                      type="text"
                      disabled={isReadOnly}
                      placeholder="e.g. Betty's Wedding"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className={`w-full h-11 px-4 rounded-xl border bg-card-alt text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all ${
                        formErrors.name ? "border-red-500" : "border-border"
                      }`}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 mb-1.5 px-1">Event Type</label>
                    <Select
                      options={eventTypes.map((et) => ({
                        id: et.id,
                        label: et.event_name,
                      }))}
                      value={formData.event_type_id}
                      onChange={(val) => setFormData({ ...formData, event_type_id: val })}
                      placeholder="Select Type"
                      className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 mb-1.5 px-1 flex items-center gap-1">
                      <HiUser className="w-3.5 h-3.5" /> Client Name
                    </label>
                    <input
                      type="text"
                      disabled={isReadOnly}
                      placeholder="e.g. Betty Hailu"
                      value={formData.client_name}
                      onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                      className={`w-full h-11 px-4 rounded-xl border bg-card-alt text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all ${
                        formErrors.client_name ? "border-red-500" : "border-border"
                      }`}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 mb-1.5 px-1">Client Phone</label>
                    <input
                      type="tel"
                      disabled={isReadOnly}
                      placeholder="e.g. 0911223344"
                      value={formData.client_phone}
                      onChange={(e) => setFormData({ ...formData, client_phone: e.target.value.replace(/[^\d+]/g, "") })}
                      className={`w-full h-11 px-4 rounded-xl border bg-card-alt text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all ${
                        formErrors.client_phone ? "border-red-500" : "border-border"
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Finance & Status */}
              <div className="bg-card-alt/30 p-5 rounded-xl border border-border/50 space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">Status & Budget</h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 mb-1.5 px-1 flex items-center gap-1">
                      <HiCurrencyDollar className="w-3.5 h-3.5" /> Contract Price (ETB)
                    </label>
                    <input
                      type="number"
                      disabled={isReadOnly}
                      placeholder="0.00"
                      value={formData.contract_price || ""}
                      onChange={(e) => setFormData({ ...formData, contract_price: Number(e.target.value) })}
                      className={`w-full h-11 px-4 rounded-xl border bg-card-alt text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all ${
                        formErrors.contract_price ? "border-red-500" : "border-border"
                      }`}
                    />
                  </div>

                  {event && (
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 mb-1.5 px-1">Event Status</label>
                      <Select
                        options={[
                          { id: "Planned", label: "Planned (ቀጠሮ)" },
                          { id: "Ongoing", label: "Ongoing (በሂደት ላይ)" },
                          { id: "Completed", label: "Completed (የተጠናቀቀ)" },
                        ]}
                        value={formData.status}
                        onChange={(val) => setFormData({ ...formData, status: val as "Planned" | "Ongoing" | "Completed" })}
                        placeholder="Select Status"
                        className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Venue & Schedule */}
            <div className="space-y-4">
              {/* Section 2: Venue & Schedule */}
              <div className="bg-card-alt/30 p-5 rounded-xl border border-border/50 space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">Schedule & Location</h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 mb-1.5 px-1">Start Date</label>
                    <input
                      type="date"
                      disabled={isReadOnly}
                      value={formData.start_date}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                      className={`w-full h-11 px-4 rounded-xl border bg-card-alt text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all ${
                        formErrors.start_date ? "border-red-500" : "border-border"
                      }`}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 mb-1.5 px-1">End Date</label>
                    <input
                      type="date"
                      disabled={isReadOnly}
                      value={formData.end_date}
                      onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                      className={`w-full h-11 px-4 rounded-xl border bg-card-alt text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all ${
                        formErrors.end_date ? "border-red-500" : "border-border"
                      }`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 mb-1.5 px-1">Start Time</label>
                    <input
                      type="time"
                      disabled={isReadOnly}
                      value={formData.start_time}
                      onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                      className="w-full h-11 px-4 rounded-xl border border-border bg-card-alt text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 mb-1.5 px-1">End Time</label>
                    <input
                      type="time"
                      disabled={isReadOnly}
                      value={formData.end_time}
                      onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                      className="w-full h-11 px-4 rounded-xl border border-border bg-card-alt text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 mb-1.5 px-1 flex items-center gap-1">
                    <HiMapPin className="w-3.5 h-3.5" /> Venue Location
                  </label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    placeholder="e.g. Sheraton Ballroom / CMC Residence"
                    value={formData.venue_location}
                    onChange={(e) => setFormData({ ...formData, venue_location: e.target.value })}
                    className={`w-full h-11 px-4 rounded-xl border bg-card-alt text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all ${
                      formErrors.venue_location ? "border-red-500" : "border-border"
                    }`}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          {!isReadOnly && (
            <div className="flex gap-3 pt-4">
              <Button
                type="submit"
                loading={saveMutation.isPending}
                className="flex-1 h-11 rounded-2xl bg-primary text-on-primary font-semibold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {event ? t("Save Changes") : t("Create Event")}
              </Button>
              {event && (
                <Button
                  type="button"
                  variant="destructive"
                  loading={deleteMutation.isPending}
                  onClick={() => setShowDeleteModal(true)}
                  className="w-11 h-11 rounded-2xl flex items-center justify-center transition-all group shrink-0"
                  title={t("Delete Event")}
                >
                  <HiTrash className="w-5 h-5 group-hover:scale-105 transition-transform" />
                </Button>
              )}
            </div>
          )}
        </form>
      </ResponsiveDrawer>

      {/* Delete Confirmation Modal */}
      {event && (
        <DeleteConfirmModal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={() => deleteMutation.mutate(event.id)}
          isDeleting={deleteMutation.isPending}
          title="Delete Event"
          message="Are you sure you want to delete this event? This action is permanent."
          itemName={event.name}
        />
      )}
    </>
  );
}
