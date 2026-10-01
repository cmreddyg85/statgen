-- A short public id per student: five digits, never starting with 0, unique.
-- Existing students get one here; new students get one from the default.
CREATE OR REPLACE FUNCTION new_student_code() RETURNS varchar(5)
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  code varchar(5);
BEGIN
  -- ponytail: random retry, fine far below the 90,000 codes available.
  LOOP
    code := (10000 + floor(random() * 90000))::int::text;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM students WHERE student_code = code);
  END LOOP;
  RETURN code;
END
$$;

ALTER TABLE students ADD COLUMN IF NOT EXISTS student_code varchar(5);
UPDATE students SET student_code = new_student_code() WHERE student_code IS NULL;

ALTER TABLE students
  ALTER COLUMN student_code SET DEFAULT new_student_code(),
  ALTER COLUMN student_code SET NOT NULL,
  ADD CONSTRAINT students_student_code_format CHECK (student_code ~ '^[1-9][0-9]{4}$');

CREATE UNIQUE INDEX IF NOT EXISTS students_student_code_key ON students (student_code);
