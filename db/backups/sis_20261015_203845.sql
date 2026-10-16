--
-- PostgreSQL database dump
--

-- Dumped from database version 16.2
-- Dumped by pg_dump version 16.2

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: fn_audit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_audit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
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


--
-- Name: fn_audit_log_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_audit_log_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only; % is not allowed.', TG_OP;
END;
$$;


--
-- Name: fn_block_grade_for_dropped(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_block_grade_for_dropped() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: fn_current_student_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_current_student_id() RETURNS integer
    LANGUAGE sql STABLE
    AS $$
    SELECT NULLIF(current_setting('app.student_id', true), '')::INTEGER
$$;


--
-- Name: fn_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;


--
-- Name: sp_enroll_student(integer, integer); Type: PROCEDURE; Schema: public; Owner: -
--

CREATE PROCEDURE public.sp_enroll_student(IN p_student_id integer, IN p_section_id integer)
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


--
-- Name: sp_transfer_section(integer, integer, integer); Type: PROCEDURE; Schema: public; Owner: -
--

CREATE PROCEDURE public.sp_transfer_section(IN p_student_id integer, IN p_from_section integer, IN p_to_section integer)
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcements (
    announcement_id integer NOT NULL,
    title character varying(150) NOT NULL,
    body text NOT NULL,
    audience character varying(20) DEFAULT 'all'::character varying NOT NULL,
    posted_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_announcements_audience CHECK (((audience)::text = ANY ((ARRAY['all'::character varying, 'students'::character varying, 'staff'::character varying])::text[]))),
    CONSTRAINT ck_announcements_title CHECK ((length(btrim((title)::text)) > 0))
);


--
-- Name: announcements_announcement_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.announcements ALTER COLUMN announcement_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.announcements_announcement_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    audit_id bigint NOT NULL,
    table_name character varying(60) NOT NULL,
    record_id character varying(40),
    action character varying(10) NOT NULL,
    old_data jsonb,
    new_data jsonb,
    changed_by character varying(80) NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_audit_action CHECK (((action)::text = ANY ((ARRAY['INSERT'::character varying, 'UPDATE'::character varying, 'DELETE'::character varying])::text[])))
);


--
-- Name: audit_log_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ALTER COLUMN audit_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.audit_log_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enrollments (
    enrollment_id integer NOT NULL,
    student_id integer NOT NULL,
    section_id integer NOT NULL,
    status character varying(20) DEFAULT 'enrolled'::character varying NOT NULL,
    enrolled_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_enrollments_status CHECK (((status)::text = ANY ((ARRAY['enrolled'::character varying, 'dropped'::character varying, 'completed'::character varying])::text[])))
);


--
-- Name: enrollments_enrollment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.enrollments ALTER COLUMN enrollment_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.enrollments_enrollment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: grades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.grades (
    grade_id integer NOT NULL,
    enrollment_id integer NOT NULL,
    grade_value numeric(3,2) NOT NULL,
    recorded_by integer,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_grades_value CHECK ((grade_value = ANY (ARRAY[1.00, 1.25, 1.50, 1.75, 2.00, 2.25, 2.50, 2.75, 3.00, 5.00])))
);


--
-- Name: grades_grade_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.grades ALTER COLUMN grade_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.grades_grade_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: instructors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructors (
    instructor_id integer NOT NULL,
    first_name character varying(60) NOT NULL,
    last_name character varying(60) NOT NULL,
    email character varying(120) NOT NULL,
    CONSTRAINT ck_instructors_email CHECK (((email)::text ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text))
);


--
-- Name: instructors_instructor_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.instructors ALTER COLUMN instructor_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.instructors_instructor_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: programs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.programs (
    program_id integer NOT NULL,
    code character varying(10) NOT NULL,
    name character varying(120) NOT NULL,
    CONSTRAINT ck_programs_code CHECK ((length(btrim((code)::text)) > 0))
);


--
-- Name: programs_program_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.programs ALTER COLUMN program_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.programs_program_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sections (
    section_id integer NOT NULL,
    subject_id integer NOT NULL,
    instructor_id integer,
    section_code character varying(20) NOT NULL,
    school_year character varying(9) NOT NULL,
    semester smallint NOT NULL,
    schedule character varying(60),
    room character varying(20),
    capacity smallint DEFAULT 40 NOT NULL,
    CONSTRAINT ck_sections_capacity CHECK (((capacity >= 1) AND (capacity <= 100))),
    CONSTRAINT ck_sections_sem CHECK ((semester = ANY (ARRAY[1, 2, 3]))),
    CONSTRAINT ck_sections_sy CHECK (((school_year)::text ~ '^[0-9]{4}-[0-9]{4}$'::text))
);


--
-- Name: sections_section_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.sections ALTER COLUMN section_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.sections_section_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: students; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.students (
    student_id integer NOT NULL,
    user_id integer,
    student_no character varying(20) NOT NULL,
    first_name character varying(60) NOT NULL,
    middle_name character varying(60),
    last_name character varying(60) NOT NULL,
    email character varying(120) NOT NULL,
    contact_no character varying(20),
    birth_date date NOT NULL,
    program_id integer NOT NULL,
    year_level smallint DEFAULT 1 NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_students_birth CHECK ((birth_date < CURRENT_DATE)),
    CONSTRAINT ck_students_email CHECK (((email)::text ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text)),
    CONSTRAINT ck_students_status CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'graduated'::character varying, 'dropped'::character varying])::text[]))),
    CONSTRAINT ck_students_student_no CHECK ((length(btrim((student_no)::text)) > 0)),
    CONSTRAINT ck_students_year CHECK (((year_level >= 1) AND (year_level <= 5)))
);


--
-- Name: students_student_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.students ALTER COLUMN student_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.students_student_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: subjects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subjects (
    subject_id integer NOT NULL,
    code character varying(20) NOT NULL,
    title character varying(150) NOT NULL,
    units smallint NOT NULL,
    CONSTRAINT ck_subjects_units CHECK (((units >= 1) AND (units <= 6)))
);


--
-- Name: subjects_subject_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.subjects ALTER COLUMN subject_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.subjects_subject_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    user_id integer NOT NULL,
    username character varying(50) NOT NULL,
    password_hash text NOT NULL,
    role character varying(20) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_users_role CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'registrar'::character varying, 'student'::character varying])::text[]))),
    CONSTRAINT ck_users_username CHECK (((username)::text ~ '^[a-z0-9._-]{3,50}$'::text))
);


--
-- Name: users_user_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.users ALTER COLUMN user_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.users_user_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: v_section_roster; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_section_roster AS
SELECT
    NULL::integer AS section_id,
    NULL::character varying(20) AS subject_code,
    NULL::character varying(150) AS subject_title,
    NULL::smallint AS units,
    NULL::character varying(20) AS section_code,
    NULL::character varying(9) AS school_year,
    NULL::smallint AS semester,
    NULL::character varying(60) AS schedule,
    NULL::character varying(20) AS room,
    NULL::text AS instructor,
    NULL::smallint AS capacity,
    NULL::bigint AS enrolled_count,
    NULL::bigint AS seats_left;


--
-- Name: v_student_enrollment_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_student_enrollment_summary AS
SELECT
    NULL::integer AS student_id,
    NULL::character varying(20) AS student_no,
    NULL::text AS student_name,
    NULL::character varying(10) AS program_code,
    NULL::smallint AS year_level,
    NULL::character varying(20) AS status,
    NULL::bigint AS enrolled_subjects,
    NULL::bigint AS enrolled_units;


--
-- Name: v_student_gpa; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_student_gpa AS
SELECT
    NULL::integer AS student_id,
    NULL::character varying(20) AS student_no,
    NULL::text AS student_name,
    NULL::character varying(10) AS program_code,
    NULL::bigint AS graded_subjects,
    NULL::bigint AS graded_units,
    NULL::numeric AS gpa;


--
-- Name: v_student_grades; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_student_grades WITH (security_invoker='true') AS
 SELECT st.student_id,
    st.student_no,
    (((st.last_name)::text || ', '::text) || (st.first_name)::text) AS student_name,
    e.enrollment_id,
    e.status AS enrollment_status,
    sub.code AS subject_code,
    sub.title AS subject_title,
    sub.units,
    sec.school_year,
    sec.semester,
    g.grade_value,
        CASE
            WHEN (g.grade_value IS NULL) THEN 'No grade yet'::text
            WHEN (g.grade_value <= 3.00) THEN 'Passed'::text
            ELSE 'Failed'::text
        END AS remarks
   FROM ((((public.enrollments e
     JOIN public.students st ON ((st.student_id = e.student_id)))
     JOIN public.sections sec ON ((sec.section_id = e.section_id)))
     JOIN public.subjects sub ON ((sub.subject_id = sec.subject_id)))
     LEFT JOIN public.grades g ON ((g.enrollment_id = e.enrollment_id)))
  WHERE ((e.status)::text <> 'dropped'::text);


--
-- Data for Name: announcements; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.announcements (announcement_id, title, body, audience, posted_by, created_at) FROM stdin;
1	Welcome to Connecting Learners	This portal lets you view your enrollment, grades, and school announcements.	all	1	2026-10-16 11:38:44.515298+08
2	Enrollment Reminder	Please verify that your enrolled subjects are correct. Contact the registrar for concerns.	students	1	2026-10-16 11:38:44.515298+08
3	Grade Encoding Deadline	Instructors: submit final grades to the registrar before the encoding deadline.	staff	1	2026-10-16 11:38:44.515298+08
\.


--
-- Data for Name: audit_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_log (audit_id, table_name, record_id, action, old_data, new_data, changed_by, changed_at) FROM stdin;
\.


--
-- Data for Name: enrollments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.enrollments (enrollment_id, student_id, section_id, status, enrolled_at) FROM stdin;
1	1	2	completed	2026-10-16 11:38:44.496502+08
2	2	3	completed	2026-10-16 11:38:44.496502+08
3	3	4	completed	2026-10-16 11:38:44.496502+08
4	4	5	completed	2026-10-16 11:38:44.496502+08
5	5	6	completed	2026-10-16 11:38:44.496502+08
6	6	1	completed	2026-10-16 11:38:44.496502+08
7	7	2	completed	2026-10-16 11:38:44.496502+08
8	8	3	completed	2026-10-16 11:38:44.496502+08
9	9	4	completed	2026-10-16 11:38:44.496502+08
10	10	5	completed	2026-10-16 11:38:44.496502+08
11	11	6	completed	2026-10-16 11:38:44.496502+08
12	12	1	completed	2026-10-16 11:38:44.496502+08
13	13	2	completed	2026-10-16 11:38:44.496502+08
14	14	3	completed	2026-10-16 11:38:44.496502+08
15	15	4	completed	2026-10-16 11:38:44.496502+08
16	16	5	completed	2026-10-16 11:38:44.496502+08
17	17	6	completed	2026-10-16 11:38:44.496502+08
18	18	1	completed	2026-10-16 11:38:44.496502+08
19	19	2	completed	2026-10-16 11:38:44.496502+08
20	20	3	completed	2026-10-16 11:38:44.496502+08
21	21	4	completed	2026-10-16 11:38:44.496502+08
22	22	5	completed	2026-10-16 11:38:44.496502+08
23	23	6	completed	2026-10-16 11:38:44.496502+08
24	24	1	completed	2026-10-16 11:38:44.496502+08
25	25	2	completed	2026-10-16 11:38:44.496502+08
26	26	3	completed	2026-10-16 11:38:44.496502+08
27	27	4	completed	2026-10-16 11:38:44.496502+08
28	28	5	completed	2026-10-16 11:38:44.496502+08
29	29	6	completed	2026-10-16 11:38:44.496502+08
30	30	1	completed	2026-10-16 11:38:44.496502+08
31	1	3	completed	2026-10-16 11:38:44.496502+08
32	2	4	completed	2026-10-16 11:38:44.496502+08
33	3	5	completed	2026-10-16 11:38:44.496502+08
34	4	6	completed	2026-10-16 11:38:44.496502+08
35	5	1	completed	2026-10-16 11:38:44.496502+08
36	6	2	completed	2026-10-16 11:38:44.496502+08
37	7	3	completed	2026-10-16 11:38:44.496502+08
38	8	4	completed	2026-10-16 11:38:44.496502+08
39	9	5	completed	2026-10-16 11:38:44.496502+08
40	10	6	completed	2026-10-16 11:38:44.496502+08
41	11	1	completed	2026-10-16 11:38:44.496502+08
42	12	2	completed	2026-10-16 11:38:44.496502+08
43	13	3	completed	2026-10-16 11:38:44.496502+08
44	14	4	completed	2026-10-16 11:38:44.496502+08
45	15	5	completed	2026-10-16 11:38:44.496502+08
46	16	6	completed	2026-10-16 11:38:44.496502+08
47	17	1	completed	2026-10-16 11:38:44.496502+08
48	18	2	completed	2026-10-16 11:38:44.496502+08
49	19	3	completed	2026-10-16 11:38:44.496502+08
50	20	4	completed	2026-10-16 11:38:44.496502+08
51	21	5	completed	2026-10-16 11:38:44.496502+08
52	22	6	completed	2026-10-16 11:38:44.496502+08
53	23	1	completed	2026-10-16 11:38:44.496502+08
54	24	2	completed	2026-10-16 11:38:44.496502+08
55	25	3	completed	2026-10-16 11:38:44.496502+08
56	26	4	completed	2026-10-16 11:38:44.496502+08
57	27	5	completed	2026-10-16 11:38:44.496502+08
58	28	6	completed	2026-10-16 11:38:44.496502+08
59	29	1	completed	2026-10-16 11:38:44.496502+08
60	30	2	completed	2026-10-16 11:38:44.496502+08
61	1	4	completed	2026-10-16 11:38:44.496502+08
62	2	5	completed	2026-10-16 11:38:44.496502+08
63	3	6	completed	2026-10-16 11:38:44.496502+08
64	4	1	completed	2026-10-16 11:38:44.496502+08
65	5	2	completed	2026-10-16 11:38:44.496502+08
66	6	3	completed	2026-10-16 11:38:44.496502+08
67	7	4	completed	2026-10-16 11:38:44.496502+08
68	8	5	completed	2026-10-16 11:38:44.496502+08
69	9	6	completed	2026-10-16 11:38:44.496502+08
70	10	1	completed	2026-10-16 11:38:44.496502+08
71	11	2	completed	2026-10-16 11:38:44.496502+08
72	12	3	completed	2026-10-16 11:38:44.496502+08
73	13	4	completed	2026-10-16 11:38:44.496502+08
74	14	5	completed	2026-10-16 11:38:44.496502+08
75	15	6	completed	2026-10-16 11:38:44.496502+08
76	16	1	completed	2026-10-16 11:38:44.496502+08
77	17	2	completed	2026-10-16 11:38:44.496502+08
78	18	3	completed	2026-10-16 11:38:44.496502+08
79	19	4	completed	2026-10-16 11:38:44.496502+08
80	20	5	completed	2026-10-16 11:38:44.496502+08
81	21	6	completed	2026-10-16 11:38:44.496502+08
82	22	1	completed	2026-10-16 11:38:44.496502+08
83	23	2	completed	2026-10-16 11:38:44.496502+08
84	24	3	completed	2026-10-16 11:38:44.496502+08
85	25	4	completed	2026-10-16 11:38:44.496502+08
86	26	5	completed	2026-10-16 11:38:44.496502+08
87	27	6	completed	2026-10-16 11:38:44.496502+08
88	28	1	completed	2026-10-16 11:38:44.496502+08
89	29	2	completed	2026-10-16 11:38:44.496502+08
90	30	3	completed	2026-10-16 11:38:44.496502+08
91	1	8	enrolled	2026-10-16 11:38:44.503882+08
92	2	9	enrolled	2026-10-16 11:38:44.503882+08
93	3	10	enrolled	2026-10-16 11:38:44.503882+08
94	4	11	enrolled	2026-10-16 11:38:44.503882+08
95	5	12	enrolled	2026-10-16 11:38:44.503882+08
96	6	7	enrolled	2026-10-16 11:38:44.503882+08
97	7	8	enrolled	2026-10-16 11:38:44.503882+08
98	8	9	enrolled	2026-10-16 11:38:44.503882+08
99	9	10	enrolled	2026-10-16 11:38:44.503882+08
100	10	11	enrolled	2026-10-16 11:38:44.503882+08
101	11	12	enrolled	2026-10-16 11:38:44.503882+08
102	12	7	enrolled	2026-10-16 11:38:44.503882+08
103	13	8	enrolled	2026-10-16 11:38:44.503882+08
104	14	9	enrolled	2026-10-16 11:38:44.503882+08
105	15	10	enrolled	2026-10-16 11:38:44.503882+08
106	16	11	enrolled	2026-10-16 11:38:44.503882+08
107	17	12	enrolled	2026-10-16 11:38:44.503882+08
108	18	7	enrolled	2026-10-16 11:38:44.503882+08
109	19	8	enrolled	2026-10-16 11:38:44.503882+08
110	20	9	enrolled	2026-10-16 11:38:44.503882+08
111	21	10	enrolled	2026-10-16 11:38:44.503882+08
112	22	11	enrolled	2026-10-16 11:38:44.503882+08
113	23	12	enrolled	2026-10-16 11:38:44.503882+08
114	24	7	enrolled	2026-10-16 11:38:44.503882+08
115	25	8	enrolled	2026-10-16 11:38:44.503882+08
116	26	9	enrolled	2026-10-16 11:38:44.503882+08
117	27	10	enrolled	2026-10-16 11:38:44.503882+08
118	28	11	enrolled	2026-10-16 11:38:44.503882+08
119	1	9	enrolled	2026-10-16 11:38:44.503882+08
120	2	10	enrolled	2026-10-16 11:38:44.503882+08
121	3	11	enrolled	2026-10-16 11:38:44.503882+08
122	4	12	enrolled	2026-10-16 11:38:44.503882+08
123	5	7	enrolled	2026-10-16 11:38:44.503882+08
124	6	8	enrolled	2026-10-16 11:38:44.503882+08
125	7	9	enrolled	2026-10-16 11:38:44.503882+08
126	8	10	enrolled	2026-10-16 11:38:44.503882+08
127	9	11	enrolled	2026-10-16 11:38:44.503882+08
128	10	12	enrolled	2026-10-16 11:38:44.503882+08
129	11	7	enrolled	2026-10-16 11:38:44.503882+08
130	12	8	enrolled	2026-10-16 11:38:44.503882+08
131	13	9	enrolled	2026-10-16 11:38:44.503882+08
132	14	10	enrolled	2026-10-16 11:38:44.503882+08
133	15	11	enrolled	2026-10-16 11:38:44.503882+08
134	16	12	enrolled	2026-10-16 11:38:44.503882+08
135	17	7	enrolled	2026-10-16 11:38:44.503882+08
136	18	8	enrolled	2026-10-16 11:38:44.503882+08
137	19	9	enrolled	2026-10-16 11:38:44.503882+08
138	20	10	enrolled	2026-10-16 11:38:44.503882+08
139	21	11	enrolled	2026-10-16 11:38:44.503882+08
140	22	12	enrolled	2026-10-16 11:38:44.503882+08
141	23	7	enrolled	2026-10-16 11:38:44.503882+08
142	24	8	enrolled	2026-10-16 11:38:44.503882+08
143	25	9	enrolled	2026-10-16 11:38:44.503882+08
144	26	10	enrolled	2026-10-16 11:38:44.503882+08
145	27	11	enrolled	2026-10-16 11:38:44.503882+08
146	28	12	enrolled	2026-10-16 11:38:44.503882+08
147	1	10	enrolled	2026-10-16 11:38:44.503882+08
148	2	11	enrolled	2026-10-16 11:38:44.503882+08
149	3	12	enrolled	2026-10-16 11:38:44.503882+08
150	4	7	enrolled	2026-10-16 11:38:44.503882+08
151	5	8	enrolled	2026-10-16 11:38:44.503882+08
152	6	9	enrolled	2026-10-16 11:38:44.503882+08
153	7	10	enrolled	2026-10-16 11:38:44.503882+08
154	8	11	enrolled	2026-10-16 11:38:44.503882+08
155	9	12	enrolled	2026-10-16 11:38:44.503882+08
156	10	7	enrolled	2026-10-16 11:38:44.503882+08
157	11	8	enrolled	2026-10-16 11:38:44.503882+08
158	12	9	enrolled	2026-10-16 11:38:44.503882+08
159	13	10	enrolled	2026-10-16 11:38:44.503882+08
160	14	11	enrolled	2026-10-16 11:38:44.503882+08
161	15	12	enrolled	2026-10-16 11:38:44.503882+08
162	16	7	enrolled	2026-10-16 11:38:44.503882+08
163	17	8	enrolled	2026-10-16 11:38:44.503882+08
164	18	9	enrolled	2026-10-16 11:38:44.503882+08
165	19	10	enrolled	2026-10-16 11:38:44.503882+08
166	20	11	enrolled	2026-10-16 11:38:44.503882+08
167	21	12	enrolled	2026-10-16 11:38:44.503882+08
168	22	7	enrolled	2026-10-16 11:38:44.503882+08
169	23	8	enrolled	2026-10-16 11:38:44.503882+08
170	24	9	enrolled	2026-10-16 11:38:44.503882+08
171	25	10	enrolled	2026-10-16 11:38:44.503882+08
172	26	11	enrolled	2026-10-16 11:38:44.503882+08
173	27	12	enrolled	2026-10-16 11:38:44.503882+08
174	28	7	enrolled	2026-10-16 11:38:44.503882+08
175	1	13	enrolled	2026-10-16 11:38:44.508551+08
176	2	13	enrolled	2026-10-16 11:38:44.508551+08
\.


--
-- Data for Name: grades; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.grades (grade_id, enrollment_id, grade_value, recorded_by, recorded_at) FROM stdin;
1	1	2.75	2	2026-10-16 11:38:44.509063+08
2	2	2.00	2	2026-10-16 11:38:44.509063+08
3	3	1.25	2	2026-10-16 11:38:44.509063+08
4	4	3.00	2	2026-10-16 11:38:44.509063+08
5	5	2.25	2	2026-10-16 11:38:44.509063+08
6	6	1.50	2	2026-10-16 11:38:44.509063+08
7	7	5.00	2	2026-10-16 11:38:44.509063+08
8	8	2.50	2	2026-10-16 11:38:44.509063+08
9	9	1.75	2	2026-10-16 11:38:44.509063+08
10	10	1.00	2	2026-10-16 11:38:44.509063+08
11	11	2.75	2	2026-10-16 11:38:44.509063+08
12	12	2.00	2	2026-10-16 11:38:44.509063+08
13	13	1.25	2	2026-10-16 11:38:44.509063+08
14	14	3.00	2	2026-10-16 11:38:44.509063+08
15	15	2.25	2	2026-10-16 11:38:44.509063+08
16	16	1.50	2	2026-10-16 11:38:44.509063+08
17	17	5.00	2	2026-10-16 11:38:44.509063+08
18	18	2.50	2	2026-10-16 11:38:44.509063+08
19	19	1.75	2	2026-10-16 11:38:44.509063+08
20	20	1.00	2	2026-10-16 11:38:44.509063+08
21	21	2.75	2	2026-10-16 11:38:44.509063+08
22	22	2.00	2	2026-10-16 11:38:44.509063+08
23	23	1.25	2	2026-10-16 11:38:44.509063+08
24	24	3.00	2	2026-10-16 11:38:44.509063+08
25	25	2.25	2	2026-10-16 11:38:44.509063+08
26	26	1.50	2	2026-10-16 11:38:44.509063+08
27	27	5.00	2	2026-10-16 11:38:44.509063+08
28	28	2.50	2	2026-10-16 11:38:44.509063+08
29	29	1.75	2	2026-10-16 11:38:44.509063+08
30	30	1.00	2	2026-10-16 11:38:44.509063+08
31	31	2.75	2	2026-10-16 11:38:44.509063+08
32	32	2.00	2	2026-10-16 11:38:44.509063+08
33	33	1.25	2	2026-10-16 11:38:44.509063+08
34	34	3.00	2	2026-10-16 11:38:44.509063+08
35	35	2.25	2	2026-10-16 11:38:44.509063+08
36	36	1.50	2	2026-10-16 11:38:44.509063+08
37	37	5.00	2	2026-10-16 11:38:44.509063+08
38	38	2.50	2	2026-10-16 11:38:44.509063+08
39	39	1.75	2	2026-10-16 11:38:44.509063+08
40	40	1.00	2	2026-10-16 11:38:44.509063+08
41	41	2.75	2	2026-10-16 11:38:44.509063+08
42	42	2.00	2	2026-10-16 11:38:44.509063+08
43	43	1.25	2	2026-10-16 11:38:44.509063+08
44	44	3.00	2	2026-10-16 11:38:44.509063+08
45	45	2.25	2	2026-10-16 11:38:44.509063+08
46	46	1.50	2	2026-10-16 11:38:44.509063+08
47	47	5.00	2	2026-10-16 11:38:44.509063+08
48	48	2.50	2	2026-10-16 11:38:44.509063+08
49	49	1.75	2	2026-10-16 11:38:44.509063+08
50	50	1.00	2	2026-10-16 11:38:44.509063+08
51	51	2.75	2	2026-10-16 11:38:44.509063+08
52	52	2.00	2	2026-10-16 11:38:44.509063+08
53	53	1.25	2	2026-10-16 11:38:44.509063+08
54	54	3.00	2	2026-10-16 11:38:44.509063+08
55	55	2.25	2	2026-10-16 11:38:44.509063+08
56	56	1.50	2	2026-10-16 11:38:44.509063+08
57	57	5.00	2	2026-10-16 11:38:44.509063+08
58	58	2.50	2	2026-10-16 11:38:44.509063+08
59	59	1.75	2	2026-10-16 11:38:44.509063+08
60	60	1.00	2	2026-10-16 11:38:44.509063+08
61	61	2.75	2	2026-10-16 11:38:44.509063+08
62	62	2.00	2	2026-10-16 11:38:44.509063+08
63	63	1.25	2	2026-10-16 11:38:44.509063+08
64	64	3.00	2	2026-10-16 11:38:44.509063+08
65	65	2.25	2	2026-10-16 11:38:44.509063+08
66	66	1.50	2	2026-10-16 11:38:44.509063+08
67	67	5.00	2	2026-10-16 11:38:44.509063+08
68	68	2.50	2	2026-10-16 11:38:44.509063+08
69	69	1.75	2	2026-10-16 11:38:44.509063+08
70	70	1.00	2	2026-10-16 11:38:44.509063+08
71	71	2.75	2	2026-10-16 11:38:44.509063+08
72	72	2.00	2	2026-10-16 11:38:44.509063+08
73	73	1.25	2	2026-10-16 11:38:44.509063+08
74	74	3.00	2	2026-10-16 11:38:44.509063+08
75	75	2.25	2	2026-10-16 11:38:44.509063+08
76	76	1.50	2	2026-10-16 11:38:44.509063+08
77	77	5.00	2	2026-10-16 11:38:44.509063+08
78	78	2.50	2	2026-10-16 11:38:44.509063+08
79	79	1.75	2	2026-10-16 11:38:44.509063+08
80	80	1.00	2	2026-10-16 11:38:44.509063+08
81	81	2.75	2	2026-10-16 11:38:44.509063+08
82	82	2.00	2	2026-10-16 11:38:44.509063+08
83	83	1.25	2	2026-10-16 11:38:44.509063+08
84	84	3.00	2	2026-10-16 11:38:44.509063+08
85	85	2.25	2	2026-10-16 11:38:44.509063+08
86	86	1.50	2	2026-10-16 11:38:44.509063+08
87	87	5.00	2	2026-10-16 11:38:44.509063+08
88	88	2.50	2	2026-10-16 11:38:44.509063+08
89	89	1.75	2	2026-10-16 11:38:44.509063+08
90	90	1.00	2	2026-10-16 11:38:44.509063+08
\.


--
-- Data for Name: instructors; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.instructors (instructor_id, first_name, last_name, email) FROM stdin;
1	Maria	Santos	maria.santos@example.com
2	Jose	Reyes	jose.reyes@example.com
3	Ana	Cruz	ana.cruz@example.com
4	Ramon	Garcia	ramon.garcia@example.com
5	Liza	Mendoza	liza.mendoza@example.com
6	Carlos	Bautista	carlos.bautista@example.com
\.


--
-- Data for Name: programs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.programs (program_id, code, name) FROM stdin;
1	BSIT	Bachelor of Science in Information Technology
2	BSCS	Bachelor of Science in Computer Science
3	BSBA	Bachelor of Science in Business Administration
4	BSOA	Bachelor of Science in Office Administration
\.


--
-- Data for Name: sections; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sections (section_id, subject_id, instructor_id, section_code, school_year, semester, schedule, room, capacity) FROM stdin;
1	1	1	A	2025-2026	2	MWF 08:00-09:00	Rm 101	40
2	2	2	A	2025-2026	2	TTh 09:00-10:30	Lab 1	40
3	3	3	A	2025-2026	2	MWF 10:00-11:00	Rm 102	40
4	4	4	A	2025-2026	2	TTh 13:00-14:30	Lab 2	40
5	11	5	A	2025-2026	2	MWF 13:00-14:00	Rm 103	40
6	12	6	A	2025-2026	2	TTh 10:30-12:00	Rm 104	40
7	5	1	A	2026-2027	1	MWF 08:00-09:00	Lab 1	40
8	6	2	A	2026-2027	1	TTh 09:00-10:30	Lab 2	40
9	7	3	A	2026-2027	1	MWF 10:00-11:00	Lab 3	40
10	8	4	A	2026-2027	1	TTh 13:00-14:30	Rm 201	40
11	9	5	A	2026-2027	1	MWF 13:00-14:00	Lab 1	40
12	10	6	A	2026-2027	1	TTh 10:30-12:00	Rm 202	40
13	10	6	B	2026-2027	1	TTh 13:00-14:30	Rm 203	2
\.


--
-- Data for Name: students; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.students (student_id, user_id, student_no, first_name, middle_name, last_name, email, contact_no, birth_date, program_id, year_level, status, created_at, updated_at) FROM stdin;
1	3	2026-00001	Juan	Mae	Ramos	student1@example.com	09171000137	2005-02-21	1	1	active	2026-10-16 11:38:44.486409+08	2026-10-16 11:38:44.486409+08
2	4	2026-00002	Maria	Jose	Navarro	student2@example.com	09171000274	2005-03-30	2	2	active	2026-10-16 11:38:44.486409+08	2026-10-16 11:38:44.486409+08
3	5	2026-00003	Pedro	Grace	Mercado	student3@example.com	09171000411	2005-05-06	3	3	active	2026-10-16 11:38:44.486409+08	2026-10-16 11:38:44.486409+08
4	6	2026-00004	Ana	Luis	Garcia	student4@example.com	09171000548	2005-06-12	4	4	active	2026-10-16 11:38:44.486409+08	2026-10-16 11:38:44.486409+08
5	7	2026-00005	Luis	Ann	Villanueva	student5@example.com	09171000685	2005-07-19	1	1	active	2026-10-16 11:38:44.486409+08	2026-10-16 11:38:44.486409+08
6	\N	2026-00006	Carla	Mae	Flores	student6@example.com	09171000822	2005-08-25	2	2	active	2026-10-16 11:38:44.486409+08	2026-10-16 11:38:44.486409+08
7	\N	2026-00007	Miguel	Jose	Dela Cruz	student7@example.com	09171000959	2005-10-01	3	3	active	2026-10-16 11:38:44.486409+08	2026-10-16 11:38:44.486409+08
8	\N	2026-00008	Sofia	Grace	Aquino	student8@example.com	09171001096	2005-11-07	4	4	active	2026-10-16 11:38:44.486409+08	2026-10-16 11:38:44.486409+08
9	\N	2026-00009	Diego	Luis	Castillo	student9@example.com	09171001233	2005-12-14	1	1	active	2026-10-16 11:38:44.486409+08	2026-10-16 11:38:44.486409+08
10	\N	2026-00010	Isabel	Ann	Salazar	student10@example.com	09171001370	2006-01-20	2	2	active	2026-10-16 11:38:44.486409+08	2026-10-16 11:38:44.486409+08
11	\N	2026-00011	Juan	Mae	Ramos	student11@example.com	09171001507	2006-02-26	3	3	active	2026-10-16 11:38:44.486409+08	2026-10-16 11:38:44.486409+08
12	\N	2026-00012	Maria	Jose	Navarro	student12@example.com	09171001644	2006-04-04	4	4	active	2026-10-16 11:38:44.486409+08	2026-10-16 11:38:44.486409+08
13	\N	2026-00013	Pedro	Grace	Mercado	student13@example.com	09171001781	2006-05-11	1	1	active	2026-10-16 11:38:44.486409+08	2026-10-16 11:38:44.486409+08
14	\N	2026-00014	Ana	Luis	Garcia	student14@example.com	09171001918	2006-06-17	2	2	active	2026-10-16 11:38:44.486409+08	2026-10-16 11:38:44.486409+08
15	\N	2026-00015	Luis	Ann	Villanueva	student15@example.com	09171002055	2006-07-24	3	3	active	2026-10-16 11:38:44.486409+08	2026-10-16 11:38:44.486409+08
16	\N	2026-00016	Carla	Mae	Flores	student16@example.com	09171002192	2006-08-30	4	4	active	2026-10-16 11:38:44.486409+08	2026-10-16 11:38:44.486409+08
17	\N	2026-00017	Miguel	Jose	Dela Cruz	student17@example.com	09171002329	2006-10-06	1	1	active	2026-10-16 11:38:44.486409+08	2026-10-16 11:38:44.486409+08
18	\N	2026-00018	Sofia	Grace	Aquino	student18@example.com	09171002466	2006-11-12	2	2	active	2026-10-16 11:38:44.486409+08	2026-10-16 11:38:44.486409+08
19	\N	2026-00019	Diego	Luis	Castillo	student19@example.com	09171002603	2006-12-19	3	3	active	2026-10-16 11:38:44.486409+08	2026-10-16 11:38:44.486409+08
20	\N	2026-00020	Isabel	Ann	Salazar	student20@example.com	09171002740	2007-01-25	4	4	active	2026-10-16 11:38:44.486409+08	2026-10-16 11:38:44.486409+08
21	\N	2026-00021	Juan	Mae	Ramos	student21@example.com	09171002877	2007-03-03	1	1	active	2026-10-16 11:38:44.486409+08	2026-10-16 11:38:44.486409+08
22	\N	2026-00022	Maria	Jose	Navarro	student22@example.com	09171003014	2007-04-09	2	2	active	2026-10-16 11:38:44.486409+08	2026-10-16 11:38:44.486409+08
23	\N	2026-00023	Pedro	Grace	Mercado	student23@example.com	09171003151	2007-05-16	3	3	active	2026-10-16 11:38:44.486409+08	2026-10-16 11:38:44.486409+08
24	\N	2026-00024	Ana	Luis	Garcia	student24@example.com	09171003288	2007-06-22	4	4	active	2026-10-16 11:38:44.486409+08	2026-10-16 11:38:44.486409+08
25	\N	2026-00025	Luis	Ann	Villanueva	student25@example.com	09171003425	2007-07-29	1	1	active	2026-10-16 11:38:44.486409+08	2026-10-16 11:38:44.486409+08
26	\N	2026-00026	Carla	Mae	Flores	student26@example.com	09171003562	2007-09-04	2	2	active	2026-10-16 11:38:44.486409+08	2026-10-16 11:38:44.486409+08
27	\N	2026-00027	Miguel	Jose	Dela Cruz	student27@example.com	09171003699	2007-10-11	3	3	active	2026-10-16 11:38:44.486409+08	2026-10-16 11:38:44.486409+08
28	\N	2026-00028	Sofia	Grace	Aquino	student28@example.com	09171003836	2007-11-17	4	4	active	2026-10-16 11:38:44.486409+08	2026-10-16 11:38:44.486409+08
29	\N	2026-00029	Diego	Luis	Castillo	student29@example.com	09171003973	2007-12-24	1	1	inactive	2026-10-16 11:38:44.486409+08	2026-10-16 11:38:44.486409+08
30	\N	2026-00030	Isabel	Ann	Salazar	student30@example.com	09171004110	2008-01-30	2	2	graduated	2026-10-16 11:38:44.486409+08	2026-10-16 11:38:44.486409+08
\.


--
-- Data for Name: subjects; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.subjects (subject_id, code, title, units) FROM stdin;
1	IT101	Introduction to Computing	3
2	IT102	Computer Programming 1	3
3	IT103	Discrete Mathematics	3
4	IT104	Computer Programming 2	3
5	IT105	Web Systems and Technologies	3
6	IT106	Data Structures and Algorithms	3
7	IT201	Advance Database System	3
8	IT202	Networking Fundamentals	3
9	IT203	Object-Oriented Programming	3
10	IT204	Systems Analysis and Design	3
11	GE101	Understanding the Self	3
12	GE102	Purposive Communication	3
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (user_id, username, password_hash, role, is_active, last_login_at, created_at) FROM stdin;
1	admin	$2a$10$zJa28RhX.C571E.oS0q9kevbw87Uqs31xbBUMFc6achZxluh3sfmi	admin	t	\N	2026-10-16 11:38:43.842026+08
2	registrar	$2a$10$.xnprDmX9Sq05NhhKXgO6erSzf3AElbF4J55ljPBrNBDVOYZxykV6	registrar	t	\N	2026-10-16 11:38:43.842026+08
3	student1	$2a$10$61SX6hL/6RQ6YZFcPQssxu/G.441ms3mgLM2TI1y6XUx61YYsQ5ye	student	t	\N	2026-10-16 11:38:43.842026+08
4	student2	$2a$10$8AqO3sSa4TAfe5T8SVva5uWQ919lIQp2IOwwqfNpqC7sU7gl70c1O	student	t	\N	2026-10-16 11:38:43.842026+08
5	student3	$2a$10$2D2dulEqrhjAySV5JK15KOU94srv.O0i3efDkGN8oQ3vwENmx/3hu	student	t	\N	2026-10-16 11:38:43.842026+08
6	student4	$2a$10$vZgmcY.my.OvYZ3QWzMQK.29Yq9PT4ZhvT8O5zYAsjtP6CEUwHBNC	student	t	\N	2026-10-16 11:38:43.842026+08
7	student5	$2a$10$1rH4OVXarHEqmCf0DQKwUOWf7vmGPyc78LwcX2VnxD6KmoWkkjO5K	student	t	\N	2026-10-16 11:38:43.842026+08
\.


--
-- Name: announcements_announcement_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.announcements_announcement_id_seq', 3, true);


--
-- Name: audit_log_audit_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.audit_log_audit_id_seq', 1, true);


--
-- Name: enrollments_enrollment_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.enrollments_enrollment_id_seq', 177, true);


--
-- Name: grades_grade_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.grades_grade_id_seq', 90, true);


--
-- Name: instructors_instructor_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.instructors_instructor_id_seq', 6, true);


--
-- Name: programs_program_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.programs_program_id_seq', 4, true);


--
-- Name: sections_section_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.sections_section_id_seq', 13, true);


--
-- Name: students_student_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.students_student_id_seq', 30, true);


--
-- Name: subjects_subject_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.subjects_subject_id_seq', 12, true);


--
-- Name: users_user_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_user_id_seq', 7, true);


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (announcement_id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (audit_id);


--
-- Name: enrollments enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_pkey PRIMARY KEY (enrollment_id);


--
-- Name: grades grades_enrollment_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grades
    ADD CONSTRAINT grades_enrollment_id_key UNIQUE (enrollment_id);


--
-- Name: grades grades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grades
    ADD CONSTRAINT grades_pkey PRIMARY KEY (grade_id);


--
-- Name: instructors instructors_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructors
    ADD CONSTRAINT instructors_email_key UNIQUE (email);


--
-- Name: instructors instructors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructors
    ADD CONSTRAINT instructors_pkey PRIMARY KEY (instructor_id);


--
-- Name: programs programs_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programs
    ADD CONSTRAINT programs_code_key UNIQUE (code);


--
-- Name: programs programs_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programs
    ADD CONSTRAINT programs_name_key UNIQUE (name);


--
-- Name: programs programs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programs
    ADD CONSTRAINT programs_pkey PRIMARY KEY (program_id);


--
-- Name: sections sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sections
    ADD CONSTRAINT sections_pkey PRIMARY KEY (section_id);


--
-- Name: students students_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_email_key UNIQUE (email);


--
-- Name: students students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_pkey PRIMARY KEY (student_id);


--
-- Name: students students_student_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_student_no_key UNIQUE (student_no);


--
-- Name: students students_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_user_id_key UNIQUE (user_id);


--
-- Name: subjects subjects_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_code_key UNIQUE (code);


--
-- Name: subjects subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_pkey PRIMARY KEY (subject_id);


--
-- Name: enrollments uq_enrollments_student_section; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT uq_enrollments_student_section UNIQUE (student_id, section_id);


--
-- Name: sections uq_sections_offering; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sections
    ADD CONSTRAINT uq_sections_offering UNIQUE (subject_id, section_code, school_year, semester);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: ix_announcements_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_announcements_created ON public.announcements USING btree (created_at DESC);


--
-- Name: ix_audit_changed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_changed_at ON public.audit_log USING btree (changed_at DESC);


--
-- Name: ix_audit_table_record; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_table_record ON public.audit_log USING btree (table_name, record_id);


--
-- Name: ix_enrollments_section; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_enrollments_section ON public.enrollments USING btree (section_id);


--
-- Name: ix_sections_instructor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_sections_instructor ON public.sections USING btree (instructor_id);


--
-- Name: ix_sections_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_sections_subject ON public.sections USING btree (subject_id);


--
-- Name: ix_students_program; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_students_program ON public.students USING btree (program_id);


--
-- Name: v_section_roster _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.v_section_roster AS
 SELECT sec.section_id,
    sub.code AS subject_code,
    sub.title AS subject_title,
    sub.units,
    sec.section_code,
    sec.school_year,
    sec.semester,
    sec.schedule,
    sec.room,
    COALESCE((((i.last_name)::text || ', '::text) || (i.first_name)::text), 'TBA'::text) AS instructor,
    sec.capacity,
    count(e.enrollment_id) FILTER (WHERE ((e.status)::text <> 'dropped'::text)) AS enrolled_count,
    (sec.capacity - count(e.enrollment_id) FILTER (WHERE ((e.status)::text <> 'dropped'::text))) AS seats_left
   FROM (((public.sections sec
     JOIN public.subjects sub ON ((sub.subject_id = sec.subject_id)))
     LEFT JOIN public.instructors i ON ((i.instructor_id = sec.instructor_id)))
     LEFT JOIN public.enrollments e ON ((e.section_id = sec.section_id)))
  GROUP BY sec.section_id, sub.subject_id, i.instructor_id;


--
-- Name: v_student_gpa _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.v_student_gpa WITH (security_invoker='true') AS
 SELECT st.student_id,
    st.student_no,
    (((st.last_name)::text || ', '::text) || (st.first_name)::text) AS student_name,
    p.code AS program_code,
    count(g.grade_id) AS graded_subjects,
    sum(sub.units) AS graded_units,
    round((sum((g.grade_value * (sub.units)::numeric)) / (NULLIF(sum(sub.units), 0))::numeric), 2) AS gpa
   FROM (((((public.students st
     JOIN public.programs p ON ((p.program_id = st.program_id)))
     JOIN public.enrollments e ON ((e.student_id = st.student_id)))
     JOIN public.grades g ON ((g.enrollment_id = e.enrollment_id)))
     JOIN public.sections sec ON ((sec.section_id = e.section_id)))
     JOIN public.subjects sub ON ((sub.subject_id = sec.subject_id)))
  GROUP BY st.student_id, p.program_id;


--
-- Name: v_student_enrollment_summary _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.v_student_enrollment_summary WITH (security_invoker='true') AS
 SELECT st.student_id,
    st.student_no,
    (((st.last_name)::text || ', '::text) || (st.first_name)::text) AS student_name,
    p.code AS program_code,
    st.year_level,
    st.status,
    count(e.enrollment_id) FILTER (WHERE ((e.status)::text = 'enrolled'::text)) AS enrolled_subjects,
    COALESCE(sum(sub.units) FILTER (WHERE ((e.status)::text = 'enrolled'::text)), (0)::bigint) AS enrolled_units
   FROM ((((public.students st
     JOIN public.programs p ON ((p.program_id = st.program_id)))
     LEFT JOIN public.enrollments e ON ((e.student_id = st.student_id)))
     LEFT JOIN public.sections sec ON ((sec.section_id = e.section_id)))
     LEFT JOIN public.subjects sub ON ((sub.subject_id = sec.subject_id)))
  GROUP BY st.student_id, p.program_id;


--
-- Name: announcements trg_audit_announcements; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_announcements AFTER INSERT OR DELETE OR UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION public.fn_audit('announcement_id');


--
-- Name: enrollments trg_audit_enrollments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_enrollments AFTER INSERT OR DELETE OR UPDATE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION public.fn_audit('enrollment_id');


--
-- Name: grades trg_audit_grades; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_grades AFTER INSERT OR DELETE OR UPDATE ON public.grades FOR EACH ROW EXECUTE FUNCTION public.fn_audit('grade_id');


--
-- Name: audit_log trg_audit_log_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_log_immutable BEFORE DELETE OR UPDATE ON public.audit_log FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_immutable();


--
-- Name: sections trg_audit_sections; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_sections AFTER INSERT OR DELETE OR UPDATE ON public.sections FOR EACH ROW EXECUTE FUNCTION public.fn_audit('section_id');


--
-- Name: students trg_audit_students; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_students AFTER INSERT OR DELETE OR UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.fn_audit('student_id');


--
-- Name: subjects trg_audit_subjects; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_subjects AFTER INSERT OR DELETE OR UPDATE ON public.subjects FOR EACH ROW EXECUTE FUNCTION public.fn_audit('subject_id');


--
-- Name: users trg_audit_users; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_users AFTER INSERT OR DELETE OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.fn_audit('user_id');


--
-- Name: grades trg_grades_not_dropped; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_grades_not_dropped BEFORE INSERT OR UPDATE ON public.grades FOR EACH ROW EXECUTE FUNCTION public.fn_block_grade_for_dropped();


--
-- Name: students trg_students_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_students_touch BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();


--
-- Name: announcements announcements_posted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_posted_by_fkey FOREIGN KEY (posted_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: enrollments enrollments_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.sections(section_id) ON DELETE CASCADE;


--
-- Name: enrollments enrollments_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id) ON DELETE CASCADE;


--
-- Name: grades grades_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grades
    ADD CONSTRAINT grades_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(enrollment_id) ON DELETE CASCADE;


--
-- Name: grades grades_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grades
    ADD CONSTRAINT grades_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: sections sections_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sections
    ADD CONSTRAINT sections_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(instructor_id) ON DELETE SET NULL;


--
-- Name: sections sections_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sections
    ADD CONSTRAINT sections_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(subject_id) ON DELETE RESTRICT;


--
-- Name: students students_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.programs(program_id) ON DELETE RESTRICT;


--
-- Name: students students_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: enrollments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

--
-- Name: grades; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;

--
-- Name: instructors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instructors ENABLE ROW LEVEL SECURITY;

--
-- Name: announcements p_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_admin_all ON public.announcements TO sis_admin USING (true) WITH CHECK (true);


--
-- Name: audit_log p_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_admin_all ON public.audit_log TO sis_admin USING (true) WITH CHECK (true);


--
-- Name: enrollments p_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_admin_all ON public.enrollments TO sis_admin USING (true) WITH CHECK (true);


--
-- Name: grades p_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_admin_all ON public.grades TO sis_admin USING (true) WITH CHECK (true);


--
-- Name: instructors p_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_admin_all ON public.instructors TO sis_admin USING (true) WITH CHECK (true);


--
-- Name: programs p_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_admin_all ON public.programs TO sis_admin USING (true) WITH CHECK (true);


--
-- Name: sections p_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_admin_all ON public.sections TO sis_admin USING (true) WITH CHECK (true);


--
-- Name: students p_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_admin_all ON public.students TO sis_admin USING (true) WITH CHECK (true);


--
-- Name: subjects p_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_admin_all ON public.subjects TO sis_admin USING (true) WITH CHECK (true);


--
-- Name: users p_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_admin_all ON public.users TO sis_admin USING (true) WITH CHECK (true);


--
-- Name: announcements p_registrar_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_registrar_all ON public.announcements TO sis_registrar USING (true) WITH CHECK (true);


--
-- Name: enrollments p_registrar_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_registrar_all ON public.enrollments TO sis_registrar USING (true) WITH CHECK (true);


--
-- Name: grades p_registrar_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_registrar_all ON public.grades TO sis_registrar USING (true) WITH CHECK (true);


--
-- Name: instructors p_registrar_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_registrar_all ON public.instructors TO sis_registrar USING (true) WITH CHECK (true);


--
-- Name: programs p_registrar_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_registrar_all ON public.programs TO sis_registrar USING (true) WITH CHECK (true);


--
-- Name: sections p_registrar_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_registrar_all ON public.sections TO sis_registrar USING (true) WITH CHECK (true);


--
-- Name: students p_registrar_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_registrar_all ON public.students TO sis_registrar USING (true) WITH CHECK (true);


--
-- Name: subjects p_registrar_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_registrar_all ON public.subjects TO sis_registrar USING (true) WITH CHECK (true);


--
-- Name: announcements p_student_announcements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_student_announcements ON public.announcements FOR SELECT TO sis_student USING (((audience)::text = ANY ((ARRAY['all'::character varying, 'students'::character varying])::text[])));


--
-- Name: enrollments p_student_own_enrollments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_student_own_enrollments ON public.enrollments FOR SELECT TO sis_student USING ((student_id = public.fn_current_student_id()));


--
-- Name: grades p_student_own_grades; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_student_own_grades ON public.grades FOR SELECT TO sis_student USING ((enrollment_id IN ( SELECT enrollments.enrollment_id
   FROM public.enrollments
  WHERE (enrollments.student_id = public.fn_current_student_id()))));


--
-- Name: students p_student_own_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_student_own_profile ON public.students FOR SELECT TO sis_student USING ((student_id = public.fn_current_student_id()));


--
-- Name: instructors p_student_ref_instructors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_student_ref_instructors ON public.instructors FOR SELECT TO sis_student USING (true);


--
-- Name: programs p_student_ref_programs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_student_ref_programs ON public.programs FOR SELECT TO sis_student USING (true);


--
-- Name: sections p_student_ref_sections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_student_ref_sections ON public.sections FOR SELECT TO sis_student USING (true);


--
-- Name: subjects p_student_ref_subjects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_student_ref_subjects ON public.subjects FOR SELECT TO sis_student USING (true);


--
-- Name: programs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;

--
-- Name: sections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;

--
-- Name: students; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

--
-- Name: subjects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO sis_admin;
GRANT USAGE ON SCHEMA public TO sis_registrar;
GRANT USAGE ON SCHEMA public TO sis_student;


--
-- Name: PROCEDURE sp_enroll_student(IN p_student_id integer, IN p_section_id integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON PROCEDURE public.sp_enroll_student(IN p_student_id integer, IN p_section_id integer) FROM PUBLIC;
GRANT ALL ON PROCEDURE public.sp_enroll_student(IN p_student_id integer, IN p_section_id integer) TO sis_admin;
GRANT ALL ON PROCEDURE public.sp_enroll_student(IN p_student_id integer, IN p_section_id integer) TO sis_registrar;


--
-- Name: PROCEDURE sp_transfer_section(IN p_student_id integer, IN p_from_section integer, IN p_to_section integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON PROCEDURE public.sp_transfer_section(IN p_student_id integer, IN p_from_section integer, IN p_to_section integer) FROM PUBLIC;
GRANT ALL ON PROCEDURE public.sp_transfer_section(IN p_student_id integer, IN p_from_section integer, IN p_to_section integer) TO sis_admin;
GRANT ALL ON PROCEDURE public.sp_transfer_section(IN p_student_id integer, IN p_from_section integer, IN p_to_section integer) TO sis_registrar;


--
-- Name: TABLE announcements; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.announcements TO sis_admin;
GRANT SELECT ON TABLE public.announcements TO sis_registrar;
GRANT SELECT ON TABLE public.announcements TO sis_student;


--
-- Name: TABLE audit_log; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.audit_log TO sis_admin;


--
-- Name: TABLE enrollments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.enrollments TO sis_admin;
GRANT SELECT,INSERT,UPDATE ON TABLE public.enrollments TO sis_registrar;
GRANT SELECT ON TABLE public.enrollments TO sis_student;


--
-- Name: TABLE grades; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.grades TO sis_admin;
GRANT SELECT,INSERT,UPDATE ON TABLE public.grades TO sis_registrar;
GRANT SELECT ON TABLE public.grades TO sis_student;


--
-- Name: TABLE instructors; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.instructors TO sis_admin;
GRANT SELECT ON TABLE public.instructors TO sis_registrar;
GRANT SELECT ON TABLE public.instructors TO sis_student;


--
-- Name: TABLE programs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.programs TO sis_admin;
GRANT SELECT ON TABLE public.programs TO sis_registrar;
GRANT SELECT ON TABLE public.programs TO sis_student;


--
-- Name: TABLE sections; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sections TO sis_admin;
GRANT SELECT ON TABLE public.sections TO sis_registrar;
GRANT SELECT ON TABLE public.sections TO sis_student;


--
-- Name: TABLE students; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.students TO sis_admin;
GRANT SELECT,INSERT,UPDATE ON TABLE public.students TO sis_registrar;
GRANT SELECT ON TABLE public.students TO sis_student;


--
-- Name: TABLE subjects; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.subjects TO sis_admin;
GRANT SELECT ON TABLE public.subjects TO sis_registrar;
GRANT SELECT ON TABLE public.subjects TO sis_student;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.users TO sis_admin;


--
-- Name: TABLE v_section_roster; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.v_section_roster TO sis_admin;
GRANT SELECT ON TABLE public.v_section_roster TO sis_registrar;
GRANT SELECT ON TABLE public.v_section_roster TO sis_student;


--
-- Name: TABLE v_student_enrollment_summary; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.v_student_enrollment_summary TO sis_admin;
GRANT SELECT ON TABLE public.v_student_enrollment_summary TO sis_registrar;
GRANT SELECT ON TABLE public.v_student_enrollment_summary TO sis_student;


--
-- Name: TABLE v_student_gpa; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.v_student_gpa TO sis_admin;
GRANT SELECT ON TABLE public.v_student_gpa TO sis_registrar;
GRANT SELECT ON TABLE public.v_student_gpa TO sis_student;


--
-- Name: TABLE v_student_grades; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.v_student_grades TO sis_admin;
GRANT SELECT ON TABLE public.v_student_grades TO sis_registrar;
GRANT SELECT ON TABLE public.v_student_grades TO sis_student;


--
-- PostgreSQL database dump complete
--

