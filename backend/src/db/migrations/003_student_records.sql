-- Generated statements, one row per run of the Generate-record form.
-- The three payloads are kept exactly as the module produced them: the form
-- input, what was read off the uploaded statement, and the statement itself.
CREATE TABLE IF NOT EXISTS student_records (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     uuid NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  input_json     jsonb NOT NULL,
  extract_json   jsonb NOT NULL,
  statement_json jsonb NOT NULL,
  created_by     uuid NOT NULL REFERENCES users (id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- The student's page lists their records newest first.
CREATE INDEX IF NOT EXISTS student_records_student_created_idx
  ON student_records (student_id, created_at DESC);

DROP TRIGGER IF EXISTS student_records_set_updated_at ON student_records;
CREATE TRIGGER student_records_set_updated_at
  BEFORE UPDATE ON student_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
