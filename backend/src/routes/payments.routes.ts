import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { getActor, requireAdmin, requireAuth } from '../middleware/auth.js';
import { body, queryParams, routeParams, validate } from '../middleware/validate.js';
import { recordAudit } from '../services/audit.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { notFound } from '../utils/errors.js';
import { uuidParamSchema } from '../validation/schemas.js';

export const paymentsRouter = Router();

paymentsRouter.use(requireAuth, requireAdmin);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date');
// '' is "not entered", not 0.
const money = z.preprocess(
  (value) => (value === '' || value == null ? undefined : Number(value)),
  z
    .number({ required_error: 'Enter an amount', invalid_type_error: 'Enter a valid amount' })
    .finite()
    .min(0, 'Cannot be negative')
    .max(1e10),
);
const optionalText = z
  .string()
  .trim()
  .max(200)
  .nullish()
  .transform((value) => value || null);

const paymentSchema = z.object({
  connectedDate: isoDate,
  studentId: z.string().uuid('Pick a student'),
  offerCompany: optionalText,
  bgvCompany: optionalText,
  referredBy: optionalText,
  reportTypes: z.array(z.enum(['SBI', 'IDBI', 'EMAIL', 'STATEMENTS'])).max(4),
  amount: money,
  installments: z
    .array(z.object({ date: isoDate, remarks: z.string().trim().max(500).default(''), amount: money }))
    .max(100),
});
type PaymentBody = z.infer<typeof paymentSchema>;

const SELECT = `
  SELECT p.id, p.connected_date::text AS "connectedDate", p.student_id AS "studentId",
         s.student_code AS "studentCode", s.name AS "studentName",
         p.offer_company AS "offerCompany", p.bgv_company AS "bgvCompany",
         p.referred_by AS "referredBy", p.report_types AS "reportTypes",
         p.amount::float8 AS amount, p.installments, p.live_done_at AS "liveDoneAt",
         p.created_at AS "createdAt", p.updated_at AS "updatedAt"
    FROM payments p JOIN students s ON s.id = p.student_id`;

/** GET /api/v1/payments */
paymentsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(`${SELECT} ORDER BY p.connected_date DESC, p.created_at DESC`);
    res.json({ payments: rows });
  }),
);

/**
 * GET /api/v1/payments/students — the form's student dropdown, newest first.
 * `include` adds one student even if archived: the one a payment being edited
 * already belongs to.
 */
paymentsRouter.get(
  '/students',
  validate(z.object({ include: z.string().uuid().optional() }), 'query'),
  asyncHandler(async (req, res) => {
    const { include } = queryParams<{ include?: string }>(req);
    const { rows } = await query(
      `SELECT id, student_code AS "studentCode", name,
              offer_company AS "offerCompany", referred_by AS "referredBy",
              archived_at IS NOT NULL AS archived
         FROM students WHERE archived_at IS NULL OR id = $1::uuid ORDER BY created_at DESC`,
      [include ?? null],
    );
    res.json({ students: rows });
  }),
);

const params = (p: PaymentBody) => [
  p.connectedDate,
  p.studentId,
  p.offerCompany ?? null,
  p.bgvCompany ?? null,
  p.referredBy ?? null,
  `{${p.reportTypes.join(',')}}`,
  p.amount,
  JSON.stringify(p.installments),
];

/** POST /api/v1/payments */
paymentsRouter.post(
  '/',
  validate(paymentSchema),
  asyncHandler(async (req, res) => {
    const payment = body<PaymentBody>(req);
    const actor = getActor(req);
    const { rows } = await query<{ id: string }>(
      `INSERT INTO payments (connected_date, student_id, offer_company, bgv_company, referred_by,
                             report_types, amount, installments, created_by)
       VALUES ($1, $2, $3, $4, $5, $6::text[], $7, $8::jsonb, $9) RETURNING id`,
      [...params(payment), actor.user.id],
    );
    await recordAudit({
      userId: actor.user.id,
      action: 'PAYMENT_CREATED',
      entityType: 'payment',
      entityId: rows[0]!.id,
      metadata: { studentId: payment.studentId },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });
    res.status(201).json({ id: rows[0]!.id });
  }),
);

/** PUT /api/v1/payments/:id */
paymentsRouter.put(
  '/:id',
  validate(uuidParamSchema, 'params'),
  validate(paymentSchema),
  asyncHandler(async (req, res) => {
    const { id } = routeParams<{ id: string }>(req);
    const payment = body<PaymentBody>(req);
    const actor = getActor(req);
    const { rowCount } = await query(
      `UPDATE payments
          SET connected_date = $1, student_id = $2, offer_company = $3, bgv_company = $4,
              referred_by = $5, report_types = $6::text[], amount = $7, installments = $8::jsonb
        WHERE id = $9`,
      [...params(payment), id],
    );
    if (!rowCount) throw notFound('Payment not found.');
    await recordAudit({
      userId: actor.user.id,
      action: 'PAYMENT_UPDATED',
      entityType: 'payment',
      entityId: id,
      metadata: { studentId: payment.studentId },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });
    res.json({ id });
  }),
);

/** POST /api/v1/payments/:id/live-done — { done: true } marks it, { done: false } clears it. */
paymentsRouter.post(
  '/:id/live-done',
  validate(uuidParamSchema, 'params'),
  validate(z.object({ done: z.boolean() })),
  asyncHandler(async (req, res) => {
    const { id } = routeParams<{ id: string }>(req);
    const { done } = body<{ done: boolean }>(req);
    const actor = getActor(req);
    const { rows } = await query<{ live_done_at: string | null }>(
      `UPDATE payments
          SET live_done_at = CASE WHEN $2 THEN now() END,
              live_done_by = CASE WHEN $2 THEN $3::uuid END
        WHERE id = $1
        RETURNING live_done_at`,
      [id, done, actor.user.id],
    );
    if (!rows[0]) throw notFound('Payment not found.');
    await recordAudit({
      userId: actor.user.id,
      action: 'PAYMENT_UPDATED',
      entityType: 'payment',
      entityId: id,
      metadata: { liveDone: done },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });
    res.json({ liveDoneAt: rows[0].live_done_at });
  }),
);

/** DELETE /api/v1/payments/:id */
paymentsRouter.delete(
  '/:id',
  validate(uuidParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = routeParams<{ id: string }>(req);
    const actor = getActor(req);
    const { rowCount } = await query('DELETE FROM payments WHERE id = $1', [id]);
    if (!rowCount) throw notFound('Payment not found.');
    await recordAudit({
      userId: actor.user.id,
      action: 'PAYMENT_DELETED',
      entityType: 'payment',
      entityId: id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });
    res.json({ success: true });
  }),
);
