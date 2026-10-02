import { recordAudit } from './audit.service.js';
import * as studentService from './student.service.js';
import * as records from '../repositories/student-record.repository.js';
import * as students from '../repositories/student.repository.js';
import type { RequestActor, StudentRecordEntry, StudentRecordSummary } from '../types.js';
import { randomUUID } from 'node:crypto';
import { buildEmailOutput, type EmailInput } from '../email/output.js';
import { generateIdbiTransactions } from '../idbi/generate.js';
import { generateSbiTransactions } from '../sbi/generate.js';
import { matchTransactions } from '../statement/match.js';
import {
  renderIdbiStatement,
  renderStatement,
  type StatementPayload,
} from '../sbi/statement-render.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';

/**
 * Generated statements hang off a student, so they inherit that student's
 * ownership rule: every call resolves the student through
 * `studentService.getById`, which 404s anything the actor may not touch.
 */

export async function list(
  studentId: string,
  actor: RequestActor,
): Promise<StudentRecordSummary[]> {
  await studentService.getById(studentId, actor);
  return records.listForStudent(studentId);
}

export async function getById(
  studentId: string,
  id: string,
  actor: RequestActor,
): Promise<StudentRecordEntry> {
  await studentService.getById(studentId, actor);
  const record = await records.findById(studentId, id);
  if (!record) throw notFound('Generated record not found.');
  return record;
}

export async function create(
  studentId: string,
  payload: records.RecordPayload,
  actor: RequestActor,
): Promise<StudentRecordSummary> {
  await studentService.getById(studentId, actor);
  const created = await records.insertRecord(studentId, payload, actor.user.id);

  await recordAudit({
    userId: actor.user.id,
    action: 'STUDENT_RECORD_CREATED',
    entityType: 'student_record',
    entityId: created.id,
    metadata: { studentId, bank: created.bank },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });

  return created;
}

/**
 * A finalized record is the student's agreed statement, so it is locked for
 * everyone — administrators included — until someone unfinalizes it.
 */
async function assertEditable(studentId: string, id: string): Promise<StudentRecordSummary> {
  const existing = await records.findSummary(studentId, id);
  if (!existing) throw notFound('Generated record not found.');
  if (existing.finalizedAt) {
    throw conflict('This record is finalized. Unfinalize it before changing or deleting it.');
  }
  return existing;
}

export async function update(
  studentId: string,
  id: string,
  payload: records.RecordPayload,
  actor: RequestActor,
): Promise<StudentRecordSummary> {
  await studentService.getById(studentId, actor);
  const existing = await assertEditable(studentId, id);
  if (existing.bank === 'EMAIL') throw badRequest('Email records are saved through the email form.');
  const updated = await records.updateRecord(studentId, id, payload);
  if (!updated) throw notFound('Generated record not found.');

  await recordAudit({
    userId: actor.user.id,
    action: 'STUDENT_RECORD_UPDATED',
    entityType: 'student_record',
    entityId: id,
    metadata: { studentId },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });

  return updated;
}

/**
 * Admin correction of the extract (account block, salary periods, balances):
 * the statement is generated again from it, so the PDFs follow the edit. The
 * form input is kept — a later record edit rebuilds the salary periods from
 * it but carries the edited account block forward.
 */
export async function updateExtract(
  studentId: string,
  id: string,
  extract: Record<string, unknown>,
  actor: RequestActor,
): Promise<StudentRecordSummary> {
  const existing = await getById(studentId, id, actor);
  await assertEditable(studentId, id);
  if (existing.bank === 'EMAIL') throw badRequest('Email records have no extract.');

  if (!extract.accountInfo || typeof extract.accountInfo !== 'object') {
    throw badRequest('The extract needs an "accountInfo" object.');
  }
  if (!Array.isArray(extract.salaries) || extract.salaries.length === 0) {
    throw badRequest('The extract needs a non-empty "salaries" array.');
  }

  let statement;
  try {
    statement =
      existing.bank === 'IDBI' ? generateIdbiTransactions(extract) : generateSbiTransactions(extract);
  } catch (error) {
    throw badRequest(`Could not generate from that extract: ${(error as Error).message}`);
  }
  if (statement.invalidDates.length > 0) {
    throw badRequest(
      `The generated transactions came out in the wrong order (${statement.invalidDates.length} date(s)). Check the salary period dates.`,
    );
  }
  if (statement.transactions.length === 0) {
    throw badRequest('That extract produced no transactions.');
  }

  const updated = await records.updateRecord(studentId, id, {
    input: existing.input,
    extract,
    statement,
  });
  if (!updated) throw notFound('Generated record not found.');

  await recordAudit({
    userId: actor.user.id,
    action: 'STUDENT_RECORD_UPDATED',
    entityType: 'student_record',
    entityId: id,
    metadata: { studentId, extractEdited: true },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });

  return updated;
}

/**
 * Correction of the statement's account block alone: the transactions stay as
 * generated. The extract is not touched, so a later record edit regenerates
 * from it and puts the PDF's own account details back.
 */
export async function updateAccountInfo(
  studentId: string,
  id: string,
  accountInfo: Record<string, string>,
  actor: RequestActor,
): Promise<StudentRecordSummary> {
  await studentService.getById(studentId, actor);
  const existing = await assertEditable(studentId, id);
  if (existing.bank === 'EMAIL') throw badRequest('Email records have no account details.');
  const updated = await records.updateAccountInfo(studentId, id, accountInfo);
  if (!updated) throw notFound('Generated record not found.');

  await recordAudit({
    userId: actor.user.id,
    action: 'STUDENT_RECORD_UPDATED',
    entityType: 'student_record',
    entityId: id,
    metadata: { studentId, accountInfoEdited: true },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });

  return updated;
}

export async function remove(
  studentId: string,
  id: string,
  actor: RequestActor,
): Promise<void> {
  await studentService.getById(studentId, actor);
  await assertEditable(studentId, id);
  const deleted = await records.deleteRecord(studentId, id);
  if (!deleted) throw notFound('Generated record not found.');

  await recordAudit({
    userId: actor.user.id,
    action: 'STUDENT_RECORD_DELETED',
    entityType: 'student_record',
    entityId: id,
    metadata: { studentId },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });
}

/** The statement page the record was generated from. */
export async function getAttachment(
  studentId: string,
  id: string,
  actor: RequestActor,
): Promise<records.RecordAttachment> {
  await studentService.getById(studentId, actor);
  const attachment = await records.findAttachment(studentId, id);
  if (!attachment) throw notFound('No statement page is stored for this record.');
  return attachment;
}

/**
 * Finalizing marks the one record that counts for a student, per bank: one
 * SBI and one IDBI record can each be finalized. Within a bank only one at a
 * time, and the other one has to be released first — silently
 * moving the flag would unlock a record someone had deliberately frozen.
 */
export async function finalize(
  studentId: string,
  id: string,
  actor: RequestActor,
): Promise<StudentRecordSummary> {
  await studentService.getById(studentId, actor);

  const existing = await records.findSummary(studentId, id);
  if (!existing) throw notFound('Generated record not found.');
  if (existing.finalizedAt) return existing;

  const alreadyFinal = await records.findFinalized(studentId, existing.bank);
  if (alreadyFinal) {
    throw conflict(
      `Another ${existing.bank} record is already finalized for this student. Unfinalize that one first.`,
    );
  }

  const updated = await records.setFinalized(studentId, id, actor.user.id);
  if (!updated) throw notFound('Generated record not found.');

  await recordAudit({
    userId: actor.user.id,
    action: 'STUDENT_RECORD_FINALIZED',
    entityType: 'student_record',
    entityId: id,
    metadata: { studentId },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });

  return updated;
}

export async function unfinalize(
  studentId: string,
  id: string,
  actor: RequestActor,
): Promise<StudentRecordSummary> {
  await studentService.getById(studentId, actor);

  const updated = await records.setFinalized(studentId, id, null);
  if (!updated) throw notFound('Generated record not found.');
  // An unfinalized statement is no longer the agreed one, so it goes off live.
  await students.clearLive(studentId);

  await recordAudit({
    userId: actor.user.id,
    action: 'STUDENT_RECORD_UNFINALIZED',
    entityType: 'student_record',
    entityId: id,
    metadata: { studentId },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });

  return updated;
}

/**
 * Releasing a finalized record hands its clean statement to the student's
 * owner. Administrators only — the route enforces the role.
 */
export async function setDownloadReleased(
  studentId: string,
  id: string,
  released: boolean,
  actor: RequestActor,
): Promise<StudentRecordSummary> {
  await studentService.getById(studentId, actor);

  const existing = await records.findSummary(studentId, id);
  if (!existing) throw notFound('Generated record not found.');
  if (released && existing.bank !== 'SBI') {
    throw conflict(`${existing.bank} records have no clean statement to release.`);
  }
  if (released && !existing.finalizedAt) {
    throw conflict('Finalize the record before releasing its statement.');
  }

  const updated = await records.setDownloadReleased(
    studentId,
    id,
    released ? actor.user.id : null,
  );
  if (!updated) throw notFound('Generated record not found.');

  await recordAudit({
    userId: actor.user.id,
    action: released ? 'STUDENT_RECORD_DOWNLOAD_SHOWN' : 'STUDENT_RECORD_DOWNLOAD_HIDDEN',
    entityType: 'student_record',
    entityId: id,
    metadata: { studentId },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });

  return updated;
}

export interface StatementPdfOptions {
  fromDate: string;
  toDate: string;
  dateOfStatement?: string;
  dummy: boolean;
  protect: boolean;
  /** Overrides the record's own password, for this download only. */
  password?: string;
}

/**
 * Renders one record's statement. The clean copy is for administrators and,
 * once released, the student's owner; everyone else gets it watermarked, and
 * the server decides — not the caller.
 */
export async function statementPdf(
  studentId: string,
  id: string,
  options: StatementPdfOptions,
  actor: RequestActor,
): Promise<{ pdf: Buffer; fileName: string }> {
  await studentService.getById(studentId, actor);

  const record = await records.findById(studentId, id);
  if (!record) throw notFound('Generated record not found.');
  if (record.bank === 'EMAIL') throw badRequest('Email records have no statement.');

  // Always SAMPLE-marked, so anyone with access to the student may download it.
  if (record.bank === 'IDBI') {
    return renderIdbiStatement(record.statement as StatementPayload, options);
  }

  const mayDownloadClean =
    actor.user.role === 'ADMIN' || Boolean(record.downloadReleasedAt);
  if (!options.dummy && !mayDownloadClean) {
    throw forbidden('This statement has not been released for download yet.');
  }

  // Whatever password the dialog sent applies to this file only; nothing is
  // written back to the record.
  return renderStatement(record.statement as StatementPayload, options);
}

/**
 * Creates (id null) or replaces an email record. `uploads[i]` is the new file
 * for email i; without one, the email keeps the stored file it names, if that
 * file belongs to this record.
 */
export async function saveEmail(
  studentId: string,
  id: string | null,
  emails: EmailInput[],
  uploads: Map<number, Omit<records.RecordFile, 'id'>>,
  actor: RequestActor,
): Promise<StudentRecordSummary> {
  await studentService.getById(studentId, actor);
  let stored = new Set<string>();
  if (id) {
    const existing = await assertEditable(studentId, id);
    if (existing.bank !== 'EMAIL') throw badRequest('This is not an email record.');
    stored = new Set(await records.listFileIds(id));
    // The previous names, so a kept file keeps its name in the input.
    const previous = await records.findById(studentId, id);
    const names = new Map(
      ((previous?.input as { emails?: EmailInput[] })?.emails ?? []).map((e) => [e.fileId, e.attachmentName]),
    );
    emails = emails.map((e) => ({ ...e, attachmentName: e.fileId ? names.get(e.fileId) ?? null : null }));
  }

  const files: records.RecordFile[] = [];
  const input = emails.map((email, index) => {
    const upload = uploads.get(index);
    if (upload) {
      const file = { ...upload, id: randomUUID() };
      files.push(file);
      return { ...email, fileId: file.id, attachmentName: file.name };
    }
    return email.fileId && stored.has(email.fileId)
      ? email
      : { ...email, fileId: null, attachmentName: null };
  });
  const keep = input.flatMap((e) => (e.fileId && stored.has(e.fileId) ? [e.fileId] : []));

  const savedId = await records.saveEmailRecord(
    studentId,
    id,
    { emails: input },
    buildEmailOutput(input),
    files,
    keep,
    actor.user.id,
  );
  const saved = savedId && (await records.findSummary(studentId, savedId));
  if (!saved) throw notFound('Generated record not found.');

  await recordAudit({
    userId: actor.user.id,
    action: id ? 'STUDENT_RECORD_UPDATED' : 'STUDENT_RECORD_CREATED',
    entityType: 'student_record',
    entityId: saved.id,
    metadata: { studentId, bank: 'EMAIL' },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });

  return saved;
}

export async function getFile(
  studentId: string,
  id: string,
  fileId: string,
  actor: RequestActor,
): Promise<records.RecordAttachment> {
  await studentService.getById(studentId, actor);
  const file = await records.findFile(studentId, id, fileId);
  if (!file) throw notFound('Attachment not found.');
  return file;
}

/**
 * Appends one or two transactions so a finalized statement closes on
 * `target`. The only change a finalized record allows: existing rows stay
 * exactly as they are.
 */
export async function matchClosingBalance(
  studentId: string,
  id: string,
  target: number,
  actor: RequestActor,
): Promise<{ added: unknown[]; transactions: unknown[] }> {
  const record = await getById(studentId, id, actor);
  if (record.bank === 'EMAIL') throw badRequest('Email records have no transactions.');
  if (!record.finalizedAt) throw conflict('Finalize the record before matching its transactions.');

  const statement = record.statement as { transactions?: unknown[] };
  let result: { added: unknown[]; transactions: unknown[] };
  try {
    result = matchTransactions(record.bank, statement.transactions ?? [], target);
  } catch (error) {
    throw badRequest((error as Error).message);
  }
  if (result.added.length === 0) return result;

  await records.updateTransactions(studentId, id, result.transactions);
  await recordAudit({
    userId: actor.user.id,
    action: 'STUDENT_RECORD_UPDATED',
    entityType: 'student_record',
    entityId: id,
    metadata: { studentId, matchedClosingBalance: target, added: result.added.length },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });
  return result;
}
