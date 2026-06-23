"use client";
import { useState } from "react";
import { AxiosError } from "axios";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";

import Image from "next/image";
import { updateEmployee, getDepartments, createDepartment, deleteEmployee, getStores, getSalaryLevels, getEventTypes } from "@/lib/api";
import { Employee, SalaryLevel, EventType, EmployeesResponse } from "@/lib/types";
import toast from "react-hot-toast";
import { HiExclamationCircle, HiPlus, HiTrash, HiXMark, HiUserPlus, HiIdentification } from "react-icons/hi2";
import Select from "./ui/Select";
import DeleteConfirmModal from "./DeleteConfirmModal";
import ResponsiveDrawer from "./ui/ResponsiveDrawer";
import { Button } from "./ui/button";
import { z } from "zod";
import { useLanguage } from "@/hooks/use-language";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Edit Employee": "Edit Employee",
    "Updating": "Updating",
    "New Photo": "New Photo",
    "Upload": "Upload",
    "ID Front": "ID Front",
    "Upload Front": "Upload Front",
    "ID Back": "ID Back",
    "Upload Back": "Upload Back",
    "Full Name *": "Full Name *",
    "Employee ID *": "Employee ID *",
    "Phone": "Phone",
    "Email": "Email",
    "Department": "Department",
    "Select Department": "Select Department",
    "Office / Branch": "Office / Branch",
    "Select Office": "Select Office",
    "Base Salary": "Base Salary",
    "Select Level": "Select Level",
    "Base Salary Amount": "Base Salary Amount",
    "Select a salary level to view the amount": "Select a salary level to view the amount.",
    "Event Rates": "Event Rates",
    "Rates Description": "Set custom rates for this employee. These prices will be used during payroll calculation.",
    "Save Changes": "Save Changes",
    "Updating...": "Updating...",
    "Delete Record": "Delete Record",
    "Delete Permanently": "Delete Permanently",
    "Delete Warning": "This action will move the record to trash. Are you sure?",
    "Failed to process image": "Failed to process image",
    "Department added!": "Department added!",
    "Failed to add department": "Failed to add department",
    "Please fix the mistakes in the form": "Please fix the mistakes in the form"
  },
  am: {
    "Edit Employee": "የሰራተኛ መረጃ ማስተካከያ",
    "Updating": "በማስተካከል ላይ",
    "New Photo": "አዲስ ፎቶ",
    "Upload": "ጫን",
    "ID Front": "የመታወቂያ ፊት",
    "Upload Front": "የፊት ክፍል ጫን",
    "ID Back": "የመታወቂያ ጀርባ",
    "Upload Back": "የጀርባ ክፍል ጫን",
    "Full Name *": "ሙሉ ስም *",
    "Employee ID *": "የሰራተኛ መታወቂያ *",
    "Phone": "ስልክ",
    "Email": "ኢሜይል",
    "Department": "ክፍል",
    "Select Department": "ክፍል ይምረጡ",
    "Office / Branch": "ቢሮ / ቅርንጫፍ",
    "Select Office": "ቢሮ ይምረጡ",
    "Base Salary": "መሰረታዊ ደመወዝ",
    "Select Level": "ደረጃ ይምረጡ",
    "Base Salary Amount": "የመሰረታዊ ደመወዝ መጠን",
    "Select a salary level to view the amount": "መጠኑን ለማየት እባክዎ የደመወዝ ደረጃ ይምረጡ።",
    "Event Rates": "የዝግጅት ተመኖች",
    "Rates Description": "ለዚህ ሰራተኛ ብጁ ተመኖችን ይወስኑ። እነዚህ ዋጋዎች በደመወዝ ስሌት ወቅት ጥቅም ላይ ይውላሉ።",
    "Save Changes": "ለውጦችን አስቀምጥ",
    "Updating...": "በማዘመን ላይ...",
    "Delete Record": "መዝገብ ሰርዝ",
    "Delete Permanently": "በቋሚነት ሰርዝ",
    "Delete Warning": "ይህ ተግባር መዝገቡን ወደ ቆሻሻ መጣያ ያዛውረዋል። እርግጠኛ ነዎት?",
    "Failed to process image": "ፎቶውን ለማዘጋጀት አልተሳካም",
    "Department added!": "ክፍል በተሳካ ሁኔታ ታክሏል!",
    "Failed to add department": "ክፍል ማከል አልተሳካም",
    "Please fix the mistakes in the form": "እባክዎ በቅጹ ውስጥ ያሉትን ስህተቶች ያስተካክሉ"
  }
};

const employeeValidationSchema = z.object({
  full_name: z.string().min(1, "Full name is required"),
  employee_id: z.string().min(1, "Employee ID is required"),
  phone: z.string().refine((val) => {
    const ethioRegex = /^(?:\+251|0)[79]\d{8}$/;
    return ethioRegex.test(val.replace(/\s+/g, ""));
  }, "Invalid Ethiopian phone number. Use +251... or 09.../07..."),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
});

interface EditEmployeeSheetProps {
  employee: Employee;
  onClose: () => void;
}

type UpdateEmployeeResponse = Employee & {
  _warning?: string;
  _dropped_columns?: string[];
};

export default function EditEmployeeSheet({ employee, onClose }: EditEmployeeSheetProps) {
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const queryClient = useQueryClient();

  const [frontPreview, setFrontPreview] = useState<string | null>(employee.id_card_front_url);
  const [backPreview, setBackPreview] = useState<string | null>(employee.id_card_back_url);
  const [profilePreview, setProfilePreview] = useState<string | null>(employee.profile_photo_url || null);
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [formData, setFormData] = useState({
    full_name: employee.full_name,
    employee_id: employee.employee_id,
    department_id: employee.department_id || "",
    phone: employee.phone || "",
    email: employee.email || "",
    salary_level: employee.salary_level || "",
    office_id: employee.office_id || "",
  });
  const [eventPrices, setEventPrices] = useState<Record<string, number>>(employee.event_prices || {});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [newDepartment, setNewDepartment] = useState("");
  const [isAddingDepartment, setIsAddingDepartment] = useState(false);

  const { data: departments, refetch: refetchDepartments } = useQuery({
    queryKey: ["departments"],
    queryFn: () => getDepartments(),
  });


  const { data: stores } = useQuery({
    queryKey: ["stores"],
    queryFn: () => getStores(),
  });

  const { data: salaryLevels = [] } = useQuery<SalaryLevel[]>({
    queryKey: ["salary-levels"],
    queryFn: getSalaryLevels,
  });

  const { data: eventTypes = [] } = useQuery<EventType[]>({
    queryKey: ["event-types"],
    queryFn: getEventTypes,
  });

  const selectedSalaryLevel = salaryLevels.find((lvl) => lvl.level_name === formData.salary_level);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteEmployee(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Employee deleted successfully");
      onClose();
    },
    onError: () => {
      toast.error("Failed to delete employee");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (fd: FormData) => updateEmployee(employee.id, fd) as Promise<UpdateEmployeeResponse>,
    onSuccess: (updated) => {
      const dropped = updated?._dropped_columns ?? [];
      const skippedEventPrices = dropped.includes("event_prices") || updated?._warning?.includes("event_prices");

      if (skippedEventPrices) {
        toast.error("Employee saved, but event rates were not persisted. Please run DB migration for event_prices.");
        queryClient.invalidateQueries({ queryKey: ["employees"] });
        return;
      }

      queryClient.setQueriesData<EmployeesResponse>(
        { queryKey: ["employees"] },
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            employees: prev.employees.map((emp) =>
              emp.id === updated.id
                ? {
                    ...emp,
                    ...updated,
                    event_prices: updated.event_prices ?? {},
                  }
                : emp
            ),
          };
        }
      );

      toast.success("Employee updated!");
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      onClose();
    },
    onError: (err: AxiosError<{ error?: string; details?: string }>) => {
      const message = err.response?.data?.error || err.response?.data?.details || "Update failed";
      toast.error(message);
    },
  });

  const compressImage = async (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = document.createElement("img");
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject("Could not get context");

        let width = img.width;
        let height = img.height;
        const MAX_SIZE = 1200;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) return reject("Compression failed");
            const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", {
              type: "image/webp",
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          "image/webp",
          0.7
        );
      };
      img.onerror = (err) => reject(err);
    });
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>, side: "front" | "back" | "profile") => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await compressImage(file);
      if (side === "front") setFrontFile(compressed);
      else if (side === "back") setBackFile(compressed);
      else setProfileFile(compressed);

      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result;
        if (typeof result === "string") {
          if (side === "front") setFrontPreview(result);
          else if (side === "back") setBackPreview(result);
          else setProfilePreview(result);
        }
      };
      reader.readAsDataURL(compressed);
    } catch {
      toast.error(t("Failed to process image"));
    }
  };



  const handleAddDepartment = async () => {
    if (!newDepartment.trim()) return;
    try {
      const res = await createDepartment(newDepartment.trim());
      await refetchDepartments();
      setFormData(prev => ({ ...prev, department_id: res.id }));
      setNewDepartment("");
      setIsAddingDepartment(false);
      toast.success(t("Department added!"));
    } catch (err: unknown) {
      if (err instanceof AxiosError) {
        toast.error(err.response?.data?.error || t("Failed to add department"));
      } else {
        toast.error(t("Failed to add department"));
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Frontend validation
    const result = employeeValidationSchema.safeParse(formData);
    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        const field = issue.path[0] as string;
        errors[field] = issue.message;
      });
      setFormErrors(errors);
      toast.error(t("Please fix the mistakes in the form"));
      return;
    }
    setFormErrors({});

    const fd = new FormData();
    if (frontFile) fd.append("id_card_front", frontFile);
    if (backFile) fd.append("id_card_back", backFile);
    if (profileFile) fd.append("profile_photo", profileFile);

    fd.append("event_prices", JSON.stringify(eventPrices));

    Object.entries(formData).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        fd.append(key, value.toString());
      }
    });

    updateMutation.mutate(fd);
  };

  return (
    <>
      <ResponsiveDrawer
        isOpen={true}
        onClose={onClose}
        title={t("Edit Employee")}
        subtitle={`${t("Updating")} ${employee.full_name}`}
      >
        <form onSubmit={handleSubmit} className="space-y-6 pb-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            {/* Left Column: Profile & Contact */}
            <div className="space-y-6">
              {/* Profile & ID Cards Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Profile Photo */}
                <div className="sm:col-span-1 flex flex-col items-center justify-center gap-3 bg-card-alt/30 p-4 rounded-xl border border-border/50">
                  <div className="relative group">
                    <div 
                      className={`relative w-20 h-20 rounded-full border-4 border-dashed overflow-hidden flex items-center justify-center transition-all bg-card-alt ${
                        profilePreview ? "border-primary/30" : "border-border hover:border-primary/20"
                      }`}
                    >
                      {profilePreview ? (
                        <Image src={profilePreview} alt="Profile" fill className="object-cover" unoptimized />
                      ) : (
                        <HiUserPlus className="w-6 h-6 text-muted opacity-30" />
                      )}
                    </div>
                    
                    {profilePreview && (
                      <button
                        type="button"
                        onClick={() => { setProfilePreview(null); setProfileFile(null); }}
                        className="absolute -top-1 -right-1 w-7 h-7 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-black/70 shadow-lg"
                      >
                        <HiXMark className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*';
                        input.capture = 'user';
                        input.onchange = (e) => handleImageSelect(e as unknown as React.ChangeEvent<HTMLInputElement>, "profile");
                        input.click();
                      }}
                      className="px-2.5 py-1 bg-primary/10 text-primary text-[10px] font-semibold rounded-lg hover:bg-primary/20 transition-all whitespace-nowrap"
                    >
                      {t("New Photo")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*';
                        input.onchange = (e) => handleImageSelect(e as unknown as React.ChangeEvent<HTMLInputElement>, "profile");
                        input.click();
                      }}
                      className="px-2.5 py-1 bg-card-alt border border-border text-muted text-[10px] font-semibold rounded-lg hover:bg-border transition-all whitespace-nowrap"
                    >
                      {t("Upload")}
                    </button>
                  </div>
                </div>

                {/* ID Cards */}
                <div className="sm:col-span-2 grid grid-cols-2 gap-4 bg-card-alt/30 p-4 rounded-xl border border-border/50">
                  <div className="space-y-2 flex flex-col justify-between">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 px-1">{t("ID Front")}</label>
                    <div
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*';
                        input.onchange = (e) => handleImageSelect(e as unknown as React.ChangeEvent<HTMLInputElement>, "front");
                        input.click();
                      }}
                      className="relative aspect-[1.6/1] w-full rounded-lg border-2 border-dashed border-border overflow-hidden cursor-pointer bg-card-alt/50 hover:border-primary/30 transition-all flex-1 flex items-center justify-center min-h-[96px]"
                    >
                      {frontPreview ? (
                        <Image src={frontPreview} alt="Front" fill className="object-cover" unoptimized />
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-1.5 opacity-30 text-center">
                          <HiIdentification className="w-6 h-6 text-muted" />
                          <span className="text-[9px] font-semibold">{t("Upload Front")}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 flex flex-col justify-between">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 px-1">{t("ID Back")}</label>
                    <div
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*';
                        input.onchange = (e) => handleImageSelect(e as unknown as React.ChangeEvent<HTMLInputElement>, "back");
                        input.click();
                      }}
                      className="relative aspect-[1.6/1] w-full rounded-lg border-2 border-dashed border-border overflow-hidden cursor-pointer bg-card-alt/50 hover:border-primary/30 transition-all flex-1 flex items-center justify-center min-h-[96px]"
                    >
                      {backPreview ? (
                        <Image src={backPreview} alt="Back" fill className="object-cover" unoptimized />
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-1.5 opacity-30 text-center">
                          <HiIdentification className="w-6 h-6 text-muted" />
                          <span className="text-[9px] font-semibold">{t("Upload Back")}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Name & ID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 mb-1.5 px-1">{t("Full Name *")}</label>
                  <input
                    type="text"
                    value={formData.full_name}
                    onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                    className={`w-full h-11 px-4 rounded-xl border bg-card-alt outline-none focus:ring-2 focus:ring-primary/20 transition-all text-sm ${
                      formErrors.full_name ? "border-red-500" : "border-border"
                    }`}
                  />
                  {formErrors.full_name && <p className="text-[10px] text-red-500 font-semibold px-1 mt-1">{formErrors.full_name}</p>}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 mb-1.5 px-1">{t("Employee ID *")}</label>
                  <input
                    type="text"
                    value={formData.employee_id}
                    onChange={(e) => setFormData({...formData, employee_id: e.target.value})}
                    className={`w-full h-11 px-4 rounded-xl border bg-card-alt outline-none focus:ring-2 focus:ring-primary/20 font-mono transition-all text-sm ${
                      formErrors.employee_id ? "border-red-500" : "border-border"
                    }`}
                  />
                  {formErrors.employee_id && <p className="text-[10px] text-red-500 font-semibold px-1 mt-1">{formErrors.employee_id}</p>}
                </div>
              </div>

              {/* Phone & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 mb-1.5 px-1">{t("Phone")}</label>
                  <div className="relative">
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value.replace(/[^\d+]/g, "")})}
                      className={`w-full h-11 px-4 rounded-xl border bg-card-alt text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all ${
                        formErrors.phone ? "border-red-500 pr-9" : "border-border"
                      }`}
                    />
                    {formErrors.phone && <HiExclamationCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />}
                  </div>
                  {formErrors.phone && <p className="text-[10px] text-red-500 font-semibold px-1 mt-1">{formErrors.phone}</p>}
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 mb-1.5 px-1">{t("Email")}</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className={`w-full h-11 px-4 rounded-xl border bg-card-alt text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all ${
                      formErrors.email ? "border-red-500" : "border-border"
                    }`}
                  />
                  {formErrors.email && <p className="text-[10px] text-red-500 font-semibold px-1 mt-1">{formErrors.email}</p>}
                </div>
              </div>
            </div>

            {/* Right Column: HR Metadata & Rates */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Department */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 mb-1.5 px-1">{t("Department")}</label>
                  <div className="flex gap-2">
                    {isAddingDepartment ? (
                      <div className="flex-1 flex gap-2">
                         <input
                          type="text"
                          autoFocus
                          value={newDepartment}
                          onChange={(e) => setNewDepartment(e.target.value)}
                          className="flex-1 h-11 px-4 rounded-xl border border-primary bg-card-alt text-sm outline-none"
                        />
                        <button type="button" onClick={handleAddDepartment} className="w-11 h-11 rounded-xl bg-primary text-on-primary hover:bg-primary-dark transition-all flex items-center justify-center shrink-0">
                          <HiPlus className="w-4.5 h-4.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <Select
                          options={departments?.map((d: { id: string; name: string }) => ({ id: d.id, label: d.name })) || []}
                          value={formData.department_id}
                          onChange={(val) => setFormData({...formData, department_id: val})}
                          placeholder={t("Select Department")}
                          className="flex-1"
                        />
                        <button type="button" onClick={() => setIsAddingDepartment(true)} className="w-11 h-11 rounded-xl bg-primary text-on-primary hover:bg-primary-dark transition-all flex items-center justify-center shrink-0 shadow-sm" title="Add Department">
                          <HiPlus className="w-4.5 h-4.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Office / Branch */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 mb-1.5 px-1">{t("Office / Branch")}</label>
                  <Select
                    options={stores?.map((s: { id: string; name: string }) => ({ id: s.id, label: s.name })) || []}
                    value={formData.office_id}
                    onChange={(val) => setFormData({...formData, office_id: val})}
                    placeholder={t("Select Office")}
                  />
                </div>
              </div>

              {/* Base Salary */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 mb-1.5 px-1">{t("Base Salary")}</label>
                <Select
                  options={salaryLevels.map((level) => ({
                    id: level.level_name,
                    label: `${level.level_name} - ETB ${Number(level.base_salary).toLocaleString()}`
                  }))}
                  value={formData.salary_level}
                  onChange={(val) => setFormData({...formData, salary_level: val})}
                  placeholder={t("Select Level")}
                />
                <p className="text-[10px] font-semibold text-muted-foreground/80 px-1 mt-1">
                  {selectedSalaryLevel
                    ? `${t("Base Salary Amount")}: ETB ${Number(selectedSalaryLevel.base_salary).toLocaleString()}`
                    : t("Select a salary level to view the amount")}
                </p>
              </div>

              {/* Event Rates */}
              <div className="pt-2 space-y-4">
                <div className="flex items-center gap-2 px-1">
                  <HiPlus className="w-4.5 h-4.5 text-primary/75" />
                  <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">{t("Event Rates")}</h3>
                </div>
                <p className="text-[10px] text-muted px-1 font-medium leading-relaxed">
                  {t("Rates Description")}
                </p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {eventTypes.map((et) => (
                    <div key={et.id} className="bg-card-alt p-3 py-2.5 rounded-xl border border-border flex flex-col gap-2 group hover:border-primary/30 transition-all">
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] text-foreground font-semibold uppercase tracking-wider truncate mr-2" title={et.event_name}>{et.event_name}</span>
                        <span className="text-[9px] text-muted/80 font-bold uppercase tracking-wider shrink-0">ETB</span>
                      </div>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={eventPrices[et.id] ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEventPrices(prev => {
                            const next = { ...prev };
                            if (val === "") {
                              delete next[et.id];
                            } else {
                              next[et.id] = Number(val);
                            }
                            return next;
                          });
                        }}
                        className="bg-background border border-border rounded-lg px-3 py-1.5 text-foreground text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted/50 no-spinner w-full"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex gap-3 mt-6">
            <Button
              type="submit"
              loading={updateMutation.isPending}
              className="flex-1 h-11 rounded-2xl bg-primary text-primary-foreground hover:bg-primary-dark active:scale-[0.98] transition-all"
            >
              {t("Save Changes")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={deleteMutation.isPending}
              onClick={() => setShowDeleteModal(true)}
              className="w-11 h-11 rounded-2xl flex items-center justify-center transition-all group shrink-0"
              title={t("Delete Permanently")}
            >
              <HiTrash className="w-5 h-5 group-hover:scale-105 transition-transform" />
            </Button>
          </div>
        </form>
      </ResponsiveDrawer>

      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={() => deleteMutation.mutate(employee.id)}
        isDeleting={deleteMutation.isPending}
        title={t("Delete Record")}
        message={t("Delete Warning")}
        itemName={employee.full_name}
      />
    </>
  );
}
