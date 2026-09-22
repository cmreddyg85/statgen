import { Router } from 'express';
import { modulesForRole } from '../config/modules.js';
import { getActor, requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

export const modulesRouter = Router();

modulesRouter.use(requireAuth);

/**
 * GET /api/v1/modules — the modules the signed-in role may generate against.
 * Drives the dropdown on a student's Generate screen.
 */
modulesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { user } = getActor(req);
    res.json({
      modules: modulesForRole(user.role).map(({ key, label, description }) => ({
        key,
        label,
        description,
      })),
    });
  }),
);
