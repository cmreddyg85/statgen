-- A finalized record's real statement is released to its owner by an
-- administrator; until then a user only gets the watermarked copy.
ALTER TABLE student_records
  ADD COLUMN IF NOT EXISTS download_released_at timestamptz,
  ADD COLUMN IF NOT EXISTS download_released_by uuid REFERENCES users (id);
