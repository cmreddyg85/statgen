import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { getActor, requireAdmin, requireAuth } from '../middleware/auth.js';
import { body, validate } from '../middleware/validate.js';
import { recordAudit } from '../services/audit.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { badRequest } from '../utils/errors.js';

export const liveRouter = Router();

liveRouter.use(requireAuth, requireAdmin);

/**
 * GET /api/v1/live — students with a finalized SBI or IDBI record, the one
 * whose finalized record was created most recently first, plus which are live.
 */
liveRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { rows } = await query<{
      id: string;
      student_code: string;
      name: string;
      banks: string[];
      live: boolean;
      active_live: boolean;
    }>(
      `SELECT s.id, s.student_code, s.name, s.live, s.active_live,
              array_agg(DISTINCT r.bank ORDER BY r.bank) AS banks
         FROM students s
         JOIN student_records r ON r.student_id = s.id AND r.finalized_at IS NOT NULL
        WHERE s.archived_at IS NULL
        GROUP BY s.id
        ORDER BY max(r.created_at) DESC`,
    );
    res.json({
      students: rows.map((row) => ({
        id: row.id,
        studentCode: row.student_code,
        name: row.name,
        banks: row.banks,
      })),
      selected: rows.filter((row) => row.live).map((row) => row.id),
      active: rows.find((row) => row.live && row.active_live)?.id ?? null,
    });
  }),
);

const saveLiveSchema = z.object({
  studentIds: z.array(z.string().uuid()).max(10_000),
  /** Served by the public APIs called without an id; one of `studentIds`, or null. */
  activeStudentId: z.string().uuid().nullable().default(null),
});

/** PUT /api/v1/live — the full selection; everyone not in it goes off live. */
liveRouter.put(
  '/',
  validate(saveLiveSchema),
  asyncHandler(async (req, res) => {
    const { studentIds, activeStudentId } = body<{
      studentIds: string[];
      activeStudentId: string | null;
    }>(req);
    if (activeStudentId && !studentIds.includes(activeStudentId)) {
      throw badRequest('The active live student must be one of the live students.');
    }
    const actor = getActor(req);
    await withTransaction(async (client) => {
      // The old active student is cleared first: the single-active index is
      // checked row by row, so setting the new one first would trip it.
      await client.query(
        'UPDATE students SET active_live = false WHERE active_live AND id IS DISTINCT FROM $1::uuid',
        [activeStudentId],
      );
      await client.query(
        `WITH picked AS (SELECT jsonb_array_elements_text($1::jsonb)::uuid AS id)
         UPDATE students SET live = (id IN (SELECT id FROM picked)),
                             active_live = (id IS NOT DISTINCT FROM $2::uuid)
          WHERE live <> (id IN (SELECT id FROM picked))
             OR active_live <> (id IS NOT DISTINCT FROM $2::uuid)`,
        [JSON.stringify(studentIds), activeStudentId],
      );
    });
    await recordAudit({
      userId: actor.user.id,
      action: 'LIVE_STUDENTS_UPDATED',
      entityType: 'student',
      metadata: { studentIds, activeStudentId },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });
    res.json({ selected: studentIds, active: activeStudentId });
  }),
);
