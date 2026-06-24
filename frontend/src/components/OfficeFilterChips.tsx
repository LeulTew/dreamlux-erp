"use client";
import { Store } from "@/lib/types";
import Select from "./ui/Select";

export default function OfficeFilterChips({
  offices,
  selected,
  onChange,
}: {
  offices: Store[];
  selected: string;
  onChange: (officeId: string) => void;
}) {
  return (
    <div className="flex flex-col md:flex-row gap-3 md:gap-2 w-full md:w-auto md:flex-wrap items-stretch md:items-center">
      {/* Mobile view: Dropdown + Add button */}
      <div className="flex md:hidden gap-2 w-full">
        <Select
          options={[
            { id: "all", label: "All Offices" },
            ...offices.map((office) => ({ id: office.id, label: office.name }))
          ]}
          value={selected}
          onChange={(val) => onChange(val)}
          className="flex-1"
        />
      </div>

      {/* Desktop view: Chips + Add button */}
      <div className="hidden md:flex flex-wrap gap-2 items-center">
        <button
          onClick={() => onChange("all")}
          className={`h-10 px-4 rounded-xl text-xs uppercase font-extrabold tracking-wider transition-all duration-300 ${
            selected === "all"
              ? "bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white shadow-md shadow-amber-500/10 hover:scale-[1.02] active:scale-[0.97]"
              : "bg-card-alt text-muted hover:text-foreground hover:bg-border/50"
          }`}
        >
          All Offices
        </button>
        {offices.map((office) => (
          <button
            key={office.id}
            onClick={() => onChange(office.id)}
            className={`h-10 px-4 rounded-xl text-xs uppercase font-extrabold tracking-wider transition-all duration-300 ${
              selected === office.id
                ? "bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white shadow-md shadow-amber-500/10 hover:scale-[1.02] active:scale-[0.97]"
                : "bg-card-alt text-muted hover:text-foreground hover:bg-border/50"
            }`}
          >
            {office.name}
          </button>
        ))}
      </div>
    </div>
  );
}
