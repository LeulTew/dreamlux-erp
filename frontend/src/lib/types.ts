export interface Store {
  id: string;
  name: string;
  is_active: boolean;
}

export interface Item {
  id: string;
  name: string;
  quantity: number;
  allocated_quantity?: number;
  available_quantity?: number;
  description: string | null;
  store: {
    id: string;
    name: string;
  };
  image_url: string | null;
  last_counted_at: string | null;
  last_counted_by: { full_name: string } | null;
  created_at: string;
  updated_at: string;
}

export interface ItemsResponse {
  items: Item[];
  total: number;
  page: number;
  limit: number;
}

export interface Employee {
  id: string;
  full_name: string;
  employee_id: string;
  department: string | null;
  department_id: string | null;
  position: string | null;
  phone: string | null;
  email: string | null;
  salary_level: string | null;
  commission: string | null;
  commission_type: "percent" | "etb" | null;
  id_card_front_url: string | null;
  id_card_back_url: string | null;
  profile_photo_url: string | null;
  office_id: string | null;
  office: string | null;
  event_prices: Record<string, number> | null;
  base_salary?: number;
  gender: string | null;
  employment_type: string | null;
  group_name: string | null;
  bank_name: string | null;
  bank_account: string | null;
  hire_date: string | null;
  contract_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeesResponse {
  employees: Employee[];
  total: number;
  page: number;
  limit: number;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  permission_slugs?: string[];
}

export interface User {
  id: string;
  username: string;
  full_name: string;
  email: string | null;
  phone?: string | null;
  profile_image_url?: string | null;
  role_id: string;
  role_name: string;
  role_ids?: string[];
  role_names?: string[];
  permission_slugs: string[];
  is_active: boolean;
  created_at: string;
}


export interface InventoryStats {
  totalItems: number;
  stockPerLocation: {
    location: string;
    quantity: number;
    lowStockItems: number;
    totalEntries: number;
    store_id: string;
  }[];
  lowStockItems: number;
  reconciledRecently: number;
  totalEntries: number;
}

export interface ReconcileRun {
  id: string;
  started_at: string;
  completed_at: string | null;
  initiated_by: string | { id: string; full_name: string | null };
  initiated_by_name?: string;
  store_id: string | null;
  store?: { id: string; name: string | null } | null;
  store_name?: string;
  status: "pending" | "completed";
  notes: string | null;
  item_count: number;
  primary_item_name?: string | null;
  trashed_at?: string | null;
  total_delta?: number;
  discrepancy_count?: number;
  first_prev?: number;
  first_delta?: number;
}

export interface ReconcileRunDetail extends ReconcileRun {
  items: {
    id: string;
    item_id: string;
    item_name: string;
    previous_quantity: number;
    counted_quantity: number;
    delta: number;
    counted_by_name: string;
    counted_at: string;
  }[];
}

export interface ReconcileSummary {
  run_id: string | null;
  success: boolean;
  count: number;
  audit_committed?: boolean;
  audit_warning?: string | null;
  failed_item_ids?: string[];
  summary: {
    changed_rows: number;
    zero_delta_rows: number;
    total_delta: number;
    notes: string | null;
    store_id: string | null;
  };
}


// ====================================================
// HR & PAYROLL MODULE TYPES
// ====================================================

export interface SalaryLevel {
  id: string;
  level_name: string;
  base_salary: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface EventType {
  id: string;
  event_name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PayrollRunLineEvent {
  id?: string;
  employee_line_id?: string;
  event_type_id: string;
  event_name?: string;
  quantity: number;
  price_applied: number;
  total_price_for_type: number;
  override_price_etb?: number | null;
  override_reason?: string | null;
}

export interface PayrollEmployeeLine {
  id?: string;
  payroll_run_id?: string;
  employee_id: string;
  employee_name_snapshot: string;
  profile_photo_url?: string | null;
  snapshot_base_salary: number;
  total_events_value: number;
  total_line_pay: number;
  events: PayrollRunLineEvent[];
}

export interface PayrollRun {
  id: string;
  month: number;
  year: number;
  period_start: string;
  period_end: string;
  status: "DRAFT" | "FINALIZED" | "FLAGGED_WRONG" | "TRASH";
  total_payroll_value: number;
  locked_at: string | null;
  created_by_user_id: string | null;
  created_by_username?: string;
  corrected_run_id: string | null;
  notes: string | null;
  default_include_images: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  employee_lines?: PayrollEmployeeLine[];
}

export interface PayrollPreviewPayload {
  month: number;
  year: number;
  total_payroll_value: number;
  employee_lines: PayrollEmployeeLine[];
}

export interface PayrollGenerateRequest {
  month?: number;
  year?: number;
  period_kind?: "month" | "half_month" | "range";
  period_start?: string;
  period_end?: string;
  employeeLineEvents: {
    employee_id: string;
    events: {
      event_type_id: string;
      quantity: number;
      selected_level_id?: string | null;
      price_override?: number | null;
      override_reason?: string | null;
    }[];
  }[];
}

// ====================================================
// EVENT LIFE CYCLE MODULE TYPES
// ====================================================

export interface EventLog {
  id: string;
  event_id: string;
  user_id: string | null;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
  user_username?: string;
  user_full_name?: string;
}

export interface Event {
  id: string;
  name: string;
  client_name: string;
  client_phone: string | null;
  event_type_id: string | null;
  event_type_name?: string | null;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  venue_location: string;
  contract_price: number;
  package_design_notes?: string | null;
  estimated_design_cost?: number | null;
  status: "Planned" | "Ongoing" | "Completed";
  created_by: string | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface EventsResponse {
  events: Event[];
  total: number;
  page: number;
  limit: number;
}

export interface EventInventoryAllocation {
  id: string;
  event_id: string;
  item_id: string;
  quantity_allocated: number;
  status: "Reserved" | "Pulled" | "Returned";
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  item_name: string;
  available_quantity: number;
  item_description: string | null;
  image_key: string | null;
  store_name: string | null;
}

export interface EventChecklistItem {
  id: string;
  event_id: string;
  title: string;
  status: "Todo" | "Done";
  due_date: string | null;
  owner_name: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventAssignment {
  id: string;
  event_id: string;
  employee_id: string;
  employee_name?: string;
  employee_phone?: string;
  role: string;
  commission_amount: number;
  attended: boolean;
  created_at: string;
}

export interface Vehicle {
  id: string;
  plate_number: string;
  vehicle_type: string;
  fuel_type: string;
  fuel_consumption_rate: number;
  driver_license_details: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface VehicleAssignment {
  id: string;
  event_id: string;
  vehicle_id: string;
  plate_number?: string;
  vehicle_type?: string;
  fuel_type?: string;
  fuel_consumption_rate?: number;
  driver_id: string | null;
  driver_name?: string | null;
  is_night_shift: boolean;
  created_at: string;
}

export interface EventExpense {
  id: string;
  event_id: string;
  category: "Fuel" | "Labor" | "Transportation" | "Equipment Rental" | "Consumables" | "Other";
  amount: number;
  description: string;
  receipt_image_key: string | null;
  status: "Pending" | "Approved" | "Rejected";
  rejected_reason: string | null;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
  approved_at: string | null;
  event_name?: string;
  client_name?: string;
  venue_location?: string;
  submitted_by_name?: string | null;
  approved_by_name?: string | null;
}

export interface PaginatedExpenseResponse {
  data: EventExpense[];
  total: number;
  page: number;
  totalPages: number;
}

export interface EventTripLog {
  id: string;
  vehicle_assignment_id: string;
  event_id?: string;
  vehicle_id?: string;
  destination: string;
  distance_km: number;
  fuel_liters_used: number;
  fuel_cost_etb: number;
  plate_number?: string;
  vehicle_type?: string;
  fuel_type?: string;
  fuel_consumption_rate?: number;
  driver_name?: string | null;
  created_at: string;
}

export interface EventWorkspace {
  event: Event;
  allocations: EventInventoryAllocation[];
  checklist: EventChecklistItem[];
  assignments: EventAssignment[];
  vehicleAssignments: VehicleAssignment[];
  expenses: EventExpense[];
  trips: EventTripLog[];
}

export interface CategoryCost {
  category: "Fuel" | "Labor" | "Transportation" | "Equipment Rental" | "Consumables" | "Other";
  amount: number;
}

export interface EventProfitSummary {
  eventId: string;
  name: string;
  contractPrice: number;
  totalExpenses: number;
  netProfit: number;
  profitMargin: number;
  categoryBreakdown: CategoryCost[];
}

export interface MonthProfitSummary {
  month: string;
  eventCount: number;
  revenue: number;
  expenses: number;
  profit: number;
  margin: number;
}

export interface ProfitReportRow {
  event_id: string;
  event_name: string;
  event_type_name: string | null;
  event_type_id: string | null;
  start_date: string;
  status: string;
  revenue: number;
  approved_expenses: number;
  labor_cost: number;
  fuel_cost: number;
  other_cost: number;
  pending_expense_exposure: number;
  net_profit: number;
  margin_percentage: number;
  proposal_id: string | null;
  proposal_status: string | null;
  estimated_total_cost: number;
  estimated_net_profit: number;
  estimated_profit_variance: number | null;
}

export interface ProfitReportSummary {
  summary: {
    totalEvents: number;
    totalRevenue: number;
    totalExpenses: number;
    netProfit: number;
    profitMargin: number;
    pendingExpenseExposure: number;
  };
  categoryBreakdown: CategoryCost[];
  monthlyData: MonthProfitSummary[];
  eventTypePerformance: {
    eventType: string;
    eventCount: number;
    revenue: number;
    expenses: number;
    netProfit: number;
    averageMargin: number;
  }[];
  kpis: {
    mostProfitableEvent: ProfitReportRow | null;
    mostProfitableEventType: {
      eventType: string;
      eventCount: number;
      revenue: number;
      expenses: number;
      netProfit: number;
      averageMargin: number;
    } | null;
    highestMarginEventType: {
      eventType: string;
      eventCount: number;
      revenue: number;
      expenses: number;
      netProfit: number;
      averageMargin: number;
    } | null;
    lowestMarginEvent: ProfitReportRow | null;
    pendingExpenseExposure: number;
    proposalConversionRate: number;
  };
  proposalVariance: {
    events: {
      eventId: string;
      eventName: string;
      proposalId: string;
      estimatedNetProfit: number;
      actualNetProfit: number;
      variance: number | null;
    }[];
    averageVariance: number;
  };
}

export interface EventSavedView {
  id: string;
  name: string;
  user_id: string | null;
  scope: "personal" | "role" | "global";
  role_name: string | null;
  columns: string[];
  filters: {
    field: string;
    operator: string;
    value?: unknown;
  }[];
  sort: {
    sortBy: string;
    sortOrder: "asc" | "desc";
  } | null;
  page_size: number;
  is_default: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProposalEstimateLine {
  label: string;
  amount: number;
  notes?: string | null;
  people_count?: number;
  commission_per_person?: number;
  km?: number;
  fuel_price?: number;
}

export interface EventProposal {
  id: string;
  name: string;
  client_name: string;
  client_phone: string | null;
  event_type_id: string | null;
  event_type_name?: string | null;
  requested_budget: number;
  requested_start_date: string | null;
  requested_end_date: string | null;
  requested_start_time: string | null;
  requested_end_time: string | null;
  venue_location: string | null;
  notes: string | null;
  package_design_notes: string | null;
  cost_breakdown: {
    design?: ProposalEstimateLine[];
    team?: ProposalEstimateLine[];
    trip?: ProposalEstimateLine[];
    other?: ProposalEstimateLine[];
  };
  estimated_design_cost: number;
  estimated_team_cost: number;
  estimated_trip_cost: number;
  estimated_other_cost: number;
  estimated_total_cost: number;
  estimated_net_profit: number;
  estimated_margin_percentage: number;
  status: "Draft" | "Submitted" | "Approved" | "Rejected" | "Converted" | "Canceled";
  rejection_reason: string | null;
  converted_event_id: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_by_user_id?: string | null;
  approved_by_name?: string | null;
  approved_by_username?: string | null;
  approved_by_email?: string | null;
  approved_at: string | null;
  created_by: string | null;
  proposed_by_user_id?: string | null;
  proposed_by_name?: string | null;
  proposed_by_username?: string | null;
  proposed_by_email?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface EventProposalLog {
  id: string;
  proposal_id: string;
  user_id: string | null;
  action: string;
  old_status: string | null;
  new_status: string | null;
  note: string | null;
  created_at: string;
}
