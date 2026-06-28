import { Pool, PoolClient } from "pg";
import { Router, Response } from "express";
import { pool } from "../../db/pool";
import { requireAuth, AuthRequest, getEffectivePermissionSlugsFromUser } from "../../middleware/auth";
import { hasPermissionSlug } from "../../lib/permissions";
import { eventProposalPayloadSchema, eventProposalListQuerySchema, eventProposalRejectSchema } from "../../lib/validation";

function hasPermission(req: AuthRequest, slug: string): boolean {
  return hasPermissionSlug(getEffectivePermissionSlugsFromUser(req.user), slug);
}

function canWriteEventProposals(req: AuthRequest): boolean {
  return hasPermission(req, "events:proposals:write") || hasPermission(req, "events:write");
}

function canApproveEventProposals(req: AuthRequest): boolean {
  return hasPermission(req, "events:proposals:approve");
}

function canReadEventProposals(req: AuthRequest): boolean {
  return canWriteEventProposals(req) || canApproveEventProposals(req);
}

function canDeleteEventProposals(req: AuthRequest): boolean {
  return hasPermission(req, "events:delete");
}

function canImportEvents(req: AuthRequest): boolean {
  return hasPermission(req, "events:write");
}

type ProposalFilterField = "name" | "client_name" | "venue_location" | "status" | "requested_budget" | "estimated_net_profit" | "estimated_margin_percentage" | "requested_start_date" | "requested_end_date" | "created_at" | "event_type_name";
type ProposalFilterOperator = "contains" | "equals" | "not_equals" | "greater_than" | "less_than" | "between";

function buildProposalFilterClause(
  filter: { field: ProposalFilterField; operator: ProposalFilterOperator; value?: unknown },
  params: Array<string | number | null>,
): string {
  const columnMap: Record<ProposalFilterField, string> = {
    name: "p.name",
    client_name: "p.client_name",
    venue_location: "p.venue_location",
    status: "p.status",
    requested_budget: "p.requested_budget",
    estimated_net_profit: "p.estimated_net_profit",
    estimated_margin_percentage: "p.estimated_margin_percentage",
    requested_start_date: "p.requested_start_date",
    requested_end_date: "p.requested_end_date",
    created_at: "p.created_at",
    event_type_name: "et.name",
  };

  const column = columnMap[filter.field];
  if (filter.operator === "contains") {
    params.push(`%${String(filter.value ?? "").trim()}%`);
    return `${column} ILIKE $${params.length}`;
  }

  if (filter.operator === "between") {
    const range = Array.isArray(filter.value) ? filter.value : [];
    const start = range[0] ?? null;
    const end = range[1] ?? null;
    params.push(start as string | number | null, end as string | number | null);
    return `${column} BETWEEN $${params.length - 1} AND $${params.length}`;
  }

  params.push(filter.value as string | number | null);
  const comparator = filter.operator === "not_equals" ? "<>" : filter.operator === "greater_than" ? ">" : filter.operator === "less_than" ? "<" : "=";
  return `${column} ${comparator} $${params.length}`;
}

function buildProposalFilterGroup(filters: Array<{ field: ProposalFilterField; operator: ProposalFilterOperator; value?: unknown }>, logic: "and" | "or", params: Array<string | number | null>): string {
  if (filters.length === 0) return "TRUE";
  const clauses = filters.map((filter) => buildProposalFilterClause(filter, params));
  const joiner = logic === "or" ? " OR " : " AND ";
  return clauses.length === 1 ? clauses[0] : `(${clauses.join(joiner)})`;
}

async function insertEventAuditLog(
  client: PoolClient | Pool,
  eventId: string | null,
  userId: string | null,
  fieldChanged: string,
  oldValue: string | null,
  newValue: string | null,
): Promise<void> {
  await client.query(
    `
      INSERT INTO event_logs (event_id, user_id, field_changed, old_value, new_value)
      VALUES ($1, $2, $3, $4, $5)
    `,
    [eventId, userId, fieldChanged, oldValue, newValue],
  );
}

type ProposalCostBreakdown = {
  design?: Array<{ amount: number }>;
  team?: Array<{ amount?: number; people_count?: number; commission_per_person?: number }>;
  trip?: Array<{ amount: number }>;
  other?: Array<{ amount: number }>;
};

function sumAmounts(lines: Array<{ amount?: number }> = []): number {
  return lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
}

function calculateProposalFinancials(requestedBudget: number, costBreakdown: ProposalCostBreakdown) {
  const estimatedDesignCost = sumAmounts(costBreakdown.design || []);
  const estimatedTeamCost = (costBreakdown.team || []).reduce((sum, line) => {
    const explicitAmount = Number(line.amount || 0);
    const derivedAmount = Number(line.people_count || 0) * Number(line.commission_per_person || 0);
    return sum + Math.max(explicitAmount, derivedAmount);
  }, 0);
  const estimatedTripCost = sumAmounts(costBreakdown.trip || []);
  const estimatedOtherCost = sumAmounts(costBreakdown.other || []);
  const estimatedTotalCost = estimatedDesignCost + estimatedTeamCost + estimatedTripCost + estimatedOtherCost;
  const estimatedNetProfit = requestedBudget - estimatedTotalCost;
  const estimatedMarginPercentage = requestedBudget > 0
    ? Number(((estimatedNetProfit / requestedBudget) * 100).toFixed(2))
    : 0;

  return {
    estimatedDesignCost,
    estimatedTeamCost,
    estimatedTripCost,
    estimatedOtherCost,
    estimatedTotalCost,
    estimatedNetProfit,
    estimatedMarginPercentage,
  };
}

function normalizeOptionalText(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value).trim();
}

function formatProposal(row: any) {
  const budget = Number(row.requested_budget || 0);
  const estimatedTotalCost = Number(row.estimated_total_cost || 0);
  const estimatedNetProfit = Number(row.estimated_net_profit || 0);
  const estimatedMarginPercentage = Number(row.estimated_margin_percentage || 0);
  return {
    ...row,
    requested_budget: budget,
    estimated_design_cost: Number(row.estimated_design_cost || 0),
    estimated_team_cost: Number(row.estimated_team_cost || 0),
    estimated_trip_cost: Number(row.estimated_trip_cost || 0),
    estimated_other_cost: Number(row.estimated_other_cost || 0),
    estimated_total_cost: estimatedTotalCost,
    estimated_net_profit: estimatedNetProfit,
    estimated_margin_percentage: estimatedMarginPercentage,
  };
}

async function insertProposalAuditLog(
  client: PoolClient | Pool,
  proposalId: string,
  userId: string | null,
  action: string,
  oldStatus: string | null,
  newStatus: string | null,
  note: string | null = null,
): Promise<void> {
  await client.query(
    `
      INSERT INTO event_proposal_logs (proposal_id, user_id, action, old_status, new_status, note)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [proposalId, userId, action, oldStatus, newStatus, note],
  );
}


export function createEventProposalsRouter(): Router {
  const router = Router();

  // GET /events/proposals - Event intake/profitability proposal queue
  router.get("/proposals", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      if (!canReadEventProposals(req)) {
        res.status(403).json({ error: "Forbidden: Missing event proposal access permission" });
        return;
      }

      const validationResult = eventProposalListQuerySchema.safeParse(req.query);
      if (!validationResult.success) {
        res.status(400).json({ error: validationResult.error.errors[0].message });
        return;
      }

      const {
        page,
        limit,
        status,
        created_by,
        event_type_id,
        search,
        start_date,
        end_date,
        min_margin,
        max_margin,
        min_profit,
        max_profit,
        filterLogic,
        filters,
        sortBy,
        sortOrder
      } = validationResult.data;
      const params: any[] = [];
      const conditions = ["p.deleted_at IS NULL"];

      if (status) {
        params.push(status);
        conditions.push(`p.status = $${params.length}`);
      }
      if (created_by) {
        params.push(created_by);
        conditions.push(`p.created_by = $${params.length}`);
      }
      if (event_type_id) {
        params.push(event_type_id);
        conditions.push(`p.event_type_id = $${params.length}`);
      }
      if (search?.trim()) {
        params.push(`%${search.trim()}%`);
        conditions.push(`(p.name ILIKE $${params.length} OR p.client_name ILIKE $${params.length} OR p.venue_location ILIKE $${params.length})`);
      }
      if (start_date) {
        params.push(start_date);
        conditions.push(`p.requested_start_date >= $${params.length}`);
      }
      if (end_date) {
        params.push(end_date);
        conditions.push(`p.requested_end_date <= $${params.length}`);
      }
      if (min_margin !== undefined) {
        params.push(min_margin);
        conditions.push(`p.estimated_margin_percentage >= $${params.length}`);
      }
      if (max_margin !== undefined) {
        params.push(max_margin);
        conditions.push(`p.estimated_margin_percentage <= $${params.length}`);
      }
      if (min_profit !== undefined) {
        params.push(min_profit);
        conditions.push(`p.estimated_net_profit >= $${params.length}`);
      }
      if (max_profit !== undefined) {
        params.push(max_profit);
        conditions.push(`p.estimated_net_profit <= $${params.length}`);
      }
      if (filters && filters.length > 0) {
        conditions.push(buildProposalFilterGroup(filters as any, filterLogic || "and", params));
      }

      const whereClause = conditions.join(" AND ");
      const countResult = await pool.query(`SELECT COUNT(*) FROM event_proposals p WHERE ${whereClause}`, params);
      const total = parseInt(countResult.rows[0].count, 10);
      const offset = (page - 1) * limit;
      const queryParams = [...params, limit, offset];

      let orderByClause = `
        ORDER BY
          CASE WHEN p.status = 'Submitted' THEN 0 ELSE 1 END,
          CASE
            WHEN p.requested_start_date IS NOT NULL AND p.requested_start_date <= CURRENT_DATE + INTERVAL '14 days'
            THEN p.estimated_net_profit
            ELSE NULL
          END DESC NULLS LAST,
          CASE
            WHEN p.requested_start_date IS NOT NULL AND p.requested_start_date <= CURRENT_DATE + INTERVAL '14 days'
            THEN p.estimated_margin_percentage
            ELSE NULL
          END DESC NULLS LAST,
          p.created_at ASC
      `;

      if (sortBy) {
        const order = sortOrder === "asc" ? "ASC" : "DESC";
        orderByClause = `ORDER BY p.${sortBy} ${order} NULLS LAST`;
      }

      const result = await pool.query(
        `
          SELECT
            p.*,
            et.name AS event_type_name,
            p.created_by AS proposed_by_user_id,
            proposer.full_name AS proposed_by_name,
            proposer.username AS proposed_by_username,
            proposer.email AS proposed_by_email,
            p.approved_by AS approved_by_user_id,
            approver.full_name AS approved_by_name,
            approver.username AS approved_by_username,
            approver.email AS approved_by_email
          FROM event_proposals p
          LEFT JOIN event_types et ON p.event_type_id = et.id
          LEFT JOIN users proposer ON proposer.id = p.created_by AND proposer.deleted_at IS NULL
          LEFT JOIN users approver ON approver.id = p.approved_by AND approver.deleted_at IS NULL
          WHERE ${whereClause}
          ${orderByClause}
          LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}
        `,
        queryParams,
      );

      res.json({
        proposals: result.rows.map(formatProposal),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error: any) {
      console.error("[event-proposals-list] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  // POST /events/proposals - Create draft proposal with rough estimates only
  router.post("/proposals", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      if (!canWriteEventProposals(req)) {
        res.status(403).json({ error: "Forbidden: Missing event proposal write permission" });
        return;
      }

      const validationResult = eventProposalPayloadSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ error: validationResult.error.errors[0].message });
        return;
      }

      const payload = validationResult.data;
      const financials = calculateProposalFinancials(payload.requested_budget, payload.cost_breakdown);
      const client = await pool.connect();

      try {
        await client.query("BEGIN");
        const result = await client.query(
          `
            INSERT INTO event_proposals (
              name, client_name, client_phone, event_type_id, requested_budget,
              requested_start_date, requested_end_date, requested_start_time, requested_end_time,
              venue_location, notes, package_design_notes, cost_breakdown,
              estimated_design_cost, estimated_team_cost, estimated_trip_cost, estimated_other_cost,
              estimated_total_cost, estimated_net_profit, estimated_margin_percentage, created_by
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
              $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
            )
            RETURNING *
          `,
          [
            payload.name,
            payload.client_name,
            normalizeOptionalText(payload.client_phone),
            normalizeOptionalText(payload.event_type_id),
            payload.requested_budget,
            normalizeOptionalText(payload.requested_start_date),
            normalizeOptionalText(payload.requested_end_date),
            normalizeOptionalText(payload.requested_start_time),
            normalizeOptionalText(payload.requested_end_time),
            normalizeOptionalText(payload.venue_location),
            normalizeOptionalText(payload.notes),
            normalizeOptionalText(payload.package_design_notes),
            JSON.stringify(payload.cost_breakdown),
            financials.estimatedDesignCost,
            financials.estimatedTeamCost,
            financials.estimatedTripCost,
            financials.estimatedOtherCost,
            financials.estimatedTotalCost,
            financials.estimatedNetProfit,
            financials.estimatedMarginPercentage,
            req.user?.id || null,
          ],
        );
        await insertProposalAuditLog(client, result.rows[0].id, req.user?.id || null, "proposal_created", null, "Draft");
        await client.query("COMMIT");
        res.status(201).json({ proposal: formatProposal(result.rows[0]) });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error: any) {
      console.error("[event-proposals-create] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  // GET /events/proposals/trash/list - Deleted proposal queue
  router.get("/proposals/trash/list", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      if (!canReadEventProposals(req)) {
        res.status(403).json({ error: "Forbidden: Missing event proposal access permission" });
        return;
      }

      const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 10, 1), 100);
      const offset = (page - 1) * limit;

      const countResult = await pool.query(`SELECT COUNT(*)::int AS count FROM event_proposals WHERE deleted_at IS NOT NULL`);
      const result = await pool.query(
        `
          SELECT
            p.*,
            et.name AS event_type_name,
            p.created_by AS proposed_by_user_id,
            proposer.full_name AS proposed_by_name,
            proposer.username AS proposed_by_username,
            proposer.email AS proposed_by_email,
            p.approved_by AS approved_by_user_id,
            approver.full_name AS approved_by_name,
            approver.username AS approved_by_username,
            approver.email AS approved_by_email
          FROM event_proposals p
          LEFT JOIN event_types et ON p.event_type_id = et.id
          LEFT JOIN users proposer ON proposer.id = p.created_by AND proposer.deleted_at IS NULL
          LEFT JOIN users approver ON approver.id = p.approved_by AND approver.deleted_at IS NULL
          WHERE p.deleted_at IS NOT NULL
          ORDER BY p.deleted_at DESC, p.updated_at DESC
          LIMIT $1 OFFSET $2
        `,
        [limit, offset],
      );

      const total = Number(countResult.rows[0]?.count || 0);
      res.json({ proposals: result.rows.map(formatProposal), total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
    } catch (error: any) {
      console.error("[event-proposals-trash-list] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  // POST /events/proposals/:proposalId/restore - Restore a deleted proposal
  router.post("/proposals/:proposalId/restore", requireAuth, async (req: AuthRequest, res: Response) => {
    if (!canDeleteEventProposals(req)) {
      res.status(403).json({ error: "Forbidden: Missing event delete permission" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `
          UPDATE event_proposals
          SET deleted_at = NULL, updated_at = NOW()
          WHERE id = $1 AND deleted_at IS NOT NULL
          RETURNING *
        `,
        [req.params.proposalId],
      );
      if (result.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Deleted event proposal not found" });
        return;
      }

      await insertProposalAuditLog(client, req.params.proposalId, req.user?.id || null, "proposal_restored", null, result.rows[0].status, "Restored from trash");
      await client.query("COMMIT");
      res.json({ proposal: formatProposal(result.rows[0]) });
    } catch (error: any) {
      await client.query("ROLLBACK");
      console.error("[event-proposals-restore] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    } finally {
      client.release();
    }
  });

  // DELETE /events/proposals/:proposalId/permanent - Hard delete only unconverted trashed proposals
  router.delete("/proposals/:proposalId/permanent", requireAuth, async (req: AuthRequest, res: Response) => {
    if (!canDeleteEventProposals(req)) {
      res.status(403).json({ error: "Forbidden: Missing event delete permission" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query(
        `SELECT * FROM event_proposals WHERE id = $1 AND deleted_at IS NOT NULL FOR UPDATE`,
        [req.params.proposalId],
      );
      if (existing.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Deleted event proposal not found" });
        return;
      }

      const proposal = existing.rows[0];
      if (proposal.converted_event_id || proposal.status === "Converted") {
        await insertProposalAuditLog(client, req.params.proposalId, req.user?.id || null, "proposal_permanent_delete_blocked", proposal.status, proposal.status, "Converted proposals preserve event traceability");
        await client.query("COMMIT");
        res.status(409).json({ error: "Converted proposals cannot be permanently deleted because they preserve event traceability" });
        return;
      }

      await client.query(`DELETE FROM event_proposals WHERE id = $1`, [req.params.proposalId]);
      await client.query("COMMIT");
      res.json({ success: true });
    } catch (error: any) {
      await client.query("ROLLBACK");
      console.error("[event-proposals-permanent-delete] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    } finally {
      client.release();
    }
  });

  // GET /events/proposals/:proposalId - Proposal detail with optional audit history
  router.get("/proposals/:proposalId", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      if (!canReadEventProposals(req)) {
        res.status(403).json({ error: "Forbidden: Missing event proposal access permission" });
        return;
      }

      const result = await pool.query(
        `
          SELECT
            p.*,
            et.name AS event_type_name,
            p.created_by AS proposed_by_user_id,
            proposer.full_name AS proposed_by_name,
            proposer.username AS proposed_by_username,
            proposer.email AS proposed_by_email,
            p.approved_by AS approved_by_user_id,
            approver.full_name AS approved_by_name,
            approver.username AS approved_by_username,
            approver.email AS approved_by_email
          FROM event_proposals p
          LEFT JOIN event_types et ON p.event_type_id = et.id
          LEFT JOIN users proposer ON proposer.id = p.created_by AND proposer.deleted_at IS NULL
          LEFT JOIN users approver ON approver.id = p.approved_by AND approver.deleted_at IS NULL
          WHERE p.id = $1 AND p.deleted_at IS NULL
        `,
        [req.params.proposalId],
      );
      if (result.rowCount === 0) {
        res.status(404).json({ error: "Event proposal not found" });
        return;
      }

      const logsResult = await pool.query(
        `SELECT * FROM event_proposal_logs WHERE proposal_id = $1 ORDER BY created_at ASC`,
        [req.params.proposalId],
      );
      res.json({ proposal: formatProposal(result.rows[0]), logs: logsResult.rows });
    } catch (error: any) {
      console.error("[event-proposals-detail] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  // DELETE /events/proposals/:proposalId - Soft delete proposal
  router.delete("/proposals/:proposalId", requireAuth, async (req: AuthRequest, res: Response) => {
    if (!canDeleteEventProposals(req)) {
      res.status(403).json({ error: "Forbidden: Missing event delete permission" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query(
        `SELECT id, status, deleted_at FROM event_proposals WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [req.params.proposalId],
      );
      if (existing.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Event proposal not found" });
        return;
      }

      const result = await client.query(
        `UPDATE event_proposals SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
        [req.params.proposalId],
      );
      await insertProposalAuditLog(client, req.params.proposalId, req.user?.id || null, "proposal_deleted", existing.rows[0].status, existing.rows[0].status, "Moved to trash");
      await client.query("COMMIT");
      res.json({ proposal: formatProposal(result.rows[0]) });
    } catch (error: any) {
      await client.query("ROLLBACK");
      console.error("[event-proposals-delete] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    } finally {
      client.release();
    }
  });

  async function transitionProposalStatus(
    req: AuthRequest,
    res: Response,
    allowedStatuses: string[],
    newStatus: string,
    action: string,
    note: string | null = null,
  ): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query(
        `SELECT * FROM event_proposals WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [req.params.proposalId],
      );
      if (existing.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Event proposal not found" });
        return;
      }

      const oldStatus = existing.rows[0].status;
      if (!allowedStatuses.includes(oldStatus)) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: `Cannot ${action} proposal from ${oldStatus} status` });
        return;
      }

      const updateResult = await client.query(
        `
          UPDATE event_proposals
          SET status = $1,
              submitted_at = CASE WHEN $1 = 'Submitted' THEN NOW() ELSE submitted_at END,
              approved_by = CASE WHEN $1 = 'Approved' THEN $2 ELSE approved_by END,
              approved_at = CASE WHEN $1 = 'Approved' THEN NOW() ELSE approved_at END,
              rejection_reason = CASE WHEN $1 = 'Rejected' THEN $3 ELSE rejection_reason END,
              updated_at = NOW()
          WHERE id = $4
          RETURNING *
        `,
        [newStatus, req.user?.id || null, note, req.params.proposalId],
      );
      await insertProposalAuditLog(client, req.params.proposalId, req.user?.id || null, action, oldStatus, newStatus, note);
      await client.query("COMMIT");
      res.json({ proposal: formatProposal(updateResult.rows[0]) });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  router.post("/proposals/:proposalId/submit", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      if (!canWriteEventProposals(req)) {
        res.status(403).json({ error: "Forbidden: Missing event proposal write permission" });
        return;
      }
      await transitionProposalStatus(req, res, ["Draft"], "Submitted", "proposal_submitted");
    } catch (error: any) {
      console.error("[event-proposals-submit] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  router.post("/proposals/:proposalId/approve", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      if (!canApproveEventProposals(req)) {
        res.status(403).json({ error: "Forbidden: Missing event proposal approval permission" });
        return;
      }
      await transitionProposalStatus(req, res, ["Submitted"], "Approved", "proposal_approved");
    } catch (error: any) {
      console.error("[event-proposals-approve] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  router.post("/proposals/:proposalId/reject", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      if (!canApproveEventProposals(req)) {
        res.status(403).json({ error: "Forbidden: Missing event proposal approval permission" });
        return;
      }
      const validationResult = eventProposalRejectSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ error: validationResult.error.errors[0].message });
        return;
      }
      await transitionProposalStatus(req, res, ["Submitted"], "Rejected", "proposal_rejected", validationResult.data.reason);
    } catch (error: any) {
      console.error("[event-proposals-reject] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  router.post("/proposals/:proposalId/cancel", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      if (!canApproveEventProposals(req) && !canWriteEventProposals(req)) {
        res.status(403).json({ error: "Forbidden: Missing event proposal permission" });
        return;
      }
      await transitionProposalStatus(req, res, ["Draft", "Submitted", "Approved"], "Canceled", "proposal_canceled");
    } catch (error: any) {
      console.error("[event-proposals-cancel] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  // POST /events/proposals/:proposalId/convert - Atomically convert approved proposal into a real event
  router.post("/proposals/:proposalId/convert", requireAuth, async (req: AuthRequest, res: Response) => {
    if (!canApproveEventProposals(req) || !canImportEvents(req)) {
      res.status(403).json({ error: "Forbidden: Missing event proposal conversion permission" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const proposalResult = await client.query(
        `SELECT * FROM event_proposals WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [req.params.proposalId],
      );
      if (proposalResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Event proposal not found" });
        return;
      }

      const proposal = proposalResult.rows[0];
      if (proposal.converted_event_id) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "Proposal is already converted", eventId: proposal.converted_event_id });
        return;
      }
      if (proposal.status !== "Approved") {
        await client.query("ROLLBACK");
        res.status(409).json({ error: `Cannot convert proposal from ${proposal.status} status` });
        return;
      }
      if (!proposal.requested_start_date || !proposal.requested_end_date || !proposal.venue_location) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Approved proposal must have dates and venue before conversion" });
        return;
      }

      const eventResult = await client.query(
        `
          INSERT INTO events (
            name, client_name, client_phone, event_type_id,
            start_date, end_date, start_time, end_time,
            venue_location, contract_price, status, created_by,
            package_design_notes, estimated_design_cost, event_proposal_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Planned', $11, $12, $13, $14)
          RETURNING *
        `,
        [
          proposal.name,
          proposal.client_name,
          proposal.client_phone,
          proposal.event_type_id,
          proposal.requested_start_date,
          proposal.requested_end_date,
          proposal.requested_start_time,
          proposal.requested_end_time,
          proposal.venue_location,
          proposal.requested_budget,
          req.user?.id || null,
          proposal.package_design_notes,
          proposal.estimated_design_cost,
          proposal.id,
        ],
      );

      const updatedProposal = await client.query(
        `
          UPDATE event_proposals
          SET status = 'Converted',
              converted_event_id = $1,
              updated_at = NOW()
          WHERE id = $2 AND converted_event_id IS NULL
          RETURNING *
        `,
        [eventResult.rows[0].id, proposal.id],
      );
      if (updatedProposal.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "Proposal conversion was already completed" });
        return;
      }

      await insertProposalAuditLog(client, proposal.id, req.user?.id || null, "proposal_converted", proposal.status, "Converted", eventResult.rows[0].id);
      await insertEventAuditLog(client, eventResult.rows[0].id, req.user?.id || null, "event_created_from_proposal", null, proposal.id);
      await client.query("COMMIT");
      res.status(201).json({ proposal: formatProposal(updatedProposal.rows[0]), event: eventResult.rows[0] });
    } catch (error: any) {
      await client.query("ROLLBACK");
      console.error("[event-proposals-convert] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    } finally {
      client.release();
    }
  });


  return router;
}
