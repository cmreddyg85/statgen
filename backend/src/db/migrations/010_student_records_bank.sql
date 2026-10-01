-- Which bank format a record was generated for. Every existing row is SBI.
ALTER TABLE student_records
  ADD COLUMN IF NOT EXISTS bank varchar(10) NOT NULL DEFAULT 'SBI'
  CHECK (bank IN ('SBI', 'IDBI'));

-- One finalized record per student per bank, instead of one per student.
DROP INDEX IF EXISTS student_records_single_final_idx;
CREATE UNIQUE INDEX IF NOT EXISTS student_records_single_final_bank_idx
  ON student_records (student_id, bank) WHERE finalized_at IS NOT NULL;
