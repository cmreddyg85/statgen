-- Optional one-page PDF that can be prepended to a downloaded SBI statement.
ALTER TABLE student_records
  ADD COLUMN IF NOT EXISTS first_page bytea,
  ADD COLUMN IF NOT EXISTS first_page_name text;
