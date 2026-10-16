# Normalization Write-up (target: BCNF)

## 1. Starting point: the unnormalized registration record

A paper/Excel registration form for one student looks like this:

```
UNF( student_no, student_name, student_email, program_code, program_name,
     { subject_code, subject_title, units, section_code, school_year, semester,
       schedule, room, instructor_name, instructor_email, grade } )
```
`{ … }` is a repeating group: one student has many subjects.

## 2. First Normal Form (1NF) - atomic values, no repeating groups

* Split `student_name` into `first_name`, `middle_name`, `last_name`.
* Move the repeating group to its own rows, so there is one row per (student, subject offering).

```
R1( student_no, first_name, middle_name, last_name, student_email, program_code, program_name,
    subject_code, subject_title, units, section_code, school_year, semester,
    schedule, room, instructor_name, instructor_email, grade )
Key: (student_no, subject_code, section_code, school_year, semester)
```

## 3. Second Normal Form (2NF) - remove partial dependencies

Functional dependencies on **parts** of the composite key:

| Determinant (part of key) | Determines |
|---|---|
| `student_no` | names, `student_email`, `program_code`, `program_name` |
| `subject_code` | `subject_title`, `units` |
| `subject_code, section_code, school_year, semester` | `schedule`, `room`, `instructor_name`, `instructor_email` |

Decomposition:

* `STUDENT(student_no, first_name, middle_name, last_name, email, program_code, program_name, …)`
* `SUBJECT(subject_code, subject_title, units)`
* `SECTION(subject_code, section_code, school_year, semester, schedule, room, instructor_name, instructor_email)`
* `ENROLLMENT(student_no, subject_code, section_code, school_year, semester, grade)`

Only `grade` depends on the whole key of `ENROLLMENT`.

## 4. Third Normal Form (3NF) - remove transitive dependencies

| Transitive dependency | Fix |
|---|---|
| `student_no → program_code → program_name` | new table `PROGRAMS(code, name)` |
| `section → instructor_email → instructor_name` | new table `INSTRUCTORS(email, first_name, last_name)` |

Surrogate integer keys (`student_id`, `section_id`, `enrollment_id`, …) are then introduced. The natural keys remain as `UNIQUE` candidate keys, so the dependencies above still hold. The composite enrollment key becomes `(student_id, section_id)`, because a section already identifies subject, section code, school year and semester.

## 5. Boyce-Codd Normal Form (BCNF)

A relation is in BCNF when, for every non-trivial functional dependency X → Y, **X is a superkey**. Final functional dependencies per table (`PK` = primary key, `CK` = other candidate key):

| Table | Functional dependencies | Determinant is a superkey? |
|---|---|---|
| `users` | `user_id → username, password_hash, role, is_active, last_login_at, created_at`<br>`username → user_id, …` | `user_id` PK; `username` CK ✔ |
| `programs` | `program_id → code, name`<br>`code → program_id, name`<br>`name → program_id, code` | all keys ✔ |
| `instructors` | `instructor_id → first_name, last_name, email`<br>`email → instructor_id, first_name, last_name` | PK, CK ✔ |
| `students` | `student_id → all attributes`<br>`student_no → all`<br>`email → all`<br>`user_id → all` | PK + 3 CKs ✔ |
| `subjects` | `subject_id → code, title, units`<br>`code → subject_id, title, units` | PK, CK ✔ |
| `sections` | `section_id → all`<br>`(subject_id, section_code, school_year, semester) → section_id, instructor_id, schedule, room, capacity` | PK, composite CK ✔ |
| `enrollments` | `enrollment_id → student_id, section_id, status, enrolled_at`<br>`(student_id, section_id) → enrollment_id, status, enrolled_at` | PK, composite CK ✔ |
| `grades` | `grade_id → enrollment_id, grade_value, recorded_by, recorded_at`<br>`enrollment_id → grade_id, …` (one grade per enrollment) | PK, CK ✔ |
| `announcements` | `announcement_id → title, body, audience, posted_by, created_at` | PK ✔ |
| `audit_log` | `audit_id → all attributes` | PK ✔ |

Every determinant in every table is a superkey, so the schema is in **BCNF**.

## 6. Design decisions that protect normalization

* **Derived data is not stored.** Seats taken (`enrolled_count`), seats left, `remarks` (Passed/Failed) and GPA are calculated in the views `v_section_roster`, `v_student_grades` and `v_student_gpa`. Storing them would create update anomalies.
* `enrollments.status` is stored because it is a fact about the (student, section) pair, not derivable from other data.
* `audit_log` is intentionally a denormalized, append-only history table (JSONB snapshots). It is a log, not part of the transactional model.

## 7. Assumptions behind the dependencies

1. A student has exactly one e-mail address and one student number (both unique).
2. A section has at most one instructor.
3. A student can hold at most one grade per enrollment (no per-term grade breakdown, such as prelim/midterm, is modelled).
4. The grading scale is 1.00 (highest) to 3.00 (lowest passing), and 5.00 is failed. This is the common Philippine scale and is enforced by `ck_grades_value`.
5. Student number format is free text. The sample data uses `YYYY-NNNNN`.
