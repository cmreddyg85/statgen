import { query } from '../db/pool.js';
import type { SbiReportEntry, SbiReportSummary } from '../types.js';

interface SummaryRow {
  id: string;
  source: string;
  customer_name: string | null;
  account_number: string | null;
  transaction_count: number | null;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

interface ReportRow extends SummaryRow {
  input_json: unknown;
  statement_json: unknown;
}

/**
 * The list needs a few facts about each report, not the payload: those are
 * read straight out of the stored JSON.
 */
const COLUMNS = `r.id, r.source,
                 r.statement_json->'accountInfo'->>'customerName' AS customer_name,
                 r.statement_json->'accountInfo'->>'accountNumber' AS account_number,
                 jsonb_array_length(r.statement_json->'transactions') AS transaction_count,
                 r.created_by, u.name AS created_by_name, r.created_at, r.updated_at`;

const JOIN = 'LEFT JOIN users u ON u.id = r.created_by';

function mapSummary(row: SummaryRow): SbiReportSummary {
  return {
    id: row.id,
    source: row.source === 'transactions' ? 'transactions' : 'extract',
    customerName: row.customer_name,
    accountNumber: row.account_number,
    transactionCount: Number(row.transaction_count ?? 0),
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listReports(): Promise<SbiReportSummary[]> {
  const { rows } = await query<SummaryRow>(
    `SELECT ${COLUMNS} FROM sbi_reports r ${JOIN} ORDER BY r.created_at DESC`,
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
       INSERT INTO sbi_reports (source, input_json, statement_json, created_by)
       VALUES ($1, $2::jsonb, $3::jsonb, $4)
       RETURNING *
     )
     SELECT ${COLUMNS} FROM inserted r ${JOIN}`,
    [payload.source, JSON.stringify(payload.input), JSON.stringify(payload.statement), createdBy],
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

export async function deleteReport(id: string): Promise<boolean> {
  const { rowCount } = await query('DELETE FROM sbi_reports WHERE id = $1', [id]);
  return (rowCount ?? 0) > 0;
}
