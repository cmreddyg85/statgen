import { createHmac, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';
import { query } from '../db/pool.js';
import type { Role, SessionRecord, UserRecord } from '../types.js';
import { mapUserRow, type UserRow } from '../repositories/user.repository.js';

/**
 * Sessions are opaque, server-side and absolute (PRD 8.1/8.2):
 *  - the raw token exists only in the HttpOnly cookie,
 *  - PostgreSQL stores an HMAC of the token, keyed with the server pepper,
 *  - expiry is decided at login and is never silently extended.
 */
const TOKEN_BYTES = 48;

export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHmac('sha256', env.SESSION_SECRET_OR_PEPPER).update(token).digest('hex');
}

/** Absolute session lifetime in milliseconds, by role. */
export function sessionLifetimeMs(role: Role): number {
  return role === 'ADMIN'
    ? env.SESSION_TTL_ADMIN_HOURS * 60 * 60 * 1000
    : env.SESSION_TTL_USER_MINUTES * 60 * 1000;
}

export function computeExpiry(role: Role, from: Date = new Date()): Date {
  return new Date(from.getTime() + sessionLifetimeMs(role));
}

export function isExpired(expiresAt: string | Date, now: Date = new Date()): boolean {
  const expiry = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  return expiry.getTime() <= now.getTime();
}

export interface CreatedSession {
  token: string;
  session: SessionRecord;
}

export async function createSession(input: {
  user: UserRecord;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<CreatedSession> {
  const token = generateSessionToken();
  const expiresAt = computeExpiry(input.user.role);

  const { rows } = await query<{
    id: string;
    user_id: string;
    created_at: string;
    expires_at: string;
  }>(
    `INSERT INTO sessions (user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4::inet, $5)
     RETURNING id, user_id, created_at, expires_at`,
    [
      input.user.id,
      hashSessionToken(token),
      expiresAt.toISOString(),
      input.ipAddress,
      input.userAgent?.slice(0, 400) ?? null,
    ],
  );

  const row = rows[0]!;
  return {
    token,
    session: {
      id: row.id,
      userId: row.user_id,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    },
  };
}

export type SessionResolution =
  | { status: 'valid'; user: UserRecord; session: SessionRecord }
  | { status: 'expired' }
  | { status: 'revoked' }
  | { status: 'inactive-user' }
  | { status: 'missing' };

/**
 * Resolves a raw cookie token to a live session. Every protected request goes
 * through this, so account deactivation and revocation take effect immediately.
 */
export async function resolveSession(token: string): Promise<SessionResolution> {
  const { rows } = await query<
    UserRow & {
      session_id: string;
      session_created_at: string;
      session_expires_at: string;
      revoked_at: string | null;
    }
  >(
    `SELECT s.id AS session_id,
            s.created_at AS session_created_at,
            s.expires_at AS session_expires_at,
            s.revoked_at,
            u.id, u.name, u.username, u.role, u.active,
            u.last_login_at, u.created_at, u.updated_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1`,
    [hashSessionToken(token)],
  );

  const row = rows[0];
  if (!row) return { status: 'missing' };
  if (row.revoked_at) return { status: 'revoked' };
  if (isExpired(row.session_expires_at)) return { status: 'expired' };
  if (!row.active) return { status: 'inactive-user' };

  return {
    status: 'valid',
    user: mapUserRow(row),
    session: {
      id: row.session_id,
      userId: row.id,
      createdAt: row.session_created_at,
      expiresAt: row.session_expires_at,
    },
  };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await query(
    `UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`,
    [sessionId],
  );
}

/** Used when an account is deactivated or its password is reset. */
export async function revokeAllSessionsForUser(userId: string): Promise<number> {
  const { rowCount } = await query(
    `UPDATE sessions
        SET revoked_at = now()
      WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [userId],
  );
  return rowCount ?? 0;
}

/**
 * Used when a user changes their own password: every other device is signed
 * out, while the session doing the change stays alive.
 */
export async function revokeOtherSessionsForUser(
  userId: string,
  keepSessionId: string,
): Promise<number> {
  const { rowCount } = await query(
    `UPDATE sessions
        SET revoked_at = now()
      WHERE user_id = $1
        AND id <> $2
        AND revoked_at IS NULL
        AND expires_at > now()`,
    [userId, keepSessionId],
  );
  return rowCount ?? 0;
}

/** Housekeeping: drop sessions that expired long ago. */
export async function purgeExpiredSessions(olderThanDays = 7): Promise<number> {
  const { rowCount } = await query(
    `DELETE FROM sessions WHERE expires_at < now() - ($1 || ' days')::interval`,
    [String(olderThanDays)],
  );
  return rowCount ?? 0;
}
