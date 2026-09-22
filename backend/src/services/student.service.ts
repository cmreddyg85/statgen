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
  verified?: boolean;
  /** Honoured for admins only; a user is always scoped to their own records. */
  createdBy?: string;
  page: number;
  pageSize: number;
}

export async function list(
  options: ListOptions,
  actor: RequestActor,
): Promise<Paginated<StudentRecord>> {
  return students.listStudents({
    ...options,
    createdBy: listScopeFor(actor.user, options.createdBy),
  });
}

export async function getById(id: string, actor: RequestActor): Promise<StudentRecord> {
  const student = await students.findById(id);
  if (!student) throw notFound('Student not found.');

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
  input: {
    name: string;
    mobileNumber: string;
    offerCompany: string | null;
    companyVerified: boolean;
  },
  actor: RequestActor,
): Promise<StudentRecord> {
  const student = await students.insertStudent({
    ...input,
    // Ownership and verifier attribution both come from the session, never
    // from the payload.
    verifiedBy: input.companyVerified ? actor.user.id : null,
    createdBy: actor.user.id,
  });

  await recordAudit({
    userId: actor.user.id,
    action: 'STUDENT_CREATED',
    entityType: 'student',
    entityId: student.id,
    metadata: { name: student.name, companyVerified: student.companyVerified },
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

export async function setVerification(
  id: string,
  verified: boolean,
  actor: RequestActor,
): Promise<StudentRecord> {
  await getById(id, actor);

  const updated = await students.setVerification(id, verified, actor.user.id);
  if (!updated) throw notFound('Student not found.');

  await recordAudit({
    userId: actor.user.id,
    action: verified ? 'STUDENT_COMPANY_VERIFIED' : 'STUDENT_COMPANY_UNVERIFIED',
    entityType: 'student',
    entityId: id,
    metadata: { offerCompany: updated.offerCompany },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });

  return updated;
}

/** Soft delete only — history is preserved (PRD 14.1). */
export async function remove(id: string, actor: RequestActor): Promise<void> {
  const existing = await getById(id, actor);

  const deleted = await students.softDeleteStudent(id);
  if (!deleted) throw notFound('Student not found.');

  await recordAudit({
    userId: actor.user.id,
    action: 'STUDENT_DELETED',
    entityType: 'student',
    entityId: id,
    metadata: { name: existing.name, softDelete: true },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });
}

/** Counts follow the same scope as the list. */
export async function stats(actor: RequestActor): Promise<students.StudentStats> {
  return students.getStudentStats(listScopeFor(actor.user));
}
