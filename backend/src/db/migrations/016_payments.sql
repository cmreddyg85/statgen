-- What a student is paying for, and the amounts received so far.
CREATE TABLE IF NOT EXISTS payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connected_date date NOT NULL,
  student_id     uuid NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  offer_company  text,
  bgv_company    text,
  referred_by    text,
  -- Any of SBI, IDBI, EMAIL, STATEMENTS.
  report_types   text[] NOT NULL DEFAULT '{}',
  amount         numeric(12, 2) NOT NULL,
  -- [{ date, remarks, amount }], in the order they were entered.
  installments   jsonb NOT NULL DEFAULT '[]',
  created_by     uuid NOT NULL REFERENCES users (id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_connected_idx ON payments (connected_date DESC, created_at DESC);

DROP TRIGGER IF EXISTS payments_set_updated_at ON payments;
CREATE TRIGGER payments_set_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
