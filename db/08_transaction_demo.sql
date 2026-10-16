-- =============================================================================
-- 08_transaction_demo.sql - Transaction management (Requirement 3)
-- Run with:  psql -d <db> -f db/08_transaction_demo.sql
-- Student 10 is enrolled in section 12 and has no enrollment in sections 8 or 9.
-- Section 13 is full (capacity 2). The script leaves the data unchanged except
-- for Part A, which is undone by the cleanup at the bottom.
-- =============================================================================

\echo '--- Part A: COMMIT - enroll student 10 into section 8 ---'
BEGIN;
    CALL sp_enroll_student(10, 8);
    SELECT enrollment_id, student_id, section_id, status FROM enrollments WHERE student_id = 10 AND section_id = 8;
COMMIT;
\echo 'After COMMIT (row persists):'
SELECT enrollment_id, student_id, section_id, status FROM enrollments WHERE student_id = 10 AND section_id = 8;

\echo ''
\echo '--- Part B: ROLLBACK - enroll student 10 into section 9, then undo ---'
BEGIN;
    CALL sp_enroll_student(10, 9);
    \echo 'Inside the transaction (row visible):'
    SELECT enrollment_id, student_id, section_id, status FROM enrollments WHERE student_id = 10 AND section_id = 9;
ROLLBACK;
\echo 'After ROLLBACK (no row):'
SELECT enrollment_id, student_id, section_id, status FROM enrollments WHERE student_id = 10 AND section_id = 9;

\echo ''
\echo '--- Part C: failed transfer is rolled back automatically ---'
\echo 'Student 10 tries to move from section 12 to section 13, which is full.'
BEGIN;
    CALL sp_transfer_section(10, 12, 13);   -- drops 12, then enrolling in 13 fails
ROLLBACK;                                   -- required: the transaction is in an aborted state
\echo 'Enrollment in section 12 is still intact (status = enrolled):'
SELECT enrollment_id, student_id, section_id, status FROM enrollments WHERE student_id = 10 AND section_id IN (12, 13) ORDER BY section_id;

-- Cleanup of Part A so the demo can be repeated
DELETE FROM enrollments WHERE student_id = 10 AND section_id = 8;
