-- =============================================================================
-- Connecting Learners: A Student-Centered Information System for ICCT Colleges
-- IM2 Final Project - 01_schema.sql
-- Target: PostgreSQL 15+ (tested on 16 and Supabase)
-- Re-runnable: drops and recreates all SIS objects.
-- =============================================================================

DO $$ BEGIN
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ---------- Reset (reverse dependency order) ---------------------------------
DROP VIEW  IF EXISTS v_student_gpa, v_student_grades, v_student_enrollment_summary, v_section_roster CASCADE;
DROP TABLE IF EXISTS audit_log, announcements, grades, enrollments, sections,
                     subjects, students, instructors, programs, users CASCADE;
DROP PROCEDURE IF EXISTS sp_enroll_student(integer, integer);
DROP PROCEDURE IF EXISTS sp_transfer_section(integer, integer, integer);
DROP FUNCTION  IF EXISTS fn_audit() CASCADE;
DROP FUNCTION  IF EXISTS fn_touch_updated_at() CASCADE;
DROP FUNCTION  IF EXISTS fn_block_grade_for_dropped() CASCADE;
DROP FUNCTION  IF EXISTS fn_audit_log_immutable() CASCADE;
DROP FUNCTION  IF EXISTS fn_current_student_id() CASCADE;

-- ---------- 1. users ----------------------------------------------------------
-- Application login accounts. Passwords are stored as bcrypt hashes only.
CREATE TABLE users (
    user_id       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username      VARCHAR(50)  NOT NULL UNIQUE,
    password_hash TEXT         NOT NULL,
    role          VARCHAR(20)  NOT NULL,
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_users_username CHECK (username ~ '^[a-z0-9._-]{3,50}$'),
    CONSTRAINT ck_users_role     CHECK (role IN ('admin', 'registrar', 'student'))
);

-- ---------- 2. programs -------------------------------------------------------
CREATE TABLE programs (
    program_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code       VARCHAR(10)  NOT NULL UNIQUE,
    name       VARCHAR(120) NOT NULL UNIQUE,
    CONSTRAINT ck_programs_code CHECK (length(btrim(code)) > 0)
);

-- ---------- 3. instructors ----------------------------------------------------
CREATE TABLE instructors (
    instructor_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    first_name    VARCHAR(60)  NOT NULL,
    last_name     VARCHAR(60)  NOT NULL,
    email         VARCHAR(120) NOT NULL UNIQUE,
    CONSTRAINT ck_instructors_email CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

-- ---------- 4. students -------------------------------------------------------
CREATE TABLE students (
    student_id  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     INTEGER UNIQUE REFERENCES users(user_id) ON DELETE SET NULL,
    student_no  VARCHAR(20)  NOT NULL UNIQUE,
    first_name  VARCHAR(60)  NOT NULL,
    middle_name VARCHAR(60),
    last_name   VARCHAR(60)  NOT NULL,
    email       VARCHAR(120) NOT NULL UNIQUE,
    contact_no  VARCHAR(20),
    birth_date  DATE         NOT NULL,
    program_id  INTEGER      NOT NULL REFERENCES programs(program_id) ON DELETE RESTRICT,
    year_level  SMALLINT     NOT NULL DEFAULT 1,
    status      VARCHAR(20)  NOT NULL DEFAULT 'active',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_students_student_no CHECK (length(btrim(student_no)) > 0),
    CONSTRAINT ck_students_email      CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    CONSTRAINT ck_students_birth      CHECK (birth_date < CURRENT_DATE),
    CONSTRAINT ck_students_year       CHECK (year_level BETWEEN 1 AND 5),
    CONSTRAINT ck_students_status     CHECK (status IN ('active', 'inactive', 'graduated', 'dropped'))
);

-- ---------- 5. subjects -------------------------------------------------------
CREATE TABLE subjects (
    subject_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code       VARCHAR(20)  NOT NULL UNIQUE,
    title      VARCHAR(150) NOT NULL,
    units      SMALLINT     NOT NULL,
    CONSTRAINT ck_subjects_units CHECK (units BETWEEN 1 AND 6)
);

-- ---------- 6. sections -------------------------------------------------------
-- A section is one offering of a subject in one term.
CREATE TABLE sections (
    section_id    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    subject_id    INTEGER     NOT NULL REFERENCES subjects(subject_id)       ON DELETE RESTRICT,
    instructor_id INTEGER              REFERENCES instructors(instructor_id) ON DELETE SET NULL,
    section_code  VARCHAR(20) NOT NULL,
    school_year   VARCHAR(9)  NOT NULL,
    semester      SMALLINT    NOT NULL,
    schedule      VARCHAR(60),
    room          VARCHAR(20),
    capacity      SMALLINT    NOT NULL DEFAULT 40,
    CONSTRAINT uq_sections_offering UNIQUE (subject_id, section_code, school_year, semester),
    CONSTRAINT ck_sections_sy       CHECK (school_year ~ '^[0-9]{4}-[0-9]{4}$'),
    CONSTRAINT ck_sections_sem      CHECK (semester IN (1, 2, 3)),
    CONSTRAINT ck_sections_capacity CHECK (capacity BETWEEN 1 AND 100)
);

-- ---------- 7. enrollments ----------------------------------------------------
CREATE TABLE enrollments (
    enrollment_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_id    INTEGER     NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
    section_id    INTEGER     NOT NULL REFERENCES sections(section_id) ON DELETE CASCADE,
    status        VARCHAR(20) NOT NULL DEFAULT 'enrolled',
    enrolled_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_enrollments_student_section UNIQUE (student_id, section_id),
    CONSTRAINT ck_enrollments_status CHECK (status IN ('enrolled', 'dropped', 'completed'))
);

-- ---------- 8. grades ---------------------------------------------------------
-- Uses the 1.00 (highest) to 3.00 (lowest passing) / 5.00 (failed) scale.
CREATE TABLE grades (
    grade_id      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    enrollment_id INTEGER      NOT NULL UNIQUE REFERENCES enrollments(enrollment_id) ON DELETE CASCADE,
    grade_value   NUMERIC(3,2) NOT NULL,
    recorded_by   INTEGER               REFERENCES users(user_id) ON DELETE SET NULL,
    recorded_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_grades_value CHECK (grade_value IN
        (1.00, 1.25, 1.50, 1.75, 2.00, 2.25, 2.50, 2.75, 3.00, 5.00))
);

-- ---------- 9. announcements --------------------------------------------------
CREATE TABLE announcements (
    announcement_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title      VARCHAR(150) NOT NULL,
    body       TEXT         NOT NULL,
    audience   VARCHAR(20)  NOT NULL DEFAULT 'all',
    posted_by  INTEGER      REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_announcements_audience CHECK (audience IN ('all', 'students', 'staff')),
    CONSTRAINT ck_announcements_title    CHECK (length(btrim(title)) > 0)
);

-- ---------- 10. audit_log -----------------------------------------------------
-- Filled automatically by triggers (see 05_triggers.sql). Append-only.
CREATE TABLE audit_log (
    audit_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_name VARCHAR(60)  NOT NULL,
    record_id  VARCHAR(40),
    action     VARCHAR(10)  NOT NULL,
    old_data   JSONB,
    new_data   JSONB,
    changed_by VARCHAR(80)  NOT NULL,
    changed_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_audit_action CHECK (action IN ('INSERT', 'UPDATE', 'DELETE'))
);

-- ---------- Indexes (foreign keys and common lookups) -------------------------
CREATE INDEX ix_students_program      ON students(program_id);
CREATE INDEX ix_sections_subject      ON sections(subject_id);
CREATE INDEX ix_sections_instructor   ON sections(instructor_id);
CREATE INDEX ix_enrollments_section   ON enrollments(section_id);
CREATE INDEX ix_announcements_created ON announcements(created_at DESC);
CREATE INDEX ix_audit_table_record    ON audit_log(table_name, record_id);
CREATE INDEX ix_audit_changed_at      ON audit_log(changed_at DESC);
