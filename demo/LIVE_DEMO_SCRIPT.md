# 5–7 Minute Live Demo Script
## Connecting Learners: A Student-Centered Information System for ICCT Colleges

---

## Pre-Demo Checklist (2 Minutes Before Presenting)
Open **two windows** side by side:
1. **PowerShell Terminal** inside `g:\Personal Project\connecting-learners-sis`
2. **Web Browser** at `http://localhost:3000`

Make sure the database is freshly seeded and the Next.js server is running:
```powershell
# 1. Reset and seed local PostgreSQL database
psql -U postgres -h localhost -c "DROP DATABASE IF EXISTS sis_dev" -c "CREATE DATABASE sis_dev"
psql -U postgres -h localhost -d sis_dev -v ON_ERROR_STOP=1 -f db/sis_full.sql

# 2. Start the web app (inside app/)
cd app
npm run dev
```

### Demo Login Credentials
| Role | Username | Password |
|---|---|---|
| **Admin** | `admin` | `Admin@12345` |
| **Registrar** | `registrar` | `Registrar@12345` |
| **Student** | `student1` (or `student2`..`student5`) | `Student@12345` |

---

## Minute-by-Minute Live Demo Flow (5–7 Minutes Total)

### Minute 0:00 – 1:00 | Part 1: ERD, BCNF Schema & Views
1. Briefly show [`docs/ERD.md`](../docs/ERD.md) and [`db/01_schema.sql`](../db/01_schema.sql).
2. Say: *"Our system, Connecting Learners, uses a 10-table PostgreSQL database normalized to BCNF. Every determinant is a candidate key, and derived values like seats left, grade remarks, and weighted GPA are never stored in tables—they are calculated dynamically by 4 SQL views in `03_views.sql`."*

---

### Minute 1:00 – 2:30 | Part 2: UI Demo — Admin & Registrar Workflows (Requirement 7)
1. **Login (`/login`):** Sign in as `admin` / `Admin@12345`. Point out the Dashboard metrics and announcements.
2. **Students CRUD & Search (`/students`):**
   - Type `Dela Cruz` in the search box and filter by Program `BSIT` → click **Search**.
   - Click **Add student** (`/students/new`), create a sample student (e.g., `2026-00099`, `Juan`, `Santos`, `juan.santos@example.com`, `2005-05-10`, `BSIT`, Year `1`), and show it in the list.
   - Click **Edit** on that student, change Year Level to `2`, and click **Save changes**.
3. **Transactional Enrollment (`/enrollments`):**
   - Enroll `2026-00099` into `IT105-A` (`CALL sp_enroll_student` runs behind the scenes).
   - Now try to enroll `2026-00010` into **`IT204-B` (Section 13, which is 2/2 Full)**. Point out the red alert returned directly by the stored procedure: `Section 13 is full (2 of 2 seats taken).`
4. **Grades (`/grades`) & Reports (`/reports`):**
   - Open `/grades`, load a section roster, change a student's grade to `1.25`, and click **Save grades**.
   - Open `/reports` to show **Enrollment per Section** (`v_section_roster`) and **Top 10 Students by GPA** (`v_student_gpa`).
5. **Audit Log (`/audit-log`):**
   - Open `/audit-log` and show the automatic `INSERT` and `UPDATE` records captured by the `fn_audit()` trigger, including the exact `old_data → new_data` values and `changed_by: admin`.

---

### Minute 2:30 – 3:30 | Part 3: UI Demo — Student Self-Service & Row-Level Security
1. Click **Sign out** and sign in as `student1` / `Student@12345`.
2. Show the **Student Dashboard** (Program, Year Level, Enrolled Subjects, and GPA).
3. Click **My records (`/my`)** to show `student1`'s personal profile, subject grades, `Passed`/`Failed` remarks, and weighted GPA.
4. Say: *"Notice that `student1` only sees their own rows. Even at the database level, our `withDb()` wrapper runs `SET LOCAL ROLE sis_student` and sets `app.student_id = 1`, so PostgreSQL Row-Level Security blocks access to any other student's records."*

---

### Minute 3:30 – 6:00 | Part 4: Terminal Proof of SQL Requirements 2–6
Switch to the PowerShell terminal in `g:\Personal Project\connecting-learners-sis` and run these four commands one by one:

```powershell
# 1. Requirement 3: Transaction Management (COMMIT, manual ROLLBACK, and automatic ROLLBACK on full section transfer)
psql -U postgres -h localhost -d sis_dev -f db/08_transaction_demo.sql

# 2. Requirement 4: Database Security (Role privilege matrix + permission denied proofs for sis_student, sis_registrar, sis_admin)
psql -U postgres -h localhost -d sis_dev -f db/09_security_demo.sql

# 3. Requirement 5: Full Backup and Restore Verification
powershell -NoProfile -File db/backup.ps1 -Url "postgresql://postgres@localhost:5432/sis_dev"
$latest = (Get-ChildItem db/backups/*.dump | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
powershell -NoProfile -File db/restore.ps1 -DumpFile $latest -AdminUrl "postgresql://postgres@localhost:5432/postgres" -NewDb sis_restore_test

# 4. Requirement 6: Performance Optimization (200,000 rows: Seq Scan ~21 ms vs Bitmap Index Scan ~0.11 ms)
psql -U postgres -h localhost -d sis_dev -f db/10_index_test.sql
```
