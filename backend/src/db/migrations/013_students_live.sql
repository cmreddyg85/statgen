-- Students an admin has picked on the Live screen. Only these are served by
-- the public /api/sbi-details endpoint.
ALTER TABLE students ADD COLUMN IF NOT EXISTS live boolean NOT NULL DEFAULT false;
