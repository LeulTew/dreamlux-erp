import { supabase } from "../db/supabase";
import { getSettings } from "./settings";

/**
 * Generates the next sequential employee ID based on a prefix and padding.
 * It finds the maximum numeric value among IDs matching the prefix,
 * increments it, and ensures it's available.
 */
export async function generateNextEmployeeId(providedPrefix?: string, padding: number = 3): Promise<string> {
  // 1. Fetch current prefix if not provided
  const prefix = providedPrefix || (await getSettings()).employee_id_prefix;

  // 1. Fetch all employee IDs that match the prefix
  const { data, error } = await supabase
    .from("employees")
    .select("employee_id")
    .ilike("employee_id", `${prefix}%`);

  if (error) throw error;

  const existingIds = data?.map((d: any) => d.employee_id) || [];

  // 2. Extract numeric parts and find max
  let maxNum = 0;
  const regex = new RegExp(`^${prefix}(\\d+)$`, "i");

  for (const id of existingIds) {
    const match = id.match(regex);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }

  // 3. Increment and ensure availability
  let nextNum = maxNum + 1;
  let nextId = formatId(prefix, nextNum, padding);

  // Scan upwards if there's a collision (though maxNum + 1 should usually be safe)
  while (existingIds.includes(nextId)) {
    nextNum++;
    nextId = formatId(prefix, nextNum, padding);
  }

  return nextId;
}

function formatId(prefix: string, num: number, padding: number): string {
  return `${prefix}${String(num).padStart(padding, "0")}`;
}
