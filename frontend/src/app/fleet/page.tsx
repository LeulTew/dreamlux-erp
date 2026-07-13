"use client";

import React, { Suspense, useState } from "react";
import { HiPlus, HiPencilSquare, HiOutlineTrash, HiArchiveBox, HiArrowUturnLeft } from "react-icons/hi2";
import AuthLayout from "@/components/AuthLayout";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  getVehicles,
  createVehicle,
  updateVehicle,
  archiveVehicle,
  restoreVehicle,
  deleteVehicle,
  type VehiclePayload,
} from "@/lib/api";
import type { Vehicle, VehiclesResponse } from "@/lib/types";
import toast from "@/lib/toast";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import PaginationControls from "@/components/PaginationControls";
import Select from "@/components/ui/Select";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/useAuth";
import ForbiddenState from "@/components/ForbiddenState";
import {
  FUEL_CONSUMPTION_UNIT,
  MAX_REASONABLE_LITERS_PER_KM,
  validateFuelConsumptionRateLitersPerKm,
} from "@/lib/fuel";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Fleet Management": "Fleet Management",
    "Manage the vehicle registry, fuel consumption, and retirement": "Manage the vehicle registry, fuel consumption, and retirement",
    "Plate Number": "Plate Number",
    "Vehicle Type": "Vehicle Type",
    "Fuel Type": "Fuel Type",
    "Fuel Consumption": "Fuel Consumption",
    "License / Notes": "License / Notes",
    "Add Vehicle": "Add Vehicle",
    "Update Vehicle": "Update Vehicle",
    "Cancel": "Cancel",
    "Actions": "Actions",
    "Status": "Status",
    "Active": "Active",
    "Archived": "Archived",
    "All": "All",
    "Search plate or type": "Search plate or type",
    "No vehicles found": "No vehicles found",
    "Initializing...": "Initializing...",
    "Edit": "Edit",
    "Archive": "Archive",
    "Restore": "Restore",
    "Delete": "Delete",
    "Delete Vehicle": "Delete Vehicle",
    "Are you sure you want to permanently delete this vehicle?": "Permanent deletion is only possible for vehicles with no assignment history. Otherwise archive it instead.",
    "Vehicle added": "Vehicle added",
    "Vehicle updated": "Vehicle updated",
    "Vehicle archived": "Vehicle archived",
    "Vehicle restored": "Vehicle restored",
    "Vehicle deleted": "Vehicle deleted",
    "Plate number is required": "Plate number is required",
    "Vehicle type is required": "Vehicle type is required",
  },
  am: {
    "Fleet Management": "የተሽከርካሪ አስተዳደር",
    "Manage the vehicle registry, fuel consumption, and retirement": "የተሽከርካሪ መዝገብ፣ የነዳጅ ፍጆታ እና ማቋረጥ ያስተዳድሩ",
    "Plate Number": "የሰሌዳ ቁጥር",
    "Vehicle Type": "የተሽከርካሪ ዓይነት",
    "Fuel Type": "የነዳጅ ዓይነት",
    "Fuel Consumption": "የነዳጅ ፍጆታ",
    "License / Notes": "ፍቃድ / ማስታወሻ",
    "Add Vehicle": "ተሽከርካሪ ጨምር",
    "Update Vehicle": "ተሽከርካሪ አዘምን",
    "Cancel": "ሰርዝ",
    "Actions": "ድርጊቶች",
    "Status": "ሁኔታ",
    "Active": "አክቲቭ",
    "Archived": "የተቀመጠ",
    "All": "ሁሉም",
    "Search plate or type": "ሰሌዳ ወይም ዓይነት ፈልግ",
    "No vehicles found": "ምንም ተሽከርካሪ አልተገኘም",
    "Initializing...": "በማዘጋጀት ላይ...",
    "Edit": "አስተካክል",
    "Archive": "አስቀምጥ",
    "Restore": "መልስ",
    "Delete": "ሰርዝ",
    "Delete Vehicle": "ተሽከርካሪ ሰርዝ",
    "Are you sure you want to permanently delete this vehicle?": "ቋሚ ስረዛ የሚቻለው የምደባ ታሪክ ለሌላቸው ተሽከርካሪዎች ብቻ ነው። ካልሆነ ያስቀምጡት።",
    "Vehicle added": "ተሽከርካሪ ተጨምሯል",
    "Vehicle updated": "ተሽከርካሪ ተዘምኗል",
    "Vehicle archived": "ተሽከርካሪ ተቀምጧል",
    "Vehicle restored": "ተሽከርካሪ ተመልሷል",
    "Vehicle deleted": "ተሽከርካሪ ተሰርዟል",
    "Plate number is required": "የሰሌዳ ቁጥር ያስፈልጋል",
    "Vehicle type is required": "የተሽከርካሪ ዓይነት ያስፈልጋል",
  },
};

const FUEL_TYPES = ["Diesel", "Benzene", "Petrol", "Electric", "Hybrid"];

type FleetForm = {
  id?: string;
  plate_number: string;
  vehicle_type: string;
  fuel_type: string;
  fuel_consumption_rate: string;
  driver_license_details: string;
  is_active: boolean;
};

const EMPTY_FORM: FleetForm = {
  plate_number: "",
  vehicle_type: "",
  fuel_type: FUEL_TYPES[0],
  fuel_consumption_rate: "",
  driver_license_details: "",
  is_active: true,
};

function getMutationErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null) {
    const maybe = error as { response?: { data?: { error?: string } }; message?: string };
    return maybe.response?.data?.error || maybe.message || fallback;
  }
  return fallback;
}

function FleetContent() {
  const { hasPermission, isLoading: authLoading, isAuthenticated } = useAuth();
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const queryClient = useQueryClient();

  const hasReadAccess = hasPermission("vehicles:read") || hasPermission("vehicles:write");
  const hasWriteAccess = hasPermission("vehicles:write");
  const hasDeleteAccess = hasPermission("vehicles:delete");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "archived" | "all">("active");
  const [fuelFilter, setFuelFilter] = useState("");
  const [form, setForm] = useState<FleetForm>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const limit = 25;

  const { data, isLoading, isError, refetch, isFetching } = useQuery<VehiclesResponse>({
    queryKey: ["vehicles", { page, search, statusFilter, fuelFilter }],
    queryFn: () => getVehicles({ page, limit, search, status: statusFilter, fuel_type: fuelFilter || undefined }),
    enabled: isAuthenticated && hasReadAccess,
    placeholderData: keepPreviousData,
  });

  const vehicles = data?.vehicles ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const activeDeleteVehicle = vehicles.find((v) => v.id === deleteId);

  const resetForm = () => setForm(EMPTY_FORM);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["vehicles"] });

  const createMut = useMutation({
    mutationFn: (payload: VehiclePayload) => createVehicle(payload),
    onSuccess: () => { invalidate(); resetForm(); toast.success(t("Vehicle added")); },
    onError: (err) => toast.error(getMutationErrorMessage(err, "Failed to create vehicle")),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: VehiclePayload }) => updateVehicle(id, payload),
    onSuccess: () => { invalidate(); resetForm(); toast.success(t("Vehicle updated")); },
    onError: (err) => toast.error(getMutationErrorMessage(err, "Failed to update vehicle")),
  });
  const archiveMut = useMutation({
    mutationFn: (id: string) => archiveVehicle(id),
    onSuccess: () => { invalidate(); toast.success(t("Vehicle archived")); },
    onError: (err) => toast.error(getMutationErrorMessage(err, "Failed to archive vehicle")),
  });
  const restoreMut = useMutation({
    mutationFn: (id: string) => restoreVehicle(id),
    onSuccess: () => { invalidate(); toast.success(t("Vehicle restored")); },
    onError: (err) => toast.error(getMutationErrorMessage(err, "Failed to restore vehicle")),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteVehicle(id),
    onSuccess: () => { invalidate(); setDeleteId(null); toast.success(t("Vehicle deleted")); },
    onError: (err) => { toast.error(getMutationErrorMessage(err, "Failed to delete vehicle")); setDeleteId(null); },
  });

  const isSaving = createMut.isPending || updateMut.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.plate_number.trim()) { toast.error(t("Plate number is required")); return; }
    if (!form.vehicle_type.trim()) { toast.error(t("Vehicle type is required")); return; }
    const rate = validateFuelConsumptionRateLitersPerKm(form.fuel_consumption_rate);
    if (rate === null) {
      toast.error(`Fuel consumption must be a number within (0, ${MAX_REASONABLE_LITERS_PER_KM}] ${FUEL_CONSUMPTION_UNIT}`);
      return;
    }
    const payload: VehiclePayload = {
      plate_number: form.plate_number.trim(),
      vehicle_type: form.vehicle_type.trim(),
      fuel_type: form.fuel_type.trim(),
      fuel_consumption_rate: rate,
      driver_license_details: form.driver_license_details.trim() || null,
      is_active: form.is_active,
    };
    if (form.id) updateMut.mutate({ id: form.id, payload });
    else createMut.mutate(payload);
  };

  const startEdit = (v: Vehicle) => {
    setForm({
      id: v.id,
      plate_number: v.plate_number,
      vehicle_type: v.vehicle_type,
      fuel_type: v.fuel_type,
      fuel_consumption_rate: String(v.fuel_consumption_rate),
      driver_license_details: v.driver_license_details ?? "",
      is_active: v.is_active,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const fuelFilterOptions = [{ id: "", label: t("All") }, ...FUEL_TYPES.map((f) => ({ id: f, label: f }))];

  if (authLoading) {
    return (
      <AuthLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground animate-pulse">{t("Initializing...")}</span>
        </div>
      </AuthLayout>
    );
  }

  if (!hasReadAccess) return <ForbiddenState />;

  const colSpan = hasWriteAccess || hasDeleteAccess ? 5 : 4;

  return (
    <AuthLayout>
      <div className="page-container-sm pt-4 md:py-8 px-4 sm:px-6 md:px-8">
        <header className="mb-6 md:mb-8">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-foreground">{t("Fleet Management")}</h1>
          <p className="text-xs font-semibold text-muted-foreground mt-1">{t("Manage the vehicle registry, fuel consumption, and retirement")}</p>
        </header>

        {hasWriteAccess && (
          <div className="bg-card p-5 md:p-6 rounded-2xl border border-border mb-6">
            <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 items-end">
              <div>
                <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-2 tracking-wide">{t("Plate Number")}</label>
                <Input value={form.plate_number} onChange={(e) => setForm({ ...form, plate_number: e.target.value })} placeholder="AA-3-A12345" required />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-2 tracking-wide">{t("Vehicle Type")}</label>
                <Input value={form.vehicle_type} onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })} placeholder="Isuzu FSR / Van" required />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-2 tracking-wide">{t("Fuel Type")}</label>
                <Select
                  value={form.fuel_type}
                  onChange={(v) => setForm({ ...form, fuel_type: v })}
                  options={(form.fuel_type && !FUEL_TYPES.includes(form.fuel_type) ? [form.fuel_type, ...FUEL_TYPES] : FUEL_TYPES).map((f) => ({ id: f, label: f }))}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-2 tracking-wide">
                  {t("Fuel Consumption")} ({FUEL_CONSUMPTION_UNIT})
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max={MAX_REASONABLE_LITERS_PER_KM}
                  value={form.fuel_consumption_rate}
                  onChange={(e) => setForm({ ...form, fuel_consumption_rate: e.target.value })}
                  placeholder="0.35"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-2 tracking-wide">{t("License / Notes")}</label>
                <Input value={form.driver_license_details} onChange={(e) => setForm({ ...form, driver_license_details: e.target.value })} placeholder="—" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-2 tracking-wide">{t("Status")}</label>
                <Select
                  value={form.is_active ? "true" : "false"}
                  onChange={(v) => setForm({ ...form, is_active: v === "true" })}
                  options={[{ id: "true", label: t("Active") }, { id: "false", label: t("Inactive") || "Inactive" }]}
                />
              </div>
              <div className="flex gap-3 sm:col-span-2 lg:col-span-3">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="h-11 px-5 rounded-xl bg-amber-600 text-white text-xs font-black uppercase tracking-widest hover:bg-amber-700 active:scale-[0.98] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {form.id ? <span>{t("Update Vehicle")}</span> : (<><HiPlus className="w-4 h-4" /><span>{t("Add Vehicle")}</span></>)}
                </button>
                {form.id && (
                  <button type="button" onClick={resetForm} className="px-4 h-11 bg-muted/50 text-foreground font-semibold text-sm rounded-xl hover:bg-muted transition-colors border border-border/50">
                    {t("Cancel")}
                  </button>
                )}
              </div>
            </form>
          </div>
        )}

        {/* Filter toolbar */}
        <div className="grid gap-3 mb-4 sm:grid-cols-[minmax(0,1fr)_11rem_11rem]">
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={t("Search plate or type")}
            className="h-11"
          />
          <Select
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v as "active" | "archived" | "all"); setPage(1); }}
            options={[{ id: "active", label: t("Active") }, { id: "archived", label: t("Archived") }, { id: "all", label: t("All") }]}
          />
          <Select
            value={fuelFilter}
            onChange={(v) => { setFuelFilter(v); setPage(1); }}
            options={fuelFilterOptions}
          />
        </div>

        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-muted/30">
                  <th className="px-4 sm:px-6 py-4 text-xs font-semibold uppercase text-muted-foreground tracking-wider border-b border-border/50">{t("Plate Number")}</th>
                  <th className="px-4 sm:px-6 py-4 text-xs font-semibold uppercase text-muted-foreground tracking-wider border-b border-border/50">{t("Vehicle Type")}</th>
                  <th className="px-4 sm:px-6 py-4 text-xs font-semibold uppercase text-muted-foreground tracking-wider border-b border-border/50">{t("Fuel Type")}</th>
                  <th className="px-4 sm:px-6 py-4 text-right text-xs font-semibold uppercase text-muted-foreground tracking-wider border-b border-border/50">{t("Fuel Consumption")}</th>
                  {(hasWriteAccess || hasDeleteAccess) && (
                    <th className="px-4 sm:px-6 py-4 text-right text-xs font-semibold uppercase text-muted-foreground tracking-wider border-b border-border/50">{t("Actions")}</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {isLoading ? (
                  <tr><td colSpan={colSpan} className="p-16 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground animate-pulse">{t("Initializing...")}</td></tr>
                ) : isError ? (
                  <tr><td colSpan={colSpan} className="p-12 text-center text-sm">
                    <span className="text-destructive font-semibold">Failed to load vehicles. </span>
                    <button type="button" onClick={() => refetch()} className="underline underline-offset-2 text-primary font-semibold">Retry</button>
                  </td></tr>
                ) : vehicles.length === 0 ? (
                  <tr><td colSpan={colSpan} className="p-16 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-card-alt">{t("No vehicles found")}</td></tr>
                ) : (
                  vehicles.map((v) => {
                    const archived = !!v.deleted_at;
                    return (
                      <tr key={v.id} className={`transition-colors ${archived ? "opacity-60" : "hover:bg-primary/5"}`}>
                        <td className="px-4 sm:px-6 py-3.5">
                          <span className="font-bold text-sm tracking-tight text-foreground font-mono">{v.plate_number}</span>
                          {archived && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-neutral-500/10 text-neutral-500 border border-neutral-500/20">{t("Archived")}</span>}
                        </td>
                        <td className="px-4 sm:px-6 py-3.5 text-foreground">{v.vehicle_type}</td>
                        <td className="px-4 sm:px-6 py-3.5 text-muted-foreground">{v.fuel_type}</td>
                        <td className="px-4 sm:px-6 py-3.5 text-right tabular-nums font-semibold text-foreground">{Number(v.fuel_consumption_rate).toFixed(2)} <span className="text-[11px] text-muted-foreground">{FUEL_CONSUMPTION_UNIT}</span></td>
                        {(hasWriteAccess || hasDeleteAccess) && (
                          <td className="px-4 sm:px-6 py-3.5 text-right space-x-2">
                            {hasWriteAccess && !archived && (
                              <button onClick={() => startEdit(v)} title={t("Edit")} className="p-2 bg-primary/10 rounded-lg text-primary md:hover:bg-primary md:hover:text-background transition-colors active:scale-90 inline-flex border border-primary/20">
                                <HiPencilSquare className="w-4 h-4" />
                              </button>
                            )}
                            {hasWriteAccess && !archived && (
                              <button onClick={() => archiveMut.mutate(v.id)} disabled={archiveMut.isPending} title={t("Archive")} className="p-2 bg-amber-500/10 rounded-lg text-amber-600 md:hover:bg-amber-600 md:hover:text-white transition-colors active:scale-90 inline-flex border border-amber-500/20 disabled:opacity-50">
                                <HiArchiveBox className="w-4 h-4" />
                              </button>
                            )}
                            {hasWriteAccess && archived && (
                              <button onClick={() => restoreMut.mutate(v.id)} disabled={restoreMut.isPending} title={t("Restore")} className="p-2 bg-emerald-500/10 rounded-lg text-emerald-600 md:hover:bg-emerald-600 md:hover:text-white transition-colors active:scale-90 inline-flex border border-emerald-500/20 disabled:opacity-50">
                                <HiArrowUturnLeft className="w-4 h-4" />
                              </button>
                            )}
                            {hasDeleteAccess && (
                              <button onClick={() => setDeleteId(v.id)} title={t("Delete")} className="p-2 bg-destructive/10 rounded-lg text-destructive md:hover:bg-destructive md:hover:text-white transition-colors active:scale-90 inline-flex border border-destructive/20">
                                <HiOutlineTrash className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {total > limit && (
          <div className="mt-4">
            <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
        {isFetching && !isLoading && <div className="mt-2 text-center text-[11px] text-muted-foreground">…</div>}
      </div>

      <DeleteConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title={t("Delete Vehicle")}
        message={t("Are you sure you want to permanently delete this vehicle?")}
        itemName={activeDeleteVehicle?.plate_number ?? ""}
        isDeleting={deleteMut.isPending}
      />
    </AuthLayout>
  );
}

export default function FleetPage() {
  return (
    <Suspense>
      <FleetContent />
    </Suspense>
  );
}
