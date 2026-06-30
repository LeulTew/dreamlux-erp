import { pool } from "../db/pool";
import { hasPermissionSlug } from "../lib/permissions";

export interface ActivityLogEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  user_id: string | null;
  username: string | null;
  full_name: string | null;
  action: string;
  field_changed: string | null;
  old_value: string | null;
  new_value: string | null;
  note: string | null;
  source_route?: string | null;
  created_at: string;
}

export class ActivityService {
  /**
   * Log an activity transactionally or directly.
   */
  static async logActivity(params: {
    entity_type: string;
    entity_id: string;
    user_id: string | null;
    action: string;
    field_changed?: string | null;
    old_value?: string | null;
    new_value?: string | null;
    note?: string | null;
  }): Promise<boolean> {
    const {
      entity_type,
      entity_id,
      user_id,
      action,
      field_changed = null,
      old_value = null,
      new_value = null,
      note = null,
    } = params;

    try {
      await pool.query(
        `INSERT INTO public.activity_logs 
          (entity_type, entity_id, user_id, action, field_changed, old_value, new_value, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [entity_type, entity_id, user_id, action, field_changed, old_value, new_value, note]
      );
      return true;
    } catch (error) {
      console.error("[ActivityService] Failed to write log activity:", error);
      return false;
    }
  }

  /**
   * Process and redact sensitive before/after fields based on user permission slugs.
   */
  static redactLogs(logs: ActivityLogEntry[], userPermissionSlugs: string[]): ActivityLogEntry[] {
    const isSuperAdmin = userPermissionSlugs.includes("*") || userPermissionSlugs.some(s => s.toLowerCase().includes("super_admin"));
    const hasPayrollRead = isSuperAdmin || hasPermissionSlug(userPermissionSlugs, "payroll:read");
    const hasProfitRead = isSuperAdmin || hasPermissionSlug(userPermissionSlugs, "reports:read") || hasPermissionSlug(userPermissionSlugs, "events:profit:read");
    const hasUsersManage = isSuperAdmin || hasPermissionSlug(userPermissionSlugs, "users:manage");
    const hasEmployeesRead = isSuperAdmin || hasPermissionSlug(userPermissionSlugs, "employees:read");

    // Sensitive field indicators
    const isSensitivePayrollField = (field: string) => 
      /salary|bank|payout|account|rate|commission/i.test(field);
    const isSensitiveProfitField = (field: string) => 
      /profit|margin|budget|cost|price|revenue/i.test(field);
    const isSensitiveSecurityField = (field: string) => 
      /password|hash|permission|role_ids|role_id|secret/i.test(field);
    const isSensitivePhoneField = (field: string) => 
      /phone|mobile/i.test(field);

    return logs.map(log => {
      const field = log.field_changed || "";
      let redactedOld = log.old_value;
      let redactedNew = log.new_value;
      let redactedNote = log.note;

      // Payroll check
      if (isSensitivePayrollField(field) && !hasPayrollRead) {
        redactedOld = redactedOld ? "[REDACTED]" : null;
        redactedNew = redactedNew ? "[REDACTED]" : null;
      }

      // Profit check
      if (isSensitiveProfitField(field) && !hasProfitRead) {
        redactedOld = redactedOld ? "[REDACTED]" : null;
        redactedNew = redactedNew ? "[REDACTED]" : null;
      }

      // Security check
      if (isSensitiveSecurityField(field) && !hasUsersManage) {
        redactedOld = redactedOld ? "[REDACTED]" : null;
        redactedNew = redactedNew ? "[REDACTED]" : null;
        if (redactedNote) redactedNote = "[REDACTED]";
      }

      // Phone check
      if (isSensitivePhoneField(field) && !hasEmployeesRead && !hasUsersManage) {
        redactedOld = redactedOld ? "[REDACTED]" : null;
        redactedNew = redactedNew ? "[REDACTED]" : null;
      }

      return {
        ...log,
        old_value: redactedOld,
        new_value: redactedNew,
        note: redactedNote,
      };
    });
  }
}
