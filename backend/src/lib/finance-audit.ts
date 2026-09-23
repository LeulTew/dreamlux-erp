import { Pool, PoolClient } from "pg";

// Transaction-aware audit insert for finance modules: callers pass their open
// client so a failed or suppressed audit write rolls the whole mutation back.
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
  const written = await client.query(
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
  if (written.rowCount !== 1) throw new Error("Finance audit write was not acknowledged");
}

export function roundMoney(value: unknown): number {
  return Number(Number(value || 0).toFixed(2));
}

// pg returns DATE columns as local-midnight Date objects; format their local
// calendar parts so the day never shifts with the server's UTC offset.
export function toDateString(value: unknown): string {
  if (value instanceof Date) {
    const pad = (part: number) => String(part).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  return String(value).slice(0, 10);
}
