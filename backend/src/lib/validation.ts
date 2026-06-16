import { z } from "zod";

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
  department_id: z.string().uuid("Invalid department ID").optional().or(z.literal("")),
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
  email: z.string().email("Invalid email").max(200, "Email too long").optional().or(z.literal("")),
  commission: z.string().optional().or(z.literal("")),
  commission_type: z.enum(["percent", "etb"]).optional().default("percent"),
  salary_level: z.string().optional().or(z.literal("")),
  office_id: z.string().uuid("Invalid office ID").optional().or(z.literal("")),
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
  sortBy: z.enum(["name", "salary", "date"]).optional().default("salary"),
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
    .string()
    .max(50, "Phone too long")
    .optional()
    .nullable()
    .or(z.literal(""))
    .refine((val) => {
      if (!val) return true;
      const ethioRegex = /^(?:\+251|0)[79]\d{8}$/;
      return ethioRegex.test(val.replace(/\s+/g, ""));
    }, "Invalid Ethiopian phone number. Use +251... or 09.../07..."),
  event_type_id: z.string().uuid("Invalid event type ID").optional().nullable(),
  start_date: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid start date"),
  end_date: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid end date"),
  start_time: z.string().optional().nullable().or(z.literal("")),
  end_time: z.string().optional().nullable().or(z.literal("")),
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
