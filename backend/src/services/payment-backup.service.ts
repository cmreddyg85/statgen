import { env } from '../config/env.js';
import { query } from '../db/pool.js';
import { recordAudit } from './audit.service.js';
import { sendMail } from './mail.service.js';
import { toCsv } from '../utils/csv.js';
import { logger } from '../utils/logger.js';

/**
 * Columns up to `updated_at` are exactly what `npm run import:payments`
 * reads back; the ones after are for reading only and ignored on import.
 */
export const PAYMENT_CSV_HEADER = [
  'id', 'connected_date', 'student_code', 'student_name', 'offer_company', 'bgv_company',
  'referred_by', 'report_types', 'amount', 'installments_json', 'live_done_at',
  'created_by_username', 'created_at', 'updated_at',
  'student_id', 'installments_count', 'total_paid', 'balance', 'last_payment_date',
];

interface Row {
  id: string; connected_date: string; student_id: string; student_code: string; student_name: string;
  offer_company: string | null; bgv_company: string | null; referred_by: string | null;
  report_types: string[]; amount: string; installments: { date: string; remarks: string; amount: number }[];
  live_done_at: Date | string | null; created_by_username: string; created_at: Date | string; updated_at: Date | string;
}

/** The pool may hand timestamps back as strings or Dates. */
const stamp = (v: Date | string | null) => (v ? new Date(v).toISOString() : '');

export async function buildPaymentsCsv(): Promise<{ csv: string; count: number }> {
  const { rows } = await query<Row>(
    `SELECT p.id, p.connected_date::text, p.student_id, s.student_code, s.name AS student_name,
            p.offer_company, p.bgv_company, p.referred_by, p.report_types, p.amount::text,
            p.installments, p.live_done_at, u.username AS created_by_username,
            p.created_at, p.updated_at
       FROM payments p JOIN students s ON s.id = p.student_id JOIN users u ON u.id = p.created_by
      ORDER BY p.connected_date, p.created_at`,
  );
  const body = rows.map((r) => {
    const paid = r.installments.reduce((sum, i) => sum + Number(i.amount), 0);
    const last = r.installments.map((i) => i.date).sort().pop() ?? '';
    return [
      r.id, r.connected_date, r.student_code, r.student_name, r.offer_company, r.bgv_company,
      r.referred_by, r.report_types.join('|'), r.amount, JSON.stringify(r.installments),
      stamp(r.live_done_at), r.created_by_username,
      stamp(r.created_at), stamp(r.updated_at),
      r.student_id, r.installments.length, paid.toFixed(2), (Number(r.amount) - paid).toFixed(2), last,
    ];
  });
  return { csv: toCsv([PAYMENT_CSV_HEADER, ...body]), count: rows.length };
}

const localIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Once the configured time has passed, mails the full payments CSV if any
 * payment was created, edited or deleted today and today's mail has not gone
 * yet. "Sent today" lives in the audit log, so a restart cannot double-send.
 */
export async function runPaymentBackupIfDue(now = new Date()): Promise<boolean> {
  const [h, m] = env.PAYMENT_BACKUP_TIME.split(':').map(Number) as [number, number];
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return false;

  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const { rows } = await query<{ changed: string; sent: string }>(
    `SELECT count(*) FILTER (WHERE action IN ('PAYMENT_CREATED','PAYMENT_UPDATED','PAYMENT_DELETED')) AS changed,
            count(*) FILTER (WHERE action = 'PAYMENTS_BACKUP_SENT') AS sent
       FROM audit_logs WHERE created_at >= $1`,
    [dayStart],
  );
  if (Number(rows[0]!.changed) === 0 || Number(rows[0]!.sent) > 0) return false;

  const { csv, count } = await buildPaymentsCsv();
  const date = localIso(now);
  await sendMail(`payments-backup-${date}`, `${count} payments, ${rows[0]!.changed} change(s) today.`, [
    { filename: `payments-${date}.csv`, content: csv },
  ]);
  await recordAudit({ action: 'PAYMENTS_BACKUP_SENT', entityType: 'payment', metadata: { count } });
  return true;
}

/** Checks once a minute; a failed send is retried on the next tick. */
export function startPaymentBackup(): NodeJS.Timeout {
  const timer = setInterval(() => {
    runPaymentBackupIfDue().catch((error) => logger.error({ err: error }, 'Payments backup mail failed'));
  }, 60_000);
  timer.unref();
  return timer;
}
