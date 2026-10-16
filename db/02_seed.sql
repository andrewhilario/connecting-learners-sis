-- =============================================================================
-- 02_seed.sql - Sample data (fictional names; example.com e-mail addresses)
-- DEMO LOGINS (change before any real deployment):
--   admin      / Admin@12345
--   registrar  / Registrar@12345
--   student1 .. student5 / Student@12345   (linked to students 1..5)
-- Passwords are hashed with bcrypt via pgcrypto (compatible with bcryptjs).
-- =============================================================================

-- users --------------------------------------------------------------------
INSERT INTO users (username, password_hash, role) VALUES
 ('admin',     crypt('Admin@12345',     gen_salt('bf', 10)), 'admin'),
 ('registrar', crypt('Registrar@12345', gen_salt('bf', 10)), 'registrar'),
 ('student1',  crypt('Student@12345',   gen_salt('bf', 10)), 'student'),
 ('student2',  crypt('Student@12345',   gen_salt('bf', 10)), 'student'),
 ('student3',  crypt('Student@12345',   gen_salt('bf', 10)), 'student'),
 ('student4',  crypt('Student@12345',   gen_salt('bf', 10)), 'student'),
 ('student5',  crypt('Student@12345',   gen_salt('bf', 10)), 'student');

-- programs -----------------------------------------------------------------
INSERT INTO programs (code, name) VALUES
 ('BSIT',  'Bachelor of Science in Information Technology'),
 ('BSCS',  'Bachelor of Science in Computer Science'),
 ('BSBA',  'Bachelor of Science in Business Administration'),
 ('BSOA',  'Bachelor of Science in Office Administration');

-- instructors --------------------------------------------------------------
INSERT INTO instructors (first_name, last_name, email) VALUES
 ('Maria',   'Santos',    'maria.santos@example.com'),
 ('Jose',    'Reyes',     'jose.reyes@example.com'),
 ('Ana',     'Cruz',      'ana.cruz@example.com'),
 ('Ramon',   'Garcia',    'ramon.garcia@example.com'),
 ('Liza',    'Mendoza',   'liza.mendoza@example.com'),
 ('Carlos',  'Bautista',  'carlos.bautista@example.com');

-- subjects -----------------------------------------------------------------
INSERT INTO subjects (code, title, units) VALUES
 ('IT101',  'Introduction to Computing',            3),
 ('IT102',  'Computer Programming 1',               3),
 ('IT103',  'Discrete Mathematics',                 3),
 ('IT104',  'Computer Programming 2',               3),
 ('IT105',  'Web Systems and Technologies',         3),
 ('IT106',  'Data Structures and Algorithms',       3),
 ('IT201',  'Advance Database System',              3),
 ('IT202',  'Networking Fundamentals',              3),
 ('IT203',  'Object-Oriented Programming',          3),
 ('IT204',  'Systems Analysis and Design',          3),
 ('GE101',  'Understanding the Self',               3),
 ('GE102',  'Purposive Communication',              3);

-- sections ------------------------------------------------------------------
-- Sections 1-6  : past term  SY 2025-2026, 2nd semester (completed, graded)
-- Sections 7-12 : current term SY 2026-2027, 1st semester (enrolled)
-- Section 13    : same offering family as section 12, tiny capacity (full-section demo)
INSERT INTO sections (subject_id, instructor_id, section_code, school_year, semester, schedule, room, capacity) VALUES
 (1,  1, 'A', '2025-2026', 2, 'MWF 08:00-09:00', 'Rm 101', 40),
 (2,  2, 'A', '2025-2026', 2, 'TTh 09:00-10:30', 'Lab 1',  40),
 (3,  3, 'A', '2025-2026', 2, 'MWF 10:00-11:00', 'Rm 102', 40),
 (4,  4, 'A', '2025-2026', 2, 'TTh 13:00-14:30', 'Lab 2',  40),
 (11, 5, 'A', '2025-2026', 2, 'MWF 13:00-14:00', 'Rm 103', 40),
 (12, 6, 'A', '2025-2026', 2, 'TTh 10:30-12:00', 'Rm 104', 40),
 (5,  1, 'A', '2026-2027', 1, 'MWF 08:00-09:00', 'Lab 1',  40),
 (6,  2, 'A', '2026-2027', 1, 'TTh 09:00-10:30', 'Lab 2',  40),
 (7,  3, 'A', '2026-2027', 1, 'MWF 10:00-11:00', 'Lab 3',  40),
 (8,  4, 'A', '2026-2027', 1, 'TTh 13:00-14:30', 'Rm 201', 40),
 (9,  5, 'A', '2026-2027', 1, 'MWF 13:00-14:00', 'Lab 1',  40),
 (10, 6, 'A', '2026-2027', 1, 'TTh 10:30-12:00', 'Rm 202', 40),
 (10, 6, 'B', '2026-2027', 1, 'TTh 13:00-14:30', 'Rm 203', 2);

-- students (30 deterministic sample records) -------------------------------
INSERT INTO students (user_id, student_no, first_name, middle_name, last_name, email, contact_no, birth_date, program_id, year_level, status)
SELECT
    CASE WHEN i <= 5 THEN i + 2 END,
    '2026-' || lpad(i::text, 5, '0'),
    (ARRAY['Juan','Maria','Pedro','Ana','Luis','Carla','Miguel','Sofia','Diego','Isabel'])[((i - 1) % 10) + 1],
    (ARRAY['Mae','Jose','Grace','Luis','Ann'])[((i - 1) % 5) + 1],
    (ARRAY['Dela Cruz','Garcia','Ramos','Aquino','Villanueva','Navarro','Castillo','Flores','Mercado','Salazar'])[((i * 3 - 1) % 10) + 1],
    'student' || i || '@example.com',
    '0917' || lpad((1000000 + i * 137)::text, 7, '0'),
    DATE '2005-01-15' + (i * 37),
    ((i - 1) % 4) + 1,
    ((i - 1) % 4) + 1,
    CASE WHEN i = 29 THEN 'inactive' WHEN i = 30 THEN 'graduated' ELSE 'active' END
FROM generate_series(1, 30) AS i;

-- enrollments: completed (past term, sections 1-6) -------------------------
INSERT INTO enrollments (student_id, section_id, status)
SELECT s, ((s + k) % 6) + 1, 'completed'
FROM generate_series(1, 30) AS s, generate_series(0, 2) AS k;

-- enrollments: current term (sections 7-12), active students only ----------
INSERT INTO enrollments (student_id, section_id, status)
SELECT s, ((s + k) % 6) + 7, 'enrolled'
FROM generate_series(1, 28) AS s, generate_series(0, 2) AS k;

-- Section 13 is already full (capacity 2)
INSERT INTO enrollments (student_id, section_id, status) VALUES (1, 13, 'enrolled'), (2, 13, 'enrolled');

-- grades for completed enrollments (deterministic) -------------------------
INSERT INTO grades (enrollment_id, grade_value, recorded_by)
SELECT e.enrollment_id,
       (ARRAY[1.00,1.25,1.50,1.75,2.00,2.25,2.50,2.75,3.00,5.00])[((e.enrollment_id * 7) % 10) + 1],
       2
FROM enrollments e
WHERE e.status = 'completed';

-- announcements ------------------------------------------------------------
INSERT INTO announcements (title, body, audience, posted_by) VALUES
 ('Welcome to Connecting Learners',  'This portal lets you view your enrollment, grades, and school announcements.', 'all',      1),
 ('Enrollment Reminder',             'Please verify that your enrolled subjects are correct. Contact the registrar for concerns.', 'students', 1),
 ('Grade Encoding Deadline',         'Instructors: submit final grades to the registrar before the encoding deadline.', 'staff',    1);
