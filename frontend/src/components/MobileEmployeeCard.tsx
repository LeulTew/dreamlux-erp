import { Employee } from "@/lib/types";
import { HiIdentification, HiPhone, HiTrash, HiPencilSquare, HiArrowUturnLeft, HiCheckCircle } from "react-icons/hi2";
import Image from "next/image";
import { DeleteButton } from "@/components/ui/DeleteButton";

interface MobileEmployeeCardProps {
  employee: Employee;
  onTap?: (employee: Employee) => void;
  editMode?: boolean;
  onUpdate?: (id: string, field: string, value: string) => void;
  onDelete?: (employee: Employee) => void;
  showTrash?: boolean;
  onRestore?: (employee: Employee) => void;
  selected?: boolean;
  onSelect?: (id: string) => void;
  selectMode?: boolean;
}

export default function MobileEmployeeCard({ 
  employee, 
  onTap, 
  editMode, 
  onUpdate,
  onDelete,
  showTrash,
  onRestore,
  selected,
  onSelect,
  selectMode,
}: MobileEmployeeCardProps) {
  return (
    <div
      onClick={() => {
        if (showTrash && selectMode) { onSelect?.(employee.id); return; }
        if (!editMode && !showTrash) onTap?.(employee);
      }}
      className={`bg-card rounded-xl border-none p-5 shadow-premium transition-all ${
        selected ? "ring-2 ring-primary" : ""
      } ${
        (editMode || showTrash) && !selectMode ? "" : "active:scale-[0.98] cursor-pointer"
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          {employee.profile_photo_url ? (
            <Image
              src={employee.profile_photo_url}
              alt={employee.full_name}
              width={48}
              height={48}
              className="w-full h-full object-cover rounded-lg"
              unoptimized
            />
          ) : (
            <HiIdentification className="w-6 h-6 text-primary" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="space-y-2">
            {editMode ? (
              <div className="space-y-2">
                <div className="relative">
                  <input
                    type="text"
                    defaultValue={employee.full_name}
                    onChange={(e) => onUpdate?.(employee.id, "full_name", e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-semibold"
                    placeholder="Full Name"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <HiPencilSquare className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted/30" />
                </div>
                <div className="relative">
                  <input
                    type="text"
                    defaultValue={employee.employee_id}
                    onChange={(e) => onUpdate?.(employee.id, "employee_id", e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-foreground text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="ID"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <HiIdentification className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted/30" />
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold text-foreground truncate">{employee.full_name}</h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-light text-foreground shrink-0">
                    {employee.employee_id}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                  {employee.department && (
                    <span className="flex items-center gap-1 text-foreground">
                      {employee.department}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
          
          <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3">
             {showTrash ? (
               <div className="flex items-center gap-2 w-full">
                 {/* Checkbox in select mode */}
                 {selectMode && onSelect && (
                   <button
                     onClick={(e) => { e.stopPropagation(); onSelect(employee.id); }}
                     className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                       selected ? "bg-primary border-primary text-on-primary" : "border-border bg-card-alt"
                     }`}
                   >
                     {selected && <HiCheckCircle className="w-4 h-4" />}
                   </button>
                 )}
                 {/* Restore */}
                 <button
                   onClick={(e) => { e.stopPropagation(); onRestore?.(employee); }}
                   className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-all flex-1 justify-center"
                 >
                   <HiArrowUturnLeft className="w-3.5 h-3.5" />
                   Restore
                 </button>
                 {/* Single delete — only when not in select mode */}
                 {!selectMode && (
                   <DeleteButton
                      onClick={(e) => { e.stopPropagation(); onDelete?.(employee); }}
                      tooltipText="Delete permanently"
                      iconSize={16}
                    />
                 )}
               </div>
             ) : editMode ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete?.(employee);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-all shadow-md group"
                >
                  <HiTrash className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                  Move to Trash
                </button>
             ) : (
                <>
                  <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                    {employee.phone && (
                      <span className="flex items-center gap-1">
                        <HiPhone className="w-3 h-3" /> {employee.phone}
                      </span>
                    )}
                     {employee.salary_level && (
                      <div className="flex items-center gap-1 bg-accent/10 px-1.5 py-0.5 rounded shrink min-w-0">
                        <span className="text-accent-dark font-bold tracking-wider text-[10px] whitespace-nowrap">
                          {employee.salary_level}
                        </span>
                        {employee.base_salary ? (
                          <span className="text-[9px] text-accent-dark/80 font-semibold whitespace-nowrap truncate">
                            ({employee.base_salary.toLocaleString()})
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 ml-auto">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onTap?.(employee);
                      }}
                      className="p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-all active:scale-95 shadow-lg shadow-indigo-500/10"
                    >
                      <HiPencilSquare className="w-4 h-4" />
                    </button>
                    <DeleteButton
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete?.(employee);
                      }}
                      tooltipText="Move to Trash"
                      iconSize={16}
                    />
                  </div>
                </>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}
