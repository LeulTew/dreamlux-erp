import type { Event } from "./types";

export type EventEditValues = {
  name: string;
  client_name: string;
  client_phone: string;
  event_type_id: string;
  service_scope_ids: string[];
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  venue_location: string;
  contract_price: number;
  status: Event["status"];
};

export function buildEventEditPayload(
  values: EventEditValues,
  editedFields?: ReadonlySet<keyof EventEditValues>,
): Record<string, unknown> {
  const normalized = {
    ...values,
    event_type_id: values.event_type_id || null,
    client_phone: values.client_phone || null,
    start_time: values.start_time || null,
    end_time: values.end_time || null,
  };
  if (editedFields === undefined) return normalized;
  const changed = new Set<string>(editedFields);
  return Object.fromEntries(Object.entries(normalized).filter(([field]) => changed.has(field)));
}
