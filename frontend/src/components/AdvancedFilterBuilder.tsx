"use client";
import { useState } from "react";
import { HiPlus, HiXMark, HiAdjustmentsHorizontal } from "react-icons/hi2";
import { motion, AnimatePresence } from "framer-motion";
import Select from "./ui/Select";

export type FilterOperator = "equals" | "not_equals" | "contains" | "greater_than" | "less_than";

export interface FilterRule {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
}

interface AdvancedFilterBuilderProps {
  fields: { key: string; label: string; type: "string" | "number" | "date" }[];
  rules: FilterRule[];
  onChange: (rules: FilterRule[]) => void;
}

export default function AdvancedFilterBuilder({ fields, rules, onChange }: AdvancedFilterBuilderProps) {
  const [isOpen, setIsOpen] = useState(false);

  const addRule = () => {
    const newRule: FilterRule = {
      id: Math.random().toString(36).substr(2, 9),
      field: fields[0]?.key || "",
      operator: "contains",
      value: "",
    };
    onChange([...rules, newRule]);
    setIsOpen(true);
  };

  const updateRule = (id: string, updates: Partial<FilterRule>) => {
    onChange(rules.map((rule) => (rule.id === id ? { ...rule, ...updates } : rule)));
  };

  const removeRule = (id: string) => {
    onChange(rules.filter((rule) => rule.id !== id));
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex items-center justify-between px-2">
        <div className="flex gap-3 items-center flex-wrap">
          <HiAdjustmentsHorizontal className="w-5 h-5 text-primary/40" />
          {rules.length === 0 ? (
            <span className="text-muted-foreground font-semibold text-xs tracking-wider opacity-60">No filters active</span>
          ) : (
            <div className="flex gap-2 items-center">
              <span className="text-xs font-semibold text-primary uppercase tracking-wider bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
                {rules.length} Rules Applied
              </span>
            </div>
          )}
        </div>
        <button
          onClick={() => (rules.length === 0 ? addRule() : setIsOpen(!isOpen))}
          className="h-10 px-4 text-xs font-semibold uppercase tracking-wider text-primary bg-primary/10 hover:bg-primary/20 hover:scale-105 active:scale-[0.98] rounded-lg transition-all shadow-sm border border-primary/10"
        >
          {isOpen ? "Close Filters" : rules.length === 0 ? "Filter List" : "Edit Filters"}
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ 
                opacity: 0,
                scale: (typeof window !== 'undefined' && window.innerWidth >= 768) ? 0.95 : 1,
                x: "-50%",
                y: (typeof window !== 'undefined' && window.innerWidth >= 768) ? "-50%" : "100%"
              }}
              animate={{ 
                opacity: 1, 
                scale: 1,
                x: "-50%",
                y: (typeof window !== 'undefined' && window.innerWidth >= 768) ? "-50%" : 0
              }}
              exit={{ 
                opacity: 0,
                scale: (typeof window !== 'undefined' && window.innerWidth >= 768) ? 0.95 : 1,
                x: "-50%",
                y: (typeof window !== 'undefined' && window.innerWidth >= 768) ? "-50%" : "100%"
              }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="absolute bottom-0 md:bottom-auto left-1/2 md:top-1/2 w-full md:max-w-5xl bg-card rounded-t-xl md:rounded-xl max-h-[90vh] md:max-h-[min(90vh,900px)] overflow-y-auto border border-border/60 shadow-massive pb-10 md:pb-0"
            >
              <div className="bg-card p-6 md:p-8 rounded-xl border border-border/60 shadow-inner flex flex-col gap-4 mb-4 relative">
                <div className="absolute inset-0 bg-primary/1 pointer-events-none rounded-xl" />
                
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-bold uppercase text-primary tracking-wider">Filter System</h2>
                  <button 
                    onClick={() => setIsOpen(false)}
                    className="p-2 rounded-xl bg-card-alt text-muted hover:text-foreground transition-all"
                  >
                    <HiXMark className="w-5 h-5" />
                  </button>
                </div>

                {rules.length === 0 && (
                  <div className="py-10 text-center flex flex-col items-center gap-3">
                     <div className="w-12 h-12 rounded-full border-2 border-dashed border-border flex items-center justify-center text-muted-foreground/30 font-bold text-xs">0</div>
                     <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider leading-relaxed">No logic rules defined yet.<br/>Use the button below to start.</p>
                  </div>
                )}

                {rules.map((rule) => (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    key={rule.id} 
                    className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full bg-card-alt p-3 rounded-xl border border-border/50 group hover:border-primary/30 transition-all"
                  >
                    <Select
                      options={fields.map((f) => ({ id: f.key, label: f.label }))}
                      value={rule.field}
                      onChange={(val) => updateRule(rule.id, { field: val })}
                      className="flex-1"
                    />

                    <Select
                      options={[
                        { id: "contains", label: "Contains" },
                        { id: "equals", label: "Exact Match" },
                        { id: "not_equals", label: "Does Not Equal" },
                        { id: "greater_than", label: "More Than" },
                        { id: "less_than", label: "Less Than" },
                      ]}
                      value={rule.operator}
                      onChange={(val) => updateRule(rule.id, { operator: val as FilterOperator })}
                      className="w-full sm:w-48"
                    />

                    <input
                      type="text"
                      value={rule.value}
                      onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                      placeholder="Search query..."
                      className="flex-2 px-4 h-11 rounded-xl text-sm font-semibold border border-border/50 bg-card text-foreground shadow-sm focus:ring-4 focus:ring-primary/10 transition-all outline-none placeholder:text-muted-foreground/30 placeholder:uppercase placeholder:text-[9px] placeholder:tracking-widest"
                    />

                    <button
                      onClick={() => removeRule(rule.id)}
                      className="w-11 h-11 flex items-center justify-center shrink-0 rounded-xl bg-danger/10 text-danger hover:bg-danger hover:text-on-danger transition-all self-end sm:self-auto shadow-sm active:scale-[0.98]"
                    >
                      <HiXMark className="w-5 h-5" />
                    </button>
                  </motion.div>
                ))}

                <button
                  onClick={addRule}
                  className="mt-4 flex items-center justify-center gap-3 h-11 border-2 border-dashed border-primary/20 rounded-xl text-primary font-semibold text-sm hover:border-primary/40 hover:bg-primary/2 hover:scale-[1.01] active:scale-[0.98] transition-all w-full shadow-sm"
                >
                  <HiPlus className="w-5 h-5" /> New Filtering Rule
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}