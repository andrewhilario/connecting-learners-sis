-- =============================================================================
-- 06_roles.sql - Database security
-- Three NOLOGIN group roles with different access rights, plus row-level
-- security so a student can only read their own records.
--   sis_admin      full control of all SIS objects
--   sis_registrar  manage students, enrollments, grades; read reference data
--   sis_student    read-only, own records + public reference data
-- The application switches to the matching role per request with SET LOCAL ROLE.
-- =============================================================================

-- Roles ---------------------------------------------------------------------
DO $$
DECLARE r TEXT;
BEGIN
    FOREACH r IN ARRAY ARRAY['sis_admin', 'sis_registrar', 'sis_student'] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('CREATE ROLE %I NOLOGIN', r);
        END IF;
    END LOOP;
END $$;

-- Allow the account that runs this script (and the app connection) to SET ROLE.
GRANT sis_admin, sis_registrar, sis_student TO CURRENT_USER;

-- Start from zero: nobody gets anything by default ---------------------------
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL PROCEDURES IN SCHEMA public FROM PUBLIC;

-- Supabase auto-exposes the public schema through its REST API to the
-- anon/authenticated roles. Remove their access to our tables entirely.
DO $$
DECLARE r TEXT;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
            EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
            EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
        END IF;
    END LOOP;
END $$;

GRANT USAGE ON SCHEMA public TO sis_admin, sis_registrar, sis_student;

-- Row-level security (the table owner bypasses it; the roles above do not) ----
ALTER TABLE users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE instructors   ENABLE ROW LEVEL SECURITY;
ALTER TABLE students      ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections      ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE grades        ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log     ENABLE ROW LEVEL SECURITY;

-- The app sets app.student_id for student sessions.
CREATE OR REPLACE FUNCTION fn_current_student_id() RETURNS INTEGER
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.student_id', true), '')::INTEGER
$$;

-- Policies: staff roles see every row -----------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['programs','instructors','students','subjects','sections','enrollments','grades','announcements'] LOOP
        EXECUTE format('CREATE POLICY p_admin_all ON %I FOR ALL TO sis_admin USING (true) WITH CHECK (true)', t);
        EXECUTE format('CREATE POLICY p_registrar_all ON %I FOR ALL TO sis_registrar USING (true) WITH CHECK (true)', t);
    END LOOP;
END $$;
CREATE POLICY p_admin_all ON users     FOR ALL    TO sis_admin USING (true) WITH CHECK (true);
CREATE POLICY p_admin_all ON audit_log FOR ALL    TO sis_admin USING (true) WITH CHECK (true);

-- Policies: students -----------------------------------------------------------
CREATE POLICY p_student_ref_programs    ON programs    FOR SELECT TO sis_student USING (true);
CREATE POLICY p_student_ref_instructors ON instructors FOR SELECT TO sis_student USING (true);
CREATE POLICY p_student_ref_subjects    ON subjects    FOR SELECT TO sis_student USING (true);
CREATE POLICY p_student_ref_sections    ON sections    FOR SELECT TO sis_student USING (true);
CREATE POLICY p_student_own_profile     ON students    FOR SELECT TO sis_student USING (student_id = fn_current_student_id());
CREATE POLICY p_student_own_enrollments ON enrollments FOR SELECT TO sis_student USING (student_id = fn_current_student_id());
CREATE POLICY p_student_own_grades      ON grades      FOR SELECT TO sis_student
    USING (enrollment_id IN (SELECT enrollment_id FROM enrollments WHERE student_id = fn_current_student_id()));
CREATE POLICY p_student_announcements   ON announcements FOR SELECT TO sis_student USING (audience IN ('all', 'students'));

-- Table privileges ---------------------------------------------------------------
-- Admin: everything.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sis_admin;
-- audit_log is write-protected for every role: rows are written only by the SECURITY DEFINER
-- trigger function, and the immutability trigger blocks UPDATE/DELETE as well.
REVOKE INSERT, UPDATE, DELETE ON audit_log FROM sis_admin;
GRANT SELECT ON audit_log TO sis_admin;

-- Registrar: day-to-day registrar work, no deletes of students, no user/audit access.
GRANT SELECT                 ON programs, instructors, subjects, sections, announcements TO sis_registrar;
GRANT SELECT, INSERT, UPDATE ON students, enrollments, grades TO sis_registrar;

-- Student: read-only.
GRANT SELECT ON programs, instructors, subjects, sections, announcements,
                students, enrollments, grades TO sis_student;

-- Views
GRANT SELECT ON v_section_roster, v_student_grades, v_student_gpa, v_student_enrollment_summary
    TO sis_admin, sis_registrar, sis_student;

-- Stored procedures: staff only
GRANT EXECUTE ON PROCEDURE sp_enroll_student(INTEGER, INTEGER)           TO sis_admin, sis_registrar;
GRANT EXECUTE ON PROCEDURE sp_transfer_section(INTEGER, INTEGER, INTEGER) TO sis_admin, sis_registrar;
