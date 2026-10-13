-- Set when an admin sends a finalized SBI/IDBI report; the report is mailed then.
ALTER TABLE sbi_reports
  ADD COLUMN IF NOT EXISTS done_at timestamptz,
  ADD COLUMN IF NOT EXISTS done_by uuid REFERENCES users (id);
