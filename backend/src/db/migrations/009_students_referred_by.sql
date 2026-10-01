-- Who sent the student our way. Optional free text. The mobile number became
-- optional at the same time; a student without one stores it as ''.
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS referred_by varchar(150);
