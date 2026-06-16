"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import {
  HiArrowLeft,
  HiCalendarDays,
  HiCheckCircle,
  HiClipboardDocumentCheck,
  HiCube,
  HiMapPin,
  HiMinusCircle,
  HiPaintBrush,
  HiPhone,
  HiPlus,
  HiUser,
} from "react-icons/hi2";

import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createEventAllocation,
  createEventChecklistItem,
  deleteEventAllocation,
  getEventWorkspace,
  getItems,
  updateEventChecklistItem,
  updateEventDesign,
} from "@/lib/api";
import type { EventChecklistItem, Item } from "@/lib/types";
import { useLanguage } from "@/hooks/use-language";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Back to Events": "Back to Events",
    "Event Workspace": "Event Workspace",
    "Operational packet for event planning, store allocation, and day-of readiness.": "Operational packet for event planning, store allocation, and day-of readiness.",
    Details: "Details",
    "Inventory Allocation": "Inventory Allocation",
    Checklist: "Checklist",
    Client: "Client",
    Phone: "Phone",
    "Event Type": "Event Type",
    Venue: "Venue",
    Schedule: "Schedule",
    "Contract Price": "Contract Price",
    "Design Package": "Design Package",
    "Design Notes": "Design Notes",
    "Estimated Design Cost": "Estimated Design Cost",
    "Save Design": "Save Design",
    "No design notes yet. Add package, theme, color, or mockup direction.": "No design notes yet. Add package, theme, color, or mockup direction.",
    "Central Store Allocation": "Central Store Allocation",
    "Search inventory": "Search inventory",
    "Select item": "Select item",
    Quantity: "Quantity",
    Notes: "Notes",
    Allocate: "Allocate",
    "Available": "Available",
    "Allocated": "Allocated",
    "No allocations yet. Reserve inventory before event setup begins.": "No allocations yet. Reserve inventory before event setup begins.",
    Release: "Release",
    "Allocation exceeds available stock.": "Allocation exceeds available stock.",
    "Allocation saved": "Allocation saved",
    "Allocation released": "Allocation released",
    "Design details saved": "Design details saved",
    "Event Checklist": "Event Checklist",
    "Task title": "Task title",
    Owner: "Owner",
    "Due date": "Due date",
    "Add Task": "Add Task",
    Todo: "Todo",
    Done: "Done",
    "No checklist tasks yet. Add the first preparation task.": "No checklist tasks yet. Add the first preparation task.",
    "Task added": "Task added",
    "Task updated": "Task updated",
    "Loading workspace": "Loading workspace",
    "Workspace unavailable": "Workspace unavailable",
    "Try again from the Events page.": "Try again from the Events page.",
    "Required": "Required",
    Status: "Status",
  },
  am: {
    "Back to Events": "ወደ ዝግጅቶች ተመለስ",
    "Event Workspace": "የዝግጅት የስራ ቦታ",
    "Operational packet for event planning, store allocation, and day-of readiness.": "ለዝግጅት እቅድ፣ የመጋዘን ምደባ እና የዕለቱ ዝግጅት የስራ ፋይል።",
    Details: "ዝርዝሮች",
    "Inventory Allocation": "የዕቃ ምደባ",
    Checklist: "የስራ ዝርዝር",
    Client: "ደንበኛ",
    Phone: "ስልክ",
    "Event Type": "የዝግጅት አይነት",
    Venue: "ቦታ",
    Schedule: "ቀንና ሰዓት",
    "Contract Price": "የውል ዋጋ",
    "Design Package": "የዲዛይን ፓኬጅ",
    "Design Notes": "የዲዛይን ማስታወሻ",
    "Estimated Design Cost": "የተገመተ የዲዛይን ወጪ",
    "Save Design": "ዲዛይን አስቀምጥ",
    "No design notes yet. Add package, theme, color, or mockup direction.": "እስካሁን የዲዛይን ማስታወሻ የለም። ፓኬጅ፣ ገጽታ፣ ቀለም ወይም የሞክአፕ አቅጣጫ ያክሉ።",
    "Central Store Allocation": "የመካከለኛ መጋዘን ምደባ",
    "Search inventory": "ዕቃ ፈልግ",
    "Select item": "ዕቃ ምረጥ",
    Quantity: "ብዛት",
    Notes: "ማስታወሻ",
    Allocate: "መድብ",
    "Available": "ያለ",
    "Allocated": "የተመደበ",
    "No allocations yet. Reserve inventory before event setup begins.": "እስካሁን ምደባ የለም። የዝግጅት ማቀናበር ከመጀመሩ በፊት ዕቃ ያስይዙ።",
    Release: "ልቀቅ",
    "Allocation exceeds available stock.": "ምደባው ካለው ክምችት በላይ ነው።",
    "Allocation saved": "ምደባ ተቀምጧል",
    "Allocation released": "ምደባ ተለቋል",
    "Design details saved": "የዲዛይን ዝርዝር ተቀምጧል",
    "Event Checklist": "የዝግጅት የስራ ዝርዝር",
    "Task title": "የስራ ርዕስ",
    Owner: "ባለቤት",
    "Due date": "የማብቂያ ቀን",
    "Add Task": "ስራ ጨምር",
    Todo: "የሚሰራ",
    Done: "ተጠናቋል",
    "No checklist tasks yet. Add the first preparation task.": "እስካሁን የስራ ዝርዝር የለም። የመጀመሪያውን የዝግጅት ስራ ያክሉ።",
    "Task added": "ስራ ታክሏል",
    "Task updated": "ስራ ተዘምኗል",
    "Loading workspace": "የስራ ቦታ በመጫን ላይ",
    "Workspace unavailable": "የስራ ቦታ አልተገኘም",
    "Try again from the Events page.": "ከዝግጅቶች ገጽ እንደገና ይሞክሩ።",
    "Required": "ያስፈልጋል",
    Status: "ሁኔታ",
  },
};

type TabKey = "details" | "inventory" | "checklist";

const tabs: Array<{ id: TabKey; label: string; icon: typeof HiUser }> = [
  { id: "details", label: "Details", icon: HiUser },
  { id: "inventory", label: "Inventory Allocation", icon: HiCube },
  { id: "checklist", label: "Checklist", icon: HiClipboardDocumentCheck },
];

function formatDate(value?: string | null) {
  if (!value) return "-";
  return value.split("T")[0];
}

function formatTime(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 5);
}

function formatCurrency(value?: number | string | null) {
  return `ETB ${Number(value || 0).toLocaleString()}`;
}

function FieldRow({ label, value, icon: Icon }: { label: string; value: string; icon: typeof HiUser }) {
  return (
    <div className="rounded-lg border border-border bg-card-alt/40 p-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-muted">
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </div>
      <div className="mt-1 text-sm font-semibold text-foreground break-words">{value || "-"}</div>
    </div>
  );
}

function DesignPackagePanel({
  eventId,
  initialNotes,
  initialCost,
  t,
}: {
  eventId: string;
  initialNotes: string;
  initialCost: number;
  t: (key: string) => string;
}) {
  const queryClient = useQueryClient();
  const [designNotes, setDesignNotes] = useState(initialNotes);
  const [designCost, setDesignCost] = useState(String(initialCost));

  const saveDesignMutation = useMutation({
    mutationFn: () =>
      updateEventDesign(eventId, {
        package_design_notes: designNotes,
        estimated_design_cost: Number(designCost || 0),
      }),
    onSuccess: () => {
      toast.success(t("Design details saved"));
      queryClient.invalidateQueries({ queryKey: ["event-workspace", eventId] });
    },
  });

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex items-center gap-2">
        <HiPaintBrush className="h-5 w-5 text-primary-dark" />
        <h2 className="text-base font-bold text-foreground">{t("Design Package")}</h2>
      </div>
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-muted">{t("Design Notes")}</label>
        <textarea
          value={designNotes}
          onChange={(eventChange) => setDesignNotes(eventChange.target.value)}
          placeholder={t("No design notes yet. Add package, theme, color, or mockup direction.")}
          className="min-h-32 w-full rounded-lg border border-input bg-card-alt px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-ring focus:ring-3 focus:ring-ring/30"
        />
        <label className="block text-xs font-semibold text-muted">{t("Estimated Design Cost")}</label>
        <Input
          type="number"
          min="0"
          value={designCost}
          onChange={(eventChange) => setDesignCost(eventChange.target.value)}
        />
        <Button
          type="button"
          onClick={() => saveDesignMutation.mutate()}
          disabled={saveDesignMutation.isPending}
          className="w-full"
        >
          {t("Save Design")}
        </Button>
      </div>
    </section>
  );
}

export default function EventWorkspacePage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>("details");
  const [itemSearch, setItemSearch] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [allocationQty, setAllocationQty] = useState("1");
  const [allocationNotes, setAllocationNotes] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskOwner, setTaskOwner] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");

  const workspaceQuery = useQuery({
    queryKey: ["event-workspace", eventId],
    queryFn: () => getEventWorkspace(eventId),
  });

  const event = workspaceQuery.data?.event;
  const allocations = workspaceQuery.data?.allocations || [];
  const checklist = workspaceQuery.data?.checklist || [];

  const itemsQuery = useQuery({
    queryKey: ["event-allocation-items", itemSearch],
    queryFn: () => getItems(1, 30, itemSearch || undefined, "all", false),
  });

  const items = (itemsQuery.data?.items || []) as Item[];
  const selectedItem = items.find((item) => item.id === selectedItemId);
  const alreadyAllocated = allocations
    .filter((allocation) => allocation.item_id === selectedItemId && allocation.status !== "Returned")
    .reduce((sum, allocation) => sum + Number(allocation.quantity_allocated || 0), 0) || 0;
  const selectedAvailable = selectedItem ? Math.max(0, Number(selectedItem.quantity || 0) - alreadyAllocated) : 0;

  const allocationMutation = useMutation({
    mutationFn: () =>
      createEventAllocation(eventId, {
        item_id: selectedItemId,
        quantity_allocated: Number(allocationQty || 0),
        notes: allocationNotes || null,
      }),
    onSuccess: () => {
      toast.success(t("Allocation saved"));
      setAllocationQty("1");
      setAllocationNotes("");
      queryClient.invalidateQueries({ queryKey: ["event-workspace", eventId] });
    },
    onError: () => toast.error(t("Allocation exceeds available stock.")),
  });

  const releaseMutation = useMutation({
    mutationFn: (allocationId: string) => deleteEventAllocation(eventId, allocationId),
    onSuccess: () => {
      toast.success(t("Allocation released"));
      queryClient.invalidateQueries({ queryKey: ["event-workspace", eventId] });
    },
  });

  const addTaskMutation = useMutation({
    mutationFn: () =>
      createEventChecklistItem(eventId, {
        title: taskTitle,
        owner_name: taskOwner || null,
        due_date: taskDueDate || null,
      }),
    onSuccess: () => {
      toast.success(t("Task added"));
      setTaskTitle("");
      setTaskOwner("");
      setTaskDueDate("");
      queryClient.invalidateQueries({ queryKey: ["event-workspace", eventId] });
    },
  });

  const toggleTaskMutation = useMutation({
    mutationFn: (item: EventChecklistItem) =>
      updateEventChecklistItem(eventId, item.id, {
        status: item.status === "Done" ? "Todo" : "Done",
      }),
    onSuccess: () => {
      toast.success(t("Task updated"));
      queryClient.invalidateQueries({ queryKey: ["event-workspace", eventId] });
    },
  });

  const schedule = event
    ? `${formatDate(event.start_date)}${event.start_date !== event.end_date ? ` - ${formatDate(event.end_date)}` : ""} ${formatTime(event.start_time)}${event.end_time ? ` - ${formatTime(event.end_time)}` : ""}`
    : "";

  const canAllocate =
    selectedItemId &&
    Number(allocationQty) > 0 &&
    Number(allocationQty) <= selectedAvailable &&
    !allocationMutation.isPending;

  return (
    <AuthLayout>
      <div className="page-container-lg space-y-5">
        <div className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <Link href="/events" className="mb-3 inline-flex items-center gap-2 text-xs font-semibold text-muted hover:text-foreground">
              <HiArrowLeft className="h-4 w-4" />
              {t("Back to Events")}
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-primary/30 bg-primary-light text-primary-dark">
                <HiCalendarDays className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-black text-foreground">{event?.name || t("Event Workspace")}</h1>
                <p className="mt-1 text-sm text-muted">{t("Operational packet for event planning, store allocation, and day-of readiness.")}</p>
              </div>
            </div>
          </div>
          {event && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card-alt px-3 py-2 text-xs font-bold text-foreground">
              <span className="text-muted">{t("Status")}</span>
              <span>{event.status}</span>
            </div>
          )}
        </div>

        {workspaceQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : workspaceQuery.isError || !event ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <h2 className="text-lg font-bold text-foreground">{t("Workspace unavailable")}</h2>
            <p className="mt-2 text-sm text-muted">{t("Try again from the Events page.")}</p>
          </div>
        ) : (
          <>
            <div className="flex gap-2 overflow-x-auto border-b border-border">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex min-h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors ${
                      isActive
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {t(tab.label)}
                  </button>
                );
              })}
            </div>

            {activeTab === "details" && (
              <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <section className="rounded-lg border border-border bg-card p-4">
                  <h2 className="mb-4 text-base font-bold text-foreground">{t("Details")}</h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FieldRow label={t("Client")} value={event.client_name} icon={HiUser} />
                    <FieldRow label={t("Phone")} value={event.client_phone || "-"} icon={HiPhone} />
                    <FieldRow label={t("Event Type")} value={event.event_type_name || "-"} icon={HiClipboardDocumentCheck} />
                    <FieldRow label={t("Venue")} value={event.venue_location} icon={HiMapPin} />
                    <FieldRow label={t("Schedule")} value={schedule} icon={HiCalendarDays} />
                    <FieldRow label={t("Contract Price")} value={formatCurrency(event.contract_price)} icon={HiCheckCircle} />
                  </div>
                </section>

                <DesignPackagePanel
                  key={`${event.id}:${event.updated_at}`}
                  eventId={eventId}
                  initialNotes={event.package_design_notes || ""}
                  initialCost={Number(event.estimated_design_cost || 0)}
                  t={t}
                />
              </div>
            )}

            {activeTab === "inventory" && (
              <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
                <section className="rounded-lg border border-border bg-card p-4">
                  <h2 className="mb-4 text-base font-bold text-foreground">{t("Central Store Allocation")}</h2>
                  <div className="space-y-3">
                    <Input
                      value={itemSearch}
                      onChange={(eventChange) => setItemSearch(eventChange.target.value)}
                      placeholder={t("Search inventory")}
                    />
                    <select
                      value={selectedItemId}
                      onChange={(eventChange) => setSelectedItemId(eventChange.target.value)}
                      className="h-9 w-full rounded-lg border border-input bg-card-alt px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
                    >
                      <option value="">{t("Select item")}</option>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} - {t("Available")} {item.quantity}
                        </option>
                      ))}
                    </select>
                    {selectedItem && (
                      <div className="rounded-lg border border-border bg-card-alt/50 p-3 text-xs text-muted">
                        <div className="font-semibold text-foreground">{selectedItem.name}</div>
                        <div className="mt-1">
                          {t("Available")}: {selectedAvailable} | {t("Allocated")}: {alreadyAllocated}
                        </div>
                      </div>
                    )}
                    <Input
                      type="number"
                      min="1"
                      value={allocationQty}
                      onChange={(eventChange) => setAllocationQty(eventChange.target.value)}
                      placeholder={t("Quantity")}
                    />
                    <Input
                      value={allocationNotes}
                      onChange={(eventChange) => setAllocationNotes(eventChange.target.value)}
                      placeholder={t("Notes")}
                    />
                    <Button type="button" onClick={() => allocationMutation.mutate()} disabled={!canAllocate} className="w-full">
                      <HiPlus className="h-4 w-4" />
                      {t("Allocate")}
                    </Button>
                    {selectedItem && Number(allocationQty) > selectedAvailable && (
                      <p className="text-xs font-semibold text-danger">{t("Allocation exceeds available stock.")}</p>
                    )}
                  </div>
                </section>

                <section className="rounded-lg border border-border bg-card">
                  {allocations.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted">{t("No allocations yet. Reserve inventory before event setup begins.")}</div>
                  ) : (
                    <div className="divide-y divide-border">
                      {allocations.map((allocation) => (
                        <div key={allocation.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="font-semibold text-foreground">{allocation.item_name}</div>
                            <div className="mt-1 text-xs text-muted">
                              {allocation.store_name || "-"} | {t("Allocated")}: {allocation.quantity_allocated} | {allocation.status}
                            </div>
                            {allocation.notes && <div className="mt-1 text-xs text-muted">{allocation.notes}</div>}
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => releaseMutation.mutate(allocation.id)}
                            disabled={releaseMutation.isPending}
                          >
                            <HiMinusCircle className="h-4 w-4" />
                            {t("Release")}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}

            {activeTab === "checklist" && (
              <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
                <section className="rounded-lg border border-border bg-card p-4">
                  <h2 className="mb-4 text-base font-bold text-foreground">{t("Event Checklist")}</h2>
                  <div className="space-y-3">
                    <Input value={taskTitle} onChange={(eventChange) => setTaskTitle(eventChange.target.value)} placeholder={t("Task title")} />
                    <Input value={taskOwner} onChange={(eventChange) => setTaskOwner(eventChange.target.value)} placeholder={t("Owner")} />
                    <Input type="date" value={taskDueDate} onChange={(eventChange) => setTaskDueDate(eventChange.target.value)} />
                    <Button
                      type="button"
                      onClick={() => {
                        if (!taskTitle.trim()) {
                          toast.error(t("Required"));
                          return;
                        }
                        addTaskMutation.mutate();
                      }}
                      disabled={addTaskMutation.isPending}
                      className="w-full"
                    >
                      <HiPlus className="h-4 w-4" />
                      {t("Add Task")}
                    </Button>
                  </div>
                </section>

                <section className="rounded-lg border border-border bg-card">
                  {checklist.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted">{t("No checklist tasks yet. Add the first preparation task.")}</div>
                  ) : (
                    <div className="divide-y divide-border">
                      {checklist.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => toggleTaskMutation.mutate(item)}
                          className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-card-alt/50"
                        >
                          <span
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                              item.status === "Done"
                                ? "border-success bg-success text-white"
                                : "border-border bg-card-alt text-transparent"
                            }`}
                          >
                            <HiCheckCircle className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block text-sm font-semibold ${item.status === "Done" ? "text-muted line-through" : "text-foreground"}`}>
                              {item.title}
                            </span>
                            <span className="mt-1 block text-xs text-muted">
                              {item.owner_name || t("Owner")} | {item.due_date ? formatDate(item.due_date) : t("Due date")} | {t(item.status)}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}
          </>
        )}
      </div>
    </AuthLayout>
  );
}
