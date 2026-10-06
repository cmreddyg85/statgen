-- Set when an admin marks the student done (all finalized records mailed).
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS done_at timestamptz,
  ADD COLUMN IF NOT EXISTS done_by uuid REFERENCES users (id);
