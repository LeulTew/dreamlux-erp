"use client";

import { useEffect, useRef, useState } from "react";
import ResponsiveDrawer from "@/components/ui/ResponsiveDrawer";
import Select from "@/components/ui/Select";
import StaffPaymentEmployeePicker from "@/components/StaffPaymentEmployeePicker";

export default function DrawerLifecycleFixture() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(true);
  const [closeCount, setCloseCount] = useState(0);
  const [choice, setChoice] = useState("one");
  const [added, setAdded] = useState(0);
  const [showStaffPicker, setShowStaffPicker] = useState(false);
  const [staffId, setStaffId] = useState("");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const cycleDuringExit = () => {
    timers.current.push(setTimeout(() => setOpen(false), 80));
    timers.current.push(setTimeout(() => setOpen(true), 160));
  };

  return (
    <main className="min-h-[180vh] space-y-4 bg-background p-6 text-foreground">
      <h1 className="text-xl font-bold">Drawer lifecycle fixture</h1>
      <button type="button" className="min-h-12 rounded-xl border border-border bg-card px-4"
        onClick={() => { setMounted(true); setOpen(true); }}>Open controlled drawer</button>
      <p role="status">User close callbacks: {closeCount}</p>
      <p>Selected choice: {choice}; added: {added}</p>
      <p data-testid="staff-selection">Selected staff: {staffId}</p>
      {mounted && (
        <ResponsiveDrawer isOpen={open} title="Controlled drawer" subtitle="Synthetic record only"
          onClose={() => { setCloseCount((count) => count + 1); setOpen(false); }}
          footer={<button type="button" className="min-h-12 rounded-xl border border-border px-4"
            onClick={() => setOpen(false)}>External close</button>}>
          <div className="space-y-4">
            <label className="block">Draft
              <input aria-label="Fixture draft" defaultValue="Unsaved synthetic draft"
                className="mt-2 block min-h-12 w-full rounded-xl border border-border bg-card-alt px-3" />
            </label>
            <Select name="choice" aria-label="Fixture choice" value={choice} onChange={setChoice} searchable
              onAdd={() => setAdded((count) => count + 1)} addLabel="Add fixture choice"
              options={[{ id: "one", label: "First choice" }, { id: "two", label: "Second choice" }]} />
            <button type="button" className="min-h-12 rounded-xl border border-border px-4"
              onClick={() => setShowStaffPicker(true)}>Show staff picker</button>
            {showStaffPicker && <StaffPaymentEmployeePicker value={staffId} onChange={setStaffId} />}
            <button type="button" className="min-h-12 rounded-xl border border-border px-4"
              onClick={cycleDuringExit}>Schedule reopen</button>
            <button type="button" className="ml-3 min-h-12 rounded-xl border border-border px-4"
              onClick={() => timers.current.push(setTimeout(() => setMounted(false), 80))}>Schedule unmount</button>
            <div className="h-[110vh] border-t border-border pt-4">
              Scrollable content must not drag the sheet.
            </div>
            <p>End of synthetic content</p>
          </div>
        </ResponsiveDrawer>
      )}
    </main>
  );
}
