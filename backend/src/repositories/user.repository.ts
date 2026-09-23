import { query, type QueryParam } from '../db/pool.js';
import type { Paginated, Role, UserListItem, UserRecord } from '../types.js';

export interface UserRow {
  id: string;
  name: string;
  username: string;
  role: Role;
  active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export function mapUserRow(row: UserRow): UserRecord {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role,
    active: row.active,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const USER_COLUMNS = `id, name, username, role, active, last_login_at, created_at, updated_at`;

export async function findById(id: string): Promise<UserRecord | null> {
  const { rows } = await query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = $1`,
    [id],
  );
  return rows[0] ? mapUserRow(rows[0]) : null;
}

/** Returns the password hash alongside the profile; login use only. */
export async function findByUsernameWithHash(
  username: string,
): Promise<(UserRecord & { passwordHash: string }) | null> {
  const { rows } = await query<UserRow & { password_hash: string }>(
    `SELECT ${USER_COLUMNS}, password_hash FROM users WHERE lower(username) = lower($1)`,
    [username],
  );
  const row = rows[0];
  return row ? { ...mapUserRow(row), passwordHash: row.password_hash } : null;
}

export async function usernameExists(username: string): Promise<boolean> {
  const { rowCount } = await query(
    `SELECT 1 FROM users WHERE lower(username) = lower($1)`,
    [username],
  );
  return (rowCount ?? 0) > 0;
}

export interface ListUsersOptions {
  search?: string;
  status?: 'active' | 'inactive';
  role?: Role;
  page: number;
  pageSize: number;
}

export async function listUsers(
  options: ListUsersOptions,
): Promise<Paginated<UserListItem>> {
  const conditions: string[] = [];
  const params: QueryParam[] = [];

  if (options.search) {
    params.push(`%${options.search}%`);
    conditions.push(`(u.name ILIKE $${params.length} OR u.username ILIKE $${params.length})`);
  }
  if (options.status) {
    params.push(options.status === 'active');
    conditions.push(`u.active = $${params.length}`);
  }
  if (options.role) {
    params.push(options.role);
    conditions.push(`u.role = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const totalResult = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM users u ${where}`,
    params,
  );
  const total = Number(totalResult.rows[0]?.count ?? 0);

  const offset = (options.page - 1) * options.pageSize;
  // The live session count is a correlated subquery, so a page of users still
  // costs one round trip.
  const { rows } = await query<UserRow & { active_sessions: string }>(
    `SELECT u.id, u.name, u.username, u.role, u.active,
            u.last_login_at, u.created_at, u.updated_at,
            (SELECT count(*)
               FROM sessions s
              WHERE s.user_id = u.id
                AND s.revoked_at IS NULL
                AND s.expires_at > now())::text AS active_sessions
       FROM users u
       ${where}
      ORDER BY u.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, options.pageSize, offset],
  );

  return {
    items: rows.map((row) => ({
      ...mapUserRow(row),
      activeSessions: Number(row.active_sessions),
    })),
    page: options.page,
    pageSize: options.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / options.pageSize)),
  };
}

export async function insertUser(input: {
  name: string;
  username: string;
  passwordHash: string;
  role: Role;
  active: boolean;
}): Promise<UserRecord> {
  const { rows } = await query<UserRow>(
    `INSERT INTO users (name, username, password_hash, role, active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${USER_COLUMNS}`,
    [input.name, input.username, input.passwordHash, input.role, input.active],
  );
  return mapUserRow(rows[0]!);
}

export async function updateUser(
  id: string,
  changes: { name?: string; active?: boolean },
): Promise<UserRecord | null> {
  const assignments: string[] = [];
  const params: QueryParam[] = [];

  if (changes.name !== undefined) {
    params.push(changes.name);
    assignments.push(`name = $${params.length}`);
  }
  if (changes.active !== undefined) {
    params.push(changes.active);
    assignments.push(`active = $${params.length}`);
  }
  if (assignments.length === 0) return findById(id);

  params.push(id);
  const { rows } = await query<UserRow>(
    `UPDATE users SET ${assignments.join(', ')} WHERE id = $${params.length}
     RETURNING ${USER_COLUMNS}`,
    params,
  );
  return rows[0] ? mapUserRow(rows[0]) : null;
}

export async function updatePasswordHash(id: string, passwordHash: string): Promise<void> {
  await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, id]);
}

export async function touchLastLogin(id: string): Promise<void> {
  await query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [id]);
}

export interface UserStats {
  total: number;
  active: number;
  inactive: number;
  admins: number;
}

export async function getUserStats(): Promise<UserStats> {
  const { rows } = await query<{
    total: string;
    active: string;
    inactive: string;
    admins: string;
  }>(
    `SELECT count(*)::text AS total,
            count(*) FILTER (WHERE active)::text AS active,
            count(*) FILTER (WHERE NOT active)::text AS inactive,
            count(*) FILTER (WHERE role = 'ADMIN' AND active)::text AS admins
       FROM users`,
  );
  const row = rows[0]!;
  return {
    total: Number(row.total),
    active: Number(row.active),
    inactive: Number(row.inactive),
    admins: Number(row.admins),
  };
}

/** Guards the "never remove the last active admin" rule (PRD 14.1). */
export async function countOtherActiveAdmins(excludingUserId: string): Promise<number> {
  const { rows } = await query<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM users
      WHERE role = 'ADMIN' AND active = true AND id <> $1`,
    [excludingUserId],
  );
  return Number(rows[0]?.count ?? 0);
}

