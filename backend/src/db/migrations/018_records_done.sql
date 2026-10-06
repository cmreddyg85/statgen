-- Set when an admin marks a finalized record done; the record is mailed then.
ALTER TABLE student_records
  ADD COLUMN IF NOT EXISTS done_at timestamptz,
  ADD COLUMN IF NOT EXISTS done_by uuid REFERENCES users (id);
