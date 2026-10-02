import { query, withTransaction } from '../db/pool.js';
import type { RecordBank, StudentRecordBank, StudentRecordEntry, StudentRecordSummary } from '../types.js';

interface RecordRow {
  id: string;
  student_id: string;
  bank: StudentRecordBank;
  input_json: unknown;
  extract_json: unknown;
  statement_json: unknown;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  attachment_name: string | null;
  finalized_at: string | null;
  finalized_by: string | null;
  finalized_by_name: string | null;
  download_released_at: string | null;
  download_released_by: string | null;
  email_input: unknown;
}

type SummaryRow = Omit<RecordRow, 'input_json' | 'extract_json' | 'statement_json'>;

function mapSummary(row: SummaryRow): StudentRecordSummary {
  return {
    id: row.id,
    studentId: row.student_id,
    bank: row.bank,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    attachmentName: row.attachment_name,
    finalizedAt: row.finalized_at,
    finalizedBy: row.finalized_by,
    finalizedByName: row.finalized_by_name,
    downloadReleasedAt: row.download_released_at,
    downloadReleasedBy: row.download_released_by,
    emailInput: row.email_input ?? null,
  };
}

function mapRecord(row: RecordRow): StudentRecordEntry {
  return {
    ...mapSummary(row),
    input: row.input_json,
    extract: row.extract_json,
    statement: row.statement_json,
  };
}

const COLUMNS = `r.id, r.student_id, r.bank, r.created_by, u.name AS created_by_name,
                 r.created_at, r.updated_at, r.attachment_name,
                 r.finalized_at, r.finalized_by, f.name AS finalized_by_name,
                 r.download_released_at, r.download_released_by,
                 -- Small, and the email table lists its subjects and files.
                 CASE WHEN r.bank = 'EMAIL' THEN r.input_json END AS email_input`;

/** Both name joins every query needs: who generated it, who finalized it. */
const JOINS = `LEFT JOIN users u ON u.id = r.created_by
               LEFT JOIN users f ON f.id = r.finalized_by`;

/**
 * Summaries only: a statement payload runs to hundreds of kilobytes, so the
 * list never carries one. The page fetches a record when a panel is opened.
 */
export async function listForStudent(studentId: string): Promise<StudentRecordSummary[]> {
  const { rows } = await query<SummaryRow>(
    `SELECT ${COLUMNS}
       FROM student_records r ${JOINS}
      WHERE r.student_id = $1
      -- The finalized record leads; the rest are newest first.
      ORDER BY r.finalized_at IS NULL, r.created_at DESC`,
    [studentId],
  );
  return rows.map(mapSummary);
}

export async function findById(
  studentId: string,
  id: string,
): Promise<StudentRecordEntry | null> {
  const { rows } = await query<RecordRow>(
    `SELECT ${COLUMNS}, r.input_json, r.extract_json, r.statement_json
       FROM student_records r ${JOINS}
      WHERE r.student_id = $1 AND r.id = $2`,
    [studentId, id],
  );
  return rows[0] ? mapRecord(rows[0]) : null;
}

/** The uploaded statement page. Absent on an update means "keep the one stored". */
export interface RecordAttachment {
  buffer: Buffer;
  name: string;
  type: string;
}

export interface RecordPayload {
  /** Fixed at creation; an update leaves the stored bank as it is. */
  bank?: RecordBank;
  input: unknown;
  extract: unknown;
  statement: unknown;
  attachment?: RecordAttachment | null;
}

export async function insertRecord(
  studentId: string,
  payload: RecordPayload,
  createdBy: string,
): Promise<StudentRecordSummary> {
  const { rows } = await query<SummaryRow>(
    `WITH inserted AS (
       INSERT INTO student_records
         (student_id, input_json, extract_json, statement_json, created_by,
          attachment, attachment_name, attachment_type, bank)
       VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5, $6, $7, $8, $9)
       RETURNING *
     )
     SELECT ${COLUMNS} FROM inserted r ${JOINS}`,
    [
      studentId,
      JSON.stringify(payload.input),
      JSON.stringify(payload.extract),
      JSON.stringify(payload.statement),
      createdBy,
      payload.attachment?.buffer ?? null,
      payload.attachment?.name ?? null,
      payload.attachment?.type ?? null,
      payload.bank ?? 'SBI',
    ],
  );
  return mapSummary(rows[0]!);
}

export async function updateRecord(
  studentId: string,
  id: string,
  payload: RecordPayload,
): Promise<StudentRecordSummary | null> {
  const { rows } = await query<SummaryRow>(
    `WITH updated AS (
       UPDATE student_records
          SET input_json = $3::jsonb, extract_json = $4::jsonb, statement_json = $5::jsonb,
              -- A new file replaces the stored one; no file keeps it.
              attachment = COALESCE($6, attachment),
              attachment_name = COALESCE($7, attachment_name),
              attachment_type = COALESCE($8, attachment_type)
        WHERE student_id = $1 AND id = $2
        RETURNING *
     )
     SELECT ${COLUMNS} FROM updated r ${JOINS}`,
    [
      studentId,
      id,
      JSON.stringify(payload.input),
      JSON.stringify(payload.extract),
      JSON.stringify(payload.statement),
      payload.attachment?.buffer ?? null,
      payload.attachment?.name ?? null,
      payload.attachment?.type ?? null,
    ],
  );
  return rows[0] ? mapSummary(rows[0]) : null;
}

/** Overwrites the statement's account block and nothing else. */
export async function updateAccountInfo(
  studentId: string,
  id: string,
  accountInfo: Record<string, string>,
): Promise<StudentRecordSummary | null> {
  const { rows } = await query<SummaryRow>(
    `WITH updated AS (
       UPDATE student_records
          SET statement_json = jsonb_set(statement_json, '{accountInfo}', $3::jsonb)
        WHERE student_id = $1 AND id = $2
        RETURNING *
     )
     SELECT ${COLUMNS} FROM updated r ${JOINS}`,
    [studentId, id, JSON.stringify(accountInfo)],
  );
  return rows[0] ? mapSummary(rows[0]) : null;
}

/** Overwrites the statement's transactions and nothing else. */
export async function updateTransactions(
  studentId: string,
  id: string,
  transactions: unknown[],
): Promise<boolean> {
  const { rowCount } = await query(
    `UPDATE student_records
        SET statement_json = jsonb_set(statement_json, '{transactions}', $3::jsonb)
      WHERE student_id = $1 AND id = $2`,
    [studentId, id, JSON.stringify(transactions)],
  );
  return (rowCount ?? 0) > 0;
}

export async function deleteRecord(studentId: string, id: string): Promise<boolean> {
  const { rowCount } = await query(
    'DELETE FROM student_records WHERE student_id = $1 AND id = $2',
    [studentId, id],
  );
  return (rowCount ?? 0) > 0;
}

/** The stored statement page, fetched only when it is about to be sent. */
export async function findAttachment(
  studentId: string,
  id: string,
): Promise<RecordAttachment | null> {
  const { rows } = await query<{
    attachment: Buffer | null;
    attachment_name: string | null;
    attachment_type: string | null;
  }>(
    `SELECT attachment, attachment_name, attachment_type
       FROM student_records
      WHERE student_id = $1 AND id = $2`,
    [studentId, id],
  );

  const row = rows[0];
  if (!row?.attachment) return null;

  return {
    buffer: row.attachment,
    name: row.attachment_name ?? 'statement.pdf',
    type: row.attachment_type ?? 'application/pdf',
  };
}

/** The row without its payloads — enough to decide whether it may change. */
export async function findSummary(
  studentId: string,
  id: string,
): Promise<StudentRecordSummary | null> {
  const { rows } = await query<SummaryRow>(
    `SELECT ${COLUMNS} FROM student_records r ${JOINS}
      WHERE r.student_id = $1 AND r.id = $2`,
    [studentId, id],
  );
  return rows[0] ? mapSummary(rows[0]) : null;
}

/** The student's finalized record for one bank, if one is. */
export async function findFinalized(
  studentId: string,
  bank: StudentRecordBank,
): Promise<StudentRecordSummary | null> {
  const { rows } = await query<SummaryRow>(
    `SELECT ${COLUMNS} FROM student_records r ${JOINS}
      WHERE r.student_id = $1 AND r.bank = $2 AND r.finalized_at IS NOT NULL`,
    [studentId, bank],
  );
  return rows[0] ? mapSummary(rows[0]) : null;
}

/** Marks the record finalized by `userId`, or clears it when null. */
export async function setFinalized(
  studentId: string,
  id: string,
  userId: string | null,
): Promise<StudentRecordSummary | null> {
  const { rows } = await query<SummaryRow>(
    `WITH changed AS (
       UPDATE student_records
          SET finalized_at = CASE WHEN $3::uuid IS NULL THEN NULL ELSE now() END,
              finalized_by = $3::uuid,
              -- Releasing the download refers to the finalized statement, so
              -- unfinalizing takes it back.
              download_released_at = CASE WHEN $3::uuid IS NULL THEN NULL ELSE download_released_at END,
              download_released_by = CASE WHEN $3::uuid IS NULL THEN NULL ELSE download_released_by END
        WHERE student_id = $1 AND id = $2
        RETURNING *
     )
     SELECT ${COLUMNS} FROM changed r ${JOINS}`,
    [studentId, id, userId],
  );
  return rows[0] ? mapSummary(rows[0]) : null;
}

/** Releases the un-watermarked statement to the record's owner, or withdraws it. */
export async function setDownloadReleased(
  studentId: string,
  id: string,
  userId: string | null,
): Promise<StudentRecordSummary | null> {
  const { rows } = await query<SummaryRow>(
    `WITH changed AS (
       UPDATE student_records
          SET download_released_at = CASE WHEN $3::uuid IS NULL THEN NULL ELSE now() END,
              download_released_by = $3::uuid
        WHERE student_id = $1 AND id = $2
        RETURNING *
     )
     SELECT ${COLUMNS} FROM changed r ${JOINS}`,
    [studentId, id, userId],
  );
  return rows[0] ? mapSummary(rows[0]) : null;
}

export interface RecordFile {
  id: string;
  buffer: Buffer;
  name: string;
  type: string;
}

/**
 * Creates (id null) or replaces an email record. Files not in `keepFileIds`
 * are dropped and `files` are added, all in one transaction.
 */
export async function saveEmailRecord(
  studentId: string,
  id: string | null,
  input: unknown,
  output: unknown,
  files: RecordFile[],
  keepFileIds: string[],
  createdBy: string,
): Promise<string | null> {
  return withTransaction(async (client) => {
    const { rows } = id
      ? await client.query<{ id: string }>(
          `UPDATE student_records SET input_json = $3::jsonb, statement_json = $4::jsonb
            WHERE student_id = $1 AND id = $2 RETURNING id`,
          [studentId, id, JSON.stringify(input), JSON.stringify(output)],
        )
      : await client.query<{ id: string }>(
          `INSERT INTO student_records
             (student_id, bank, input_json, extract_json, statement_json, created_by)
           VALUES ($1, 'EMAIL', $2::jsonb, '{}'::jsonb, $3::jsonb, $4) RETURNING id`,
          [studentId, JSON.stringify(input), JSON.stringify(output), createdBy],
        );
    const recordId = rows[0]?.id;
    if (!recordId) return null;

    await client.query(
      'DELETE FROM student_record_files WHERE record_id = $1 AND NOT (id = ANY($2::uuid[]))',
      [recordId, keepFileIds],
    );
    for (const file of files) {
      await client.query(
        'INSERT INTO student_record_files (id, record_id, data, name, type) VALUES ($1, $2, $3, $4, $5)',
        [file.id, recordId, file.buffer, file.name, file.type],
      );
    }
    return recordId;
  });
}

export async function listFileIds(recordId: string): Promise<string[]> {
  const { rows } = await query<{ id: string }>(
    'SELECT id FROM student_record_files WHERE record_id = $1',
    [recordId],
  );
  return rows.map((row) => row.id);
}

export async function findFile(
  studentId: string,
  recordId: string,
  fileId: string,
): Promise<RecordAttachment | null> {
  const { rows } = await query<{ data: Buffer; name: string; type: string }>(
    `SELECT f.data, f.name, f.type
       FROM student_record_files f JOIN student_records r ON r.id = f.record_id
      WHERE r.student_id = $1 AND r.id = $2 AND f.id = $3`,
    [studentId, recordId, fileId],
  );
  const row = rows[0];
  return row ? { buffer: row.data, name: row.name, type: row.type } : null;
}
