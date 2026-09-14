import type { EventProposal, ProposalEstimateLine } from "@/lib/types";

export const PROPOSAL_CLONE_TIMEOUT_MS = 30_000;
export const PROPOSAL_CLONE_MAX_RETRIES = 3;

export type ProposalDraftLine = ProposalEstimateLine & { notes: string };
export type ProposalCloneValues = {
  name: string;
  clientName: string;
  clientPhone: string;
  eventTypeId: string;
  serviceScopeIds: string[];
  requestedBudget: number;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  venueLocation: string;
  notes: string;
  designNotes: string;
  designLines: ProposalDraftLine[];
  teamLines: ProposalDraftLine[];
  tripLines: ProposalDraftLine[];
  otherLines: ProposalDraftLine[];
};

function invalid(field: string): never {
  throw new Error(`Invalid proposal clone source: ${field}`);
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(field);
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, nullable = false): string {
  if (nullable && value === null) return "";
  if (typeof value !== "string") invalid(field);
  return value;
}

function numeric(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) invalid(field);
  return value;
}

function dateInput(value: EventProposal["requested_start_date"], field: string): string {
  if (value === null || value === "") return "";
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) || Number.isNaN(Date.parse(value))) invalid(field);
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) invalid(field);
  // The API's calendar date is already authoritative; do not shift it through the user's timezone.
  return date;
}

function timeInput(value: EventProposal["requested_start_time"], field: string): string {
  if (value === null || value === "") return "";
  if (!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/.test(value)) invalid(field);
  return value.slice(0, 5);
}

function lines(value: unknown, field: string): ProposalDraftLine[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50) invalid(field);
  return value.map((item, index) => {
    const source = record(item, `${field}[${index}]`);
    const line: ProposalDraftLine = {
      label: text(source.label, `${field}[${index}].label`),
      amount: numeric(source.amount, `${field}[${index}].amount`),
      notes: source.notes == null ? "" : text(source.notes, `${field}[${index}].notes`),
    };
    for (const key of ["people_count", "commission_per_person", "km", "fuel_price"] as const) {
      if (source[key] !== undefined) line[key] = numeric(source[key], `${field}[${index}].${key}`);
    }
    return line;
  });
}

function scopeIds(source: Record<string, unknown>): string[] {
  if (source.service_scope_ids !== undefined) {
    if (!Array.isArray(source.service_scope_ids)) invalid("service_scope_ids");
    return source.service_scope_ids.map((id, index) => text(id, `service_scope_ids[${index}]`));
  }
  if (source.service_scopes === undefined) return [];
  if (!Array.isArray(source.service_scopes)) invalid("service_scopes");
  return source.service_scopes.map((scope, index) => text(record(scope, `service_scopes[${index}]`).id, `service_scopes[${index}].id`));
}

export function hydrateProposalClone(response: unknown, sourceId: string): ProposalCloneValues {
  const source = record(record(response, "response").proposal, "proposal");
  const field = (key: keyof EventProposal) => source[key];
  if (!sourceId || text(field("id"), "id") !== sourceId) invalid("id");
  const breakdown = record(field("cost_breakdown"), "cost_breakdown");
  const requestedDate = (key: "requested_start_date" | "requested_end_date") =>
    dateInput(field(key) === null ? null : text(field(key), key), key);
  const requestedTime = (key: "requested_start_time" | "requested_end_time") =>
    timeInput(field(key) === null ? null : text(field(key), key), key);

  return {
    name: `${text(field("name"), "name")} (Copy)`,
    clientName: text(field("client_name"), "client_name"),
    clientPhone: text(field("client_phone"), "client_phone", true),
    eventTypeId: text(field("event_type_id"), "event_type_id", true),
    serviceScopeIds: scopeIds(source),
    requestedBudget: numeric(field("requested_budget"), "requested_budget"),
    startDate: requestedDate("requested_start_date"),
    endDate: requestedDate("requested_end_date"),
    startTime: requestedTime("requested_start_time"),
    endTime: requestedTime("requested_end_time"),
    venueLocation: text(field("venue_location"), "venue_location", true),
    notes: text(field("notes"), "notes", true),
    designNotes: text(field("package_design_notes"), "package_design_notes", true),
    designLines: lines(breakdown.design, "cost_breakdown.design"),
    teamLines: lines(breakdown.team, "cost_breakdown.team"),
    tripLines: lines(breakdown.trip, "cost_breakdown.trip"),
    otherLines: lines(breakdown.other, "cost_breakdown.other"),
  };
}
