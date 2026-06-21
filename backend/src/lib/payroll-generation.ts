import { getPublicUrl } from "../storage/storage";

export type PayrollInputEvent = {
  event_type_id: string;
  quantity: number;
  selected_level_id?: string | null;
  price_override?: number | null;
  override_reason?: string | null;
};

export type PayrollInputLine = {
  employee_id: string;
  events: PayrollInputEvent[];
};

export type PayrollGeneratedEvent = {
  event_type_id: string;
  event_name_snapshot: string;
  price_applied: number;
  quantity: number;
  total_price_for_type: number;
  override_price_etb: number | null;
  override_reason: string | null;
};

export type PayrollGeneratedLine = {
  employee_id: string;
  employee_name_snapshot: string;
  salary_level_snapshot: string;
  profile_photo_url: string | null;
  snapshot_base_salary: number;
  total_events_value: number;
  total_line_pay: number;
  events: PayrollGeneratedEvent[];
};

type EmployeeRow = {
  id: string;
  full_name: string;
  salary_level?: string | null;
  base_salary?: number | string | null;
  profile_photo_key?: string | null;
  event_prices?: Record<string, number> | null;
};

type EventTypeRow = {
  id: string;
  name: string;
};

type SalaryLevelRow = {
  id: string;
  code: string;
  amount_etb: number | string | null;
};

export function buildPayrollLines(input: {
  employeeLineEvents: PayrollInputLine[];
  employees: EmployeeRow[];
  eventTypes: EventTypeRow[];
  salaryLevels: SalaryLevelRow[];
}): { totalPayrollValue: number; lines: PayrollGeneratedLine[] } {
  const salaryLevelByCode = new Map<string, { id: string; amount: number; code: string }>();
  const salaryLevelCodeById = new Map<string, string>();
  for (const salaryLevel of input.salaryLevels) {
    const normalizedId = String(salaryLevel.id);
    salaryLevelByCode.set(salaryLevel.code, {
      id: normalizedId,
      amount: Number(salaryLevel.amount_etb ?? 0),
      code: salaryLevel.code,
    });
    salaryLevelCodeById.set(normalizedId, salaryLevel.code);
  }

  const employeeById = new Map(input.employees.map((employee) => [employee.id, employee]));
  const eventTypeById = new Map(input.eventTypes.map((eventType) => [eventType.id, eventType]));

  let totalPayrollValue = 0;
  const lines: PayrollGeneratedLine[] = [];

  for (const line of input.employeeLineEvents) {
    const employee = employeeById.get(line.employee_id);
    if (!employee) continue;

    const levelData = salaryLevelByCode.get(employee.salary_level ?? "");
    const baseSalary = levelData?.amount ?? Number(employee.base_salary ?? 0);
    const levelCode = levelData?.code ?? employee.salary_level ?? "";
    let eventsTotal = 0;

    const events = line.events.map((eventLine) => {
      const eventMaster = eventTypeById.get(eventLine.event_type_id);
      const employeeDefinedPrice = Number(employee.event_prices?.[eventLine.event_type_id] ?? 0);
      const priceApplied = eventLine.price_override != null ? Number(eventLine.price_override) : employeeDefinedPrice;
      const lineTotal = eventLine.quantity * priceApplied;
      eventsTotal += lineTotal;

      const levelSuffix = eventLine.selected_level_id && salaryLevelCodeById.has(String(eventLine.selected_level_id))
        ? ` ${salaryLevelCodeById.get(String(eventLine.selected_level_id))}`
        : "";

      return {
        event_type_id: eventLine.event_type_id,
        event_name_snapshot: `${eventMaster?.name ?? "Event"}${levelSuffix}`,
        price_applied: priceApplied,
        quantity: eventLine.quantity,
        total_price_for_type: lineTotal,
        override_price_etb: eventLine.price_override ?? null,
        override_reason: eventLine.override_reason ?? null,
      };
    });

    const totalLinePay = baseSalary + eventsTotal;
    totalPayrollValue += totalLinePay;
    lines.push({
      employee_id: employee.id,
      employee_name_snapshot: employee.full_name,
      salary_level_snapshot: levelCode,
      profile_photo_url: employee.profile_photo_key ? getPublicUrl(employee.profile_photo_key) : null,
      snapshot_base_salary: baseSalary,
      total_events_value: eventsTotal,
      total_line_pay: totalLinePay,
      events,
    });
  }

  return { totalPayrollValue, lines };
}

export function toPayrollLinePayloads(runId: string, lines: PayrollGeneratedLine[]) {
  return lines.map((line) => ({
    run_id: runId,
    employee_id: line.employee_id,
    employee_name_snapshot: line.employee_name_snapshot,
    salary_level_snapshot: line.salary_level_snapshot,
    base_salary_snapshot: line.snapshot_base_salary,
    commission_total_snapshot: line.total_events_value,
    employee_total_snapshot: line.total_line_pay,
  }));
}

export function toPayrollEventPayloads(lines: PayrollGeneratedLine[], insertedLines: Array<{ id: string; employee_id: string }>) {
  const lineIdByEmployeeId = new Map(insertedLines.map((line) => [line.employee_id, line.id]));
  const eventRows = [];

  for (const line of lines) {
    const lineId = lineIdByEmployeeId.get(line.employee_id);
    if (!lineId) continue;

    for (const event of line.events) {
      eventRows.push({
        employee_line_id: lineId,
        event_type_id: event.event_type_id,
        event_name_snapshot: event.event_name_snapshot,
        unit_price_snapshot: event.price_applied,
        quantity: event.quantity,
        line_total_snapshot: event.total_price_for_type,
        override_price_etb: event.override_price_etb,
        override_reason: event.override_reason,
      });
    }
  }

  return eventRows;
}
