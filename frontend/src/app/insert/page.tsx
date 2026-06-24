"use client";
import { useState, useCallback, useEffect } from "react";
import { AxiosError } from "axios";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { createEmployee, getNextEmployeeId, getDepartments, createDepartment, getStores, getSalaryLevels, getEventTypes } from "@/lib/api";
import AuthLayout from "@/components/AuthLayout";
import { notify } from "@/lib/toast";
import { HiXMark, HiUserPlus, HiIdentification, HiPlus, HiExclamationCircle, HiCheck } from "react-icons/hi2";
import { z } from "zod";
import { SalaryLevel, EventType } from "@/lib/types";
import Select from "@/components/ui/Select";
import { useLanguage } from "@/hooks/use-language";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Add Employee": "Add Employee",
    "Create a new employee record": "Create a new employee record",
    "Take Photo": "Take Photo",
    "Upload File": "Upload File",
    "Employee Photo (Optional)": "Employee Photo (Optional)",
    "ID Card Front *": "ID Card Front *",
    "Front View": "Front View",
    "Take Pic": "Take Pic",
    "Upload": "Upload",
    "ID Card Back *": "ID Card Back *",
    "Back View": "Back View",
    "Full Name *": "Full Name *",
    "Employee ID *": "Employee ID *",
    "Department (Optional)": "Department (Optional)",
    "Select Department": "Select Department",
    "Office / Branch (Optional)": "Office / Branch (Optional)",
    "Select Office": "Select Office",
    "Phone *": "Phone *",
    "Email (Optional)": "Email (Optional)",
    "Base Salary": "Base Salary",
    "Select Level": "Select Level",
    "Base Salary Amount": "Base Salary Amount",
    "Select a salary level to view the amount": "Select a salary level to view the amount.",
    "Event Rates": "Event Rates",
    "Rates Description": "Define the specific rates for each event type for this employee. These will be used for automated payroll calculations.",
    "Create Employee Record": "Create Employee Record",
    "Saving...": "Saving...",
    "Please fix the errors in the form": "Please fix the errors in the form",
    "New department": "New department",
    "Add": "Add",
    "Employee created successfully!": "Employee created successfully!",
    "Failed to create employee": "Failed to create employee",
    "Failed to add department": "Failed to add department",
    "Department added!": "Department added!",
    "Take Picture": "Take Picture",
    "Phone Error Hint": "Invalid phone number",
    "Phone Hint": "e.g. 0911...",
    "Full Name Placeholder": "e.g. John Doe",
    "Employee ID Placeholder": "e.g. EMP-001"
  },
  am: {
    "Add Employee": "ሰራተኛ መዝግብ",
    "Create a new employee record": "አዲስ የሰራተኛ መዝገብ ይፍጠሩ",
    "Take Photo": "ፎቶ አንሳ",
    "Upload File": "ፋይል ጫን",
    "Employee Photo (Optional)": "የሰራተኛው ፎቶ (ከተፈለገ)",
    "ID Card Front *": "የመታወቂያው የፊት ገጽ *",
    "Front View": "የፊት ገጽታ",
    "Take Pic": "ፎቶ አንሳ",
    "Upload": "ጫን",
    "ID Card Back *": "የመታወቂያው የጀርባ ገጽ *",
    "Back View": "የጀርባ ገጽታ",
    "Full Name *": "ሙሉ ስም *",
    "Employee ID *": "የሰራተኛው መለያ ቁጥር *",
    "Department (Optional)": "የስራ ክፍል (ከተፈለገ)",
    "Select Department": "ክፍል ይምረጡ",
    "Office / Branch (Optional)": "ቢሮ / ቅርንጫፍ (ከተፈለገ)",
    "Select Office": "ቢሮ ይምረጡ",
    "Phone *": "ስልክ ቁጥር *",
    "Email (Optional)": "ኢሜይል (ከተፈለገ)",
    "Base Salary": "መሰረታዊ ደመወዝ",
    "Select Level": "ደረጃ ይምረጡ",
    "Base Salary Amount": "የመሰረታዊ ደመወዝ መጠን",
    "Select a salary level to view the amount": "መጠኑን ለማየት እባክዎ የደመወዝ ደረጃ ይምረጡ።",
    "Event Rates": "የዝግጅት ተመኖች",
    "Rates Description": "ለዚህ ሰራተኛ ለእያንዳንዱ የዝግጅት አይነት ተመን ይወስኑ። እነዚህ ዋጋዎች በደመወዝ ክፍያ ጊዜ በራስ-ሰር ጥቅም ላይ ይውላሉ።",
    "Create Employee Record": "የሰራተኛ መዝገብ ፍጠር",
    "Saving...": "በማስቀመጥ ላይ...",
    "Please fix the errors in the form": "እባክዎ በቅጹ ላይ ያሉትን ስህተቶች ያስተካክሉ",
    "New department": "አዲስ የስራ ክፍል",
    "Add": "ጨምር",
    "Employee created successfully!": "የሰራተኛው መዝገብ በተሳካ ሁኔታ ተፈጥሯል!",
    "Failed to create employee": "የሰራተኛውን መዝገብ መፍጠር አልተሳካም",
    "Failed to add department": "ስራ ክፍል ማከል አልተሳካም",
    "Department added!": "ስራ ክፍል ታክሏል!",
    "Take Picture": "ፎቶ አንሳ",
    "Phone Error Hint": "የስልክ ቁጥሩ ትክክል አይደለም",
    "Phone Hint": "ምሳሌ 0911...",
    "Full Name Placeholder": "ምሳሌ፡ ዮሐንስ አበበ",
    "Employee ID Placeholder": "ምሳሌ፡ EMP-001"
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

export default function InsertEmployeePage() {
  const queryClient = useQueryClient();
  const { lang } = useLanguage();
  const t = useCallback((key: string) => TRANSLATIONS[lang]?.[key] || key, [lang]);

  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [backPreview, setBackPreview] = useState<string | null>(null);
  const [profilePreview, setProfilePreview] = useState<string | null>(null);
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [profileFile, setProfileFile] = useState<File | null>(null);

  const [formData, setFormData] = useState({
    full_name: "",
    employee_id: "",
    department_id: "",
    phone: "",
    email: "",
    salary_level: "",
    office_id: "",
  });
  const [eventPrices, setEventPrices] = useState<Record<string, number>>({});
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

  const { data: nextIdData } = useQuery({
    queryKey: ["nextEmployeeId"],
    queryFn: () => getNextEmployeeId(),
  });

  // Synchronize next employee ID to form state once fetched
  useEffect(() => {
    if (nextIdData?.nextId && !formData.employee_id) {
      queueMicrotask(() => {
        setFormData((prev) => ({ ...prev, employee_id: nextIdData.nextId }));
      });
    }
  }, [nextIdData, formData.employee_id]);

  const createMutation = useMutation({
    mutationFn: (fd: FormData) => createEmployee(fd),
    onSuccess: () => {
      notify.success(t("Employee created successfully!"));
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      resetForm();
    },
    onError: (err: AxiosError<{ error: string }>) => {
      notify.error(t("Failed to create employee"), err.response?.data?.error);
    },
  });

  const resetForm = () => {
    setFrontPreview(null);
    setBackPreview(null);
    setProfilePreview(null);
    setFrontFile(null);
    setBackFile(null);
    setProfileFile(null);
    setFormData({
      full_name: "",
      employee_id: "",
      department_id: "",
      phone: "",
      email: "",
      salary_level: "",
      office_id: "",
    });
    queryClient.invalidateQueries({ queryKey: ["nextEmployeeId"] });
  };

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

  const handleImageSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>, side: "front" | "back" | "profile") => {
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
        notify.error(t("Failed to process image"));
      }
    },
    [t],
  );

  const handleAddDepartment = async () => {
    if (!newDepartment.trim()) return;
    try {
      const res = await createDepartment(newDepartment.trim());
      await refetchDepartments();
      setFormData(prev => ({ ...prev, department_id: res.id }));
      setNewDepartment("");
      setIsAddingDepartment(false);
      notify.success(t("Department added!"));
    } catch (err: unknown) {
      if (err instanceof AxiosError) {
        notify.error(t("Failed to add department"), err.response?.data?.error);
      } else {
        notify.error(t("Failed to add department"));
      }
    }
  };

  const handlePhoneChange = (val: string) => {
    const clean = val.replace(/[^\d+]/g, "");
    setFormData({ ...formData, phone: clean });

    const ethioRegex = /^(?:\+251|0)[79]\d{8}$/;
    if (clean && !ethioRegex.test(clean.replace(/\s+/g, ""))) {
      setFormErrors(prev => ({ ...prev, phone: t("Phone Error Hint") }));
    } else {
      setFormErrors(prev => {
        const next = { ...prev };
        delete next.phone;
        return next;
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const result = employeeValidationSchema.safeParse(formData);
    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        const field = issue.path[0] as string;
        errors[field] = issue.message;
      });
      setFormErrors(errors);
      notify.error(t("Please fix the errors in the form"));
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

    createMutation.mutate(fd);
  };

  return (
    <AuthLayout>
      <div className="max-w-2xl mx-auto pb-12">
        <header className="flex items-center justify-between mb-8">
           <div className="flex items-center gap-3">
             <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-white shadow-premium">
               <HiUserPlus className="w-6 h-6" />
             </div>
             <div>
               <h1 className="text-2xl font-black text-foreground tracking-tight">{t("Add Employee")}</h1>
               <p className="text-sm text-muted font-medium">{t("Create a new employee record")}</p>
             </div>
           </div>
        </header>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Profile Photo */}
          <div className="flex flex-col items-center gap-4">
             <div className="relative group">
                <div
                  className={`w-32 h-32 rounded-full border-4 border-dashed overflow-hidden flex items-center justify-center transition-all bg-card-alt ${
                    profilePreview ? "border-primary/50" : "border-border hover:border-primary/30"
                  }`}
                >
                  {profilePreview ? (
                    <Image src={profilePreview} alt="Profile" fill className="object-cover" unoptimized />
                  ) : (
                    <HiUserPlus className="w-10 h-10 text-muted opacity-30" />
                  )}
                </div>

                {profilePreview && (
                  <button
                    type="button"
                    onClick={() => { setProfilePreview(null); setProfileFile(null); }}
                    className="absolute -top-1 -right-1 w-8 h-8 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-black/70 shadow-premium"
                  >
                    <HiXMark className="w-5 h-5" />
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
                  className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-all"
                >
                  {t("Take Photo")}
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
                  className="px-3 py-1.5 rounded-lg bg-card-alt border border-border text-muted text-xs font-bold hover:bg-border transition-all"
                >
                  {t("Upload File")}
                </button>
             </div>
             <p className="text-[10px] uppercase font-bold text-muted tracking-widest">{t("Employee Photo (Optional)")}</p>
          </div>

          {/* ID Card Images */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Front */}
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-muted px-1 flex justify-between">
                 <span>{t("ID Card Front *")}</span>
              </label>
              <div
                className={`relative aspect-[1.6/1] rounded-3xl border-2 border-dashed transition-all flex flex-col items-center justify-center overflow-hidden bg-card-alt ${
                  frontPreview ? "border-primary/50 bg-card" : "border-border hover:border-primary/30"
                }`}
              >
                {frontPreview ? (
                  <>
                    <Image src={frontPreview} alt="Front" fill className="object-cover" unoptimized />
                    <button
                      type="button"
                      onClick={() => { setFrontPreview(null); setFrontFile(null); }}
                      className="absolute top-3 right-3 w-8 h-8 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-black/70"
                    >
                      <HiXMark className="w-5 h-5" />
                    </button>
                  </>
                ) : (
                  <div className="text-center p-4">
                    <HiIdentification className="w-10 h-10 text-muted mx-auto mb-2 opacity-30" />
                    <p className="text-xs font-bold text-muted/50 uppercase tracking-widest">{t("Front View")}</p>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                 <button
                   type="button"
                   onClick={() => {
                     const input = document.createElement('input');
                     input.type = 'file';
                     input.accept = 'image/*';
                     input.capture = 'environment';
                     input.onchange = (e) => handleImageSelect(e as unknown as React.ChangeEvent<HTMLInputElement>, "front");
                     input.click();
                   }}
                   className="flex-1 px-3 py-2 rounded-xl bg-card border border-border text-foreground text-xs font-bold hover:bg-border transition-all flex items-center justify-center gap-2"
                 >
                   {t("Take Pic")}
                 </button>
                 <button
                   type="button"
                   onClick={() => {
                     const input = document.createElement('input');
                     input.type = 'file';
                     input.accept = 'image/*';
                     input.onchange = (e) => handleImageSelect(e as unknown as React.ChangeEvent<HTMLInputElement>, "front");
                     input.click();
                   }}
                   className="flex-1 px-3 py-2 rounded-xl bg-card border border-border text-foreground text-xs font-bold hover:bg-border transition-all flex items-center justify-center gap-2"
                 >
                   {t("Upload")}
                 </button>
              </div>
            </div>

            {/* Back */}
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-muted px-1 flex justify-between">
                 <span>{t("ID Card Back *")}</span>
              </label>
              <div
                className={`relative aspect-[1.6/1] rounded-3xl border-2 border-dashed transition-all flex flex-col items-center justify-center overflow-hidden bg-card-alt ${
                  backPreview ? "border-primary/50 bg-card" : "border-border hover:border-primary/30"
                }`}
              >
                {backPreview ? (
                  <>
                    <Image src={backPreview} alt="Back" fill className="object-cover" unoptimized />
                    <button
                      type="button"
                      onClick={() => { setBackPreview(null); setBackFile(null); }}
                      className="absolute top-3 right-3 w-8 h-8 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-black/70"
                    >
                      <HiXMark className="w-5 h-5" />
                    </button>
                  </>
                ) : (
                  <div className="text-center p-4">
                    <HiIdentification className="w-10 h-10 text-muted mx-auto mb-2 opacity-30" />
                    <p className="text-xs font-bold text-muted/50 uppercase tracking-widest">{t("Back View")}</p>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                 <button
                   type="button"
                   onClick={() => {
                     const input = document.createElement('input');
                     input.type = 'file';
                     input.accept = 'image/*';
                     input.capture = 'environment';
                     input.onchange = (e) => handleImageSelect(e as unknown as React.ChangeEvent<HTMLInputElement>, "back");
                     input.click();
                   }}
                   className="flex-1 px-3 py-2 rounded-xl bg-card border border-border text-foreground text-xs font-bold hover:bg-border transition-all flex items-center justify-center gap-2"
                 >
                   {t("Take Pic")}
                 </button>
                 <button
                   type="button"
                   onClick={() => {
                     const input = document.createElement('input');
                     input.type = 'file';
                     input.accept = 'image/*';
                     input.onchange = (e) => handleImageSelect(e as unknown as React.ChangeEvent<HTMLInputElement>, "back");
                     input.click();
                   }}
                   className="flex-1 px-3 py-2 rounded-xl bg-card border border-border text-foreground text-xs font-bold hover:bg-border transition-all flex items-center justify-center gap-2"
                 >
                   {t("Upload")}
                 </button>
              </div>
            </div>
          </div>

          {/* Basic Info */}
          <div className="bg-card rounded-3xl border border-border p-6 shadow-sm space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-muted tracking-tight px-1">{t("Full Name *")}</label>
                <input
                  type="text"
                  required
                  value={formData.full_name}
                  onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                  placeholder={t("Full Name Placeholder")}
                  className={`w-full px-4 py-3 rounded-xl border bg-card-alt text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all ${
                    formErrors.full_name ? "border-red-500" : "border-border"
                  }`}
                />
                {formErrors.full_name && <p className="text-[10px] text-red-500 font-bold px-1">{formErrors.full_name}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-muted tracking-tight px-1">{t("Employee ID *")}</label>
                <input
                  type="text"
                  required
                  value={formData.employee_id}
                  onChange={(e) => setFormData({...formData, employee_id: e.target.value})}
                  placeholder={t("Employee ID Placeholder")}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-card-alt text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-muted tracking-tight px-1">{t("Department (Optional)")}</label>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Select
                      options={departments?.map((d: { id: string; name: string }) => ({ id: d.id, label: d.name })) || []}
                      value={formData.department_id}
                      onChange={(val) => setFormData({...formData, department_id: val})}
                      placeholder={t("Select Department")}
                      className="flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => setIsAddingDepartment(!isAddingDepartment)}
                      className={`w-11 h-11 rounded-xl transition-all flex items-center justify-center shrink-0 shadow-premium ${
                        isAddingDepartment
                          ? "bg-secondary text-foreground border border-border/80 hover:bg-secondary/60 rotate-45"
                          : "bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
                      }`}
                      title={isAddingDepartment ? t("Cancel") : t("Add Department")}
                    >
                      <HiPlus className="w-5 h-5 transition-transform duration-300" />
                    </button>
                  </div>

                  {isAddingDepartment && (
                    <div className="flex gap-2 p-2 bg-card-alt/55 border border-border/30 rounded-xl animate-in slide-in-from-top-2 duration-200">
                      <input
                        type="text"
                        autoFocus
                        placeholder={t("New Department Name")}
                        value={newDepartment}
                        onChange={(e) => setNewDepartment(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddDepartment();
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            setIsAddingDepartment(false);
                            setNewDepartment("");
                          }
                        }}
                        className="flex-1 h-9 px-3 rounded-lg border border-border bg-card text-xs outline-none text-foreground focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/60"
                      />
                      <button
                        type="button"
                        onClick={handleAddDepartment}
                        className="px-3 h-9 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 transition-all flex items-center justify-center gap-1 shadow-sm text-xs font-semibold shrink-0"
                      >
                        <HiCheck className="w-4 h-4" />
                        {t("Add")}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-muted tracking-tight px-1">{t("Office / Branch (Optional)")}</label>
                <Select
                  options={stores?.map((s: { id: string; name: string }) => ({ id: s.id, label: s.name })) || []}
                  value={formData.office_id}
                  onChange={(val) => setFormData({...formData, office_id: val})}
                  placeholder={t("Select Office")}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-muted tracking-tight px-1 flex justify-between">
                  <span>{t("Phone *")}</span>
                  <span className="text-[10px] normal-case opacity-60">{t("Phone Hint")}</span>
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    placeholder="09... or +251..."
                    className={`w-full px-4 py-3 rounded-xl border bg-card-alt text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all ${
                      formErrors.phone ? "border-red-500 pr-10" : "border-border"
                    }`}
                  />
                  {formErrors.phone && <HiExclamationCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-red-500" />}
                </div>
                {formErrors.phone && <p className="text-[10px] text-red-500 font-bold px-1">{formErrors.phone}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-tight px-1 text-muted opacity-60 italic">{t("Email (Optional)")}</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  placeholder="john@example.com"
                  className={`w-full px-4 py-3 rounded-xl border bg-card-alt text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all ${
                    formErrors.email ? "border-red-500" : "border-border"
                  }`}
                />
                {formErrors.email && <p className="text-[10px] text-red-500 font-bold px-1">{formErrors.email}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-muted tracking-tight px-1">{t("Base Salary")}</label>
                <Select
                  options={salaryLevels.map((level) => ({
                    id: level.level_name,
                    label: `${level.level_name} - ETB ${Number(level.base_salary).toLocaleString()}`
                  }))}
                  value={formData.salary_level}
                  onChange={(val) => setFormData({...formData, salary_level: val})}
                  placeholder={t("Select Level")}
                />
                <p className="text-[10px] font-bold text-muted px-1">
                  {selectedSalaryLevel
                    ? `${t("Base Salary Amount")}: ETB ${Number(selectedSalaryLevel.base_salary).toLocaleString()}`
                    : t("Select a salary level to view the amount")}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-3xl border border-border p-6 shadow-sm space-y-6">
            <div className="flex items-center gap-2 px-1">
              <HiPlus className="w-5 h-5 text-primary" />
              <h3 className="text-sm font-black uppercase tracking-widest text-foreground">{t("Event Rates")}</h3>
            </div>
            <p className="text-[10px] text-muted px-1 font-medium leading-relaxed">
              {t("Rates Description")}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {eventTypes.map((et) => (
                <div key={et.id} className="bg-card-alt p-4 rounded-2xl border border-border flex flex-col gap-2.5 group hover:border-primary/30 transition-all shadow-premium-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] text-foreground font-bold uppercase tracking-wider truncate mr-2" title={et.event_name}>{et.event_name}</span>
                    <span className="text-[9px] text-muted font-black uppercase tracking-tight shrink-0">ETB</span>
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
                    className="bg-background border border-border rounded-xl px-3 py-2 text-foreground text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all placeholder:text-muted/60 no-spinner w-full"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-center pt-4">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="w-full max-w-xs py-3 rounded-2xl bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 font-black uppercase tracking-[0.15em] text-xs shadow-premium hover:scale-[1.01] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {createMutation.isPending ? t("Saving...") : t("Create Employee Record")}
            </button>
          </div>
        </form>
      </div>
    </AuthLayout>
  );
}
