import type { Metadata } from "next";
import { PrintButton } from "@/components/ActionForm";
import { btnSecondary, inputCls, tdCls, thCls } from "@/components/styles";
import { Card, PageHeader, Table, first, type SearchParams } from "@/components/ui";
import { withDb } from "@/lib/db";
import { requireRole, STAFF } from "@/lib/session";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireRole(...STAFF);
  const sp = await searchParams;
  const termMatch = /^(\d{4}-\d{4})\|([123])$/.exec(first(sp.term));
  const programId = Number.parseInt(first(sp.program), 10);

  const data = await withDb(user, async (db) => ({
    terms: await db.query<{ school_year: string; semester: number }>("SELECT DISTINCT school_year, semester FROM sections ORDER BY school_year DESC, semester DESC"),
    programs: await db.query<{ program_id: number; code: string }>("SELECT program_id, code FROM programs ORDER BY code"),
    sections: await db.query<{
      subject_code: string; subject_title: string; section_code: string; school_year: string; semester: number;
      instructor: string; capacity: number; enrolled_count: string; seats_left: string;
    }>(
      `SELECT subject_code, subject_title, section_code, school_year, semester, instructor, capacity, enrolled_count, seats_left
         FROM v_section_roster
        WHERE $1::text IS NULL OR (school_year = $1 AND semester = $2::int)
        ORDER BY school_year DESC, semester DESC, subject_code, section_code`,
      [termMatch ? termMatch[1] : null, termMatch ? termMatch[2] : null],
    ),
    gpa: await db.query<{ student_no: string; student_name: string; program_code: string; graded_subjects: string; graded_units: string; gpa: string }>(
      `SELECT g.student_no, g.student_name, g.program_code, g.graded_subjects, g.graded_units, g.gpa
         FROM v_student_gpa g JOIN students s ON s.student_id = g.student_id
        WHERE $1::int IS NULL OR s.program_id = $1
        ORDER BY g.gpa ASC, g.student_name
        LIMIT 10`,
      [Number.isFinite(programId) ? programId : null],
    ),
    byProgram: await db.query<{ program: string; status: string; students: string }>(
      `SELECT p.code AS program, s.status, COUNT(*) AS students
         FROM students s JOIN programs p ON p.program_id = s.program_id
        GROUP BY p.code, s.status ORDER BY p.code, s.status`,
    ),
  }));

  return (
    <>
      <PageHeader title="Reports" subtitle="Summary views built on the database views." actions={<PrintButton />} />

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 print:hidden">
        <div>
          <label htmlFor="term" className="mb-1 block text-sm font-medium text-slate-700">
            Term (section report)
          </label>
          <select id="term" name="term" defaultValue={termMatch ? first(sp.term) : ""} className={inputCls}>
            <option value="">All terms</option>
            {data.terms.map((t) => (
              <option key={`${t.school_year}|${t.semester}`} value={`${t.school_year}|${t.semester}`}>
                SY {t.school_year}, sem {t.semester}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="program" className="mb-1 block text-sm font-medium text-slate-700">
            Program (GPA report)
          </label>
          <select id="program" name="program" defaultValue={Number.isFinite(programId) ? programId : ""} className={inputCls}>
            <option value="">All programs</option>
            {data.programs.map((p) => (
              <option key={p.program_id} value={p.program_id}>
                {p.code}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={btnSecondary}>
          Apply
        </button>
      </form>

      <div className="space-y-8">
        <section aria-labelledby="r1">
          <h2 id="r1" className="mb-2 text-lg font-semibold">
            1. Enrollment per section
          </h2>
          <Table
            caption="Enrollment per section"
            empty={data.sections.length === 0}
            head={
              <>
                <th className={thCls}>Subject</th>
                <th className={thCls}>Section</th>
                <th className={thCls}>Term</th>
                <th className={thCls}>Instructor</th>
                <th className={thCls}>Enrolled</th>
                <th className={thCls}>Capacity</th>
                <th className={thCls}>Seats left</th>
              </>
            }
          >
            {data.sections.map((s) => (
              <tr key={`${s.subject_code}-${s.section_code}-${s.school_year}-${s.semester}`}>
                <td className={tdCls}>
                  {s.subject_code} - {s.subject_title}
                </td>
                <td className={tdCls}>{s.section_code}</td>
                <td className={tdCls}>
                  {s.school_year}, sem {s.semester}
                </td>
                <td className={tdCls}>{s.instructor}</td>
                <td className={tdCls}>{s.enrolled_count}</td>
                <td className={tdCls}>{s.capacity}</td>
                <td className={tdCls}>{s.seats_left}</td>
              </tr>
            ))}
          </Table>
        </section>

        <section aria-labelledby="r2">
          <h2 id="r2" className="mb-2 text-lg font-semibold">
            2. Top 10 students by GPA (lower is better)
          </h2>
          <Table
            caption="Top students by GPA"
            empty={data.gpa.length === 0}
            head={
              <>
                <th className={thCls}>#</th>
                <th className={thCls}>Student no.</th>
                <th className={thCls}>Name</th>
                <th className={thCls}>Program</th>
                <th className={thCls}>Graded subjects</th>
                <th className={thCls}>Units</th>
                <th className={thCls}>GPA</th>
              </>
            }
          >
            {data.gpa.map((g, i) => (
              <tr key={g.student_no}>
                <td className={tdCls}>{i + 1}</td>
                <td className={tdCls}>{g.student_no}</td>
                <td className={tdCls}>{g.student_name}</td>
                <td className={tdCls}>{g.program_code}</td>
                <td className={tdCls}>{g.graded_subjects}</td>
                <td className={tdCls}>{g.graded_units}</td>
                <td className={`${tdCls} font-semibold`}>{g.gpa}</td>
              </tr>
            ))}
          </Table>
        </section>

        <section aria-labelledby="r3">
          <h2 id="r3" className="mb-2 text-lg font-semibold">
            3. Students per program and status
          </h2>
          <Card className="max-w-xl p-0">
            <Table
              caption="Students per program and status"
              empty={data.byProgram.length === 0}
              head={
                <>
                  <th className={thCls}>Program</th>
                  <th className={thCls}>Status</th>
                  <th className={thCls}>Students</th>
                </>
              }
            >
              {data.byProgram.map((r) => (
                <tr key={`${r.program}-${r.status}`}>
                  <td className={tdCls}>{r.program}</td>
                  <td className={tdCls}>{r.status}</td>
                  <td className={tdCls}>{r.students}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </section>
      </div>
    </>
  );
}
