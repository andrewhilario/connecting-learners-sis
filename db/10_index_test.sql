-- =============================================================================
-- 10_index_test.sql - Performance optimization (Requirement 6)
-- Uses a throw-away table perf_students (200,000 rows) so SIS data is untouched.
-- Query under test: search students by last name (a typical UI search).
-- Run with:  psql -d <db> -f db/10_index_test.sql
-- =============================================================================

\timing on

DROP TABLE IF EXISTS perf_students;
CREATE TABLE perf_students (
    student_id INTEGER PRIMARY KEY,
    student_no VARCHAR(20) NOT NULL,
    first_name VARCHAR(60) NOT NULL,
    last_name  VARCHAR(60) NOT NULL,
    program_id INTEGER     NOT NULL
);

INSERT INTO perf_students
SELECT i,
       'P-' || lpad(i::text, 7, '0'),
       (ARRAY['Juan','Maria','Pedro','Ana','Luis','Carla','Miguel','Sofia','Diego','Isabel'])[(i % 10) + 1],
       'Surname' || (i % 20000),          -- about 20,000 distinct last names, ~10 rows each
       (i % 4) + 1
FROM generate_series(1, 200000) AS i;

ANALYZE perf_students;

\echo ''
\echo '=== BEFORE INDEX: sequential scan ==='
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM perf_students WHERE last_name = 'Surname12345';

CREATE INDEX ix_perf_students_last_name ON perf_students(last_name);
ANALYZE perf_students;

\echo ''
\echo '=== AFTER INDEX: index-based lookup (bitmap index scan) ==='
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM perf_students WHERE last_name = 'Surname12345';

-- Cleanup (comment out if you want to keep the table for screenshots)
DROP TABLE perf_students;
