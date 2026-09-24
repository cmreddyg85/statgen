import { recordAudit } from './audit.service.js';
import { hashPassword } from './password.service.js';
import {
  listActiveSessionsForUser,
  revokeAllSessionsForUser,
  revokeOtherSessionsForUser,
  revokeUserSession,
  type ActiveSession,
} from './session.service.js';
import * as users from '../repositories/user.repository.js';
import type { Paginated, RequestActor, UserRecord } from '../types.js';
import { conflict, forbidden, notFound } from '../utils/errors.js';

export async function list(
  options: users.ListUsersOptions,
): Promise<Paginated<UserRecord>> {
  return users.listUsers(options);
}

export async function getById(id: string): Promise<UserRecord> {
  const user = await users.findById(id);
  if (!user) throw notFound('User not found.');
  return user;
}

export async function create(
  input: { name: string; username: string; password: string; active: boolean },
  actor: RequestActor,
): Promise<UserRecord> {
  if (await users.usernameExists(input.username)) {
    throw conflict('That username is already taken.', {
      username: 'That username is already taken.',
    });
  }

  const passwordHash = await hashPassword(input.password);
  // Role is fixed to USER when created from User Management (PRD 7.4).
  const user = await users.insertUser({
    name: input.name,
    username: input.username,
    passwordHash,
    role: 'USER',
    active: input.active,
  });

  await recordAudit({
    userId: actor.user.id,
    action: 'USER_CREATED',
    entityType: 'user',
    entityId: user.id,
    metadata: { username: user.username, active: user.active },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });

  return user;
}

export async function update(
  id: string,
  changes: { name?: string; active?: boolean },
  actor: RequestActor,
): Promise<UserRecord> {
  const existing = await getById(id);

  if (changes.active === false) {
    await assertNotLastActiveAdmin(existing);
  }

  const updated = await users.updateUser(id, changes);
  if (!updated) throw notFound('User not found.');

  await recordAudit({
    userId: actor.user.id,
    action: 'USER_UPDATED',
    entityType: 'user',
    entityId: id,
    metadata: { changes },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });

  // Losing access must be immediate, not at the next natural expiry.
  if (changes.active === false && existing.active) {
    await revokeSessionsAndAudit(id, actor, 'USER_DEACTIVATED');
  }

  return updated;
}

export async function setActive(
  id: string,
  active: boolean,
  actor: RequestActor,
): Promise<UserRecord> {
  const existing = await getById(id);
  if (!active) await assertNotLastActiveAdmin(existing);

  const updated = await users.updateUser(id, { active });
  if (!updated) throw notFound('User not found.');

  if (active) {
    await recordAudit({
      userId: actor.user.id,
      action: 'USER_ACTIVATED',
      entityType: 'user',
      entityId: id,
      metadata: { username: updated.username },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });
  } else {
    await revokeSessionsAndAudit(id, actor, 'USER_DEACTIVATED');
  }

  return updated;
}

export async function resetPassword(
  id: string,
  newPassword: string,
  actor: RequestActor,
): Promise<void> {
  const existing = await getById(id);
  const passwordHash = await hashPassword(newPassword);
  await users.updatePasswordHash(id, passwordHash);

  // A password reset invalidates every session, including any the previous
  // password holder still has open.
  const revoked = await revokeAllSessionsForUser(id);

  await recordAudit({
    userId: actor.user.id,
    action: 'USER_PASSWORD_RESET',
    entityType: 'user',
    entityId: id,
    metadata: { username: existing.username, revokedSessions: revoked },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });
}

/**
 * An administrator changing their own password from the profile menu.
 *
 * Other sessions for the same account are revoked so a forgotten or
 * compromised device loses access at once, while the session performing the
 * change stays signed in.
 */
export async function changeOwnPassword(
  newPassword: string,
  actor: RequestActor,
): Promise<{ revokedSessions: number }> {
  const passwordHash = await hashPassword(newPassword);
  await users.updatePasswordHash(actor.user.id, passwordHash);

  const revoked = await revokeOtherSessionsForUser(actor.user.id, actor.session.id);

  await recordAudit({
    userId: actor.user.id,
    action: 'USER_PASSWORD_CHANGED',
    entityType: 'user',
    entityId: actor.user.id,
    metadata: { self: true, revokedSessions: revoked },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });

  return { revokedSessions: revoked };
}

export async function stats(): Promise<users.UserStats> {
  return users.getUserStats();
}

/** PRD 14.1: the system must always retain at least one active admin. */
async function assertNotLastActiveAdmin(user: UserRecord): Promise<void> {
  if (user.role !== 'ADMIN' || !user.active) return;
  const otherAdmins = await users.countOtherActiveAdmins(user.id);
  if (otherAdmins === 0) {
    throw forbidden(
      'This is the last active administrator account and cannot be deactivated.',
    );
  }
}

async function revokeSessionsAndAudit(
  userId: string,
  actor: RequestActor,
  action: 'USER_DEACTIVATED' | 'USER_SESSIONS_REVOKED',
): Promise<void> {
  const revoked = await revokeAllSessionsForUser(userId);
  await recordAudit({
    userId: actor.user.id,
    action,
    entityType: 'user',
    entityId: userId,
    metadata: { revokedSessions: revoked },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });
}

/** Admin view of everywhere a user is currently signed in. */
export async function activeSessions(id: string): Promise<ActiveSession[]> {
  await getById(id);
  return listActiveSessionsForUser(id);
}

/** Signs a user out of one device, as picked in the Active sessions dialog. */
export async function revokeSession(
  userId: string,
  sessionId: string,
  actor: RequestActor,
): Promise<void> {
  const user = await getById(userId);
  if (!(await revokeUserSession(userId, sessionId))) {
    throw notFound('Session not found or already ended.');
  }
  await recordAudit({
    userId: actor.user.id,
    action: 'USER_SESSION_REVOKED',
    entityType: 'user',
    entityId: userId,
    metadata: { username: user.username, sessionId },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });
}

/** Signs a user out of every device at once. */
export async function revokeAllSessions(userId: string, actor: RequestActor): Promise<void> {
  await getById(userId);
  await revokeSessionsAndAudit(userId, actor, 'USER_SESSIONS_REVOKED');
}
