import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { getActor, requireAuth } from '../middleware/auth.js';
import { queryParams, validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date');

const dashboardQuerySchema = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    /** Everything on record: the range runs from the earliest data to today. */
    overall: z.enum(['true', 'false']).optional(),
    // The viewer's IANA zone: "today" and the day buckets are theirs, not the server's.
    tz: z.string().max(64).refine(validZone, 'Unknown time zone').default('Asia/Kolkata'),
  })
  .refine((value) => value.overall === 'true' || (value.from && value.to), { path: ['from'], message: 'Pick a date range' })
  .refine((value) => !value.from || !value.to || value.from <= value.to, { path: ['to'], message: 'The end date cannot be before the start date' })
  .refine((value) => !value.from || !value.to || dayCount(value.from, value.to) <= 3660, { path: ['from'], message: 'Pick at most ten years' });

function validZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

const toDay = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const dayCount = (from: string, to: string) => Math.round((toDay(to) - toDay(from)) / 86_400_000) + 1;
const shift = (iso: string, days: number) => new Date(toDay(iso) + days * 86_400_000).toISOString().slice(0, 10);

/** Day buckets up to a month, weeks up to ~4 months, months beyond. */
export function bucketFor(days: number): 'day' | 'week' | 'month' {
  return days <= 31 ? 'day' : days <= 124 ? 'week' : 'month';
}

const num = (value: unknown) => Number(value ?? 0);

/**
 * GET /api/v1/dashboard?from&to&tz — everything the dashboard draws for a
 * date range (inclusive, in the viewer's zone), with the same-length period
 * before it for comparison. A user sees only their own students and records;
 * money and team figures are administrators' only.
 */
dashboardRouter.get(
  '/',
  validate(dashboardQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const params = queryParams<{ from?: string; to?: string; tz: string; overall?: 'true' | 'false' }>(req);
    const { tz } = params;
    const actor = getActor(req);
    const isAdmin = actor.user.role === 'ADMIN';
    const scope = isAdmin ? null : actor.user.id;
    let { from, to } = params as { from: string; to: string };
    if (params.overall === 'true') {
      // From the first thing this viewer can see, to today in their zone.
      const { rows } = await query<{ first: string; today: string }>(
        `SELECT least(
                  (SELECT min((created_at AT TIME ZONE $1)::date) FROM students
                    WHERE $2::uuid IS NULL OR created_by = $2),
                  (SELECT min(connected_date) FROM payments WHERE $2::uuid IS NULL),
                  (SELECT min((i->>'date')::date) FROM payments, jsonb_array_elements(installments) i
                    WHERE $2::uuid IS NULL),
                  (now() AT TIME ZONE $1)::date
                )::text AS first,
                (now() AT TIME ZONE $1)::date::text AS today`,
        [tz, scope],
      );
      to = rows[0]!.today;
      // ponytail: capped at ten years so the series stays a sane size.
      from = rows[0]!.first < shift(to, -3659) ? shift(to, -3659) : rows[0]!.first;
    }
    const days = dayCount(from, to);
    const prevFrom = shift(from, -days);
    const prevTo = shift(from, -1);
    const bucket = bucketFor(days);
    const local = (column: string) => `(${column} AT TIME ZONE $3)::date`;

    // $1 from, $2 to, $3 tz, $4 scope (null = everyone)
    const counts = (a: string, b: string) =>
      query(
        `SELECT
           (SELECT count(*) FROM students s
             WHERE ${local('s.created_at')} BETWEEN $1 AND $2
               AND ($4::uuid IS NULL OR s.created_by = $4)) AS students,
           (SELECT count(*) FROM student_records r JOIN students s ON s.id = r.student_id
             WHERE ${local('r.created_at')} BETWEEN $1 AND $2
               AND ($4::uuid IS NULL OR s.created_by = $4)) AS records,
           (SELECT count(*) FROM student_records r JOIN students s ON s.id = r.student_id
             WHERE ${local('r.finalized_at')} BETWEEN $1 AND $2
               AND ($4::uuid IS NULL OR s.created_by = $4)) AS finalized,
           (SELECT coalesce(sum((i->>'amount')::numeric), 0)
              FROM payments p, jsonb_array_elements(p.installments) i
             WHERE $4::uuid IS NULL AND (i->>'date')::date BETWEEN $1 AND $2) AS collected,
           (SELECT coalesce(sum(p.amount), 0) FROM payments p
             WHERE $4::uuid IS NULL AND p.connected_date BETWEEN $1 AND $2) AS booked`,
        [a, b, tz, scope],
      ).then(({ rows }) => {
        const row = rows[0]!;
        return {
          students: num(row.students),
          records: num(row.records),
          finalized: num(row.finalized),
          collected: num(row.collected),
          booked: num(row.booked),
        };
      });

    const args = [from, to, tz, scope];
    const [current, previous, series, byBank, snapshot, ...adminOnly] = await Promise.all([
      counts(from, to),
      counts(prevFrom, prevTo),
      query(
        `WITH buckets AS (
           SELECT DISTINCT date_trunc('${bucket}', d)::date AS bucket
             FROM generate_series($1::date, $2::date, interval '1 day') d
         )
         SELECT b.bucket::text AS bucket,
           (SELECT count(*) FROM students s
             WHERE date_trunc('${bucket}', ${local('s.created_at')})::date = b.bucket
               AND ${local('s.created_at')} BETWEEN $1 AND $2
               AND ($4::uuid IS NULL OR s.created_by = $4)) AS students,
           (SELECT count(*) FROM student_records r JOIN students s ON s.id = r.student_id
             WHERE date_trunc('${bucket}', ${local('r.created_at')})::date = b.bucket
               AND ${local('r.created_at')} BETWEEN $1 AND $2
               AND ($4::uuid IS NULL OR s.created_by = $4)) AS records,
           (SELECT coalesce(sum((i->>'amount')::numeric), 0)
              FROM payments p, jsonb_array_elements(p.installments) i
             WHERE $4::uuid IS NULL
               AND date_trunc('${bucket}', (i->>'date')::date)::date = b.bucket
               AND (i->>'date')::date BETWEEN $1 AND $2) AS collected
           FROM buckets b ORDER BY b.bucket`,
        args,
      ),
      query(
        `SELECT r.bank, count(*) AS total, count(r.finalized_at) AS finalized
           FROM student_records r JOIN students s ON s.id = r.student_id
          WHERE ${local('r.created_at')} BETWEEN $1 AND $2
            AND ($4::uuid IS NULL OR s.created_by = $4)
          GROUP BY r.bank`,
        args,
      ),
      query(
        `SELECT
           (SELECT count(*) FROM students s
             WHERE s.archived_at IS NULL AND ($1::uuid IS NULL OR s.created_by = $1)) AS active_students,
           (SELECT count(*) FROM students s
             WHERE s.live AND s.archived_at IS NULL AND ($1::uuid IS NULL OR s.created_by = $1)) AS live_students`,
        [scope],
      ),
      ...(isAdmin
        ? [
            // Payments with activity in the range (connected, or money received),
            // by how much of them is paid to date.
            query(
              `WITH p AS (
                 SELECT amount, coalesce((SELECT sum((i->>'amount')::numeric)
                                            FROM jsonb_array_elements(installments) i), 0) AS received
                   FROM payments
                  WHERE connected_date BETWEEN $1 AND $2
                     OR EXISTS (SELECT 1 FROM jsonb_array_elements(installments) i
                                 WHERE (i->>'date')::date BETWEEN $1 AND $2)
               )
               SELECT CASE WHEN received >= amount THEN 'paid'
                           WHEN received > 0 THEN 'partial' ELSE 'unpaid' END AS status,
                      count(*) AS count, sum(amount) AS amount, sum(received) AS received
                 FROM p GROUP BY 1`,
              [from, to],
            ),
            query(
              `SELECT t AS type, count(*) AS count
                 FROM payments, unnest(report_types) t
                WHERE connected_date BETWEEN $1 AND $2
                GROUP BY t ORDER BY count(*) DESC`,
              [from, to],
            ),
            query(
              `SELECT trim(s.referred_by) AS name, count(*) AS count
                 FROM students s
                WHERE ${local('s.created_at')} BETWEEN $1 AND $2
                  AND coalesce(trim(s.referred_by), '') <> ''
                GROUP BY trim(s.referred_by) ORDER BY count(*) DESC, 1 LIMIT 6`,
              [from, to, tz],
            ),
            query(
              `SELECT u.name,
                      (SELECT count(*) FROM students s
                        WHERE s.created_by = u.id AND ${local('s.created_at')} BETWEEN $1 AND $2) AS students,
                      (SELECT count(*) FROM student_records r
                        WHERE r.created_by = u.id AND ${local('r.created_at')} BETWEEN $1 AND $2) AS records
                 FROM users u WHERE u.active
                ORDER BY 2 DESC, 3 DESC, u.name LIMIT 8`,
              [from, to, tz],
            ),
            query(
              `SELECT p.id, s.name AS student, s.student_code AS code, p.amount,
                      p.amount - coalesce((SELECT sum((i->>'amount')::numeric)
                                             FROM jsonb_array_elements(p.installments) i), 0) AS pending
                 FROM payments p JOIN students s ON s.id = p.student_id
                ORDER BY pending DESC LIMIT 50`,
            ),
          ]
        : []),
    ]);

    const [status, reportTypes, referrers, team, dues] = adminOnly;
    const owed = (dues?.rows ?? []).filter((row) => num(row.pending) > 0);

    res.json({
      range: { from, to, prevFrom, prevTo, days, bucket },
      current,
      previous,
      series: series.rows.map((row) => ({
        bucket: row.bucket,
        students: num(row.students),
        records: num(row.records),
        collected: num(row.collected),
      })),
      byBank: byBank.rows.map((row) => ({ bank: row.bank, total: num(row.total), finalized: num(row.finalized) })),
      snapshot: {
        activeStudents: num(snapshot.rows[0]?.active_students),
        liveStudents: num(snapshot.rows[0]?.live_students),
        ...(isAdmin && {
          outstanding: owed.reduce((sum, row) => sum + num(row.pending), 0),
          paymentsWithDues: owed.length,
        }),
      },
      ...(isAdmin && {
        paymentStatus: status!.rows.map((row) => ({
          status: row.status,
          count: num(row.count),
          amount: num(row.amount),
          received: num(row.received),
        })),
        reportTypes: reportTypes!.rows.map((row) => ({ type: row.type, count: num(row.count) })),
        referrers: referrers!.rows.map((row) => ({ name: row.name, count: num(row.count) })),
        team: team!.rows
          .map((row) => ({ name: row.name, students: num(row.students), records: num(row.records) }))
          .filter((row) => row.students + row.records > 0),
        topDues: owed.slice(0, 5).map((row) => ({
          id: row.id,
          student: row.student,
          code: row.code,
          amount: num(row.amount),
          pending: num(row.pending),
        })),
      }),
    });
  }),
);
