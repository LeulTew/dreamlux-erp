import { supabase } from "../db/supabase";

export interface AppSettings {
  employee_id_prefix: string;
}

export async function getSettings(): Promise<AppSettings> {
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("employee_id_prefix")
      .eq("id", 1)
      .single();

    if (error || !data || typeof data.employee_id_prefix !== "string") {
      console.error("Failed to fetch settings from DB:", error);
      return { employee_id_prefix: "EMP" };
    }

    return { employee_id_prefix: data.employee_id_prefix };
  } catch (error) {
    console.error("Error in getSettings:", error);
    return { employee_id_prefix: "EMP" };
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
    return { employee_id_prefix: data.employee_id_prefix };
  } catch (error) {
    console.error("Failed to update settings:", error);
    throw error;
  }
}
