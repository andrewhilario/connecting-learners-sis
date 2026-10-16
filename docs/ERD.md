# Entity-Relationship Diagram

System: **Connecting Learners: A Student-Centered Information System for ICCT Colleges**
Database: PostgreSQL (script: [`db/sis_full.sql`](../db/sis_full.sql))

```mermaid
erDiagram
    USERS ||--o| STUDENTS : "may own account"
    PROGRAMS ||--o{ STUDENTS : "enrolls"
    SUBJECTS ||--o{ SECTIONS : "is offered as"
    INSTRUCTORS |o--o{ SECTIONS : "teaches"
    STUDENTS ||--o{ ENROLLMENTS : "has"
    SECTIONS ||--o{ ENROLLMENTS : "contains"
    ENROLLMENTS ||--o| GRADES : "receives"
    USERS |o--o{ GRADES : "recorded by"
    USERS |o--o{ ANNOUNCEMENTS : "posts"

    USERS {
        int user_id PK
        varchar username UK
        text password_hash
        varchar role "admin | registrar | student"
        boolean is_active
        timestamptz last_login_at
        timestamptz created_at
    }
    PROGRAMS {
        int program_id PK
        varchar code UK
        varchar name UK
    }
    INSTRUCTORS {
        int instructor_id PK
        varchar first_name
        varchar last_name
        varchar email UK
    }
    STUDENTS {
        int student_id PK
        int user_id FK,UK
        varchar student_no UK
        varchar first_name
        varchar middle_name
        varchar last_name
        varchar email UK
        varchar contact_no
        date birth_date
        int program_id FK
        smallint year_level
        varchar status
        timestamptz created_at
        timestamptz updated_at
    }
    SUBJECTS {
        int subject_id PK
        varchar code UK
        varchar title
        smallint units
    }
    SECTIONS {
        int section_id PK
        int subject_id FK
        int instructor_id FK
        varchar section_code
        varchar school_year
        smallint semester
        varchar schedule
        varchar room
        smallint capacity
    }
    ENROLLMENTS {
        int enrollment_id PK
        int student_id FK
        int section_id FK
        varchar status "enrolled | dropped | completed"
        timestamptz enrolled_at
    }
    GRADES {
        int grade_id PK
        int enrollment_id FK,UK
        numeric grade_value
        int recorded_by FK
        timestamptz recorded_at
    }
    ANNOUNCEMENTS {
        int announcement_id PK
        varchar title
        text body
        varchar audience "all | students | staff"
        int posted_by FK
        timestamptz created_at
    }
    AUDIT_LOG {
        bigint audit_id PK
        varchar table_name
        varchar record_id
        varchar action
        jsonb old_data
        jsonb new_data
        varchar changed_by
        timestamptz changed_at
    }
```

`AUDIT_LOG` has no foreign keys on purpose: audit rows must survive deletion of the records they describe. It is filled only by triggers.

## Relationships

| Relationship | Cardinality | Implemented by |
|---|---|---|
| Program → Students | 1 : N | `students.program_id` (ON DELETE RESTRICT) |
| User → Student | 1 : 0..1 | `students.user_id` UNIQUE (ON DELETE SET NULL) |
| Subject → Sections | 1 : N | `sections.subject_id` (RESTRICT) |
| Instructor → Sections | 0..1 : N | `sections.instructor_id` (SET NULL) |
| Student ↔ Section | M : N | resolved by `enrollments` (UNIQUE `student_id, section_id`) |
| Enrollment → Grade | 1 : 0..1 | `grades.enrollment_id` UNIQUE |
| User → Announcements / Grades | 1 : N | `posted_by`, `recorded_by` (SET NULL) |

## Mapping to the IM2 minimum requirements

| Requirement | Where |
|---|---|
| ≥ 5 tables with PK, FK, constraints | 10 tables in `db/01_schema.sql` |
| ERD | this file |
| Normalization to BCNF | `docs/NORMALIZATION.md` |
| CRUD, ≥ 2 views, ≥ 1 procedure, ≥ 1 trigger | `07_crud_examples.sql`, `03_views.sql` (4), `04_procedures.sql` (2), `05_triggers.sql` (4) |
| Transaction with COMMIT and ROLLBACK | `08_transaction_demo.sql` |
| ≥ 2 roles and privileges | `06_roles.sql` (3 roles), `09_security_demo.sql` |
| Backup and restore | `db/backup.ps1`, `db/restore.ps1`, `docs/EVIDENCE.md` |
| Index before/after | `10_index_test.sql` |
| UI: login, add/edit/delete/search, report | `app/` |
