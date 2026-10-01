-- Email records live beside the bank formats: same table, same finalize rule.
ALTER TABLE student_records DROP CONSTRAINT IF EXISTS student_records_bank_check;
ALTER TABLE student_records
  ADD CONSTRAINT student_records_bank_check CHECK (bank IN ('SBI', 'IDBI', 'EMAIL'));

-- An email record carries one optional attachment per email.
CREATE TABLE IF NOT EXISTS student_record_files (
  id         uuid PRIMARY KEY,
  record_id  uuid NOT NULL REFERENCES student_records (id) ON DELETE CASCADE,
  data       bytea NOT NULL,
  name       text NOT NULL,
  type       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS student_record_files_record_idx ON student_record_files (record_id);
