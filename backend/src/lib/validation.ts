import { z } from "zod";

const blankToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);
const blankToNull = (value: unknown) => (typeof value === "string" && value.trim() === "" ? null : value);

const optionalUuid = (message: string) => z.preprocess(blankToUndefined, z.string().uuid(message).optional());
const nullableUuid = (message: string) => z.preprocess(blankToNull, z.string().uuid(message).nullable().optional());
const optionalText = (max: number, message: string) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max, message).optional());
const nullableText = (max: number, message: string) =>
  z.preprocess(blankToNull, z.string().trim().max(max, message).nullable().optional());
const optionalDate = (message: string) =>
  z.preprocess(
    blankToNull,
    z.string().nullable().optional().refine((val) => !val || !isNaN(Date.parse(val)), message),
  );

export const createItemSchema = z.object({
  name: z.string().min(1, "Name is required").max(500, "Name too long"),
  quantity: z.coerce.number().int("Must be integer").min(0, "Cannot be negative"),
  store_id: z.string().uuid("Invalid store ID"),
  description: z.string().max(2000, "Description too long").optional(),
});

export const updateItemSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  quantity: z.coerce.number().int().min(0).optional(),
  store_id: z.string().uuid().optional(),
  description: z.string().max(2000).optional(),
});

export const paginationSchema = z.object({
  store: z.string().optional().default("all"),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(5000).optional().default(50),
});

export const assetsPaginationSchema = paginationSchema.extend({
  sortBy: z.enum(["name", "quantity", "created_at", "updated_at", "last_counted_at"]).optional().default("updated_at"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

export type AssetsPaginationInput = z.infer<typeof assetsPaginationSchema>;

export const reconcileItemsSchema = z.object({
  store_id: z.string().uuid("Invalid store ID").optional().nullable(),
  notes: z.string().max(2000, "Notes too long").optional(),
  items: z.array(z.object({
    id: z.string().uuid(),
    quantity: z.coerce.number().int().min(0, "Quantity cannot be negative"),
    expected_current_quantity: z.coerce.number().int().min(0).optional(),
    source_run_id: z.string().optional(),
  })).min(1, "At least one item required"),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;

export const createEmployeeSchema = z.object({
  full_name: z.string().min(1, "Full name is required").max(500, "Name too long"),
  employee_id: z.string().min(1, "Employee ID is required").max(100, "ID too long"),
  department_id: optionalUuid("Invalid department ID"),
  phone: z
    .string()
    .max(50, "Phone too long")
    .optional()
    .refine((val) => {
      if (!val) return true;
      // Ethiopian phone validation:
      // +251 9... / +251 7...
      // 09... / 07...
      const ethioRegex = /^(?:\+251|0)[79]\d{8}$/;
      return ethioRegex.test(val.replace(/\s+/g, ""));
    }, "Invalid Ethiopian phone number. Use +251... or 09.../07..."),
  email: z.preprocess(blankToUndefined, z.string().email("Invalid email").max(200, "Email too long").optional()),
  commission: optionalText(100, "Commission too long"),
  commission_type: z.enum(["percent", "etb"]).optional().default("percent"),
  salary_level: optionalText(100, "Salary level code too long"),
  office_id: optionalUuid("Invalid office ID"),
  event_prices: z
    .record(z.string(), z.coerce.number().min(0, "Event price cannot be negative"))
    .optional()
    .or(z.string().optional()),
});

export const updateEmployeeSchema = createEmployeeSchema.partial();

export const employeePaginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(5000).optional().default(50),
  search: z.string().optional(),
  status: z.enum(["active", "trash"]).optional().default("active"),
  office_id: z.string().uuid("Invalid office ID").optional().or(z.literal("all")),
  department_id: z.string().uuid("Invalid department ID").optional().or(z.literal("all")),
  sortBy: z.enum(["name", "full_name", "salary", "date", "employee_id", "commission"]).optional().default("salary"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type EmployeePaginationInput = z.infer<typeof employeePaginationSchema>;

// HR / Payroll / Events Schema Additions

export const createSalaryLevelSchema = z.object({
  level_name: z.string().min(1, "Name is required").max(255),
  base_salary: z.coerce.number().min(0, "Salary cannot be negative")
});

export const updateSalaryLevelSchema = z.object({
  level_name: z.string().min(1, "Name is required").max(255).optional(),
  base_salary: z.coerce.number().min(0, "Salary cannot be negative").optional()
});

export const createEventTypeSchema = z.object({
  event_name: z.string().min(1, "Name is required").max(500),
  description: z.string().max(2000, "Description too long").optional().nullable(),
});

export const updateEventTypeSchema = z.object({
  event_name: z.string().min(1, "Name is required").max(500).optional(),
  description: z.string().max(2000, "Description too long").optional().nullable(),
});

export type CreateEventTypeInput = z.infer<typeof createEventTypeSchema>;
export type UpdateEventTypeInput = z.infer<typeof updateEventTypeSchema>;

export const generatePayrollPreviewSchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  period_kind: z.enum(["month", "range", "half_month"]).default("month"),
  period_start: z.string().optional(),
  period_end: z.string().optional(),
  employeeLineEvents: z.array(z.object({
    employee_id: z.string().uuid(),
    events: z.array(z.object({
      event_type_id: z.string().uuid(),
      quantity: z.coerce.number().int().min(1),
      selected_level_id: z.string().min(1).optional().nullable(),
      price_override: z.coerce.number().min(0).optional().nullable(),
      override_reason: z.string().optional().nullable()
    }))
  }))
});

export const finalizePayrollRunSchema = generatePayrollPreviewSchema.extend({
  created_by_user_id: z.string().uuid().optional().nullable(),
});

export const savePayrollDraftSchema = generatePayrollPreviewSchema.extend({
  created_by_user_id: z.string().uuid().optional().nullable(),
});

const eventBaseSchema = z.object({
  name: z.string().min(1, "Event name is required").max(500, "Event name too long"),
  client_name: z.string().min(1, "Client name is required").max(500, "Client name too long"),
  client_phone: z
    .preprocess(blankToNull, z.string().max(50, "Phone too long").nullable().optional())
    .refine((val) => {
      if (!val) return true;
      const ethioRegex = /^(?:\+251|0)[79]\d{8}$/;
      return ethioRegex.test(val.replace(/\s+/g, ""));
    }, "Invalid Ethiopian phone number. Use +251... or 09.../07..."),
  event_type_id: z.string().uuid("Invalid event type ID").optional().nullable(),
  start_date: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid start date"),
  end_date: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid end date"),
  start_time: nullableText(20, "Start time too long"),
  end_time: nullableText(20, "End time too long"),
  venue_location: z.string().min(1, "Venue location is required").max(1000, "Venue location too long"),
  contract_price: z.coerce.number().min(0, "Contract price cannot be negative"),
});

export const createEventSchema = eventBaseSchema.refine((data) => {
  return new Date(data.start_date) <= new Date(data.end_date);
}, {
  message: "End date must be on or after start date",
  path: ["end_date"],
});

export const updateEventSchema = eventBaseSchema.partial().extend({
  status: z.enum(["Planned", "Ongoing", "Completed"]).optional(),
}).refine((data) => {
  if (data.start_date && data.end_date) {
    return new Date(data.start_date) <= new Date(data.end_date);
  }
  return true;
}, {
  message: "End date must be on or after start date",
  path: ["end_date"],
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

const eventAdvancedFilterValueSchema = z.union([
  z.string().max(500),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string().max(500), z.number(), z.boolean(), z.null()])).max(50),
]);

const parseEventFilters = (value: unknown) => {
  if (value === undefined || value === null || value === "") return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const eventListQueryBaseSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().max(200).optional(),
  status: z.string().max(80).optional(),
  start_date: z.string().optional().refine((val) => !val || !isNaN(Date.parse(val)), "Invalid start_date"),
  end_date: z.string().optional().refine((val) => !val || !isNaN(Date.parse(val)), "Invalid end_date"),
  sortBy: z.string().max(80).optional().default("start_date"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("asc"),
  filterLogic: z.enum(["and", "or"]).optional().default("and"),
  filters: z.preprocess(parseEventFilters, z.array(z.object({
    field: z.string().min(1).max(80),
    operator: z.enum([
      "equals",
      "not_equals",
      "contains",
      "starts_with",
      "in",
      "not_in",
      "greater_than",
      "greater_than_or_equal",
      "less_than",
      "less_than_or_equal",
      "between",
      "is_empty",
      "is_not_empty",
    ]),
    value: eventAdvancedFilterValueSchema.optional(),
  })).max(25)).optional().default([]),
});

export const eventListQuerySchema = eventListQueryBaseSchema.refine((data) => {
  if (!data.start_date || !data.end_date) return true;
  return new Date(data.start_date) <= new Date(data.end_date);
}, {
  message: "end_date must be on or after start_date",
  path: ["end_date"],
});

export type EventListQueryInput = z.infer<typeof eventListQuerySchema>;

const savedViewScopeSchema = z.enum(["personal", "role", "global"]);

export const eventSavedViewPayloadSchema = z.object({
  name: z.string().min(1, "Saved view name is required").max(120, "Saved view name too long"),
  scope: savedViewScopeSchema.optional().default("personal"),
  role_name: z.string().min(1).max(120).optional().nullable(),
  is_default: z.coerce.boolean().optional().default(false),
  columns: z.array(z.string().min(1).max(80)).max(50).optional().default([]),
  filters: z.array(z.object({
    field: z.string().min(1).max(80),
    operator: z.string().min(1).max(40),
    value: eventAdvancedFilterValueSchema.optional(),
  })).max(25).optional().default([]),
  sort: z.object({
    sortBy: z.string().min(1).max(80),
    sortOrder: z.enum(["asc", "desc"]),
  }).optional().nullable(),
  page_size: z.coerce.number().int().min(1).max(100).optional().default(20),
}).refine((data) => data.scope !== "role" || Boolean(data.role_name?.trim()), {
  message: "role_name is required for role-scoped saved views",
  path: ["role_name"],
}).refine((data) => data.scope === "role" || !data.role_name, {
  message: "role_name is only allowed for role-scoped saved views",
  path: ["role_name"],
});

export type EventSavedViewPayloadInput = z.infer<typeof eventSavedViewPayloadSchema>;

const parseCsvColumns = (value: unknown) => {
  if (typeof value !== "string") return value;
  return value.split(",").map((column) => column.trim()).filter(Boolean);
};

export const eventExportQuerySchema = eventListQueryBaseSchema.extend({
  format: z.enum(["csv", "xlsx"]).optional().default("csv"),
  columns: z.preprocess(parseCsvColumns, z.array(z.string().min(1).max(80)).max(40)).optional(),
  maxRows: z.coerce.number().int().min(1).max(1000).optional().default(1000),
}).refine((data) => {
  if (!data.start_date || !data.end_date) return true;
  return new Date(data.start_date) <= new Date(data.end_date);
}, {
  message: "end_date must be on or after start_date",
  path: ["end_date"],
});

export type EventExportQueryInput = z.infer<typeof eventExportQuerySchema>;

const profitReportQueryBaseSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().max(200).optional(),
  start_date: z.string().optional().refine((val) => !val || !isNaN(Date.parse(val)), "Invalid start_date"),
  end_date: z.string().optional().refine((val) => !val || !isNaN(Date.parse(val)), "Invalid end_date"),
  event_type_id: z.string().uuid("Invalid event_type_id").optional(),
  status: z.enum(["Planned", "Ongoing", "Completed"]).optional(),
  min_margin: z.coerce.number().optional(),
  max_margin: z.coerce.number().optional(),
  min_profit: z.coerce.number().optional(),
  max_profit: z.coerce.number().optional(),
  sortBy: z.enum([
    "start_date",
    "event_name",
    "event_type",
    "revenue",
    "approved_expenses",
    "labor_cost",
    "fuel_cost",
    "net_profit",
    "margin_percentage",
    "pending_expense_exposure",
    "estimated_profit_variance",
  ]).optional().default("start_date"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

export const profitReportQuerySchema = profitReportQueryBaseSchema.refine((data) => {
  if (!data.start_date || !data.end_date) return true;
  return new Date(data.start_date) <= new Date(data.end_date);
}, {
  message: "end_date must be on or after start_date",
  path: ["end_date"],
});

export const profitReportExportQuerySchema = profitReportQueryBaseSchema.extend({
  format: z.enum(["csv", "xlsx"]).optional().default("csv"),
  maxRows: z.coerce.number().int().min(1).max(1000).optional().default(1000),
}).refine((data) => {
  if (!data.start_date || !data.end_date) return true;
  return new Date(data.start_date) <= new Date(data.end_date);
}, {
  message: "end_date must be on or after start_date",
  path: ["end_date"],
});

export type ProfitReportQueryInput = z.infer<typeof profitReportQuerySchema>;
export type ProfitReportExportQueryInput = z.infer<typeof profitReportExportQuerySchema>;

const eventImportRowSchema = z.object({
  id: z.string().uuid("Invalid event ID").optional().nullable(),
  name: z.string().min(1, "Event name is required").max(500, "Event name too long"),
  client_name: z.string().min(1, "Client name is required").max(500, "Client name too long"),
  client_phone: nullableText(50, "Phone too long"),
  event_type_id: nullableUuid("Invalid event type ID"),
  event_type_name: nullableText(500, "Event type name too long"),
  start_date: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid start date"),
  end_date: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid end date"),
  start_time: nullableText(20, "Start time too long"),
  end_time: nullableText(20, "End time too long"),
  venue_location: z.string().min(1, "Venue location is required").max(1000, "Venue location too long"),
  contract_price: z.coerce.number().min(0, "Contract price cannot be negative"),
  status: z.enum(["Planned", "Ongoing", "Completed"]).optional().default("Planned"),
  package_design_notes: nullableText(4000, "Design notes too long"),
  estimated_design_cost: z.coerce.number().min(0, "Estimated design cost cannot be negative").optional().nullable(),
}).refine((data) => new Date(data.start_date) <= new Date(data.end_date), {
  message: "End date must be on or after start date",
  path: ["end_date"],
});

export const eventImportPayloadSchema = z.object({
  mode: z.enum(["insert", "update"]).optional().default("insert"),
  rows: z.array(eventImportRowSchema).min(1, "At least one event row is required").max(500, "Import is limited to 500 rows per batch"),
  commit: z.coerce.boolean().optional().default(false),
});

export type EventImportPayloadInput = z.infer<typeof eventImportPayloadSchema>;

const proposalEstimateLineSchema = z.object({
  label: z.string().min(1, "Estimate label is required").max(200, "Estimate label too long"),
  amount: z.coerce.number().min(0, "Estimate amount cannot be negative"),
  notes: z.string().max(1000, "Estimate notes too long").optional().nullable(),
});

export const eventProposalPayloadSchema = z.object({
  name: z.string().min(1, "Proposal name is required").max(500, "Proposal name too long"),
  client_name: z.string().min(1, "Client name is required").max(500, "Client name too long"),
  client_phone: z
    .preprocess(blankToNull, z.string().max(50, "Phone too long").nullable().optional())
    .refine((val) => {
      if (!val) return true;
      const ethioRegex = /^(?:\+251|0)[79]\d{8}$/;
      return ethioRegex.test(val.replace(/\s+/g, ""));
    }, "Invalid Ethiopian phone number. Use +251... or 09.../07..."),
  event_type_id: nullableUuid("Invalid event type ID"),
  requested_budget: z.coerce.number().min(0, "Requested budget cannot be negative"),
  requested_start_date: optionalDate("Invalid requested start date"),
  requested_end_date: optionalDate("Invalid requested end date"),
  requested_start_time: nullableText(20, "Requested start time too long"),
  requested_end_time: nullableText(20, "Requested end time too long"),
  venue_location: nullableText(1000, "Venue location too long"),
  notes: nullableText(4000, "Notes too long"),
  package_design_notes: nullableText(4000, "Design notes too long"),
  cost_breakdown: z.object({
    design: z.array(proposalEstimateLineSchema).max(50).optional().default([]),
    team: z.array(proposalEstimateLineSchema.extend({
      people_count: z.coerce.number().int().min(1).max(1000).optional().default(1),
      commission_per_person: z.coerce.number().min(0).optional(),
    })).max(50).optional().default([]),
    trip: z.array(proposalEstimateLineSchema.extend({
      km: z.coerce.number().min(0).optional(),
      fuel_price: z.coerce.number().min(0).optional(),
    })).max(50).optional().default([]),
    other: z.array(proposalEstimateLineSchema).max(50).optional().default([]),
  }).optional().default({ design: [], team: [], trip: [], other: [] }),
}).refine((data) => {
  if (!data.requested_start_date || !data.requested_end_date) return true;
  return new Date(data.requested_start_date) <= new Date(data.requested_end_date);
}, {
  message: "Requested end date must be on or after requested start date",
  path: ["requested_end_date"],
});

export const eventProposalListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: z.enum(["Draft", "Submitted", "Approved", "Rejected", "Converted", "Canceled"]).optional(),
  created_by: z.string().uuid("Invalid creator ID").optional(),
  event_type_id: z.string().uuid("Invalid event type ID").optional(),
  search: z.string().max(200).optional(),
  start_date: z.string().optional().refine((val) => !val || !isNaN(Date.parse(val)), "Invalid start_date"),
  end_date: z.string().optional().refine((val) => !val || !isNaN(Date.parse(val)), "Invalid end_date"),
  min_margin: z.coerce.number().optional(),
  max_margin: z.coerce.number().optional(),
  min_profit: z.coerce.number().optional(),
  max_profit: z.coerce.number().optional(),
  filterLogic: z.enum(["and", "or"]).optional().default("and"),
  filters: z.preprocess((value) => {
    if (value === undefined || value === null || value === "") return [];
    if (Array.isArray(value)) return value;
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }, z.array(z.object({
    field: z.enum([
      "name",
      "client_name",
      "venue_location",
      "status",
      "requested_budget",
      "estimated_net_profit",
      "estimated_margin_percentage",
      "requested_start_date",
      "requested_end_date",
      "created_at",
      "event_type_name",
    ]),
    operator: z.enum(["contains", "equals", "not_equals", "greater_than", "less_than", "between"]),
    value: z.union([
      z.string().max(500),
      z.number(),
      z.array(z.union([z.string().max(500), z.number()])).max(2),
    ]).optional(),
  })).max(25)).optional().default([]),
  sortBy: z.enum(["name", "client_name", "requested_start_date", "requested_budget", "estimated_margin_percentage", "status", "created_at"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
}).refine((data) => {
  if (!data.start_date || !data.end_date) return true;
  return new Date(data.start_date) <= new Date(data.end_date);
}, {
  message: "end_date must be on or after start_date",
  path: ["end_date"],
});

export const eventProposalRejectSchema = z.object({
  reason: z.string().min(1, "Rejection reason is required").max(2000, "Rejection reason too long"),
});

export type EventProposalPayloadInput = z.infer<typeof eventProposalPayloadSchema>;
export type EventProposalListQueryInput = z.infer<typeof eventProposalListQuerySchema>;

export const updateEventDesignSchema = z.object({
  package_design_notes: z.string().max(4000, "Design notes too long").optional().nullable(),
  estimated_design_cost: z.coerce.number().min(0, "Estimated cost cannot be negative").optional().nullable(),
});

export const createEventAllocationSchema = z.object({
  item_id: z.string().uuid("Invalid inventory item ID"),
  quantity_allocated: z.coerce.number().int("Quantity must be a whole number").min(1, "Quantity must be at least 1"),
  notes: z.string().max(1000, "Allocation notes too long").optional().nullable(),
});

export const createEventChecklistItemSchema = z.object({
  title: z.string().min(1, "Task title is required").max(500, "Task title too long"),
  due_date: z.string().optional().nullable().refine((val) => {
    if (!val) return true;
    return !isNaN(Date.parse(val));
  }, "Invalid due date"),
  owner_name: z.string().max(200, "Owner name too long").optional().nullable(),
});

export const updateEventChecklistItemSchema = createEventChecklistItemSchema.partial().extend({
  status: z.enum(["Todo", "Done"]).optional(),
});

export type UpdateEventDesignInput = z.infer<typeof updateEventDesignSchema>;
export type CreateEventAllocationInput = z.infer<typeof createEventAllocationSchema>;
export type CreateEventChecklistItemInput = z.infer<typeof createEventChecklistItemSchema>;
export type UpdateEventChecklistItemInput = z.infer<typeof updateEventChecklistItemSchema>;

export const createEventAssignmentSchema = z.object({
  employee_id: z.string().uuid("Invalid employee ID"),
  role: z.enum([
    "Event Manager",
    "Supervisor",
    "Team Leader",
    "Décor Professional",
    "Assistant",
    "Driver",
    "Store Keeper"
  ], { errorMap: () => ({ message: "Invalid role selected" }) }),
  commission_amount: z.coerce.number().min(0, "Commission cannot be negative"),
  attended: z.boolean().optional().default(true),
});

export const createVehicleAssignmentSchema = z.object({
  vehicle_id: z.string().uuid("Invalid vehicle ID"),
  driver_id: z.string().uuid("Invalid driver ID").optional().nullable(),
  is_night_shift: z.boolean().optional().default(false),
});

export const createEventExpenseSchema = z.object({
  category: z.enum(["Fuel", "Labor", "Transportation", "Equipment Rental", "Consumables", "Other"]),
  amount: z.coerce.number().min(0.01, "Amount must be greater than zero"),
  description: z.string().min(1, "Description is required").max(2000, "Description too long"),
  receipt_image_key: z.string().max(1000, "Receipt key too long").optional().nullable(),
});

export const reviewEventExpenseSchema = z.object({
  status: z.enum(["Approved", "Rejected"]),
  rejected_reason: z.string().max(1000, "Review comment too long").optional().nullable(),
}).refine((data) => {
  return data.status === "Approved" || Boolean(data.rejected_reason?.trim());
}, {
  message: "Rejection reason is required",
  path: ["rejected_reason"],
});

export const createTripLogSchema = z.object({
  vehicle_assignment_id: z.string().uuid("Invalid vehicle assignment ID"),
  destination: z.string().min(1, "Destination is required").max(1000, "Destination too long"),
  distance_km: z.coerce.number().min(0.01, "Distance must be greater than zero"),
  fuel_price_etb: z.coerce.number().min(0.01, "Fuel price must be greater than zero"),
});

export type CreateEventAssignmentInput = z.infer<typeof createEventAssignmentSchema>;
export type CreateVehicleAssignmentInput = z.infer<typeof createVehicleAssignmentSchema>;
export type CreateEventExpenseInput = z.infer<typeof createEventExpenseSchema>;
export type ReviewEventExpenseInput = z.infer<typeof reviewEventExpenseSchema>;
export type CreateTripLogInput = z.infer<typeof createTripLogSchema>;
