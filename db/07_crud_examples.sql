-- =============================================================================
-- 07_crud_examples.sql - Complete CRUD operations (Requirement 2)
-- Self-cleaning: the record created here is deleted at the end.
-- =============================================================================

-- CREATE ----------------------------------------------------------------------
INSERT INTO students (student_no, first_name, last_name, email, birth_date, program_id, year_level)
VALUES ('2026-99999', 'Test', 'Crud', 'test.crud@example.com', DATE '2006-05-20',
        (SELECT program_id FROM programs WHERE code = 'BSIT'), 1)
RETURNING student_id, student_no, first_name, last_name;

-- READ (single table, search, join, aggregate) ----------------------------------
SELECT student_id, student_no, first_name, last_name, status
FROM students WHERE student_no = '2026-99999';

SELECT s.student_no, s.last_name, s.first_name, p.code AS program
FROM students s JOIN programs p ON p.program_id = s.program_id
WHERE s.last_name ILIKE '%cruz%'
ORDER BY s.last_name, s.first_name
LIMIT 5;

SELECT p.code, COUNT(*) AS students
FROM students s JOIN programs p ON p.program_id = s.program_id
GROUP BY p.code ORDER BY p.code;

-- UPDATE ------------------------------------------------------------------------
UPDATE students
SET year_level = 2, contact_no = '09171234567'
WHERE student_no = '2026-99999'
RETURNING student_no, year_level, contact_no, updated_at;

-- DELETE ------------------------------------------------------------------------
DELETE FROM students WHERE student_no = '2026-99999' RETURNING student_id, student_no;

-- Proof: the audit trigger recorded INSERT, UPDATE and DELETE ---------------------
SELECT audit_id, table_name, record_id, action, changed_by
FROM audit_log
WHERE table_name = 'students'
ORDER BY audit_id DESC
LIMIT 3;
