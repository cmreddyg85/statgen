-- Set when an admin marks the payment's student as done going live.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS live_done_at timestamptz,
  ADD COLUMN IF NOT EXISTS live_done_by uuid REFERENCES users (id);
