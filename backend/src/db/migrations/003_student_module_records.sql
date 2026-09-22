-- Records generated for a student against a business module
-- (SBI / IDBI / HDFC / PF / Gmail).
CREATE TABLE IF NOT EXISTS student_module_records (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   uuid NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  module       varchar(20) NOT NULL,
  reference    varchar(60) NOT NULL,
  status       varchar(20) NOT NULL DEFAULT 'GENERATED',
  -- Placeholder for whatever the module integration returns later; the
  -- generator writes an empty object today.
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_by uuid NOT NULL REFERENCES users (id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_module_records_student_idx
  ON student_module_records (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS student_module_records_module_idx
  ON student_module_records (module, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS student_module_records_reference_key
  ON student_module_records (reference);
