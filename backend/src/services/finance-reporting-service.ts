import { Pool } from "pg";
import { pool } from "../db/pool";
import { roundMoney, toDateString } from "../lib/finance-audit";
import { overheadMonthToDate } from "../lib/validation";

export type MonthlyNetProfitOptions = {
  month: string;
  include_investments_in_net?: boolean;
};

type Queryable = Pick<Pool, "query">;

function nextMonthDate(monthDate: string): string {
  const start = new Date(`${monthDate}T00:00:00Z`);
  start.setUTCMonth(start.getUTCMonth() + 1);
  return start.toISOString().slice(0, 10);
}

function numberValue(value: unknown): number {
  return roundMoney(Number(value || 0));
}

function countValue(value: unknown): number {
  return Number(value || 0);
}

function asCategoryRows(rows: Array<Record<string, unknown>>, categoryKey = "category") {
  return rows.map((row) => ({
    category: String(row[categoryKey] || "Uncategorized"),
    amount: numberValue(row.amount),
    count: countValue(row.count),
  }));
}

export async function buildMonthlyNetProfitStatement(
  options: MonthlyNetProfitOptions,
  db: Queryable = pool,
) {
  const monthStart = overheadMonthToDate(options.month);
  const monthEndExclusive = nextMonthDate(monthStart);
  const includeInvestmentsInNet = Boolean(options.include_investments_in_net);
  const params = [monthStart, monthEndExclusive];

  const [
    eventTotalsResult,
    eventExpenseCategoryResult,
    eventDrilldownResult,
    operationalCategoryResult,
    overheadGroupResult,
    payrollResult,
    payrollRunResult,
    investmentCategoryResult,
    investmentDrilldownResult,
    closureResult,
  ] = await Promise.all([
    db.query(
      `WITH event_expenses AS (
         SELECT event_id,
                COALESCE(SUM(amount) FILTER (WHERE status = 'Approved'), 0)::numeric AS approved_expenses,
                COALESCE(SUM(amount) FILTER (WHERE status = 'Pending'), 0)::numeric AS pending_expenses
         FROM expenses
         GROUP BY event_id
       )
       SELECT
         COUNT(e.id)::int AS event_count,
         COALESCE(SUM(e.contract_price), 0)::numeric AS revenue,
         COALESCE(SUM(COALESCE(event_expenses.approved_expenses, 0)), 0)::numeric AS approved_expenses,
         COALESCE(SUM(COALESCE(event_expenses.pending_expenses, 0)), 0)::numeric AS pending_expenses
       FROM events e
       LEFT JOIN event_expenses ON event_expenses.event_id = e.id
       WHERE e.deleted_at IS NULL
         AND e.start_date >= $1
         AND e.start_date < $2`,
      params,
    ),
    db.query(
      `SELECT x.category,
              COALESCE(SUM(x.amount), 0)::numeric AS amount,
              COUNT(*)::int AS count
       FROM expenses x
       JOIN events e ON e.id = x.event_id
       WHERE e.deleted_at IS NULL
         AND e.start_date >= $1
         AND e.start_date < $2
         AND x.status = 'Approved'
       GROUP BY x.category
       ORDER BY amount DESC, x.category ASC`,
      params,
    ),
    db.query(
      `WITH event_expenses AS (
         SELECT event_id,
                COALESCE(SUM(amount) FILTER (WHERE status = 'Approved'), 0)::numeric AS approved_expenses,
                COALESCE(SUM(amount) FILTER (WHERE status = 'Pending'), 0)::numeric AS pending_expenses
         FROM expenses
         GROUP BY event_id
       )
       SELECT e.id, e.name, to_char(e.start_date, 'YYYY-MM-DD') AS start_date,
              COALESCE(e.contract_price, 0)::numeric AS revenue,
              COALESCE(event_expenses.approved_expenses, 0)::numeric AS approved_expenses,
              COALESCE(event_expenses.pending_expenses, 0)::numeric AS pending_expenses,
              (COALESCE(e.contract_price, 0) - COALESCE(event_expenses.approved_expenses, 0))::numeric AS net_profit
       FROM events e
       LEFT JOIN event_expenses ON event_expenses.event_id = e.id
       WHERE e.deleted_at IS NULL
         AND e.start_date >= $1
         AND e.start_date < $2
       ORDER BY e.start_date ASC, e.name ASC
       LIMIT 250`,
      params,
    ),
    db.query(
      `SELECT category,
              COALESCE(SUM(amount) FILTER (WHERE status = 'Approved'), 0)::numeric AS amount,
              COALESCE(SUM(amount) FILTER (WHERE status = 'Pending'), 0)::numeric AS pending_amount,
              COUNT(*) FILTER (WHERE status = 'Approved')::int AS count
       FROM finance_operational_expenses
       WHERE deleted_at IS NULL
         AND expense_date >= $1
         AND expense_date < $2
       GROUP BY category
       ORDER BY amount DESC, category ASC`,
      params,
    ),
    db.query(
      `SELECT scope, payment_kind,
              COALESCE(SUM(amount) FILTER (WHERE status = 'Approved'), 0)::numeric AS amount,
              COALESCE(SUM(amount) FILTER (WHERE status = 'Pending'), 0)::numeric AS pending_amount,
              COUNT(*) FILTER (WHERE status = 'Approved')::int AS count
       FROM finance_overhead_expenses
       WHERE deleted_at IS NULL
         AND expense_month = $1
       GROUP BY scope, payment_kind
       ORDER BY scope ASC, payment_kind ASC`,
      [monthStart],
    ),
    db.query(
      `SELECT COALESCE(SUM(line.employee_total_snapshot), 0)::numeric AS amount,
              COUNT(DISTINCT run.id)::int AS run_count,
              COUNT(line.id)::int AS employee_line_count
       FROM payroll_runs run
       JOIN payroll_run_employee_lines line ON line.run_id = run.id
       WHERE run.deleted_at IS NULL
         AND run.status = 'finalized'
         AND run.period_start < $2
         AND run.period_end >= $1`,
      params,
    ),
    db.query(
      `SELECT run.id, run.title, to_char(run.period_start, 'YYYY-MM-DD') AS period_start,
              to_char(run.period_end, 'YYYY-MM-DD') AS period_end,
              COALESCE(SUM(line.employee_total_snapshot), 0)::numeric AS total
       FROM payroll_runs run
       JOIN payroll_run_employee_lines line ON line.run_id = run.id
       WHERE run.deleted_at IS NULL
         AND run.status = 'finalized'
         AND run.period_start < $2
         AND run.period_end >= $1
       GROUP BY run.id
       ORDER BY run.period_start ASC, run.title ASC
       LIMIT 100`,
      params,
    ),
    db.query(
      `SELECT category,
              COALESCE(SUM(total_cost) FILTER (WHERE status = 'Approved'), 0)::numeric AS amount,
              COALESCE(SUM(total_cost) FILTER (WHERE status = 'Pending'), 0)::numeric AS pending_amount,
              COUNT(*) FILTER (WHERE status = 'Approved')::int AS count
       FROM capital_investments
       WHERE deleted_at IS NULL
         AND purchase_date >= $1
         AND purchase_date < $2
       GROUP BY category
       ORDER BY amount DESC, category ASC`,
      params,
    ),
    db.query(
      `SELECT id, item_name, category, to_char(purchase_date, 'YYYY-MM-DD') AS purchase_date,
              quantity, unit, unit_cost, total_cost, vendor, capex_classification, asset_id
       FROM capital_investments
       WHERE deleted_at IS NULL
         AND status = 'Approved'
         AND purchase_date >= $1
         AND purchase_date < $2
       ORDER BY purchase_date ASC, item_name ASC
       LIMIT 250`,
      params,
    ),
    db.query(
      `SELECT c.month, c.closed_at, u.username AS closed_by_username
       FROM finance_overhead_month_closures c
       LEFT JOIN users u ON u.id = c.closed_by
       WHERE c.month = $1`,
      [monthStart],
    ),
  ]);

  const eventTotals = eventTotalsResult.rows[0] || {};
  const eventRevenue = numberValue(eventTotals.revenue);
  const approvedEventExpenses = numberValue(eventTotals.approved_expenses);
  const pendingEventExpenses = numberValue(eventTotals.pending_expenses);
  const eventGrossProfit = roundMoney(eventRevenue - approvedEventExpenses);

  const operationalRows = operationalCategoryResult.rows;
  const operationalExpenses = roundMoney(operationalRows.reduce((sum, row) => sum + numberValue(row.amount), 0));
  const pendingOperationalExpenses = roundMoney(operationalRows.reduce((sum, row) => sum + numberValue(row.pending_amount), 0));

  let approvedOverhead = 0;
  let pendingOverhead = 0;
  let staffPaymentOverhead = 0;
  for (const row of overheadGroupResult.rows) {
    const amount = numberValue(row.amount);
    approvedOverhead += amount;
    pendingOverhead += numberValue(row.pending_amount);
    if (row.payment_kind === "staff_payment") staffPaymentOverhead += amount;
  }
  approvedOverhead = roundMoney(approvedOverhead);
  pendingOverhead = roundMoney(pendingOverhead);
  staffPaymentOverhead = roundMoney(staffPaymentOverhead);

  const payrollAmount = numberValue(payrollResult.rows[0]?.amount);
  const payrollRunCount = countValue(payrollResult.rows[0]?.run_count);
  const staffPaymentOverheadIncluded = payrollRunCount > 0 ? 0 : staffPaymentOverhead;
  const staffPaymentOverheadExcluded = payrollRunCount > 0 ? staffPaymentOverhead : 0;
  const nonPayrollOverhead = roundMoney(approvedOverhead - staffPaymentOverhead);
  const overheadDeduction = roundMoney(nonPayrollOverhead + staffPaymentOverheadIncluded);
  const payrollDeduction = payrollAmount;

  const investmentRows = investmentCategoryResult.rows;
  const approvedInvestments = roundMoney(investmentRows.reduce((sum, row) => sum + numberValue(row.amount), 0));
  const pendingInvestments = roundMoney(investmentRows.reduce((sum, row) => sum + numberValue(row.pending_amount), 0));
  const approvedInvestmentCount = investmentRows.reduce((sum, row) => sum + countValue(row.count), 0);

  const operatingProfit = roundMoney(eventGrossProfit - operationalExpenses - overheadDeduction - payrollDeduction);
  const netAfterInvestments = includeInvestmentsInNet
    ? roundMoney(operatingProfit - approvedInvestments)
    : operatingProfit;
  const pendingExposure = roundMoney(pendingEventExpenses + pendingOperationalExpenses + pendingOverhead + pendingInvestments);
  const closure = closureResult.rows[0] || null;

  return {
    month: options.month,
    period: {
      start_date: monthStart,
      end_date: toDateString(new Date(new Date(`${monthEndExclusive}T00:00:00Z`).getTime() - 86_400_000)),
      closed: Boolean(closure),
      closure: closure
        ? { closed_at: closure.closed_at, closed_by_username: closure.closed_by_username || null }
        : null,
      snapshot_policy: "Open months are live read models. A month becomes operationally locked when overhead month closure exists; historical source edits remain auditable through source activity logs.",
    },
    treatment: {
      investments: includeInvestmentsInNet ? "deducted_below_operating_profit" : "shown_below_operating_profit",
      payroll: payrollRunCount > 0
        ? "finalized_payroll_runs_deducted_staff_payment_overheads_excluded"
        : "no_finalized_payroll_staff_payment_overheads_included",
    },
    totals: {
      eventRevenue,
      approvedEventExpenses,
      eventGrossProfit,
      operationalExpenses,
      overheadExpenses: overheadDeduction,
      payrollExpenses: payrollDeduction,
      operatingProfit,
      approvedInvestments,
      netAfterInvestments,
      pendingExposure,
      marginPercentage: eventRevenue > 0 ? Number(((operatingProfit / eventRevenue) * 100).toFixed(2)) : 0,
    },
    counts: {
      events: countValue(eventTotals.event_count),
      payrollRuns: payrollRunCount,
      payrollEmployeeLines: countValue(payrollResult.rows[0]?.employee_line_count),
      investmentRows: approvedInvestmentCount,
    },
    breakdowns: {
      eventExpensesByCategory: asCategoryRows(eventExpenseCategoryResult.rows),
      operationalExpensesByCategory: operationalRows.map((row) => ({
        category: String(row.category),
        amount: numberValue(row.amount),
        pendingAmount: numberValue(row.pending_amount),
        count: countValue(row.count),
      })),
      overheadByScope: overheadGroupResult.rows.map((row) => ({
        scope: String(row.scope),
        payment_kind: String(row.payment_kind),
        amount: numberValue(row.amount),
        pendingAmount: numberValue(row.pending_amount),
        count: countValue(row.count),
      })),
      investmentsByCategory: investmentRows.map((row) => ({
        category: String(row.category),
        amount: numberValue(row.amount),
        pendingAmount: numberValue(row.pending_amount),
        count: countValue(row.count),
      })),
      payroll: {
        amount: payrollDeduction,
        finalizedRunCount: payrollRunCount,
        employeeLineCount: countValue(payrollResult.rows[0]?.employee_line_count),
        staffPaymentOverheadIncluded: roundMoney(staffPaymentOverheadIncluded),
        staffPaymentOverheadExcluded: roundMoney(staffPaymentOverheadExcluded),
        nonPayrollOverhead,
      },
    },
    drilldowns: {
      events: eventDrilldownResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        start_date: row.start_date,
        revenue: numberValue(row.revenue),
        approvedExpenses: numberValue(row.approved_expenses),
        pendingExpenses: numberValue(row.pending_expenses),
        netProfit: numberValue(row.net_profit),
      })),
      payrollRuns: payrollRunResult.rows.map((row) => ({
        id: row.id,
        title: row.title,
        period_start: row.period_start,
        period_end: row.period_end,
        total: numberValue(row.total),
      })),
      investments: investmentDrilldownResult.rows.map((row) => ({
        id: row.id,
        item_name: row.item_name,
        category: row.category,
        purchase_date: row.purchase_date,
        quantity: Number(row.quantity || 0),
        unit: row.unit,
        unit_cost: numberValue(row.unit_cost),
        total_cost: numberValue(row.total_cost),
        vendor: row.vendor || null,
        capex_classification: row.capex_classification,
        asset_id: row.asset_id || null,
      })),
    },
  };
}
