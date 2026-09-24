-- Statements built straight from a pasted payload, with no student attached.
CREATE TABLE IF NOT EXISTS sbi_reports (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'extract' (account block + salary periods) or 'transactions' (ready-made).
  source         varchar(20) NOT NULL,
  input_json     jsonb NOT NULL,
  statement_json jsonb NOT NULL,
  created_by     uuid NOT NULL REFERENCES users (id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sbi_reports_created_idx ON sbi_reports (created_at DESC);

DROP TRIGGER IF EXISTS sbi_reports_set_updated_at ON sbi_reports;
CREATE TRIGGER sbi_reports_set_updated_at
  BEFORE UPDATE ON sbi_reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
