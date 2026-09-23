-- Company verification was dropped from the product.
DROP INDEX IF EXISTS students_verified_idx;
ALTER TABLE students DROP COLUMN IF EXISTS company_verified;
ALTER TABLE students DROP COLUMN IF EXISTS verified_by;
ALTER TABLE students DROP COLUMN IF EXISTS verified_at;

-- Deleting a student only archives them: the row stays, hidden from users,
-- and an administrator can bring it back.
DROP INDEX IF EXISTS students_deleted_at_idx;
ALTER TABLE students RENAME COLUMN deleted_at TO archived_at;
CREATE INDEX IF NOT EXISTS students_archived_at_idx ON students (archived_at);

-- The statement page the record was generated from, kept for download.
ALTER TABLE student_records
  ADD COLUMN IF NOT EXISTS attachment      bytea,
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS attachment_type text;
