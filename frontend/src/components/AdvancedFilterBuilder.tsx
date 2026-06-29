"use client";
import { useState } from "react";
import { HiPlus, HiXMark, HiAdjustmentsHorizontal, HiTrash } from "react-icons/hi2";
import { motion, AnimatePresence } from "framer-motion";
import toast from "@/lib/toast";
import Select from "./ui/Select";

export type FilterOperator = "contains" | "equals" | "not_equals" | "greater_than" | "less_than" | "between";

export interface FilterRule {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
}

interface AdvancedFilterBuilderProps {
  pageKey: string; // "employees", "assets", "proposals"
  fields: {
    key: string;
    label: string;
    type: "string" | "number" | "date" | "select";
    options?: { id: string; label: string }[];
  }[];
  rules: FilterRule[];
  logic: "and" | "or";
  onChange: (rules: FilterRule[], logic: "and" | "or") => void;
  data?: Array<Record<string, unknown> | unknown>; // Loaded records to extract unique values from
}

interface SavedFilter {
  name: string;
  rules: FilterRule[];
  logic: "and" | "or";
}

export default function AdvancedFilterBuilder({
  pageKey,
  fields,
  rules,
  logic,
  onChange,
  data = [],
}: AdvancedFilterBuilderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draftRules, setDraftRules] = useState<FilterRule[]>([]);
  const [draftLogic, setDraftLogic] = useState<"and" | "or">("and");

  // Saveable filters states
  const [savedFiltersList, setSavedFiltersList] = useState<SavedFilter[]>([]);
  const [newFilterName, setNewFilterName] = useState("");

  const getFieldValues = (fieldKey: string): string[] => {
    if (!data || !Array.isArray(data)) return [];
    const valuesSet = new Set<string>();

    data.forEach((item) => {
      const parts = fieldKey.split(".");
      let val: unknown = item;
      for (const part of parts) {
        if (val && typeof val === "object" && part in val) {
          val = (val as Record<string, unknown>)[part];
        } else {
          val = undefined;
          break;
        }
      }

      if (val !== undefined && val !== null && val !== "") {
        if (typeof val === "object") {
          const obj = val as Record<string, unknown>;
          if (typeof obj.name === "string") val = obj.name;
          else if (typeof obj.label === "string") val = obj.label;
          else val = JSON.stringify(val);
        }
        valuesSet.add(String(val));
      }
    });

    return Array.from(valuesSet).sort();
  };

  const handleClose = () => {
    setDraftRules(rules.map((rule) => ({ ...rule })));
    setDraftLogic(logic);
    setIsOpen(false);
  };

  const handleApply = () => {
    onChange(draftRules, draftLogic);
    setIsOpen(false);
  };

  const addRule = () => {
    const firstField = fields[0];
    const newRule: FilterRule = {
      id: Math.random().toString(36).substring(2, 11),
      field: firstField?.key || "",
      operator: firstField?.type === "date" ? "equals" : "contains",
      value: "",
    };
    setDraftRules([...draftRules, newRule]);
  };

  const updateRule = (id: string, updates: Partial<FilterRule>) => {
    setDraftRules(
      draftRules.map((rule) => {
        if (rule.id !== id) return rule;

        const next = { ...rule, ...updates };
        // Reset operator and value when field changes to prevent invalid type matches
        if (updates.field) {
          const targetField = fields.find(f => f.key === updates.field);
          next.operator = targetField?.type === "date" ? "equals" : "contains";
          next.value = "";
        }
        return next;
      })
    );
  };

  const removeRule = (id: string) => {
    setDraftRules(draftRules.filter((rule) => rule.id !== id));
  };

  const handleSaveFilter = () => {
    if (!newFilterName.trim()) return;
    const name = newFilterName.trim();
    if (savedFiltersList.some(f => f.name.toLowerCase() === name.toLowerCase())) {
      toast.error("A filter with this name already exists.");
      return;
    }
    const updated = [...savedFiltersList, { name, rules: draftRules, logic: draftLogic }];
    localStorage.setItem(`saved_filters_${pageKey}`, JSON.stringify(updated));
    setSavedFiltersList(updated);
    setNewFilterName("");
    toast.success(`Filter "${name}" saved!`);
  };

  const handleDeleteFilter = (name: string) => {
    const updated = savedFiltersList.filter(f => f.name !== name);
    localStorage.setItem(`saved_filters_${pageKey}`, JSON.stringify(updated));
    setSavedFiltersList(updated);
    toast.success(`Filter "${name}" deleted.`);
  };

  const handleLoadFilter = (name: string) => {
    const selected = savedFiltersList.find(f => f.name === name);
    if (selected) {
      setDraftRules(selected.rules.map(r => ({ ...r })));
      toast.success(`Loaded filter "${name}"`);
    }
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button
        onClick={() => {
          setDraftRules(rules.map(r => ({ ...r })));
          setDraftLogic(logic);
          if (typeof window !== "undefined") {
            try {
              const stored = localStorage.getItem(`saved_filters_${pageKey}`);
              if (stored) {
                setSavedFiltersList(JSON.parse(stored));
              } else {
                setSavedFiltersList([]);
              }
            } catch (err) {
              console.error("Failed to load saved filters from localStorage", err);
            }
          }
          setIsOpen(true);
        }}
        className={`h-9 2xl:h-11 px-3 2xl:px-4 text-xs 2xl:text-sm font-bold uppercase tracking-wider rounded-2xl border transition-all active:scale-[0.98] cursor-pointer flex items-center gap-1.5 ${
          rules.length > 0
            ? "border-amber-500/40 bg-amber-500/5 text-amber-600 shadow-sm"
            : "border-border/60 bg-card-alt text-muted hover:text-foreground hover:bg-border/20"
        }`}
      >
        <HiAdjustmentsHorizontal className="w-4 h-4 2xl:w-5 2xl:h-5" />
        <span>{rules.length === 0 ? "Filters" : "Edit Filters"}</span>
        {rules.length > 0 && (
          <span className="w-4.5 h-4.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-white text-[9px] flex items-center justify-center font-bold">
            {rules.length}
          </span>
        )}
      </button>

      {rules.length > 0 && (
        <>
          <span className="inline-flex items-center px-2.5 py-1.5 rounded-xl text-[10px] font-bold bg-amber-500/5 text-amber-600 border border-amber-500/20 uppercase tracking-widest leading-none">
            {rules.length} Rules Applied
          </span>
          <button
            onClick={() => onChange([], logic)}
            className="w-9 h-9 2xl:w-11 2xl:h-11 flex items-center justify-center rounded-2xl border border-border bg-card-alt text-muted hover:text-danger hover:bg-danger/10 hover:border-danger/20 transition-all cursor-pointer"
            title="Clear all active filters"
          >
            <HiXMark className="w-4.5 h-4.5" />
          </button>
        </>
      )}

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleClose}
              className="absolute inset-0 bg-black/45 backdrop-blur-sm"
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
              className="absolute bottom-0 md:bottom-auto left-1/2 md:top-1/2 w-full md:max-w-4xl bg-card rounded-t-xl md:rounded-lg max-h-[90vh] md:max-h-[min(90vh,800px)] overflow-y-auto border border-border/60 shadow-massive pb-10 md:pb-0"
            >
              <div className="bg-card p-6 md:p-8 rounded-lg border border-border/50 shadow-inner flex flex-col gap-4 relative">
                <div className="absolute inset-0 bg-primary/1 pointer-events-none rounded-lg" />

                {/* Header */}
                <div className="flex items-center justify-between mb-2 pb-2 border-b border-border/50">
                  <div className="flex items-center gap-3">
                    <h2 className="text-sm font-bold uppercase text-foreground tracking-wider">Advanced Filters</h2>
                    {draftRules.length > 0 && (
                      <button
                        onClick={() => setDraftRules([])}
                        className="text-[10px] font-black tracking-widest text-danger hover:text-danger/80 uppercase transition-all cursor-pointer"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  <button
                    onClick={handleClose}
                    className="p-2 rounded-lg bg-card-alt text-muted hover:text-foreground transition-all cursor-pointer border border-border/40"
                  >
                    <HiXMark className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-card-alt px-3 py-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Logic</span>
                  <div className="inline-flex rounded-lg border border-border/60 bg-card p-1">
                    <button
                      type="button"
                      onClick={() => setDraftLogic("and")}
                      className={`h-8 px-3 text-[10px] font-black uppercase tracking-wider rounded-md transition-all ${
                        draftLogic === "and" ? "bg-amber-500/10 text-amber-700" : "text-muted hover:text-foreground"
                      }`}
                    >
                      And
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraftLogic("or")}
                      className={`h-8 px-3 text-[10px] font-black uppercase tracking-wider rounded-md transition-all ${
                        draftLogic === "or" ? "bg-amber-500/10 text-amber-700" : "text-muted hover:text-foreground"
                      }`}
                    >
                      Or
                    </button>
                  </div>
                </div>

                {/* Saved Filters Management */}
                <div className="flex flex-col gap-2 p-3 bg-card-alt border border-border/40 rounded-lg text-xs">
                  <div className="flex items-center justify-between font-bold text-[10px] text-muted uppercase tracking-wider mb-1">
                    <span>Saved Filter Settings</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Load saved views */}
                    <select
                      onChange={(e) => handleLoadFilter(e.target.value)}
                      defaultValue=""
                      className="h-9 px-3 text-xs font-semibold rounded-lg bg-card border border-border outline-none text-foreground flex-1 min-w-[200px]"
                    >
                      <option value="" disabled>Load Saved Filter...</option>
                      {savedFiltersList.map((f) => (
                        <option key={f.name} value={f.name}>{f.name}</option>
                      ))}
                    </select>

                    {/* Save current view */}
                    <div className="flex items-center gap-1.5 flex-1 min-w-[240px]">
                      <input
                        type="text"
                        placeholder="Save current filters as..."
                        value={newFilterName}
                        onChange={(e) => setNewFilterName(e.target.value)}
                        className="h-9 px-3 rounded-lg border border-border bg-card text-xs font-semibold flex-1 outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                      <button
                        onClick={handleSaveFilter}
                        disabled={!newFilterName.trim()}
                        className="h-9 px-4 rounded-lg text-xs font-bold bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 disabled:opacity-40 transition-all cursor-pointer"
                      >
                        Save
                      </button>
                    </div>
                  </div>

                  {/* List of saved views with delete option */}
                  {savedFiltersList.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-border/30">
                      {savedFiltersList.map((f) => (
                        <div
                          key={f.name}
                          className="flex items-center gap-1 bg-card border border-border px-2.5 py-1 rounded-md text-[10px] font-semibold text-foreground group"
                        >
                          <button
                            onClick={() => handleLoadFilter(f.name)}
                            className="hover:underline cursor-pointer"
                          >
                            {f.name}
                          </button>
                          <button
                            onClick={() => handleDeleteFilter(f.name)}
                            className="text-muted hover:text-danger ml-1 p-0.5 rounded hover:bg-danger/10 cursor-pointer"
                            title="Delete Saved Filter"
                          >
                            <HiTrash className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Rule Rows */}
                {draftRules.length === 0 && (
                  <div className="py-10 text-center flex flex-col items-center gap-3">
                     <div className="w-12 h-12 rounded-lg border-2 border-dashed border-border/60 flex items-center justify-center text-muted-foreground/30 font-bold text-xs font-mono">0</div>
                     <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider leading-relaxed">No logic rules defined yet.<br/>Use the button below to start.</p>
                  </div>
                )}

                {draftRules.map((rule) => {
                  const targetField = fields.find((f) => f.key === rule.field);
                  const fieldType = targetField?.type || "string";

                  // Filter operators based on the field type
                  const operators =
                    fieldType === "date"
                      ? [
                          { id: "equals", label: "On Date" },
                          { id: "not_equals", label: "Not On Date" },
                          { id: "greater_than", label: "After Date" },
                          { id: "less_than", label: "Before Date" },
                          { id: "between", label: "Date Between" },
                        ]
                      : fieldType === "number"
                      ? [
                          { id: "equals", label: "Equals" },
                          { id: "not_equals", label: "Does Not Equal" },
                          { id: "greater_than", label: "More Than" },
                          { id: "less_than", label: "Less Than" },
                        ]
                      : [
                          { id: "contains", label: "Contains" },
                          { id: "equals", label: "Exact Match" },
                          { id: "not_equals", label: "Does Not Equal" },
                        ];

                  return (
                    <motion.div
                      layout
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      key={rule.id}
                      className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full bg-card-alt p-3 rounded-lg border border-border/50 group hover:border-amber-500/20 transition-all"
                    >
                      {/* Field Selector */}
                      <Select
                        options={fields.map((f) => ({ id: f.key, label: f.label }))}
                        value={rule.field}
                        onChange={(val) => updateRule(rule.id, { field: val })}
                        className="flex-1 [&>button]:rounded-lg [&>button]:h-11"
                      />

                      {/* Operator Selector */}
                      <Select
                        options={operators}
                        value={rule.operator}
                        onChange={(val) => updateRule(rule.id, { operator: val as FilterOperator })}
                        className="w-full sm:w-44 [&>button]:rounded-lg [&>button]:h-11"
                      />

                      {/* Value Input */}
                      {(() => {
                        const inputCls =
                          "flex-1 px-4 h-11 rounded-lg text-sm font-semibold border border-border bg-card text-foreground shadow-sm focus:ring-4 focus:ring-amber-500/10 transition-all outline-none placeholder:text-muted-foreground/30 placeholder:uppercase placeholder:text-[9px] placeholder:tracking-widest";

                        if (fieldType === "select" && targetField?.options) {
                          return (
                            <Select
                              options={targetField.options}
                              value={rule.value}
                              onChange={(val) => updateRule(rule.id, { value: val })}
                              placeholder="Select option..."
                              className="flex-2 [&>button]:rounded-lg [&>button]:h-11"
                            />
                          );
                        }

                        // Extract unique string values for selectable inputs
                        const uniqueVals = (fieldType === "string") ? getFieldValues(rule.field) : [];
                        if (fieldType === "string" && uniqueVals.length > 0) {
                          return (
                            <Select
                              options={uniqueVals.map(val => ({ id: val, label: val }))}
                              value={rule.value}
                              onChange={(val) => updateRule(rule.id, { value: val })}
                              placeholder="Select value..."
                              className="flex-2 [&>button]:rounded-lg [&>button]:h-11"
                            />
                          );
                        }

                        if (fieldType === "date" && rule.operator === "between") {
                          const parts = rule.value.split("|");
                          return (
                            <div className="flex-2 flex items-center gap-1.5">
                              <input
                                type="date"
                                value={parts[0] || ""}
                                onChange={(e) =>
                                  updateRule(rule.id, { value: `${e.target.value}|${parts[1] || ""}` })
                                }
                                className={inputCls}
                              />
                              <span className="text-xs text-muted font-bold">and</span>
                              <input
                                type="date"
                                value={parts[1] || ""}
                                onChange={(e) =>
                                  updateRule(rule.id, { value: `${parts[0] || ""}|${e.target.value}` })
                                }
                                className={inputCls}
                              />
                            </div>
                          );
                        }

                        return (
                          <input
                            type={
                              fieldType === "date"
                                ? "date"
                                : fieldType === "number"
                                ? "number"
                                : "text"
                            }
                            value={rule.value}
                            onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                            placeholder="Value..."
                            className="flex-2 px-4 h-11 rounded-lg text-sm font-semibold border border-border/50 bg-card text-foreground shadow-sm focus:ring-4 focus:ring-amber-500/10 transition-all outline-none"
                          />
                        );
                      })()}

                      <button
                        onClick={() => removeRule(rule.id)}
                        className="w-11 h-11 flex items-center justify-center shrink-0 rounded-lg bg-danger/10 text-danger hover:bg-danger hover:text-on-danger transition-all self-end sm:self-auto shadow-sm active:scale-[0.98] cursor-pointer"
                      >
                        <HiXMark className="w-5 h-5" />
                      </button>
                    </motion.div>
                  );
                })}

                <button
                  onClick={addRule}
                  className="mt-2 flex items-center justify-center gap-3 h-11 border-2 border-dashed border-amber-500/20 rounded-lg text-amber-600 font-semibold text-xs hover:border-amber-500/40 hover:bg-amber-500/5 transition-all w-full shadow-sm cursor-pointer uppercase tracking-wider"
                >
                  <HiPlus className="w-5 h-5" /> New Filtering Rule
                </button>

                <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-border/50">
                  <button
                    onClick={handleClose}
                    className="h-11 px-6 rounded-lg text-xs font-black uppercase tracking-wider bg-card-alt border border-border text-muted hover:text-foreground transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleApply}
                    className="h-11 px-6 rounded-lg text-xs font-black uppercase tracking-wider bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white shadow-md shadow-amber-500/10 hover:from-amber-600 hover:via-amber-700 hover:to-amber-800 transition-all cursor-pointer"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
