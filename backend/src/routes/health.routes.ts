import { Router } from 'express';
import { checkDatabaseConnection } from '../db/pool.js';
import { asyncHandler } from '../utils/async-handler.js';

export const healthRouter = Router();

/** Liveness — the process is up. */
healthRouter.get('/live', (_req, res) => {
  res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
});

/** Readiness — the process can serve traffic (database reachable). */
healthRouter.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    const databaseOk = await checkDatabaseConnection();
    res.status(databaseOk ? 200 : 503).json({
      status: databaseOk ? 'ok' : 'degraded',
      checks: { database: databaseOk ? 'ok' : 'unreachable' },
    });
  }),
);
