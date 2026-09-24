import { Router } from 'express';
import { getActor, requireAdmin, requireAuth } from '../middleware/auth.js';
import { body, queryParams, routeParams, validate } from '../middleware/validate.js';
import { listAuditForUser, listRecentAudit } from '../services/audit.service.js';
import * as userService from '../services/user.service.js';
import * as studentService from '../services/student.service.js';
import {
  createUserSchema,
  listUsersQuerySchema,
  paginationSchema,
  resetPasswordSchema,
  sessionParamsSchema,
  updateUserSchema,
  uuidParamSchema,
} from '../validation/schemas.js';
import { asyncHandler } from '../utils/async-handler.js';
import type { Role } from '../types.js';

export const usersRouter = Router();

// Every route in this file is admin-only, enforced server-side (PRD 13.4).
usersRouter.use(requireAuth, requireAdmin);

/** GET /api/v1/users/stats — admin dashboard KPI cards. */
usersRouter.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const [userStats, studentStats, recentActivity] = await Promise.all([
      userService.stats(),
      // Admin-only route, so these counts cover every student record.
      studentService.stats(getActor(req)),
      listRecentAudit(8),
    ]);
    res.json({ users: userStats, students: studentStats, recentActivity });
  }),
);

/** GET /api/v1/users */
usersRouter.get(
  '/',
  validate(listUsersQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const options = queryParams<{
      page: number;
      pageSize: number;
      search?: string;
      status?: 'active' | 'inactive';
      role?: Role;
    }>(req);
    res.json(await userService.list(options));
  }),
);

/** POST /api/v1/users */
usersRouter.post(
  '/',
  validate(createUserSchema),
  asyncHandler(async (req, res) => {
    const payload = body<{
      name: string;
      username: string;
      password: string;
      active: boolean;
    }>(req);
    const user = await userService.create(payload, getActor(req));
    res.status(201).json({ user });
  }),
);

/** GET /api/v1/users/:id */
usersRouter.get(
  '/:id',
  validate(uuidParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = routeParams<{ id: string }>(req);
    res.json({ user: await userService.getById(id) });
  }),
);

/**
 * GET /api/v1/users/:id/audit — this account's activity timeline: what the
 * user did, and what administrators did to the account.
 */
usersRouter.get(
  '/:id/audit',
  validate(uuidParamSchema, 'params'),
  validate(paginationSchema, 'query'),
  asyncHandler(async (req, res) => {
    const { id } = routeParams<{ id: string }>(req);
    const { page, pageSize } = queryParams<{ page: number; pageSize: number }>(req);
    // 404s for an unknown id rather than returning an empty timeline.
    const user = await userService.getById(id);
    res.json({ user, ...(await listAuditForUser(id, page, pageSize)) });
  }),
);

/** PATCH /api/v1/users/:id — username stays immutable by design (PRD 7.4). */
usersRouter.patch(
  '/:id',
  validate(uuidParamSchema, 'params'),
  validate(updateUserSchema),
  asyncHandler(async (req, res) => {
    const { id } = routeParams<{ id: string }>(req);
    const changes = body<{ name?: string; active?: boolean }>(req);
    res.json({ user: await userService.update(id, changes, getActor(req)) });
  }),
);

/** POST /api/v1/users/:id/activate */
usersRouter.post(
  '/:id/activate',
  validate(uuidParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = routeParams<{ id: string }>(req);
    res.json({ user: await userService.setActive(id, true, getActor(req)) });
  }),
);

/** POST /api/v1/users/:id/deactivate — also revokes that user's sessions. */
usersRouter.post(
  '/:id/deactivate',
  validate(uuidParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = routeParams<{ id: string }>(req);
    res.json({ user: await userService.setActive(id, false, getActor(req)) });
  }),
);

/** GET /api/v1/users/:id/sessions — where this user is signed in right now. */
usersRouter.get(
  '/:id/sessions',
  validate(uuidParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = routeParams<{ id: string }>(req);
    res.json({ sessions: await userService.activeSessions(id) });
  }),
);

/** DELETE /api/v1/users/:id/sessions — signs the user out of every device. */
usersRouter.delete(
  '/:id/sessions',
  validate(uuidParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = routeParams<{ id: string }>(req);
    await userService.revokeAllSessions(id, getActor(req));
    res.json({ success: true });
  }),
);

/** DELETE /api/v1/users/:id/sessions/:sessionId — signs the user out of that device. */
usersRouter.delete(
  '/:id/sessions/:sessionId',
  validate(sessionParamsSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { id, sessionId } = routeParams<{ id: string; sessionId: string }>(req);
    await userService.revokeSession(id, sessionId, getActor(req));
    res.json({ success: true });
  }),
);

/** POST /api/v1/users/:id/reset-password */
usersRouter.post(
  '/:id/reset-password',
  validate(uuidParamSchema, 'params'),
  validate(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const { id } = routeParams<{ id: string }>(req);
    const { newPassword } = body<{ newPassword: string }>(req);
    await userService.resetPassword(id, newPassword, getActor(req));
    res.json({ success: true });
  }),
);
