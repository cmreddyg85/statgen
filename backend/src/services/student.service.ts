import { recordAudit } from './audit.service.js';
import { canAccessStudent, listScopeFor } from './student-access.js';
import * as students from '../repositories/student.repository.js';
import type { Paginated, RequestActor, StudentRecord } from '../types.js';
import { notFound } from '../utils/errors.js';

/**
 * Students are shared between both roles, but a USER only ever works with the
 * records they created; an ADMIN works with all of them (see
 * `student-access.ts`). Every read and write below resolves that scope from
 * the session, so the rule cannot be bypassed from the client.
 */

export interface ListOptions {
  search?: string;
  /** Honoured for admins only; a user only ever sees active students. */
  status?: students.ArchiveScope;
  /** Honoured for admins only; a user is always scoped to their own records. */
  createdBy?: string;
  page: number;
  pageSize: number;
}

export async function list(
  options: ListOptions,
  actor: RequestActor,
): Promise<Paginated<StudentRecord>> {
  const isAdmin = actor.user.role === 'ADMIN';
  return students.listStudents({
    ...options,
    status: isAdmin ? (options.status ?? 'active') : 'active',
    createdBy: listScopeFor(actor.user, options.createdBy),
  });
}

export async function getById(id: string, actor: RequestActor): Promise<StudentRecord> {
  const student = await students.findById(id);
  if (!student) throw notFound('Student not found.');

  // Archiving hides the student from its owner; only an admin still sees it.
  if (student.archivedAt && actor.user.role !== 'ADMIN') {
    throw notFound('Student not found.');
  }

  if (!canAccessStudent(actor.user, student)) {
    await recordAudit({
      userId: actor.user.id,
      action: 'AUTHORIZATION_FAILURE',
      entityType: 'student',
      entityId: id,
      metadata: { reason: 'not_record_owner' },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });
    // Deliberately the same answer as a missing record: a user should not be
    // able to learn which student ids exist outside their own records.
    throw notFound('Student not found.');
  }

  return student;
}

export async function create(
  input: { name: string; mobileNumber: string; offerCompany: string | null },
  actor: RequestActor,
): Promise<StudentRecord> {
  const student = await students.insertStudent({
    ...input,
    // Ownership comes from the session, never from the payload.
    createdBy: actor.user.id,
  });

  await recordAudit({
    userId: actor.user.id,
    action: 'STUDENT_CREATED',
    entityType: 'student',
    entityId: student.id,
    metadata: { name: student.name },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });

  return student;
}

export async function update(
  id: string,
  changes: { name?: string; mobileNumber?: string; offerCompany?: string | null },
  actor: RequestActor,
): Promise<StudentRecord> {
  // Resolves the record and enforces ownership before anything is written.
  await getById(id, actor);

  const updated = await students.updateStudent(id, changes);
  if (!updated) throw notFound('Student not found.');

  await recordAudit({
    userId: actor.user.id,
    action: 'STUDENT_UPDATED',
    entityType: 'student',
    entityId: id,
    metadata: { changes },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });

  return updated;
}

/**
 * "Deleting" a student archives them: the row and its generated records stay,
 * the owner stops seeing it, and an administrator can restore it.
 */
export async function archive(id: string, actor: RequestActor): Promise<void> {
  const existing = await getById(id, actor);

  const archived = await students.archiveStudent(id);
  if (!archived) throw notFound('Student not found.');

  await recordAudit({
    userId: actor.user.id,
    action: 'STUDENT_ARCHIVED',
    entityType: 'student',
    entityId: id,
    metadata: { name: existing.name },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });
}

/** Admin only — the route enforces the role. */
export async function unarchive(id: string, actor: RequestActor): Promise<StudentRecord> {
  const existing = await getById(id, actor);

  const restored = await students.unarchiveStudent(id);
  if (!restored) throw notFound('Student not found.');

  await recordAudit({
    userId: actor.user.id,
    action: 'STUDENT_UNARCHIVED',
    entityType: 'student',
    entityId: id,
    metadata: { name: existing.name },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });

  return (await students.findById(id))!;
}

/**
 * Permanent deletion, administrators only — the route enforces the role.
 * Everything generated for the student goes with them.
 */
export async function remove(id: string, actor: RequestActor): Promise<void> {
  const existing = await getById(id, actor);
  const records = await students.countRecords(id);

  const deleted = await students.deleteStudent(id);
  if (!deleted) throw notFound('Student not found.');

  await recordAudit({
    userId: actor.user.id,
    action: 'STUDENT_DELETED',
    entityType: 'student',
    entityId: id,
    metadata: { name: existing.name, deletedRecords: records },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });
}

/** Counts follow the same scope as the list. */
export async function stats(actor: RequestActor): Promise<students.StudentStats> {
  return students.getStudentStats(listScopeFor(actor.user));
}
