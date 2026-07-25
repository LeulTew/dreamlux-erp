import { pool } from "../db/pool";
import type { PayrollInputLine } from "./payroll-generation";

export type EligibleCommissionRow = {
  employee_id: string;
  event_type_id: string;
  quantity: number | string;
  commission_total: number | string;
};

export const ELIGIBLE_COMMISSIONS_SQL = `SELECT ea.employee_id,
              e.event_type_id,
              COUNT(DISTINCT ea.event_id)::integer AS quantity,
              COALESCE(SUM(ea.commission_amount), 0)::numeric AS commission_total
       FROM event_assignments ea
       JOIN events e ON e.id = ea.event_id
       WHERE ea.attended IS TRUE
         AND e.deleted_at IS NULL
         AND e.start_date BETWEEN $1::date AND $2::date
       GROUP BY ea.employee_id, e.event_type_id
       ORDER BY ea.employee_id, e.event_type_id`;

export async function getEligibleCommissionRows(start: string, end: string): Promise<EligibleCommissionRow[]> {
  const result = await pool.query<EligibleCommissionRow>(ELIGIBLE_COMMISSIONS_SQL, [start, end]);
  return result.rows;
}

export async function getAuthoritativePayrollInputLines(
  start: string,
  end: string,
  employeeIds: string[],
): Promise<PayrollInputLine[]> {
  const rows = await getEligibleCommissionRows(start, end);
  return mapEligibleCommissionRows(rows, employeeIds);
}

export function mapEligibleCommissionRows(rows: EligibleCommissionRow[], employeeIds: string[]): PayrollInputLine[] {
  const eventsByEmployee = new Map<string, PayrollInputLine["events"]>();

  for (const row of rows) {
    const quantity = Number(row.quantity);
    const commissionTotal = Number(row.commission_total);
    if (!Number.isFinite(quantity) || quantity < 1 || !Number.isFinite(commissionTotal) || commissionTotal < 0) {
      throw new Error("Invalid verified commission aggregate returned by the database");
    }
    const events = eventsByEmployee.get(row.employee_id) ?? [];
    events.push({
      event_type_id: row.event_type_id,
      quantity,
      price_override: commissionTotal / quantity,
      override_reason: "Verified attended event assignments",
    });
    eventsByEmployee.set(row.employee_id, events);
  }

  return employeeIds.map((employeeId) => ({ employee_id: employeeId, events: eventsByEmployee.get(employeeId) ?? [] }));
}
