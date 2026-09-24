import { query } from '../db/pool.js';
import type { Paginated } from '../types.js';
import { logger } from '../utils/logger.js';

export type AuditAction =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'LOGOUT'
  | 'SESSION_EXPIRED'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_ACTIVATED'
  | 'USER_DEACTIVATED'
  | 'USER_PASSWORD_RESET'
  | 'USER_PASSWORD_CHANGED'
  | 'STUDENT_CREATED'
  | 'STUDENT_UPDATED'
  | 'STUDENT_DELETED'
  | 'STUDENT_ARCHIVED'
  | 'STUDENT_UNARCHIVED'
  | 'STUDENT_RECORD_CREATED'
  | 'STUDENT_RECORD_UPDATED'
  | 'STUDENT_RECORD_DELETED'
  | 'STUDENT_RECORD_FINALIZED'
  | 'STUDENT_RECORD_UNFINALIZED'
  | 'STUDENT_RECORD_DOWNLOAD_SHOWN'
  | 'STUDENT_RECORD_DOWNLOAD_HIDDEN'
  | 'SBI_REPORT_CREATED'
  | 'SBI_REPORT_UPDATED'
  | 'SBI_REPORT_DELETED'
  | 'AUTHORIZATION_FAILURE';

export interface AuditEntry {
  userId?: string | null;
  action: AuditAction;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditLogRow {
  id: string;
  userId: string | null;
  userName: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

/**
 * Audit writes must never break the business operation that triggered them,
 * so failures are logged and swallowed.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs
         (user_id, action, entity_type, entity_id, metadata_json, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::inet, $7)`,
      [
        entry.userId ?? null,
        entry.action,
        entry.entityType ?? null,
        entry.entityId ?? null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
        entry.ipAddress ?? null,
        entry.userAgent ?? null,
      ],
    );
  } catch (error) {
    logger.error({ err: error, action: entry.action }, 'Failed to write audit log entry');
  }
}

interface AuditRow {
  id: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata_json: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

const SELECT_AUDIT = `
  SELECT a.id, a.user_id, u.name AS user_name, a.action, a.entity_type,
         a.entity_id, a.metadata_json, host(a.ip_address) AS ip_address, a.created_at
    FROM audit_logs a
    LEFT JOIN users u ON u.id = a.user_id
`;

function mapAuditRow(row: AuditRow): AuditLogRow {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: row.metadata_json,
    ipAddress: row.ip_address,
    createdAt: row.created_at,
  };
}

export async function listRecentAudit(limit = 8): Promise<AuditLogRow[]> {
  const { rows } = await query<AuditRow>(
    `${SELECT_AUDIT}
      ORDER BY a.created_at DESC
      LIMIT $1`,
    [limit],
  );

  return rows.map(mapAuditRow);
}

/**
 * Everything on record for one account: actions the user performed, plus
 * changes an administrator made *to* the account. Both sides matter when
 * reviewing an account, so the modal shows them in one timeline.
 */
export async function listAuditForUser(
  userId: string,
  page: number,
  pageSize: number,
): Promise<Paginated<AuditLogRow>> {
  const scope = `WHERE a.user_id = $1
                    OR (a.entity_type = 'user' AND a.entity_id = $1)`;

  const totalResult = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM audit_logs a ${scope}`,
    [userId],
  );
  const total = Number(totalResult.rows[0]?.count ?? 0);

  const { rows } = await query<AuditRow>(
    `${SELECT_AUDIT}
      ${scope}
      ORDER BY a.created_at DESC
      LIMIT $2 OFFSET $3`,
    [userId, pageSize, (page - 1) * pageSize],
  );

  return {
    items: rows.map(mapAuditRow),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
