import { Router } from 'express';
import { env } from '../config/env.js';
import { getActor, requireAdmin, requireAuth } from '../middleware/auth.js';
import {
  clearSessionCookie,
  issueCsrfCookie,
  setSessionCookie,
} from '../middleware/cookies.js';
import { loginRateLimiter } from '../middleware/rate-limit.js';
import { clientIp, clientUserAgent } from '../middleware/request-context.js';
import { body, validate } from '../middleware/validate.js';
import { recordAudit } from '../services/audit.service.js';
import { login } from '../services/auth.service.js';
import { revokeSession, sessionLifetimeMs } from '../services/session.service.js';
import { changeOwnPassword } from '../services/user.service.js';
import { changePasswordSchema, loginSchema } from '../validation/schemas.js';
import { asyncHandler } from '../utils/async-handler.js';

export const authRouter = Router();

/** POST /api/v1/auth/login — public. */
authRouter.post(
  '/login',
  loginRateLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { username, password } = body<{ username: string; password: string }>(req);

    const result = await login(username, password, {
      ipAddress: clientIp(req),
      userAgent: clientUserAgent(req),
    });

    setSessionCookie(res, result.token, result.session.expiresAt);
    const csrfToken = issueCsrfCookie(res, result.session.expiresAt);

    res.status(200).json({
      user: result.user,
      session: {
        expiresAt: result.session.expiresAt,
        lifetimeMs: sessionLifetimeMs(result.user.role),
      },
      csrfToken,
    });
  }),
);

/** GET /api/v1/auth/session — authenticated; drives the countdown timer. */
authRouter.get(
  '/session',
  requireAuth,
  asyncHandler(async (req, res) => {
    const actor = getActor(req);
    res.json({
      authenticated: true,
      user: actor.user,
      session: {
        expiresAt: actor.session.expiresAt,
        lifetimeMs: sessionLifetimeMs(actor.user.role),
      },
      csrfToken: req.cookies?.[env.CSRF_COOKIE_NAME] ?? null,
    });
  }),
);

/** GET /api/v1/auth/me — authenticated. */
authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: getActor(req).user });
  }),
);

/**
 * POST /api/v1/auth/change-password — administrators only.
 *
 * Users do not change their own password in this release: an administrator
 * sets it for them from User Management (PRD 20, "Password reset:
 * admin-only in MVP").
 */
authRouter.post(
  '/change-password',
  requireAuth,
  requireAdmin,
  validate(changePasswordSchema),
  asyncHandler(async (req, res) => {
    const { newPassword } = body<{ newPassword: string }>(req);
    const { revokedSessions } = await changeOwnPassword(newPassword, getActor(req));
    res.json({ success: true, revokedSessions });
  }),
);

/** POST /api/v1/auth/logout — authenticated; revokes server-side state. */
authRouter.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    const actor = getActor(req);
    await revokeSession(actor.session.id);
    clearSessionCookie(res);

    await recordAudit({
      userId: actor.user.id,
      action: 'LOGOUT',
      entityType: 'session',
      entityId: actor.session.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    res.json({ success: true });
  }),
);
