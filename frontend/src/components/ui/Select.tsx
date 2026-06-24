"use client";

import { useState, useRef, useEffect } from "react";
import { HiChevronDown } from "react-icons/hi2";
import { motion, AnimatePresence } from "framer-motion";

interface Option {
  id: string | number;
  label: string;
}

interface SelectProps {
  options: Option[];
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onAdd?: () => void;
  addLabel?: string;
}

export default function Select({ options, value, onChange, placeholder = "Select...", className = "", onAdd, addLabel }: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => String(opt.id) === String(value));

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-card-alt border border-border/50 text-sm font-semibold text-foreground hover:bg-primary-light hover:text-primary-dark hover:border-primary/30 dark:hover:bg-primary-light/10 dark:hover:text-primary dark:hover:border-primary/30 transition-all duration-300 ease-out outline-none focus:ring-2 focus:ring-primary/20 shadow-sm"
      >
        <span className={selectedOption ? "text-foreground font-semibold" : "text-muted font-medium"}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <HiChevronDown className={`w-4 h-4 text-muted transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute z-[100] w-full mt-2 bg-card border border-border shadow-lg rounded-xl overflow-hidden py-1"
          >
            <div className="max-h-60 overflow-y-auto custom-scrollbar flex flex-col">
              {options.length === 0 && !onAdd ? (
                <div className="px-4 py-2 text-xs text-muted italic">No options</div>
              ) : (
                <>
                  {options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        onChange(String(option.id));
                        setIsOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm font-semibold transition-all flex items-center justify-between group/opt ${
                        String(option.id) === String(value) 
                          ? "bg-primary/10 text-primary" 
                          : "text-foreground hover:bg-card-alt hover:pl-5"
                      }`}
                    >
                      <span>{option.label}</span>
                      {String(option.id) === String(value) && (
                        <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary-rgb),0.5)]" />
                      )}
                    </button>
                  ))}
                  {onAdd && (
                    <button
                      type="button"
                      onClick={() => {
                        onAdd();
                        setIsOpen(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm font-black text-primary hover:bg-primary/10 border-t border-border/40 transition-all flex items-center gap-1.5"
                    >
                      <span>{addLabel || "+ Add New..."}</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
