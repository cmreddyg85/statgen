import type { StudentRecord, UserRecord } from '../types.js';

/**
 * Object-level authorization for student records (PRD 13.4).
 *
 * Ownership rule:
 *  - ADMIN sees and edits every student record.
 *  - USER sees and edits only the records they created.
 *
 * Ownership is decided from the session user and the record's `created_by`,
 * never from anything the client sends.
 */

/**
 * The `createdBy` filter a caller is allowed to list with.
 *
 * A USER is always pinned to their own id, so no combination of query
 * parameters can widen their view. An ADMIN may pass `requestedCreatedBy` to
 * narrow the list to one owner, or omit it to see everything.
 */
export function listScopeFor(
  user: UserRecord,
  requestedCreatedBy?: string,
): string | undefined {
  return user.role === 'ADMIN' ? requestedCreatedBy : user.id;
}

export function canAccessStudent(user: UserRecord, student: StudentRecord): boolean {
  return user.role === 'ADMIN' || student.createdBy === user.id;
}
