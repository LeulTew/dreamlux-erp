"use client";
import { useState, useRef } from "react";
import { useLanguage } from "@/hooks/use-language";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Edit Asset": "Edit Asset",
    "Updating": "Updating",
    "Asset Name *": "Asset Name *",
    "Quantity": "Quantity",
    "Office / Branch": "Office / Branch",
    "Description": "Description",
    "Choose Image": "Choose Image",
    "Save Changes": "Save Changes",
    "Updating...": "Updating...",
    "Reconcile Count": "Reconcile Count",
    "Reconciliation Warning": "This will reconcile the physical quantity of the item and record it.",
    "Delete Record": "Delete Record",
    "Delete Warning": "Are you sure you want to delete this asset?",
    "Rotate Image": "Rotate Image",
    "Delete Asset": "Delete Asset",
    "Tap to change photo": "Tap to change photo",
    "Update Image": "Update Image",
    "Rotate Asset 90°": "Rotate Asset 90°",
    "Rotating...": "Rotating...",
    "Audit Traceability": "Audit Traceability",
    "Last Reconciled": "Last Reconciled",
    "Verified By": "Verified By",
    "Reference Name": "Reference Name",
    "Adjust Stock Count": "Adjust Stock Count",
    "Assigned Location": "Assigned Location",
    "Internal Notes": "Internal Notes",
    "Notes Placeholder": "Categorize or add condition notes...",
    "Update Asset": "Update Asset",
    "Syncing...": "Syncing...",
    "Mark as Physically Verified": "Mark as Physically Verified",
    "Applying Audit...": "Applying Audit...",
    "by": "by",
    "Reset Changes": "Reset Changes",
    "Changes reset": "Changes reset"
  },
  am: {
    "Edit Asset": "የንብረት መረጃ ማስተካከያ",
    "Updating": "በማስተካከል ላይ",
    "Asset Name *": "የንብረት ስም *",
    "Quantity": "ብዛት",
    "Office / Branch": "ቢሮ / ቅርንጫፍ",
    "Description": "መግለጫ",
    "Choose Image": "ምስል ይምረጡ",
    "Save Changes": "ለውጦችን አስቀምጥ",
    "Updating...": "በማዘመን ላይ...",
    "Reconcile Count": "ቆጠራ አስታርቅ",
    "Reconciliation Warning": "ይህ የአካላዊ ንብረቱን መጠን ያስታርቃል እንዲሁም ይመዘግባል።",
    "Delete Record": "ንብረት ሰርዝ",
    "Delete Warning": "ይህንን ንብረት መሰረዝ እርግጠኛ ነዎት?",
    "Delta": "ልዩነት",
    "View Only": "ለማየት ብቻ",
    "Counted": "የተቆጠረው",
    "by": "በ",
    "Edit": "አስተካክል",
    "Recover": "መልስ",
    "Rotate Image": "ምስል አሽከርክር",
    "Delete Asset": "ንብረት ሰርዝ",
    "Tap to change photo": "ፎቶ ለመቀየር ይጫኑ",
    "Update Image": "ምስል ቀይር",
    "Rotate Asset 90°": "ምስሉን 90° አሽከርክር",
    "Rotating...": "በማሽከርከር ላይ...",
    "Audit Traceability": "የኦዲት ታሪክ",
    "Last Reconciled": "መጨረሻ የተረጋገጠው",
    "Verified By": "ያረጋገጠው ሰው",
    "Reference Name": "የንብረት ስም/መለያ",
    "Adjust Stock Count": "የክምችት መጠን ማስተካከያ",
    "Assigned Location": "የተመደበበት ቦታ/ቢሮ",
    "Internal Notes": "ውስጣዊ ማስታወሻዎች",
    "Notes Placeholder": "ማስታወሻ ወይም ሁኔታ እዚህ ይጻፉ...",
    "Update Asset": "ንብረት አዘምን",
    "Syncing...": "በማመሳሰል ላይ...",
    "Mark as Physically Verified": "በአካል መኖሩን አረጋግጥ",
    "Applying Audit...": "ኦዲት በማስተካከል ላይ...",
    "Reset Changes": "ለውጦችን መልስ",
    "Changes reset": "ለውጦች ተመልሰዋል",
    "Duplicate": "Duplicate",
    "Duplicate Asset": "Duplicate Asset",
    "Creating duplicate of": "Creating duplicate of",
    "Asset duplicated successfully!": "Asset duplicated successfully!",
    "Failed to duplicate asset": "Failed to duplicate asset",
  }
};
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { updateItem, createItem, getStores, rotateImage, deleteItem, reconcileItems } from "@/lib/api";
import { Item, Store } from "@/lib/types";
import { notify } from "@/lib/toast";
import {
  HiCamera,
  HiArrowPath,
  HiTrash,
  HiCheckCircle,
  HiCheck,
  HiDocumentDuplicate,
} from "react-icons/hi2";
import DeleteConfirmModal from "./DeleteConfirmModal";
import ResponsiveDrawer from "./ui/ResponsiveDrawer";
import { Button } from "./ui/button";

interface Props {
  item: Item;
  onClose: () => void;
  onDeleted?: () => void;
}

export default function EditAssetSheet({ item, onClose, onDeleted }: Props) {
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [officeId, setOfficeId] = useState(item.store.id);
  const [description, setDescription] = useState(item.description || "");
  const [imagePreview, setImagePreview] = useState<string | null>(
    item.image_url,
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isDuplicateMode, setIsDuplicateMode] = useState(false);

  const handleReset = () => {
    setName(item.name);
    setQuantity(String(item.quantity));
    setOfficeId(item.store.id);
    setDescription(item.description || "");
    setImagePreview(item.image_url);
    setImageFile(null);
    setIsDuplicateMode(false);
    notify.success(t("Changes reset"));
  };

  const { data: offices = [] } = useQuery<Store[]>({
    queryKey: ["offices"],
    queryFn: getStores,
  });

  const duplicateMutation = useMutation({
    mutationFn: (formData: FormData) => createItem(formData),
    onSuccess: () => {
      notify.success("Success", t("Asset duplicated successfully!"));
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryStats"] });
      onClose();
    },
    onError: () => {
      notify.error("Error", t("Failed to duplicate asset"));
    },
  });

  const updateMutation = useMutation({
    mutationFn: (formData: FormData) => updateItem(item.id, formData),
    onSuccess: () => {
      notify.success("Success", "Asset updated successfully!");
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryStats"] });
      onClose();
    },
    onError: () => {
      notify.error("Error", "Failed to update asset");
    },
  });

  const rotateMutation = useMutation({
    mutationFn: () => rotateImage(item.id),
    onSuccess: (data) => {
      notify.success("Success", "Image rotated successfully");
      if (data.image_url) {
        setImagePreview(data.image_url + "?t=" + Date.now());
      }
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: () => {
      notify.error("Error", "Rotation failed");
    },
  });

  const reconcileMutation = useMutation({
    mutationFn: (qty: number) => reconcileItems([{ id: item.id, quantity: qty }]),
    onSuccess: () => {
      notify.success("Success", "Count reconciled successfully!");
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryStats"] });
      onClose();
    },
    onError: () => {
      notify.error("Error", "Reconciliation failed");
    },
  });

  const handleReconcile = () => {
    reconcileMutation.mutate(parseInt(quantity));
  };

  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => deleteItem(item.id),
    onSuccess: () => {
      notify.success("Success", "Asset deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryStats"] });
      onClose();
      onDeleted?.();
    },
    onError: () => {
      notify.error("Error", "Delete failed");
    },
  });

  const handleDelete = () => {
    setShowDeleteModal(true);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      notify.error("Error", "Only JPEG/PNG images are allowed");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      notify.error("Error", "Image must be under 10MB");
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (typeof result === "string") {
        setImagePreview(result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append("name", name.trim());
    formData.append("quantity", quantity);
    formData.append("store_id", officeId);
    formData.append("description", description.trim());
    if (imageFile) {
      formData.append("image", imageFile);
    }
    
    if (isDuplicateMode) {
      formData.append("clone_from_id", item.id);
      duplicateMutation.mutate(formData);
    } else {
      updateMutation.mutate(formData);
    }
  };

  const isDataUrl = imagePreview?.startsWith("data:");

  return (
    <>
      <ResponsiveDrawer
        isOpen={true}
        onClose={onClose}
        title={isDuplicateMode ? t("Duplicate Asset") : t("Edit Asset")}
        subtitle={isDuplicateMode ? `${t("Creating duplicate of")} ${item.name}` : `${t("Updating")} ${item.name}`}
      >
        <form onSubmit={handleSubmit} className="space-y-6 pb-12">
          <div className="lg:grid lg:grid-cols-2 lg:gap-8 items-start">
            {/* Left: Image & Quick Stats */}
            <div className="space-y-4">
              <div
                onClick={() => !updateMutation.isPending && fileInputRef.current?.click()}
                className={`relative w-full aspect-square lg:aspect-video rounded-xl overflow-hidden border-2 border-primary/20 bg-card-alt shadow-sm transition-all ${
                  updateMutation.isPending ? "cursor-wait opacity-80" : "cursor-pointer group"
                }`}
              >
                {imagePreview ? (
                  <div className="relative w-full h-full">
                    <Image
                      src={imagePreview}
                      alt="Preview"
                      fill
                      className={`object-cover transition-transform duration-500 ${
                        !updateMutation.isPending && "group-hover:scale-105"
                      }`}
                      unoptimized={isDataUrl}
                    />

                    {/* Progress Overlay */}
                    <AnimatePresence>
                      {updateMutation.isPending && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="absolute inset-0 bg-primary/20 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center"
                        >
                          <motion.div
                            animate={{
                              scale: [1, 1.1, 1],
                              rotate: [0, 10, -10, 0]
                            }}
                            transition={{ repeat: Infinity, duration: 2 }}
                            className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-4"
                          >
                            <HiArrowPath className="w-8 h-8 text-white animate-spin-slow" />
                          </motion.div>
                          <p className="text-white font-bold text-[10px] uppercase tracking-wider drop-shadow-md">
                            {imageFile ? "Converting to WebP & Syncing..." : t("Syncing...")}
                          </p>
                          <div className="mt-4 w-32 h-1.5 bg-white/20 rounded-full overflow-hidden">
                            <motion.div
                              className="h-full bg-white"
                              animate={{ x: [-128, 128] }}
                              transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-3">
                    <div className="p-4 bg-background rounded-xl shadow-sm border border-border">
                      <HiCamera className="w-8 h-8 text-primary" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{t("Tap to change photo")}</span>
                  </div>
                )}

                {!updateMutation.isPending && (
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                    <span className="bg-background text-foreground px-6 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider shadow-massive">{t("Update Image")}</span>
                  </div>
                )}
              </div>

              {imagePreview && (
                <button
                  type="button"
                  onClick={() => rotateMutation.mutate()}
                  disabled={rotateMutation.isPending || updateMutation.isPending}
                  className="flex items-center justify-center gap-2 w-full h-11 rounded-xl text-sm font-semibold uppercase tracking-wider border border-border hover:bg-card-alt transition-all disabled:opacity-50 font-mono"
                >
                  <HiArrowPath className={`w-4 h-4 text-primary ${rotateMutation.isPending ? "animate-spin" : ""}`} />
                  {rotateMutation.isPending ? t("Rotating...") : t("Rotate Asset 90°")}
                </button>
              )}

              {/* Reconciliation Info */}
              {(item.last_counted_at || item.last_counted_by) && (
                <div className="p-4 rounded-xl bg-card-alt/50 border border-border/40 shadow-sm">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-3">{t("Audit Traceability")}</p>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-muted">{t("Last Reconciled")}</span>
                      <span className="text-xs font-bold text-foreground">
                        {item.last_counted_at ? new Date(item.last_counted_at).toLocaleDateString(undefined, {
                          month: 'short', day: 'numeric', year: 'numeric'
                        }) : "Pending"}
                      </span>
                    </div>
                    {item.last_counted_by && (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-muted">{t("Verified By")}</span>
                        <span className="text-[10px] bg-primary/10 text-primary px-3 py-1 rounded-full font-semibold tracking-wider">
                          {item.last_counted_by.full_name.toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Form Fields */}
            <div className="mt-8 lg:mt-0 space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                capture="environment"
                onChange={handleImageSelect}
                className="hidden"
              />

              <div className="space-y-1.5">
                <label className="text-[11px] uppercase font-semibold text-muted-foreground/90 tracking-wider px-1">
                  {t("Reference Name")}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("Reference Name")}
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card-alt text-foreground text-sm focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] uppercase font-semibold text-muted-foreground/90 tracking-wider px-1">
                  {t("Adjust Stock Count")}
                </label>
                <div className="flex items-center gap-2 md:gap-3">
                  <button
                    type="button"
                    onClick={() => setQuantity(String(Math.max(0, parseInt(quantity) - 1)))}
                    className="w-11 h-11 rounded-xl bg-card-alt border border-border flex items-center justify-center text-lg font-semibold hover:bg-primary hover:text-background transition-all active:scale-95"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    min="0"
                    className="flex-1 min-w-0 text-center h-11 px-2 rounded-xl border border-border bg-card-alt text-foreground font-semibold text-base focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setQuantity(String(parseInt(quantity || "0") + 1))}
                    className="w-11 h-11 rounded-xl bg-card-alt border border-border flex items-center justify-center text-lg font-semibold hover:bg-primary hover:text-background transition-all active:scale-95"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] uppercase font-semibold text-muted-foreground/90 tracking-wider px-1">
                  {t("Assigned Location")}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {offices.map((office) => (
                    <button
                      key={office.id}
                      type="button"
                      onClick={() => setOfficeId(office.id)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold tracking-wider uppercase transition-all ${
                        officeId === office.id
                          ? "bg-primary text-background shadow-sm"
                          : "bg-card-alt text-muted border border-border hover:border-primary/30"
                      }`}
                    >
                      {office.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] uppercase font-semibold text-muted-foreground/90 tracking-wider px-1">
                  {t("Internal Notes")}
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder={t("Notes Placeholder")}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-card-alt text-foreground font-medium focus:ring-2 focus:ring-primary/20 transition-all resize-none outline-none leading-relaxed text-sm"
                />
              </div>
            </div>
          </div>

          {/* Form Actions Footer */}
          <div className="flex flex-wrap justify-between items-center gap-3 mt-8 pt-4 border-t border-border/40">
            {/* Left side: Reconcile Button */}
            {!isDuplicateMode ? (
              <Button
                type="button"
                variant="outline"
                onClick={handleReconcile}
                loading={reconcileMutation.isPending}
                disabled={updateMutation.isPending}
                className="h-10 px-4 rounded-xl bg-card border border-border text-foreground font-semibold text-xs uppercase tracking-wider hover:bg-card-alt active:scale-[0.98] transition-all disabled:opacity-50 flex items-center gap-2"
              >
                <HiCheckCircle className="w-4.5 h-4.5 text-primary" />
                {t("Mark as Physically Verified")}
              </Button>
            ) : (
              <div />
            )}

            {/* Right side: Delete, Duplicate, Reset, Save Changes */}
            <div className="flex items-center gap-3">
              {!isDuplicateMode && (
                <Button
                  type="button"
                  variant="destructive"
                  loading={deleteMutation.isPending}
                  onClick={handleDelete}
                  className="h-10 px-4 rounded-xl flex items-center gap-2 transition-all text-xs font-bold uppercase tracking-wider shrink-0"
                  title={t("Delete Asset")}
                >
                  <HiTrash className="w-4.5 h-4.5" />
                  {t("Delete")}
                </Button>
              )}

              {!isDuplicateMode && (
                <Button
                  type="button"
                  onClick={() => {
                    setIsDuplicateMode(true);
                    setName(name + " (Copy)");
                  }}
                  className="h-10 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white active:scale-[0.98] transition-all text-xs font-bold uppercase tracking-wider flex items-center gap-2 shrink-0 border border-amber-500/20"
                >
                  <HiDocumentDuplicate className="w-4.5 h-4.5" />
                  {t("Duplicate")}
                </Button>
              )}

              <Button
                type="button"
                onClick={handleReset}
                className="h-10 px-4 rounded-xl bg-transparent text-indigo-600 border border-indigo-600/30 hover:bg-indigo-500/10 active:scale-[0.98] transition-all text-xs font-bold uppercase tracking-wider flex items-center gap-2 dark:text-indigo-400 dark:border-indigo-500/30 dark:hover:bg-indigo-500/10"
              >
                <HiArrowPath className="w-4.5 h-4.5" />
                {t("Reset Changes")}
              </Button>

              <Button
                type="submit"
                loading={isDuplicateMode ? duplicateMutation.isPending : updateMutation.isPending}
                className="h-10 px-6 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-50 dark:hover:bg-indigo-200 active:scale-[0.98] transition-all text-xs font-black uppercase tracking-widest flex items-center gap-2"
              >
                <HiCheck className="w-4.5 h-4.5" />
                {isDuplicateMode ? t("Duplicate Asset") : t("Save Changes")}
              </Button>
            </div>
          </div>
        </form>
      </ResponsiveDrawer>
      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={() => deleteMutation.mutate()}
        isDeleting={deleteMutation.isPending}
        title={t("Delete Asset")}
        message={t("Delete Warning")}
        itemName={item.name}
      />
    </>
  );
}
