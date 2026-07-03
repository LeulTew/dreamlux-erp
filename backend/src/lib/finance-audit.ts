import { Pool, PoolClient } from "pg";

// Transaction-aware audit insert for finance modules: callers pass their open
// client so a failed audit write rolls the whole mutation back.
export async function insertFinanceAuditLog(
  client: PoolClient | Pool,
  input: {
    entityType: string;
    entityId: string;
    userId: string | null;
    action: string;
    fieldChanged?: string | null;
    oldValue?: string | null;
    newValue?: string | null;
    note?: string | null;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO public.activity_logs (entity_type, entity_id, user_id, action, field_changed, old_value, new_value, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      input.entityType,
      input.entityId,
      input.userId,
      input.action,
      input.fieldChanged ?? null,
      input.oldValue ?? null,
      input.newValue ?? null,
      input.note ?? null,
    ],
  );
}

export function roundMoney(value: unknown): number {
  return Number(Number(value || 0).toFixed(2));
}

// pg returns DATE columns as Date objects; audit values need plain YYYY-MM-DD.
export function toDateString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}
