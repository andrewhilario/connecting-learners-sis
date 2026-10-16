-- =============================================================================
-- 09_security_demo.sql - Database security (Requirement 4)
-- Run as the owner account (e.g. postgres). Uses SET ROLE to act as each role.
-- Errors shown below are EXPECTED - they prove the privileges are enforced.
-- =============================================================================

\echo '=== 1. Privileges granted to each role (table level) ==='
SELECT grantee,
       table_name,
       string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE grantee IN ('sis_admin', 'sis_registrar', 'sis_student')
  AND table_schema = 'public'
  AND table_name NOT LIKE 'v\_%'
GROUP BY grantee, table_name
ORDER BY grantee, table_name;

\echo ''
\echo '=== 2. Procedure execute rights ==='
SELECT grantee, routine_name, privilege_type
FROM information_schema.routine_privileges
WHERE grantee IN ('sis_admin', 'sis_registrar', 'sis_student') AND routine_schema = 'public'
ORDER BY grantee, routine_name;

\echo ''
\echo '=== 3. sis_student: can read own data only (row-level security) ==='
BEGIN;
SET LOCAL ROLE sis_student;
SELECT set_config('app.student_id', '1', true);
SELECT student_id, student_no, last_name FROM students;                  -- only student 1
SELECT COUNT(*) AS my_enrollments FROM enrollments;                       -- only student 1's rows
SELECT student_no, subject_code, grade_value, remarks FROM v_student_grades WHERE grade_value IS NOT NULL LIMIT 3;
\echo 'Student tries to INSERT a student (expected: permission denied):'
INSERT INTO students (student_no, first_name, last_name, email, birth_date, program_id)
VALUES ('2026-88888', 'Bad', 'Actor', 'bad@example.com', DATE '2005-01-01', 1);
ROLLBACK;

BEGIN;
SET LOCAL ROLE sis_student;
\echo 'Student tries to read users (expected: permission denied):'
SELECT * FROM users;
ROLLBACK;

\echo ''
\echo '=== 4. sis_registrar: can update grades, cannot delete students or read audit_log ==='
BEGIN;
SET LOCAL ROLE sis_registrar;
SELECT set_config('app.current_user', 'registrar', true);
CALL sp_enroll_student(11, 9);                                            -- allowed
\echo 'Registrar tries to DELETE a student (expected: permission denied):'
DELETE FROM students WHERE student_id = 11;
ROLLBACK;

BEGIN;
SET LOCAL ROLE sis_registrar;
\echo 'Registrar tries to read audit_log (expected: permission denied):'
SELECT * FROM audit_log LIMIT 1;
ROLLBACK;

\echo ''
\echo '=== 5. sis_admin: can read audit_log, cannot tamper with it ==='
BEGIN;
SET LOCAL ROLE sis_admin;
SELECT COUNT(*) AS audit_rows FROM audit_log;
\echo 'Admin tries to DELETE audit rows (expected: permission denied):'
DELETE FROM audit_log;
ROLLBACK;
