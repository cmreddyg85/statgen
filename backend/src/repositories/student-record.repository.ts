import { query, type QueryParam } from '../db/pool.js';
import type { Paginated, StudentModuleRecord } from '../types.js';

interface RecordRow {
  id: string;
  student_id: string;
  module: string;
  reference: string;
  status: string;
  payload: Record<string, unknown>;
  generated_by: string;
  generated_by_name: string | null;
  created_at: string;
}

function mapRow(row: RecordRow): StudentModuleRecord {
  return {
    id: row.id,
    studentId: row.student_id,
    module: row.module,
    reference: row.reference,
    status: row.status,
    payload: row.payload,
    generatedBy: row.generated_by,
    generatedByName: row.generated_by_name,
    createdAt: row.created_at,
  };
}

const SELECT_RECORD = `
  SELECT r.id, r.student_id, r.module, r.reference, r.status, r.payload,
         r.generated_by, u.name AS generated_by_name, r.created_at
    FROM student_module_records r
    LEFT JOIN users u ON u.id = r.generated_by
`;

export interface ListRecordsOptions {
  studentId: string;
  module?: string;
  page: number;
  pageSize: number;
}

export async function listRecords(
  options: ListRecordsOptions,
): Promise<Paginated<StudentModuleRecord>> {
  const conditions = ['r.student_id = $1'];
  const params: QueryParam[] = [options.studentId];

  if (options.module) {
    params.push(options.module);
    conditions.push(`r.module = $${params.length}`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const totalResult = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM student_module_records r ${where}`,
    params,
  );
  const total = Number(totalResult.rows[0]?.count ?? 0);

  const { rows } = await query<RecordRow>(
    `${SELECT_RECORD} ${where}
      ORDER BY r.created_at DESC, r.reference DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, options.pageSize, (options.page - 1) * options.pageSize],
  );

  return {
    items: rows.map(mapRow),
    page: options.page,
    pageSize: options.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / options.pageSize)),
  };
}

/** How many records already exist for this student and module. */
export async function countForStudentModule(
  studentId: string,
  module: string,
): Promise<number> {
  const { rows } = await query<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM student_module_records
      WHERE student_id = $1 AND module = $2`,
    [studentId, module],
  );
  return Number(rows[0]?.count ?? 0);
}

export interface NewRecord {
  studentId: string;
  module: string;
  reference: string;
  generatedBy: string;
}

/**
 * Inserts the whole batch in one statement, so a generate run is atomic.
 * `generatedByName` is left null — the caller knows who is generating.
 */
export async function insertRecords(
  records: NewRecord[],
): Promise<StudentModuleRecord[]> {
  if (records.length === 0) return [];

  const values: string[] = [];
  const params: QueryParam[] = [];

  for (const record of records) {
    params.push(record.studentId, record.module, record.reference, record.generatedBy);
    const base = params.length - 4;
    values.push(`($${base + 1}::uuid, $${base + 2}, $${base + 3}, $${base + 4}::uuid)`);
  }

  const { rows } = await query<Omit<RecordRow, 'generated_by_name'>>(
    `INSERT INTO student_module_records (student_id, module, reference, generated_by)
     VALUES ${values.join(', ')}
     RETURNING id, student_id, module, reference, status, payload, generated_by, created_at`,
    params,
  );

  return rows.map((row) => mapRow({ ...row, generated_by_name: null }));
}
