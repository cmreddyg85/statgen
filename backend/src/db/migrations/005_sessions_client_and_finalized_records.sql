-- Where a sign-in came from, kept alongside the session it created so an
-- administrator can see the machines a user is currently signed in from.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS client_info jsonb;

-- One generated record per student may be finalized. A finalized record is
-- locked: no edit, no delete, for anyone, until it is unfinalized.
ALTER TABLE student_records
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS finalized_by uuid REFERENCES users (id);

-- "Only one" is enforced by the database, not just by the service.
CREATE UNIQUE INDEX IF NOT EXISTS student_records_single_final_idx
  ON student_records (student_id) WHERE finalized_at IS NOT NULL;
