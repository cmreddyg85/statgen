import { recordAudit } from './audit.service.js';
import * as studentService from './student.service.js';
import * as records from '../repositories/student-record.repository.js';
import type { RequestActor, StudentRecordEntry, StudentRecordSummary } from '../types.js';
import { conflict, notFound } from '../utils/errors.js';

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
    metadata: { studentId },
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
  await assertEditable(studentId, id);
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
 * Finalizing marks the one record that counts for a student. Only one can be
 * finalized at a time, and the other one has to be released first — silently
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

  const alreadyFinal = await records.findFinalized(studentId);
  if (alreadyFinal) {
    throw conflict(
      'Another record is already finalized for this student. Unfinalize that one first.',
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
