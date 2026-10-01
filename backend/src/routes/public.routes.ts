import cors from 'cors';
import { Router } from 'express';
import { query } from '../db/pool.js';
import { apiRateLimiter } from '../middleware/rate-limit.js';
import { asyncHandler } from '../utils/async-handler.js';
import { badRequest, notFound } from '../utils/errors.js';

export const publicRouter = Router();

/**
 * No session needed: the five-digit student code is the only key. Only
 * students an admin set live are served; anyone else is a 404. A live
 * student without a finalized record for that bank gets the empty shape.
 * Callable from any origin: no cookies are involved, so `*` is safe here.
 */
publicRouter.get(
  '/:bank(sbi|idbi)-details/:code',
  cors(),
  apiRateLimiter,
  asyncHandler(async (req, res) => {
    const bank = req.params.bank!.toUpperCase();
    const code = req.params.code ?? '';
    if (!/^[1-9]\d{4}$/.test(code)) throw badRequest('Student id must be 5 digits.');

    const { rows } = await query<{ account_info: unknown; transactions: unknown }>(
      // The PDF password locks the statement file; it never goes out here.
      `SELECT (r.statement_json -> 'accountInfo') - 'password' AS account_info,
              r.statement_json -> 'transactions' AS transactions
         FROM students s
         LEFT JOIN student_records r
           ON r.student_id = s.id AND r.bank = $2 AND r.finalized_at IS NOT NULL
        WHERE s.student_code = $1 AND s.live AND s.archived_at IS NULL`,
      [code, bank],
    );
    if (rows.length === 0) throw notFound('Student is not live.');
    const row = rows[0];
    res.json({ accountInfo: row?.account_info ?? {}, transactions: row?.transactions ?? [] });
  }),
);
