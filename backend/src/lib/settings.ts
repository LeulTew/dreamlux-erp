import { supabase } from "../db/supabase";

export interface AppSettings {
  employee_id_prefix: string;
  inventory_id_prefix: string;
  event_id_prefix: string;
  payroll_cycle: string;
  payroll_cycle_days: number | null;
  payroll_calendar_type: string;
  payroll_manual_start_date: string | null;
}

const DEFAULT_SETTINGS: AppSettings = {
  employee_id_prefix: "EMP",
  inventory_id_prefix: "INV",
  event_id_prefix: "EVT",
  payroll_cycle: "weekly",
  payroll_cycle_days: null,
  payroll_calendar_type: "gregorian",
  payroll_manual_start_date: null,
};

function rowToSettings(data: Record<string, unknown>): AppSettings {
  return {
    employee_id_prefix: (data.employee_id_prefix as string) || DEFAULT_SETTINGS.employee_id_prefix,
    inventory_id_prefix: (data.inventory_id_prefix as string) || DEFAULT_SETTINGS.inventory_id_prefix,
    event_id_prefix: (data.event_id_prefix as string) || DEFAULT_SETTINGS.event_id_prefix,
    payroll_cycle: (data.payroll_cycle as string) || DEFAULT_SETTINGS.payroll_cycle,
    payroll_cycle_days: (data.payroll_cycle_days as number) ?? null,
    payroll_calendar_type: (data.payroll_calendar_type as string) || DEFAULT_SETTINGS.payroll_calendar_type,
    payroll_manual_start_date: (data.payroll_manual_start_date as string) ?? null,
  };
}

export async function getSettings(): Promise<AppSettings> {
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("employee_id_prefix, inventory_id_prefix, event_id_prefix, payroll_cycle, payroll_cycle_days, payroll_calendar_type, payroll_manual_start_date")
      .eq("id", 1)
      .single();

    if (error || !data) {
      console.error("Failed to fetch settings from DB:", error);
      return { ...DEFAULT_SETTINGS };
    }

    return rowToSettings(data);
  } catch (error) {
    console.error("Error in getSettings:", error);
    return { ...DEFAULT_SETTINGS };
  }
}

export async function updateSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq("id", 1)
      .select()
      .single();

    if (error) throw error;
    return rowToSettings(data);
  } catch (error) {
    console.error("Failed to update settings:", error);
    throw error;
  }
}
