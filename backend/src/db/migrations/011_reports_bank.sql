-- Standalone reports exist for both statement formats; the SBI and IDBI
-- screens each list their own. Every existing report is SBI.
ALTER TABLE sbi_reports
  ADD COLUMN IF NOT EXISTS bank varchar(10) NOT NULL DEFAULT 'SBI'
  CHECK (bank IN ('SBI', 'IDBI'));

CREATE INDEX IF NOT EXISTS sbi_reports_bank_created_idx
  ON sbi_reports (bank, created_at DESC);
