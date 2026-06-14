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
          className={`px-5 py-2.5 rounded-2xl text-[10px] uppercase font-black tracking-[0.15em] transition-all shadow-sm ${
            selected === "all"
              ? "bg-primary text-on-primary shadow-premium"
              : "bg-card-alt text-muted hover:text-foreground hover:bg-border"
          }`}
        >
          All Offices
        </button>
        {offices.map((office) => (
          <button
            key={office.id}
            onClick={() => onChange(office.id)}
            className={`px-5 py-2.5 rounded-2xl text-[10px] uppercase font-black tracking-[0.15em] transition-all shadow-sm ${
              selected === office.id
                ? "bg-primary text-on-primary shadow-premium"
                : "bg-card-alt text-muted hover:text-foreground hover:bg-border"
            }`}
          >
            {office.name}
          </button>
        ))}
      </div>
    </div>
  );
}
