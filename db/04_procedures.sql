-- =============================================================================
-- 04_procedures.sql
-- A CALL is one atomic transaction: if any RAISE EXCEPTION fires, every change
-- made by the procedure is rolled back automatically. Business-rule failures use
-- the default SQLSTATE P0001 so the application can show the message safely.
-- =============================================================================

-- Procedure 1: enroll a student in a section --------------------------------
CREATE OR REPLACE PROCEDURE sp_enroll_student(p_student_id INTEGER, p_section_id INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
    v_student_status VARCHAR(20);
    v_capacity       INTEGER;
    v_taken          INTEGER;
    v_existing_id    INTEGER;
    v_existing_stat  VARCHAR(20);
BEGIN
    SELECT status INTO v_student_status FROM students WHERE student_id = p_student_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Student % does not exist.', p_student_id;
    END IF;
    IF v_student_status <> 'active' THEN
        RAISE EXCEPTION 'Student % is % and cannot be enrolled.', p_student_id, v_student_status;
    END IF;

    -- Serialize enrollments per section so two concurrent calls cannot both take the last seat.
    -- (An advisory lock is used because FOR UPDATE would need UPDATE rights on sections.)
    PERFORM pg_advisory_xact_lock(1001, p_section_id);
    SELECT capacity INTO v_capacity FROM sections WHERE section_id = p_section_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Section % does not exist.', p_section_id;
    END IF;

    SELECT enrollment_id, status INTO v_existing_id, v_existing_stat
    FROM enrollments
    WHERE student_id = p_student_id AND section_id = p_section_id;

    IF FOUND AND v_existing_stat <> 'dropped' THEN
        RAISE EXCEPTION 'Student % is already enrolled in section %.', p_student_id, p_section_id;
    END IF;

    SELECT COUNT(*) INTO v_taken
    FROM enrollments
    WHERE section_id = p_section_id AND status <> 'dropped';

    IF v_taken >= v_capacity THEN
        RAISE EXCEPTION 'Section % is full (% of % seats taken).', p_section_id, v_taken, v_capacity;
    END IF;

    IF v_existing_id IS NOT NULL THEN
        UPDATE enrollments SET status = 'enrolled', enrolled_at = now() WHERE enrollment_id = v_existing_id;
    ELSE
        INSERT INTO enrollments (student_id, section_id, status) VALUES (p_student_id, p_section_id, 'enrolled');
    END IF;
END;
$$;

-- Procedure 2: move a student between two sections of the same subject & term.
-- The drop and the new enrollment succeed or fail together.
CREATE OR REPLACE PROCEDURE sp_transfer_section(p_student_id INTEGER, p_from_section INTEGER, p_to_section INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
    v_from sections%ROWTYPE;
    v_to   sections%ROWTYPE;
BEGIN
    IF p_from_section = p_to_section THEN
        RAISE EXCEPTION 'Source and destination sections are the same.';
    END IF;

    SELECT * INTO v_from FROM sections WHERE section_id = p_from_section;
    IF NOT FOUND THEN RAISE EXCEPTION 'Section % does not exist.', p_from_section; END IF;
    SELECT * INTO v_to   FROM sections WHERE section_id = p_to_section;
    IF NOT FOUND THEN RAISE EXCEPTION 'Section % does not exist.', p_to_section; END IF;

    IF v_from.subject_id <> v_to.subject_id
       OR v_from.school_year <> v_to.school_year
       OR v_from.semester <> v_to.semester THEN
        RAISE EXCEPTION 'Transfers are only allowed between sections of the same subject and term.';
    END IF;

    UPDATE enrollments
    SET status = 'dropped'
    WHERE student_id = p_student_id AND section_id = p_from_section AND status = 'enrolled';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Student % is not currently enrolled in section %.', p_student_id, p_from_section;
    END IF;

    CALL sp_enroll_student(p_student_id, p_to_section);   -- raises (and undoes the drop) if full
END;
$$;
