-- =============================================================================
-- 03_views.sql
-- security_invoker views honour the caller's privileges and row-level security,
-- so a student querying them only ever sees their own rows.
-- =============================================================================

-- View 1: section roster with seat availability (no personal data) ----------
CREATE OR REPLACE VIEW v_section_roster AS
SELECT sec.section_id,
       sub.code  AS subject_code,
       sub.title AS subject_title,
       sub.units,
       sec.section_code,
       sec.school_year,
       sec.semester,
       sec.schedule,
       sec.room,
       COALESCE(i.last_name || ', ' || i.first_name, 'TBA') AS instructor,
       sec.capacity,
       COUNT(e.enrollment_id) FILTER (WHERE e.status <> 'dropped')              AS enrolled_count,
       sec.capacity - COUNT(e.enrollment_id) FILTER (WHERE e.status <> 'dropped') AS seats_left
FROM sections sec
JOIN subjects sub            ON sub.subject_id = sec.subject_id
LEFT JOIN instructors i      ON i.instructor_id = sec.instructor_id
LEFT JOIN enrollments e      ON e.section_id = sec.section_id
GROUP BY sec.section_id, sub.subject_id, i.instructor_id;

-- View 2: one row per enrollment with grade and remarks ----------------------
CREATE OR REPLACE VIEW v_student_grades WITH (security_invoker = true) AS
SELECT st.student_id,
       st.student_no,
       st.last_name || ', ' || st.first_name AS student_name,
       e.enrollment_id,
       e.status       AS enrollment_status,
       sub.code       AS subject_code,
       sub.title      AS subject_title,
       sub.units,
       sec.school_year,
       sec.semester,
       g.grade_value,
       CASE
           WHEN g.grade_value IS NULL  THEN 'No grade yet'
           WHEN g.grade_value <= 3.00  THEN 'Passed'
           ELSE 'Failed'
       END AS remarks
FROM enrollments e
JOIN students st  ON st.student_id = e.student_id
JOIN sections sec ON sec.section_id = e.section_id
JOIN subjects sub ON sub.subject_id = sec.subject_id
LEFT JOIN grades g ON g.enrollment_id = e.enrollment_id
WHERE e.status <> 'dropped';

-- View 3: weighted GPA per student (graded subjects only) --------------------
CREATE OR REPLACE VIEW v_student_gpa WITH (security_invoker = true) AS
SELECT st.student_id,
       st.student_no,
       st.last_name || ', ' || st.first_name AS student_name,
       p.code AS program_code,
       COUNT(g.grade_id)                                           AS graded_subjects,
       SUM(sub.units)                                              AS graded_units,
       ROUND(SUM(g.grade_value * sub.units) / NULLIF(SUM(sub.units), 0), 2) AS gpa
FROM students st
JOIN programs p        ON p.program_id = st.program_id
JOIN enrollments e     ON e.student_id = st.student_id
JOIN grades g          ON g.enrollment_id = e.enrollment_id
JOIN sections sec      ON sec.section_id = e.section_id
JOIN subjects sub      ON sub.subject_id = sec.subject_id
GROUP BY st.student_id, p.program_id;

-- View 4: current enrollment load per student --------------------------------
CREATE OR REPLACE VIEW v_student_enrollment_summary WITH (security_invoker = true) AS
SELECT st.student_id,
       st.student_no,
       st.last_name || ', ' || st.first_name AS student_name,
       p.code       AS program_code,
       st.year_level,
       st.status,
       COUNT(e.enrollment_id) FILTER (WHERE e.status = 'enrolled')            AS enrolled_subjects,
       COALESCE(SUM(sub.units) FILTER (WHERE e.status = 'enrolled'), 0)       AS enrolled_units
FROM students st
JOIN programs p         ON p.program_id = st.program_id
LEFT JOIN enrollments e ON e.student_id = st.student_id
LEFT JOIN sections sec  ON sec.section_id = e.section_id
LEFT JOIN subjects sub  ON sub.subject_id = sec.subject_id
GROUP BY st.student_id, p.program_id;
