-- A finalized SBI report is locked: no edit, no delete, for anyone, until it
-- is unfinalized. Unlike student records, any number can be finalized.
ALTER TABLE sbi_reports
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS finalized_by uuid REFERENCES users (id);
