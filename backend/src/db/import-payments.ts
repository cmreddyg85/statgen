import { readFileSync } from 'node:fs';
import { pool, withTransaction } from './pool.js';
import { PAYMENT_CSV_HEADER } from '../services/payment-backup.service.js';
import { parseCsv } from '../utils/csv.js';

/**
 * Restores payments from a backup CSV: `npm run import:payments -- file.csv`.
 * Upserts by payment id, so re-running is safe. Students are matched by id,
 * then student code; the creator by username, then the first admin.
 */
async function run(): Promise<void> {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: npm run import:payments -- <file.csv>');
  const [header, ...rows] = parseCsv(readFileSync(file, 'utf8'));
  const col = (r: string[], name: string) => r[header!.indexOf(name)] ?? '';
  for (const name of PAYMENT_CSV_HEADER.slice(0, 14)) {
    if (!header!.includes(name)) throw new Error(`Missing column: ${name}`);
  }

  let done = 0;
  const skipped: string[] = [];
  await withTransaction(async (client) => {
    const admin = (await client.query(`SELECT id FROM users WHERE role = 'ADMIN' ORDER BY created_at LIMIT 1`)).rows[0]?.id;
    for (const r of rows.filter((r) => r.length > 1)) {
      const student = (await client.query(
        `SELECT id FROM students WHERE id::text = $1 OR student_code = $2 ORDER BY (id::text = $1) DESC LIMIT 1`,
        [col(r, 'student_id'), col(r, 'student_code')],
      )).rows[0];
      if (!student) { skipped.push(`${col(r, 'id')} (${col(r, 'student_name')})`); continue; }
      const creator = (await client.query(`SELECT id FROM users WHERE username = $1`, [col(r, 'created_by_username')])).rows[0]?.id ?? admin;
      await client.query(
        `INSERT INTO payments (id, connected_date, student_id, offer_company, bgv_company, referred_by,
                               report_types, amount, installments, live_done_at, created_by, created_at, updated_at)
         VALUES ($1,$2,$3,NULLIF($4,''),NULLIF($5,''),NULLIF($6,''),$7,$8,$9::jsonb,NULLIF($10,'')::timestamptz,$11,$12,$13)
         ON CONFLICT (id) DO UPDATE SET connected_date = EXCLUDED.connected_date, student_id = EXCLUDED.student_id,
           offer_company = EXCLUDED.offer_company, bgv_company = EXCLUDED.bgv_company, referred_by = EXCLUDED.referred_by,
           report_types = EXCLUDED.report_types, amount = EXCLUDED.amount, installments = EXCLUDED.installments,
           live_done_at = EXCLUDED.live_done_at`,
        [col(r, 'id'), col(r, 'connected_date'), student.id, col(r, 'offer_company'), col(r, 'bgv_company'),
         col(r, 'referred_by'), col(r, 'report_types') ? col(r, 'report_types').split('|') : [], col(r, 'amount'),
         col(r, 'installments_json') || '[]', col(r, 'live_done_at'), creator, col(r, 'created_at'), col(r, 'updated_at')],
      );
      done++;
    }
  });
  console.log(`Imported ${done} payment(s).`);
  if (skipped.length) console.log(`Skipped (student not found): ${skipped.join(', ')}`);
}

run().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => pool.end());
