import { query } from '../db/pool.js';
import type { RecordBank, SbiReportEntry, SbiReportSummary } from '../types.js';

interface SummaryRow {
  id: string;
  bank: RecordBank;
  source: string;
  customer_name: string | null;
  account_number: string | null;
  transaction_count: number | null;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  finalized_at: string | null;
}

interface ReportRow extends SummaryRow {
  input_json: unknown;
  statement_json: unknown;
}

/**
 * The list needs a few facts about each report, not the payload: those are
 * read straight out of the stored JSON.
 */
const COLUMNS = `r.id, r.bank, r.source,
                 COALESCE(r.statement_json->'accountInfo'->>'customerName',
                          r.statement_json->'accountInfo'->>'accountName') AS customer_name,
                 r.statement_json->'accountInfo'->>'accountNumber' AS account_number,
                 jsonb_array_length(r.statement_json->'transactions') AS transaction_count,
                 r.created_by, u.name AS created_by_name, r.created_at, r.updated_at,
                 r.finalized_at`;

const JOIN = 'LEFT JOIN users u ON u.id = r.created_by';

function mapSummary(row: SummaryRow): SbiReportSummary {
  return {
    id: row.id,
    bank: row.bank,
    source: row.source === 'transactions' ? 'transactions' : 'extract',
    customerName: row.customer_name,
    accountNumber: row.account_number,
    transactionCount: Number(row.transaction_count ?? 0),
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finalizedAt: row.finalized_at,
  };
}

export async function listReports(bank: RecordBank): Promise<SbiReportSummary[]> {
  const { rows } = await query<SummaryRow>(
    `SELECT ${COLUMNS} FROM sbi_reports r ${JOIN}
      WHERE r.bank = $1 ORDER BY r.created_at DESC`,
    [bank],
  );
  return rows.map(mapSummary);
}

export async function findById(id: string): Promise<SbiReportEntry | null> {
  const { rows } = await query<ReportRow>(
    `SELECT ${COLUMNS}, r.input_json, r.statement_json
       FROM sbi_reports r ${JOIN} WHERE r.id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  return { ...mapSummary(row), input: row.input_json, statement: row.statement_json };
}

export interface ReportPayload {
  /** Fixed at creation; an update leaves it as it is. */
  bank?: RecordBank;
  source: 'extract' | 'transactions';
  input: unknown;
  statement: unknown;
}

export async function insertReport(
  payload: ReportPayload,
  createdBy: string,
): Promise<SbiReportSummary> {
  const { rows } = await query<SummaryRow>(
    `WITH inserted AS (
       INSERT INTO sbi_reports (source, input_json, statement_json, created_by, bank)
       VALUES ($1, $2::jsonb, $3::jsonb, $4, $5)
       RETURNING *
     )
     SELECT ${COLUMNS} FROM inserted r ${JOIN}`,
    [
      payload.source,
      JSON.stringify(payload.input),
      JSON.stringify(payload.statement),
      createdBy,
      payload.bank ?? 'SBI',
    ],
  );
  return mapSummary(rows[0]!);
}

export async function updateReport(
  id: string,
  payload: ReportPayload,
): Promise<SbiReportSummary | null> {
  const { rows } = await query<SummaryRow>(
    `WITH updated AS (
       UPDATE sbi_reports
          SET source = $2, input_json = $3::jsonb, statement_json = $4::jsonb
        WHERE id = $1
        RETURNING *
     )
     SELECT ${COLUMNS} FROM updated r ${JOIN}`,
    [id, payload.source, JSON.stringify(payload.input), JSON.stringify(payload.statement)],
  );
  return rows[0] ? mapSummary(rows[0]) : null;
}

/** Marks the report finalized by `userId`, or clears it when null. */
export async function setFinalized(
  id: string,
  userId: string | null,
): Promise<SbiReportSummary | null> {
  const { rows } = await query<SummaryRow>(
    `WITH changed AS (
       UPDATE sbi_reports
          SET finalized_at = CASE WHEN $2::uuid IS NULL THEN NULL ELSE now() END,
              finalized_by = $2::uuid
        WHERE id = $1
        RETURNING *
     )
     SELECT ${COLUMNS} FROM changed r ${JOIN}`,
    [id, userId],
  );
  return rows[0] ? mapSummary(rows[0]) : null;
}

/** Overwrites the statement's transactions and nothing else. */
export async function updateTransactions(id: string, transactions: unknown[]): Promise<boolean> {
  const { rowCount } = await query(
    `UPDATE sbi_reports
        SET statement_json = jsonb_set(statement_json, '{transactions}', $2::jsonb)
      WHERE id = $1`,
    [id, JSON.stringify(transactions)],
  );
  return (rowCount ?? 0) > 0;
}

export async function deleteReport(id: string): Promise<boolean> {
  const { rowCount } = await query('DELETE FROM sbi_reports WHERE id = $1', [id]);
  return (rowCount ?? 0) > 0;
}
