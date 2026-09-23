import { findModule } from '../config/modules.js';
import * as records from '../repositories/student-record.repository.js';
import * as studentService from './student.service.js';
import { recordAudit } from './audit.service.js';
import type { Paginated, RequestActor, StudentModuleRecord } from '../types.js';
import { badRequest, forbidden } from '../utils/errors.js';

/**
 * Generating module records for a student.
 *
 * What a record ultimately holds comes from the upstream module integration;
 * until that lands, a generated row carries its identity (module, reference,
 * status) and an empty `payload` for the integration to fill. Nothing
 * invented is presented as real business data.
 */

/**
 * `SBI-20260922-0007` — module, date, and a per-student running sequence, so
 * references stay readable and unique.
 */
export function buildReference(
  module: string,
  sequence: number,
  now: Date = new Date(),
): string {
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  return `${module.toUpperCase()}-${datePart}-${String(sequence).padStart(4, '0')}`;
}

export async function list(
  studentId: string,
  options: { module?: string; page: number; pageSize: number },
  actor: RequestActor,
): Promise<Paginated<StudentModuleRecord>> {
  // Ownership is enforced on the student, which governs its records too.
  await studentService.getById(studentId, actor);
  return records.listRecords({ studentId, ...options });
}

export async function generate(
  studentId: string,
  moduleKey: string,
  count: number,
  actor: RequestActor,
): Promise<StudentModuleRecord[]> {
  const student = await studentService.getById(studentId, actor);

  const module = findModule(moduleKey);
  if (!module) {
    throw badRequest('Choose a valid module.', { module: 'Unknown module' });
  }
  if (!module.roles.includes(actor.user.role)) {
    throw forbidden('You do not have access to this module.');
  }

  // Continue the student's existing sequence for this module rather than
  // restarting at 1 on every run.
  const existing = await records.countForStudentModule(studentId, module.key);
  const now = new Date();

  const batch = Array.from({ length: count }, (_, index) => ({
    studentId,
    module: module.key,
    reference: buildReference(module.key, existing + index + 1, now),
    generatedBy: actor.user.id,
  }));

  const created = (await records.insertRecords(batch)).map((record) => ({
    ...record,
    generatedByName: actor.user.name,
  }));

  await recordAudit({
    userId: actor.user.id,
    action: 'STUDENT_RECORDS_GENERATED',
    entityType: 'student',
    entityId: studentId,
    metadata: { module: module.key, count: created.length, student: student.name },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });

  return created;
}
