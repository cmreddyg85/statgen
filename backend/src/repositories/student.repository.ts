import { query, type QueryParam } from '../db/pool.js';
import type { Paginated, StudentRecord } from '../types.js';

interface StudentRow {
  id: string;
  name: string;
  mobile_number: string;
  offer_company: string | null;
  company_verified: boolean;
  verified_by: string | null;
  verified_by_name: string | null;
  verified_at: string | null;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

function mapStudentRow(row: StudentRow): StudentRecord {
  return {
    id: row.id,
    name: row.name,
    mobileNumber: row.mobile_number,
    offerCompany: row.offer_company,
    companyVerified: row.company_verified,
    verifiedBy: row.verified_by,
    verifiedByName: row.verified_by_name,
    verifiedAt: row.verified_at,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_STUDENT = `
  SELECT s.id, s.name, s.mobile_number, s.offer_company, s.company_verified,
         s.verified_by, vu.name AS verified_by_name, s.verified_at,
         s.created_by, cu.name AS created_by_name, s.created_at, s.updated_at
    FROM students s
    LEFT JOIN users vu ON vu.id = s.verified_by
    LEFT JOIN users cu ON cu.id = s.created_by
`;

export async function findById(id: string): Promise<StudentRecord | null> {
  const { rows } = await query<StudentRow>(
    `${SELECT_STUDENT} WHERE s.id = $1 AND s.deleted_at IS NULL`,
    [id],
  );
  return rows[0] ? mapStudentRow(rows[0]) : null;
}

export interface ListStudentsOptions {
  search?: string;
  verified?: boolean;
  /** Restricts the list to records created by this user. */
  createdBy?: string;
  page: number;
  pageSize: number;
}

export async function listStudents(
  options: ListStudentsOptions,
): Promise<Paginated<StudentRecord>> {
  const conditions = ['s.deleted_at IS NULL'];
  const params: QueryParam[] = [];

  if (options.search) {
    params.push(`%${options.search}%`);
    conditions.push(
      `(s.name ILIKE $${params.length} OR s.mobile_number ILIKE $${params.length} OR s.offer_company ILIKE $${params.length})`,
    );
  }
  if (options.verified !== undefined) {
    params.push(options.verified);
    conditions.push(`s.company_verified = $${params.length}`);
  }
  if (options.createdBy) {
    params.push(options.createdBy);
    conditions.push(`s.created_by = $${params.length}::uuid`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

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
  companyVerified: boolean;
  verifiedBy: string | null;
  createdBy: string;
}): Promise<StudentRecord> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO students
       (name, mobile_number, offer_company, company_verified, verified_by, verified_at, created_by)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $4 THEN now() ELSE NULL END, $6)
     RETURNING id`,
    [
      input.name,
      input.mobileNumber,
      input.offerCompany,
      input.companyVerified,
      input.verifiedBy,
      input.createdBy,
    ],
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
      WHERE id = $${params.length} AND deleted_at IS NULL`,
    params,
  );
  return rowCount ? findById(id) : null;
}

/**
 * Verification is a single conditional UPDATE so two concurrent requests
 * cannot both claim to be the verifier.
 */
export async function setVerification(
  id: string,
  verified: boolean,
  actorId: string,
): Promise<StudentRecord | null> {
  const { rowCount } = await query(
    `UPDATE students
        SET company_verified = $2,
            verified_by = CASE WHEN $2 THEN $3::uuid ELSE NULL END,
            verified_at = CASE WHEN $2 THEN now() ELSE NULL END
      WHERE id = $1 AND deleted_at IS NULL`,
    [id, verified, actorId],
  );
  return rowCount ? findById(id) : null;
}

/** Soft delete (PRD 14.1): records are archived, never removed. */
export async function softDeleteStudent(id: string): Promise<boolean> {
  const { rowCount } = await query(
    `UPDATE students SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return (rowCount ?? 0) > 0;
}

export interface StudentStats {
  total: number;
  verified: number;
  unverified: number;
}

/** `createdBy` scopes the counts to one owner; omitting it counts every record. */
export async function getStudentStats(createdBy?: string): Promise<StudentStats> {
  const { rows } = await query<{ total: string; verified: string; unverified: string }>(
    `SELECT count(*)::text AS total,
            count(*) FILTER (WHERE company_verified)::text AS verified,
            count(*) FILTER (WHERE NOT company_verified)::text AS unverified
       FROM students
      WHERE deleted_at IS NULL
        AND ($1::uuid IS NULL OR created_by = $1::uuid)`,
    [createdBy ?? null],
  );
  const row = rows[0]!;
  return {
    total: Number(row.total),
    verified: Number(row.verified),
    unverified: Number(row.unverified),
  };
}
