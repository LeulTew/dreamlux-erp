import type { EventProposal, ServiceScope } from "@/lib/types";

export const CLONE_SOURCE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
export const CLONE_CREATED_ID = "aaaaaaaa-0000-4000-8000-000000000002";
export const CLONE_EVENT_TYPE_ID = "eeeeeeee-0000-4000-8000-000000000001";

export const cloneScopes: ServiceScope[] = [
  { id: "scope-decoration", code: "DECORATION", name_en: "Decoration", name_am: "ማስዋቢያ", is_active: true },
  { id: "scope-lighting", code: "LIGHTING", name_en: "Lighting", name_am: "መብራት", is_active: true },
];

export function proposalCloneSource(overrides: Partial<EventProposal> = {}): EventProposal {
  return {
    id: CLONE_SOURCE_ID,
    name: "Dream Lux anniversary",
    client_name: "Anniversary client",
    client_phone: "0912345678",
    event_type_id: CLONE_EVENT_TYPE_ID,
    event_type_name: "Anniversary",
    requested_budget: 50000,
    requested_start_date: "2026-10-10T00:00:00.000Z",
    requested_end_date: "2026-10-11",
    requested_start_time: "00:00:00",
    requested_end_time: "23:45:00",
    venue_location: "Addis Hall",
    notes: "Keep the south entrance clear",
    package_design_notes: "Gold fabric and warm lighting",
    service_scope_ids: cloneScopes.map((scope) => scope.id),
    service_scopes: cloneScopes.map((scope) => ({ ...scope })),
    cost_breakdown: {
      design: [
        { label: "Stage decor", amount: 5000, notes: "Reusable backdrop" },
        { label: "Existing fabric", amount: 0, notes: "" },
      ],
      team: [{ label: "Decor crew", amount: 12000, people_count: 4, commission_per_person: 3000, notes: "Setup and teardown" }],
      trip: [{ label: "Decor transport", amount: 3000, km: 80, fuel_price: 80, notes: "Return trip included" }],
      other: [{ label: "Consumables", amount: 1500, notes: "Cable ties and tape" }],
    },
    estimated_design_cost: 5000,
    estimated_team_cost: 12000,
    estimated_trip_cost: 3000,
    estimated_other_cost: 1500,
    estimated_total_cost: 21500,
    estimated_net_profit: 28500,
    estimated_margin_percentage: 57,
    status: "Approved",
    rejection_reason: null,
    converted_event_id: null,
    submitted_at: "2026-09-10T08:00:00.000Z",
    approved_by: "source-approver",
    approved_at: "2026-09-11T08:00:00.000Z",
    created_by: "source-author",
    created_at: "2026-09-09T08:00:00.000Z",
    updated_at: "2026-09-11T08:00:00.000Z",
    deleted_at: null,
    ...overrides,
  };
}

export function expectedClonePayload(source = proposalCloneSource()) {
  return {
    name: `${source.name} (Copy)`,
    client_name: source.client_name,
    client_phone: source.client_phone,
    event_type_id: source.event_type_id,
    service_scope_ids: source.service_scope_ids,
    requested_budget: source.requested_budget,
    requested_start_date: source.requested_start_date?.slice(0, 10) ?? null,
    requested_end_date: source.requested_end_date?.slice(0, 10) ?? null,
    requested_start_time: source.requested_start_time?.slice(0, 5) ?? null,
    requested_end_time: source.requested_end_time?.slice(0, 5) ?? null,
    venue_location: source.venue_location,
    notes: source.notes,
    package_design_notes: source.package_design_notes,
    cost_breakdown: source.cost_breakdown,
  };
}
