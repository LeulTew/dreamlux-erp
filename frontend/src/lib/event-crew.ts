import type { Employee } from "@/lib/types";

// Canonical event-crew roles offered when assigning staff to an event.
export const EVENT_ROLE_VALUES = [
  "Event Manager",
  "Supervisor",
  "Team Leader",
  "Décor Professional",
  "Assistant",
  "Driver",
  "Store Keeper",
] as const;

// Durable driver eligibility: match on normalized position/department substrings
// rather than exact display text, so capitalization/translation/wording drift does
// not hide eligible drivers (issue #146).
export const DRIVER_KEYWORDS = ["driver", "chauffeur", "logistic", "transport", "fleet"];

export function isDriverEligible(emp: Pick<Employee, "position" | "department">): boolean {
  const haystack = `${emp.position || ""} ${emp.department || ""}`.toLowerCase();
  return DRIVER_KEYWORDS.some((kw) => haystack.includes(kw));
}

// Suggest an event-crew role from an employee's position/department. The suggestion
// is a starting point only — the assigner can override it.
export function suggestEventRole(emp: Pick<Employee, "position" | "department"> | undefined): string {
  if (!emp) return "";
  const haystack = `${emp.position || ""} ${emp.department || ""}`.toLowerCase();
  if (DRIVER_KEYWORDS.some((kw) => haystack.includes(kw))) return "Driver";
  if (haystack.includes("store") || haystack.includes("inventory") || haystack.includes("warehouse")) return "Store Keeper";
  if (haystack.includes("supervisor")) return "Supervisor";
  if (haystack.includes("team lead") || haystack.includes("lead")) return "Team Leader";
  if (haystack.includes("manager")) return "Event Manager";
  if (haystack.includes("decor") || haystack.includes("décor") || haystack.includes("design")) return "Décor Professional";
  return "Assistant";
}
