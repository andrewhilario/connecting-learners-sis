-- =============================================================================
-- Connecting Learners: A Student-Centered Information System for ICCT Colleges
-- Standalone Idempotent Sample Data Query (db/seed_sample_data.sql)
-- Safe to run in Supabase SQL Editor or psql on an empty or existing schema.
-- =============================================================================
-- Login Accounts Created / Updated:
--   Admin      : admin                / Admin@12345
--   Registrar  : registrar            / Registrar@12345
--   Students   : student1..student10  / Student@12345
-- =============================================================================

BEGIN;

-- Record audit entries under 'system_seed'
SELECT set_config('app.current_user', 'system_seed', true);

-- 1. USERS --------------------------------------------------------------------
INSERT INTO users (username, password_hash, role, is_active) VALUES
 ('admin',      '$2b$10$PYU3FKIhl9.aEkblqgPUYObDGIn1I36wKwNHBo1kgJkHSGVU/EpYe', 'admin',     TRUE),
 ('registrar',  '$2b$10$2lv6jVrszuufb34PS8RL8..6E/rX4t2M6e6ztAVFIqT.3vojXbvuy', 'registrar', TRUE),
 ('student1',   '$2b$10$yRlOl8YFsaYBTxlaxpcWdOPcBs6A6fs0jK8xzxIIu/7lOa39BDvZe', 'student',   TRUE),
 ('student2',   '$2b$10$yRlOl8YFsaYBTxlaxpcWdOPcBs6A6fs0jK8xzxIIu/7lOa39BDvZe', 'student',   TRUE),
 ('student3',   '$2b$10$yRlOl8YFsaYBTxlaxpcWdOPcBs6A6fs0jK8xzxIIu/7lOa39BDvZe', 'student',   TRUE),
 ('student4',   '$2b$10$yRlOl8YFsaYBTxlaxpcWdOPcBs6A6fs0jK8xzxIIu/7lOa39BDvZe', 'student',   TRUE),
 ('student5',   '$2b$10$yRlOl8YFsaYBTxlaxpcWdOPcBs6A6fs0jK8xzxIIu/7lOa39BDvZe', 'student',   TRUE),
 ('student6',   '$2b$10$yRlOl8YFsaYBTxlaxpcWdOPcBs6A6fs0jK8xzxIIu/7lOa39BDvZe', 'student',   TRUE),
 ('student7',   '$2b$10$yRlOl8YFsaYBTxlaxpcWdOPcBs6A6fs0jK8xzxIIu/7lOa39BDvZe', 'student',   TRUE),
 ('student8',   '$2b$10$yRlOl8YFsaYBTxlaxpcWdOPcBs6A6fs0jK8xzxIIu/7lOa39BDvZe', 'student',   TRUE),
 ('student9',   '$2b$10$yRlOl8YFsaYBTxlaxpcWdOPcBs6A6fs0jK8xzxIIu/7lOa39BDvZe', 'student',   TRUE),
 ('student10',  '$2b$10$yRlOl8YFsaYBTxlaxpcWdOPcBs6A6fs0jK8xzxIIu/7lOa39BDvZe', 'student',   TRUE)
ON CONFLICT (username) DO UPDATE
   SET password_hash = EXCLUDED.password_hash,
       role          = EXCLUDED.role,
       is_active     = TRUE
 WHERE users.password_hash IS DISTINCT FROM EXCLUDED.password_hash
    OR users.is_active IS FALSE;

-- 2. PROGRAMS -----------------------------------------------------------------
INSERT INTO programs (code, name) VALUES
 ('BSIT',   'Bachelor of Science in Information Technology'),
 ('BSCS',   'Bachelor of Science in Computer Science'),
 ('BSIS',   'Bachelor of Science in Information Systems'),
 ('BSBA',   'Bachelor of Science in Business Administration'),
 ('BSOA',   'Bachelor of Science in Office Administration'),
 ('BSCRIM', 'Bachelor of Science in Criminology')
ON CONFLICT (code) DO UPDATE
   SET name = EXCLUDED.name
 WHERE programs.name IS DISTINCT FROM EXCLUDED.name;

-- 3. INSTRUCTORS --------------------------------------------------------------
INSERT INTO instructors (first_name, last_name, email) VALUES
 ('Maria',    'Santos',     'maria.santos@example.com'),
 ('Jose',     'Reyes',      'jose.reyes@example.com'),
 ('Ana',      'Cruz',       'ana.cruz@example.com'),
 ('Ramon',    'Garcia',     'ramon.garcia@example.com'),
 ('Liza',     'Mendoza',    'liza.mendoza@example.com'),
 ('Carlos',   'Bautista',   'carlos.bautista@example.com'),
 ('Elena',    'Villanueva', 'elena.villanueva@example.com'),
 ('Roberto',  'Soriano',    'roberto.soriano@example.com')
ON CONFLICT (email) DO UPDATE
   SET first_name = EXCLUDED.first_name,
       last_name  = EXCLUDED.last_name
 WHERE instructors.first_name IS DISTINCT FROM EXCLUDED.first_name
    OR instructors.last_name  IS DISTINCT FROM EXCLUDED.last_name;

-- 4. SUBJECTS -----------------------------------------------------------------
INSERT INTO subjects (code, title, units) VALUES
 ('IT101', 'Introduction to Computing',                  3),
 ('IT102', 'Computer Programming 1',                     3),
 ('IT103', 'Discrete Mathematics',                       3),
 ('IT104', 'Computer Programming 2',                     3),
 ('IT105', 'Web Systems and Technologies',               3),
 ('IT106', 'Data Structures and Algorithms',             3),
 ('IT201', 'Advance Database System',                    3),
 ('IT202', 'Networking Fundamentals',                    3),
 ('IT203', 'Object-Oriented Programming',                3),
 ('IT204', 'Systems Analysis and Design',                3),
 ('IT301', 'Information Assurance and Security 1',       3),
 ('IT302', 'Application Development and Emerging Tech',  3),
 ('IT303', 'Human-Computer Interaction',                 3),
 ('GE101', 'Understanding the Self',                     3),
 ('GE102', 'Purposive Communication',                    3)
ON CONFLICT (code) DO UPDATE
   SET title = EXCLUDED.title,
       units = EXCLUDED.units
 WHERE subjects.title IS DISTINCT FROM EXCLUDED.title
    OR subjects.units IS DISTINCT FROM EXCLUDED.units;

-- 5. SECTIONS -----------------------------------------------------------------
WITH raw_sections (sub_code, inst_email, section_code, school_year, semester, schedule, room, capacity) AS (
    VALUES
      -- Past Term: SY 2025-2026, 2nd Semester (Completed & Graded)
      ('IT101', 'maria.santos@example.com',     'A', '2025-2026', 2, 'MWF 08:00-09:00', 'Rm 101', 40),
      ('IT102', 'jose.reyes@example.com',       'A', '2025-2026', 2, 'TTh 09:00-10:30', 'Lab 1',  40),
      ('IT103', 'ana.cruz@example.com',         'A', '2025-2026', 2, 'MWF 10:00-11:00', 'Rm 102', 40),
      ('IT104', 'ramon.garcia@example.com',     'A', '2025-2026', 2, 'TTh 13:00-14:30', 'Lab 2',  40),
      ('GE101', 'liza.mendoza@example.com',     'A', '2025-2026', 2, 'MWF 13:00-14:00', 'Rm 103', 40),
      ('GE102', 'carlos.bautista@example.com',  'A', '2025-2026', 2, 'TTh 10:30-12:00', 'Rm 104', 40),
      -- Current Term: SY 2026-2027, 1st Semester (Active Enrollments)
      ('IT105', 'maria.santos@example.com',     'A', '2026-2027', 1, 'MWF 08:00-09:00', 'Lab 1',  40),
      ('IT106', 'jose.reyes@example.com',       'A', '2026-2027', 1, 'TTh 09:00-10:30', 'Lab 2',  40),
      ('IT201', 'ana.cruz@example.com',         'A', '2026-2027', 1, 'MWF 10:00-11:00', 'Lab 3',  40),
      ('IT202', 'ramon.garcia@example.com',     'A', '2026-2027', 1, 'TTh 13:00-14:30', 'Rm 201', 40),
      ('IT203', 'liza.mendoza@example.com',     'A', '2026-2027', 1, 'MWF 13:00-14:00', 'Lab 1',  40),
      ('IT204', 'carlos.bautista@example.com',  'A', '2026-2027', 1, 'TTh 10:30-12:00', 'Rm 202', 40),
      ('IT204', 'carlos.bautista@example.com',  'B', '2026-2027', 1, 'TTh 13:00-14:30', 'Rm 203', 2),
      ('IT301', 'elena.villanueva@example.com', 'A', '2026-2027', 1, 'MWF 09:00-10:00', 'Lab 4',  40),
      ('IT302', 'roberto.soriano@example.com',  'A', '2026-2027', 1, 'TTh 14:30-16:00', 'Lab 3',  40),
      ('IT303', 'elena.villanueva@example.com', 'A', '2026-2027', 1, 'MWF 14:00-15:00', 'Rm 204', 40)
)
INSERT INTO sections (subject_id, instructor_id, section_code, school_year, semester, schedule, room, capacity)
SELECT sub.subject_id, ins.instructor_id, r.section_code, r.school_year, r.semester, r.schedule, r.room, r.capacity
  FROM raw_sections r
  JOIN subjects sub    ON sub.code  = r.sub_code
  LEFT JOIN instructors ins ON ins.email = r.inst_email
ON CONFLICT (subject_id, section_code, school_year, semester) DO UPDATE
   SET instructor_id = EXCLUDED.instructor_id,
       schedule      = EXCLUDED.schedule,
       room          = EXCLUDED.room,
       capacity      = EXCLUDED.capacity;

-- 6. STUDENTS (30 deterministic records linked to student1..student10) --------
INSERT INTO students (user_id, student_no, first_name, middle_name, last_name, email, contact_no, birth_date, program_id, year_level, status)
SELECT
    (SELECT u.user_id FROM users u WHERE u.username = 'student' || i AND i <= 10),
    '2026-' || lpad(i::text, 5, '0'),
    (ARRAY['Juan','Maria','Pedro','Ana','Luis','Carla','Miguel','Sofia','Diego','Isabel'])[((i - 1) % 10) + 1],
    (ARRAY['Mae','Jose','Grace','Luis','Ann'])[((i - 1) % 5) + 1],
    (ARRAY['Dela Cruz','Garcia','Ramos','Aquino','Villanueva','Navarro','Castillo','Flores','Mercado','Salazar'])[((i * 3 - 1) % 10) + 1],
    'student' || i || '@example.com',
    '0917' || lpad((1000000 + i * 137)::text, 7, '0'),
    DATE '2005-01-15' + (i * 37),
    (SELECT p.program_id FROM programs p WHERE p.code = (ARRAY['BSIT','BSCS','BSIS','BSBA','BSOA','BSCRIM'])[((i - 1) % 6) + 1]),
    ((i - 1) % 4) + 1,
    CASE WHEN i = 29 THEN 'inactive' WHEN i = 30 THEN 'graduated' ELSE 'active' END
FROM generate_series(1, 30) AS i
ON CONFLICT (student_no) DO UPDATE
   SET user_id    = COALESCE(students.user_id, EXCLUDED.user_id),
       first_name = EXCLUDED.first_name,
       last_name  = EXCLUDED.last_name
 WHERE students.user_id IS NULL AND EXCLUDED.user_id IS NOT NULL;

-- 7. ENROLLMENTS (Past completed term + Current active term) ------------------
-- Past term completed enrollments
INSERT INTO enrollments (student_id, section_id, status)
SELECT st.student_id, sec.section_id, 'completed'
  FROM generate_series(1, 30) AS i
  JOIN students st ON st.student_no = '2026-' || lpad(i::text, 5, '0')
  CROSS JOIN generate_series(0, 2) AS k
  JOIN subjects sub ON sub.code = (ARRAY['IT101','IT102','IT103','IT104','GE101','GE102'])[((i + k) % 6) + 1]
  JOIN sections sec ON sec.subject_id = sub.subject_id AND sec.school_year = '2025-2026' AND sec.semester = 2 AND sec.section_code = 'A'
ON CONFLICT (student_id, section_id) DO NOTHING;

-- Current term active enrollments
INSERT INTO enrollments (student_id, section_id, status)
SELECT st.student_id, sec.section_id, 'enrolled'
  FROM generate_series(1, 28) AS i
  JOIN students st ON st.student_no = '2026-' || lpad(i::text, 5, '0')
  CROSS JOIN generate_series(0, 2) AS k
  JOIN subjects sub ON sub.code = (ARRAY['IT105','IT106','IT201','IT202','IT203','IT204'])[((i + k) % 6) + 1]
  JOIN sections sec ON sec.subject_id = sub.subject_id AND sec.school_year = '2026-2027' AND sec.semester = 1 AND sec.section_code = 'A'
ON CONFLICT (student_id, section_id) DO NOTHING;

-- Full capacity section demo (IT204-B, capacity 2)
INSERT INTO enrollments (student_id, section_id, status)
SELECT st.student_id, sec.section_id, 'enrolled'
  FROM students st
  JOIN subjects sub ON sub.code = 'IT204'
  JOIN sections sec ON sec.subject_id = sub.subject_id AND sec.school_year = '2026-2027' AND sec.semester = 1 AND sec.section_code = 'B'
 WHERE st.student_no IN ('2026-00001', '2026-00002')
ON CONFLICT (student_id, section_id) DO NOTHING;

-- 8. GRADES (For all completed enrollments) -----------------------------------
INSERT INTO grades (enrollment_id, grade_value, recorded_by)
SELECT e.enrollment_id,
       (ARRAY[1.00,1.25,1.50,1.75,2.00,2.25,2.50,2.75,3.00,5.00])[((e.enrollment_id * 7) % 10) + 1],
       (SELECT user_id FROM users WHERE username = 'registrar')
  FROM enrollments e
 WHERE e.status = 'completed'
ON CONFLICT (enrollment_id) DO NOTHING;

-- 9. ANNOUNCEMENTS ------------------------------------------------------------
INSERT INTO announcements (title, body, audience, posted_by)
SELECT v.title, v.body, v.audience, (SELECT user_id FROM users WHERE username = 'admin')
  FROM (VALUES
    ('Welcome to Connecting Learners',
     'This portal lets you view your enrollment, grades, class schedules, and official ICCT Colleges announcements.',
     'all'),
    ('Enrollment Reminder for 1st Semester SY 2026-2027',
     'Please verify your enrolled subjects and printed Certificate of Registration (COR) under My Enrollments. Contact the Registrar for section transfer requests.',
     'students'),
    ('Grade Encoding Deadline',
     'Instructors and Registrar Staff: please finalize and verify all encoded grades before the end-of-term deadline.',
     'staff'),
    ('Scholarship & Dean''s List Application Open',
     'Students with a cumulative GPA of 1.75 or better and no failing grades may submit their Official Grade Report for academic scholarship evaluation.',
     'students'),
    ('System Security & Password Policy Notice',
     'All students and staff can now update their portal password anytime via the My Account page in the sidebar.',
     'all')
  ) AS v(title, body, audience)
 WHERE NOT EXISTS (
    SELECT 1 FROM announcements a WHERE a.title = v.title
 );

COMMIT;

-- Summary verification query
SELECT 'users'         AS table_name, COUNT(*) AS total_rows FROM users
UNION ALL SELECT 'programs',      COUNT(*) FROM programs
UNION ALL SELECT 'instructors',   COUNT(*) FROM instructors
UNION ALL SELECT 'subjects',      COUNT(*) FROM subjects
UNION ALL SELECT 'sections',      COUNT(*) FROM sections
UNION ALL SELECT 'students',      COUNT(*) FROM students
UNION ALL SELECT 'enrollments',   COUNT(*) FROM enrollments
UNION ALL SELECT 'grades',        COUNT(*) FROM grades
UNION ALL SELECT 'announcements', COUNT(*) FROM announcements
UNION ALL SELECT 'audit_log',     COUNT(*) FROM audit_log;
