-- The one live student the public APIs serve when called without a student id.
ALTER TABLE students ADD COLUMN IF NOT EXISTS active_live boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS students_single_active_live_idx ON students (active_live) WHERE active_live;
