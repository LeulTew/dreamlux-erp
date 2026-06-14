"use client";
import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { createItem, getStores } from "@/lib/api";
import { Store } from "@/lib/types";
import AuthLayout from "@/components/AuthLayout";
import toast from "react-hot-toast";
import { HiCamera, HiXMark, HiPhoto, HiChevronLeft } from "react-icons/hi2";
import { useRouter } from "next/navigation";

export default function InsertAssetPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [officeId, setOfficeId] = useState("");
  const [description, setDescription] = useState("");

  const { data: offices = [] } = useQuery<Store[]>({
    queryKey: ["offices"],
    queryFn: getStores,
  });

  const createMutation = useMutation({
    mutationFn: (formData: FormData) => createItem(formData),
    onSuccess: () => {
      toast.success("Item created successfully!");
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      resetForm();
    },
    onError: () => {
      toast.error("Failed to create item");
    },
  });

  const resetForm = () => {
    setImagePreview(null);
    setImageFile(null);
    setName("");
    setQuantity("1");
    setOfficeId("");
    setDescription("");
  };

  const handleImageSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!["image/jpeg", "image/png"].includes(file.type)) {
        toast.error("Only JPEG and PNG images are allowed");
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
        setTimeout(() => nameInputRef.current?.focus(), 100);
      };
      reader.readAsDataURL(file);
    },
    [],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!imageFile) {
      toast.error("Image is required");
      return;
    }
    if (!name.trim()) {
      toast.error("Asset name is required");
      return;
    }
    if (!officeId) {
      toast.error("Please select an office");
      return;
    }

    const formData = new FormData();
    formData.append("image", imageFile);
    formData.append("name", name.trim());
    formData.append("quantity", quantity);
    formData.append("store_id", officeId);

    if (description.trim()) {
      formData.append("description", description.trim());
    }

    createMutation.mutate(formData);
  };

  return (
    <AuthLayout>
      <div className="max-w-xl mx-auto px-4 md:px-0">
        <header className="mb-10 flex items-center gap-4 pt-6 pb-2">
          <button
            onClick={() => router.back()}
            className="p-3 rounded-2xl bg-card border border-border hover:bg-card-alt transition-all shadow-sm active:scale-90"
          >
            <HiChevronLeft className="w-5 h-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-3xl font-black text-foreground tracking-tight">Record Stock Entry</h1>
            <p className="text-sm text-muted font-black uppercase tracking-widest mt-1">New Inventory Item</p>
          </div>
        </header>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Photo <span className="text-danger">*</span>
            </label>
            {imagePreview ? (
              <div className="relative w-full aspect-4/3 rounded-2xl overflow-hidden border-2 border-primary/20 bg-card">
                <Image
                  src={imagePreview}
                  alt="Preview"
                  fill
                  className="object-cover"
                  unoptimized
                />

                {/* Loading Overlay */}
                <AnimatePresence>
                  {createMutation.isPending && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-primary/20 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-10"
                    >
                      <motion.div
                        animate={{ 
                          scale: [1, 1.1, 1],
                          rotate: [0, 10, -10, 0]
                        }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-4 shadow-massive"
                      >
                        <span className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                      </motion.div>
                      <p className="text-white font-black text-[10px] uppercase tracking-[0.2em] drop-shadow-md">
                        Processing & Syncing...
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

                <button
                  type="button"
                  disabled={createMutation.isPending}
                  onClick={() => {
                    setImagePreview(null);
                    setImageFile(null);
                  }}
                  className="absolute top-3 right-3 w-8 h-8 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors disabled:opacity-0"
                >
                  <HiXMark className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full aspect-4/3 rounded-2xl border-2 border-dashed border-border hover:border-primary/40 bg-card-alt hover:bg-primary-light/30 transition-all flex flex-col items-center justify-center gap-3 cursor-pointer"
              >
                <div className="w-14 h-14 rounded-2xl bg-primary-light flex items-center justify-center">
                  <HiCamera className="w-7 h-7 text-primary" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">Tap to take a photo</p>
                  <p className="text-xs text-muted mt-0.5">
                    or choose from gallery - JPEG/PNG - Max 10MB
                  </p>
                </div>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              capture="environment"
              onChange={handleImageSelect}
              className="hidden"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Item Name <span className="text-danger">*</span>
            </label>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Printer Ink Cartridge"
              className="w-full px-4 py-3 rounded-xl border border-border bg-card text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase font-black text-muted tracking-widest mb-3 px-1">
              Select Office Location <span className="text-danger">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {offices.map((office) => (
                <button
                  key={office.id}
                  type="button"
                  onClick={() => setOfficeId(office.id)}
                  className={`flex-1 min-w-30 px-4 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 ${
                    officeId === office.id
                      ? "bg-primary text-on-primary shadow-premium"
                      : "bg-card border border-border text-muted hover:bg-card-alt"
                  }`}
                >
                  {office.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Quantity <span className="text-danger">*</span>
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  setQuantity(String(Math.max(0, parseInt(quantity || "0", 10) - 1)))
                }
                className="w-12 h-12 rounded-xl bg-card-alt border border-border flex items-center justify-center text-lg font-bold hover:bg-primary-light transition-all"
              >
                -
              </button>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                min="0"
                className="w-20 text-center px-3 py-3 rounded-xl border border-border bg-card text-foreground font-semibold text-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
              <button
                type="button"
                onClick={() => setQuantity(String(parseInt(quantity || "0", 10) + 1))}
                className="w-12 h-12 rounded-xl bg-card-alt border border-border flex items-center justify-center text-lg font-bold hover:bg-primary-light transition-all"
              >
                +
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Description <span className="text-muted font-normal">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a brief description..."
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-border bg-card text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none"
            />
          </div>

          <div className="flex gap-4 pt-6">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex-3 py-5 rounded-3xl bg-primary text-on-primary font-black uppercase tracking-widest shadow-premium hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 text-xs flex items-center justify-center gap-3"
            >
              {createMutation.isPending ? (
                <>
                  <span className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <HiPhoto className="w-5 h-5" />
                  Confirm Entry
                </>
              )}
            </button>
            <button
               type="button"
               onClick={resetForm}
               className="flex-1 py-5 rounded-3xl bg-card-alt text-foreground font-black uppercase tracking-widest hover:bg-border transition-all text-xs"
             >
               Reset
             </button>
          </div>
        </form>
      </div>
    </AuthLayout>
  );
}
