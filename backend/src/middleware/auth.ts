import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { recordAudit } from '../services/audit.service.js';
import { resolveSession } from '../services/session.service.js';
import type { Role } from '../types.js';
import { forbidden, sessionExpired, unauthenticated } from '../utils/errors.js';
import { clearSessionCookie } from './cookies.js';
import { clientIp, clientUserAgent } from './request-context.js';

/**
 * Single gate for every authenticated API route (PRD 13.4). Authorization is
 * never inferred from the UI: each request re-resolves the session against
 * PostgreSQL, so revocation and deactivation are effective immediately.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.cookies?.[env.SESSION_COOKIE_NAME];

  if (!token || typeof token !== 'string') {
    next(unauthenticated('You must sign in to continue.'));
    return;
  }

  const resolution = await resolveSession(token);

  if (resolution.status !== 'valid') {
    clearSessionCookie(res);
    next(resolution.status === 'expired' ? sessionExpired() : unauthenticated());
    return;
  }

  req.actor = {
    user: resolution.user,
    session: resolution.session,
    ipAddress: clientIp(req),
    userAgent: clientUserAgent(req),
  };

  next();
}

/** Route-group RBAC. Must always be mounted after `requireAuth`. */
export function requireRole(...roles: Role[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const actor = req.actor;
    if (!actor) {
      next(unauthenticated());
      return;
    }

    if (!roles.includes(actor.user.role)) {
      await recordAudit({
        userId: actor.user.id,
        action: 'AUTHORIZATION_FAILURE',
        entityType: 'route',
        metadata: { method: req.method, path: req.originalUrl, requiredRoles: roles },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
      next(forbidden());
      return;
    }

    next();
  };
}

export const requireAdmin = requireRole('ADMIN');

/** Narrowing helper for handlers mounted behind `requireAuth`. */
export function getActor(req: Request) {
  const actor = req.actor;
  if (!actor) throw unauthenticated();
  return actor;
}
