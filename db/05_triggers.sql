-- =============================================================================
-- 05_triggers.sql
-- Trigger A: generic audit trigger (students, subjects, sections, enrollments,
--            grades, users, announcements) -> audit_log
-- Trigger B: touch students.updated_at
-- Trigger C: block grades for dropped enrollments
-- Trigger D: audit_log is append-only
-- The application sets  app.current_user  per transaction (see app/src/lib/db.ts)
-- so audit rows record who made the change.
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_audit() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pk  TEXT := TG_ARGV[0];
    v_row JSONB;
BEGIN
    IF TG_OP = 'DELETE' THEN v_row := to_jsonb(OLD); ELSE v_row := to_jsonb(NEW); END IF;

    INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, changed_by)
    VALUES (
        TG_TABLE_NAME,
        v_row ->> v_pk,
        TG_OP,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) - 'password_hash' END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) - 'password_hash' END,
        COALESCE(NULLIF(current_setting('app.current_user', true), ''), session_user::text)
    );
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_students      AFTER INSERT OR UPDATE OR DELETE ON students      FOR EACH ROW EXECUTE FUNCTION fn_audit('student_id');
CREATE TRIGGER trg_audit_programs      AFTER INSERT OR UPDATE OR DELETE ON programs      FOR EACH ROW EXECUTE FUNCTION fn_audit('program_id');
CREATE TRIGGER trg_audit_subjects      AFTER INSERT OR UPDATE OR DELETE ON subjects      FOR EACH ROW EXECUTE FUNCTION fn_audit('subject_id');
CREATE TRIGGER trg_audit_instructors   AFTER INSERT OR UPDATE OR DELETE ON instructors   FOR EACH ROW EXECUTE FUNCTION fn_audit('instructor_id');
CREATE TRIGGER trg_audit_sections      AFTER INSERT OR UPDATE OR DELETE ON sections      FOR EACH ROW EXECUTE FUNCTION fn_audit('section_id');
CREATE TRIGGER trg_audit_enrollments   AFTER INSERT OR UPDATE OR DELETE ON enrollments   FOR EACH ROW EXECUTE FUNCTION fn_audit('enrollment_id');
CREATE TRIGGER trg_audit_grades        AFTER INSERT OR UPDATE OR DELETE ON grades        FOR EACH ROW EXECUTE FUNCTION fn_audit('grade_id');
CREATE TRIGGER trg_audit_users         AFTER INSERT OR UPDATE OR DELETE ON users         FOR EACH ROW EXECUTE FUNCTION fn_audit('user_id');
CREATE TRIGGER trg_audit_announcements AFTER INSERT OR UPDATE OR DELETE ON announcements FOR EACH ROW EXECUTE FUNCTION fn_audit('announcement_id');

-- Trigger B ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_touch_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_students_touch BEFORE UPDATE ON students
FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Trigger C ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_block_grade_for_dropped() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    SELECT status INTO v_status FROM enrollments WHERE enrollment_id = NEW.enrollment_id;
    IF v_status = 'dropped' THEN
        RAISE EXCEPTION 'Cannot record a grade for a dropped enrollment (id %).', NEW.enrollment_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_grades_not_dropped BEFORE INSERT OR UPDATE ON grades
FOR EACH ROW EXECUTE FUNCTION fn_block_grade_for_dropped();

-- Trigger D ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_audit_log_immutable() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only; % is not allowed.', TG_OP;
END;
$$;

CREATE TRIGGER trg_audit_log_immutable BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION fn_audit_log_immutable();
