"use client";
import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { updateItem, getStores, rotateImage, deleteItem, reconcileItems } from "@/lib/api";
import { Item, Store } from "@/lib/types";
import toast from "react-hot-toast";
import {
  HiCamera,
  HiArrowPath,
  HiTrash,
  HiCheckCircle,
} from "react-icons/hi2";
import DeleteConfirmModal from "./DeleteConfirmModal";
import ResponsiveDrawer from "./ui/ResponsiveDrawer";

interface Props {
  item: Item;
  onClose: () => void;
  onDeleted?: () => void;
}

export default function EditAssetSheet({ item, onClose, onDeleted }: Props) {
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

  const { data: offices = [] } = useQuery<Store[]>({
    queryKey: ["offices"],
    queryFn: getStores,
  });

  const updateMutation = useMutation({
    mutationFn: (formData: FormData) => updateItem(item.id, formData),
    onSuccess: () => {
      toast.success("Asset updated!");
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryStats"] });
      onClose();
    },
    onError: () => {
      toast.error("Failed to update asset");
    },
  });

  const rotateMutation = useMutation({
    mutationFn: () => rotateImage(item.id),
    onSuccess: (data) => {
      toast.success("Image rotated");
      if (data.image_url) {
        setImagePreview(data.image_url + "?t=" + Date.now());
      }
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: () => {
      toast.error("Rotation failed");
    },
  });

  const reconcileMutation = useMutation({
    mutationFn: (qty: number) => reconcileItems([{ id: item.id, quantity: qty }]),
    onSuccess: () => {
      toast.success("Count reconciled!");
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryStats"] });
      onClose();
    },
    onError: () => {
      toast.error("Reconciliation failed");
    },
  });

  const handleReconcile = () => {
    reconcileMutation.mutate(parseInt(quantity));
  };

  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => deleteItem(item.id),
    onSuccess: () => {
      toast.success("Asset deleted");
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryStats"] });
      onClose();
      onDeleted?.();
    },
    onError: () => {
      toast.error("Delete failed");
    },
  });

  const handleDelete = () => {
    setShowDeleteModal(true);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      toast.error("Only JPEG/PNG allowed");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be under 10MB");
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
    updateMutation.mutate(formData);
  };

  const isDataUrl = imagePreview?.startsWith("data:");

  return (
    <>
      <ResponsiveDrawer
        isOpen={true}
        onClose={onClose}
        title="Edit Asset"
        subtitle={`Updating ${item.name}`}
      >
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
                            {imageFile ? "Converting to WebP & Syncing..." : "Syncing Asset..."}
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
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Tap to change photo</span>
                  </div>
                )}
                
                {!updateMutation.isPending && (
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                    <span className="bg-background text-foreground px-6 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider shadow-massive">Update Image</span>
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
                  {rotateMutation.isPending ? "Rotating..." : "Rotate Asset 90°"}
                </button>
              )}

              {/* Reconciliation Info */}
              {(item.last_counted_at || item.last_counted_by) && (
                <div className="p-4 rounded-xl bg-card-alt/50 border border-border/40 shadow-sm">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-3">Audit Traceability</p>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-muted">Last Reconciled</span>
                      <span className="text-xs font-bold text-foreground">
                        {item.last_counted_at ? new Date(item.last_counted_at).toLocaleDateString(undefined, { 
                          month: 'short', day: 'numeric', year: 'numeric' 
                        }) : "Pending"}
                      </span>
                    </div>
                    {item.last_counted_by && (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-muted">Verified By</span>
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
            <form onSubmit={handleSubmit} className="mt-8 lg:mt-0 space-y-4">
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
                  Reference Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Asset Name"
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card-alt text-foreground text-sm focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] uppercase font-semibold text-muted-foreground/90 tracking-wider px-1">
                  Adjust Stock Count
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
                  Assigned Location
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
                  Internal Notes
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Categorize or add condition notes..."
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-card-alt text-foreground font-medium focus:ring-2 focus:ring-primary/20 transition-all resize-none outline-none leading-relaxed text-sm"
                />
              </div>

              <div className="pt-2 space-y-3">
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={updateMutation.isPending}
                    className="flex-4 h-11 rounded-xl bg-primary text-background font-semibold text-sm hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 border border-primary/20"
                  >
                    {updateMutation.isPending ? "Syncing..." : "Update Asset"}
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleteMutation.isPending}
                    className="flex-1 h-11 rounded-xl bg-red-50 text-danger flex items-center justify-center hover:bg-danger hover:text-background transition-all active:scale-95 disabled:opacity-50"
                    aria-label="Delete asset"
                  >
                    <HiTrash className="w-4.5 h-4.5" />
                  </button>
                </div>
                
                <button
                  type="button"
                  onClick={handleReconcile}
                  disabled={reconcileMutation.isPending || updateMutation.isPending}
                  className="w-full h-11 rounded-xl bg-card border border-border text-foreground font-semibold text-sm hover:bg-card-alt active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <HiCheckCircle className="w-4.5 h-4.5 text-primary" />
                  {reconcileMutation.isPending ? "Applying Audit..." : "Mark as Physically Verified"}
                </button>
              </div>
            </form>
          </div>
      </ResponsiveDrawer>
      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={() => deleteMutation.mutate()}
        isDeleting={deleteMutation.isPending}
        title="Delete Asset"
        message="Are you sure you want to move this asset to trash?"
        itemName={item.name}
      />
    </>
  );
}
