import { query, type QueryParam } from '../db/pool.js';
import type { Paginated, StudentRecord } from '../types.js';

interface StudentRow {
  id: string;
  name: string;
  mobile_number: string;
  offer_company: string | null;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

function mapStudentRow(row: StudentRow): StudentRecord {
  return {
    id: row.id,
    name: row.name,
    mobileNumber: row.mobile_number,
    offerCompany: row.offer_company,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

const SELECT_STUDENT = `
  SELECT s.id, s.name, s.mobile_number, s.offer_company,
         s.created_by, cu.name AS created_by_name,
         s.created_at, s.updated_at, s.archived_at
    FROM students s
    LEFT JOIN users cu ON cu.id = s.created_by
`;

/** Archived students are returned too; visibility is decided by the service. */
export async function findById(id: string): Promise<StudentRecord | null> {
  const { rows } = await query<StudentRow>(`${SELECT_STUDENT} WHERE s.id = $1`, [id]);
  return rows[0] ? mapStudentRow(rows[0]) : null;
}

/** Which side of the archive to list. Only an admin may choose. */
export type ArchiveScope = 'active' | 'archived' | 'all';

export interface ListStudentsOptions {
  search?: string;
  status?: ArchiveScope;
  /** Restricts the list to records created by this user. */
  createdBy?: string;
  page: number;
  pageSize: number;
}

export async function listStudents(
  options: ListStudentsOptions,
): Promise<Paginated<StudentRecord>> {
  const conditions: string[] = [];
  const params: QueryParam[] = [];

  if (options.status === 'archived') {
    conditions.push('s.archived_at IS NOT NULL');
  } else if (options.status !== 'all') {
    conditions.push('s.archived_at IS NULL');
  }

  if (options.search) {
    params.push(`%${options.search}%`);
    conditions.push(
      `(s.name ILIKE $${params.length} OR s.mobile_number ILIKE $${params.length} OR s.offer_company ILIKE $${params.length})`,
    );
  }
  if (options.createdBy) {
    params.push(options.createdBy);
    conditions.push(`s.created_by = $${params.length}::uuid`);
  }

  // "All" with no search leaves nothing to filter on, so there is no WHERE.
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const totalResult = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM students s ${where}`,
    params,
  );
  const total = Number(totalResult.rows[0]?.count ?? 0);

  const offset = (options.page - 1) * options.pageSize;
  const { rows } = await query<StudentRow>(
    // Newest records first: the most recently added student is the one an
    // operator is most likely to be looking for.
    `${SELECT_STUDENT} ${where}
      ORDER BY s.created_at DESC, s.id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, options.pageSize, offset],
  );

  return {
    items: rows.map(mapStudentRow),
    page: options.page,
    pageSize: options.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / options.pageSize)),
  };
}

export async function insertStudent(input: {
  name: string;
  mobileNumber: string;
  offerCompany: string | null;
  createdBy: string;
}): Promise<StudentRecord> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO students (name, mobile_number, offer_company, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [input.name, input.mobileNumber, input.offerCompany, input.createdBy],
  );
  return (await findById(rows[0]!.id))!;
}

export async function updateStudent(
  id: string,
  changes: {
    name?: string;
    mobileNumber?: string;
    offerCompany?: string | null;
  },
): Promise<StudentRecord | null> {
  const assignments: string[] = [];
  const params: QueryParam[] = [];

  if (changes.name !== undefined) {
    params.push(changes.name);
    assignments.push(`name = $${params.length}`);
  }
  if (changes.mobileNumber !== undefined) {
    params.push(changes.mobileNumber);
    assignments.push(`mobile_number = $${params.length}`);
  }
  if (changes.offerCompany !== undefined) {
    params.push(changes.offerCompany);
    assignments.push(`offer_company = $${params.length}`);
  }
  if (assignments.length === 0) return findById(id);

  params.push(id);
  const { rowCount } = await query(
    `UPDATE students SET ${assignments.join(', ')}
      WHERE id = $${params.length} AND archived_at IS NULL`,
    params,
  );
  return rowCount ? findById(id) : null;
}

/** Archiving and restoring are conditional updates, so a repeated click is a
 * no-op rather than a second audit entry. */
export async function archiveStudent(id: string): Promise<boolean> {
  const { rowCount } = await query(
    'UPDATE students SET archived_at = now() WHERE id = $1 AND archived_at IS NULL',
    [id],
  );
  return (rowCount ?? 0) > 0;
}

export async function unarchiveStudent(id: string): Promise<boolean> {
  const { rowCount } = await query(
    'UPDATE students SET archived_at = NULL WHERE id = $1 AND archived_at IS NOT NULL',
    [id],
  );
  return (rowCount ?? 0) > 0;
}

export interface StudentStats {
  /** Students still in play; archived ones are counted separately. */
  total: number;
  archived: number;
}

/** `createdBy` scopes the counts to one owner; omitting it counts every record. */
export async function getStudentStats(createdBy?: string): Promise<StudentStats> {
  const { rows } = await query<{ total: string; archived: string }>(
    `SELECT count(*) FILTER (WHERE archived_at IS NULL)::text AS total,
            count(*) FILTER (WHERE archived_at IS NOT NULL)::text AS archived
       FROM students
      WHERE $1::uuid IS NULL OR created_by = $1::uuid`,
    [createdBy ?? null],
  );
  const row = rows[0]!;
  return { total: Number(row.total), archived: Number(row.archived) };
}

/**
 * Permanent removal, administrators only. The student's generated records
 * cascade with them, so the caller reports how many are going.
 */
export async function deleteStudent(id: string): Promise<boolean> {
  const { rowCount } = await query('DELETE FROM students WHERE id = $1', [id]);
  return (rowCount ?? 0) > 0;
}

export async function countRecords(studentId: string): Promise<number> {
  const { rows } = await query<{ count: string }>(
    'SELECT count(*)::text AS count FROM student_records WHERE student_id = $1',
    [studentId],
  );
  return Number(rows[0]?.count ?? 0);
}
