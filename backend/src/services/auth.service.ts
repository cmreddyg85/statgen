import { recordAudit } from './audit.service.js';
import { describeClient } from './network-info.js';
import { verifyPassword } from './password.service.js';
import { createSession, type CreatedSession } from './session.service.js';
import * as users from '../repositories/user.repository.js';
import type { UserRecord } from '../types.js';
import { AppError } from '../utils/errors.js';

/**
 * Deliberately identical for "unknown user", "wrong password" and "inactive
 * account" so the login endpoint cannot be used to enumerate accounts
 * (PRD 7.1 / 13.1).
 */
const GENERIC_LOGIN_ERROR = () =>
  new AppError(401, 'UNAUTHENTICATED', 'Invalid username or password.');

export interface LoginContext {
  ipAddress: string | null;
  userAgent: string | null;
}

export async function login(
  username: string,
  password: string,
  context: LoginContext,
): Promise<{ user: UserRecord } & CreatedSession> {
  const record = await users.findByUsernameWithHash(username);

  // Spend the same work on a missing account as on a real one, so response
  // timing does not leak whether the username exists.
  const passwordOk = record
    ? await verifyPassword(record.passwordHash, password)
    : await verifyPassword('$argon2id$v=19$m=19456,t=2,p=1$invalid$invalid', password);

  if (!record || !passwordOk || !record.active) {
    await recordAudit({
      userId: record?.id ?? null,
      action: 'LOGIN_FAILURE',
      entityType: 'user',
      entityId: record?.id ?? null,
      metadata: {
        username,
        reason: !record ? 'unknown_user' : !passwordOk ? 'bad_password' : 'inactive_account',
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
    throw GENERIC_LOGIN_ERROR();
  }

  const { passwordHash: _passwordHash, ...user } = record;
  // Where the sign-in came from: address, the network that owns it, the
  // machine and — on the local network — its MAC. Kept on the session as well
  // as in the audit trail, so active sessions can be inspected later.
  const client = await describeClient(context.ipAddress, context.userAgent);
  const created = await createSession({ user, ...context, clientInfo: client });
  await users.touchLastLogin(user.id);

  await recordAudit({
    userId: user.id,
    action: 'LOGIN_SUCCESS',
    entityType: 'user',
    entityId: user.id,
    metadata: { role: user.role, expiresAt: created.session.expiresAt, ...client },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  return { user, ...created };
}
