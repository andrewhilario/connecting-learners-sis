# Connecting Learners: A Student-Centered Information System for ICCT Colleges

**Course:** Advance Database System (IM2) — Final Project (Mini Integrated Information System)  
**Stack:** PostgreSQL 16 / Supabase + Next.js (App Router, TypeScript, Tailwind CSS)

---

## Project Structure

```text
connecting-learners-sis/
├── app/                          # Next.js + TypeScript + Tailwind web application
│   ├── .env.example              # Environment variable template (local PG & Supabase)
│   └── src/
│       ├── app/
│       │   ├── login/            # Login screen & bcrypt/JWT authentication actions
│       │   └── (app)/            # Authenticated role-based shell
│       │       ├── dashboard/    # Role-specific overview & announcements
│       │       ├── students/     # Add, edit, delete, search & filter students
│       │       ├── subjects/     # Subject catalog CRUD & search
│       │       ├── sections/     # Section schedule & capacity CRUD
│       │       ├── enrollments/  # Transactional enroll (sp_enroll_student), transfer & drop
│       │       ├── grades/       # Roster grade encoding (1.00–3.00, 5.00)
│       │       ├── reports/      # Printable summary reports (v_section_roster, v_student_gpa)
│       │       ├── my/           # Student self-service portal (RLS-protected)
│       │       ├── announcements/# Post & view targeted announcements
│       │       ├── users/        # Admin account management & password reset
│       │       └── audit-log/    # Admin append-only JSONB audit trail viewer
│       ├── components/           # Reusable accessible UI & form components
│       └── lib/                  # DB pool + SET LOCAL ROLE wrapper, JWT session, Zod helpers
├── db/                           # Complete PostgreSQL scripts & DBA automation
│   ├── 01_schema.sql             # 10 BCNF tables with PK, FK, UNIQUE, CHECK constraints
│   ├── 02_seed.sql               # Deterministic sample data (30 students, 13 sections, 176 enrollments)
│   ├── 03_views.sql              # 4 views (v_section_roster, v_student_grades, v_student_gpa, v_student_enrollment_summary)
│   ├── 04_procedures.sql         # 2 stored procedures (sp_enroll_student, sp_transfer_section)
│   ├── 05_triggers.sql           # 4 triggers (JSONB audit log, updated_at, dropped-grade guard, immutable audit log)
│   ├── 06_roles.sql              # 3 DB roles (sis_admin, sis_registrar, sis_student) + GRANTS + RLS policies
│   ├── 07_crud_examples.sql      # Standalone CRUD + audit log proof script
│   ├── 08_transaction_demo.sql   # COMMIT, manual ROLLBACK, and automatic ROLLBACK demo
│   ├── 09_security_demo.sql      # Privilege matrix & role enforcement demo
│   ├── 10_index_test.sql         # 200,000-row EXPLAIN ANALYZE before/after index benchmark
│   ├── sis_full.sql              # Single combined deliverable SQL script (01..06)
│   ├── build.ps1                 # Rebuilds sis_full.sql from 01..06
│   ├── backup.ps1                # Full database backup using pg_dump (.dump and .sql)
│   └── restore.ps1               # Restores backup into a new database and verifies row counts
├── docs/
│   ├── DOCUMENTATION.md          # Complete 5–10 page IM2 deliverable documentation with outputs
│   ├── THESIS_AND_DEFENSE_GUIDE.md # Complete system explanation, thesis writing guide & Q&A defense cheat sheet
│   ├── ERD.md                    # Mermaid Entity-Relationship Diagram & relationship table
│   ├── NORMALIZATION.md          # Step-by-step UNF → 1NF → 2NF → 3NF → BCNF functional dependency proof
│   └── screenshots/              # Folder for storing your screenshots
└── demo/
    └── LIVE_DEMO_SCRIPT.md       # 5–7 minute live demo script & commands
```

---

## Quickstart (Local PostgreSQL 16)

1. **Create and load the database:**
   ```powershell
   psql -U postgres -h localhost -c "DROP DATABASE IF EXISTS sis_dev" -c "CREATE DATABASE sis_dev"
   psql -U postgres -h localhost -d sis_dev -v ON_ERROR_STOP=1 -f db/sis_full.sql
   ```
2. **Configure and run the web app:**
   ```powershell
   cd app
   # .env.local is already configured for local PostgreSQL (postgresql://postgres@localhost:5432/sis_dev)
   npm run dev
   ```
3. **Open `http://localhost:3000` and sign in with any demo account:**
   - **Admin:** `admin` / `Admin@12345`
   - **Registrar:** `registrar` / `Registrar@12345`
   - **Student:** `student1` (through `student5`) / `Student@12345`

---

## Deploying with Supabase + Vercel

1. Create a new Supabase project, open **SQL Editor**, paste the contents of [`db/sis_full.sql`](./db/sis_full.sql), and click **Run**.
2. In Supabase, click **Connect** → copy the **Session pooler** connection string (port `5432`, IPv4-compatible).
3. In `app/.env.local` (or Vercel Environment Variables), set:
   ```ini
   DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
   DATABASE_SSL=true
   DATABASE_POOL_MAX=5
   DB_ENFORCE_ROLES=true
   SESSION_SECRET=<32+ character random string>
   ```
