import type { Metadata } from "next";
import { ActionForm } from "@/components/ActionForm";
import { btnSecondary, inputCls, tdCls, thCls } from "@/components/styles";
import { Badge, Card, PageHeader, Table, first, type SearchParams } from "@/components/ui";
import { withDb } from "@/lib/db";
import { requireRole, STAFF } from "@/lib/session";
import { saveGrades } from "./actions";

export const metadata: Metadata = { title: "Grades" };

const GRADES = ["1.00", "1.25", "1.50", "1.75", "2.00", "2.25", "2.50", "2.75", "3.00", "5.00"];

export default async function GradesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireRole(...STAFF);
  const sp = await searchParams;
  const sectionId = Number.parseInt(first(sp.section), 10);

  const { sections, roster, section } = await withDb(user, async (db) => {
    const sections = await db.query<{ section_id: number; subject_code: string; section_code: string; school_year: string; semester: number }>(
      "SELECT section_id, subject_code, section_code, school_year, semester FROM v_section_roster ORDER BY school_year DESC, semester DESC, subject_code, section_code LIMIT 300",
    );
    if (!Number.isInteger(sectionId) || sectionId <= 0) return { sections, roster: [], section: null };
    const roster = await db.query<{ enrollment_id: number; student_no: string; student_name: string; status: string; grade: string | null }>(
      `SELECT e.enrollment_id, st.student_no, st.last_name || ', ' || st.first_name AS student_name, e.status,
              to_char(g.grade_value, 'FM0.00') AS grade
         FROM enrollments e
         JOIN students st ON st.student_id = e.student_id
         LEFT JOIN grades g ON g.enrollment_id = e.enrollment_id
        WHERE e.section_id = $1 AND e.status <> 'dropped'
        ORDER BY st.last_name, st.first_name`,
      [sectionId],
    );
    const section = await db.one<{ subject_code: string; subject_title: string; section_code: string; school_year: string; semester: number }>(
      "SELECT subject_code, subject_title, section_code, school_year, semester FROM v_section_roster WHERE section_id = $1",
      [sectionId],
    );
    return { sections, roster, section };
  });

  return (
    <>
      <PageHeader title="Grades" subtitle="Scale: 1.00 (highest) to 3.00 (lowest passing). 5.00 = failed." />

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <div className="min-w-72 flex-1">
          <label htmlFor="section" className="mb-1 block text-sm font-medium text-slate-700">
            Section
          </label>
          <select id="section" name="section" defaultValue={Number.isInteger(sectionId) ? sectionId : ""} className={inputCls}>
            <option value="">Select a section</option>
            {sections.map((s) => (
              <option key={s.section_id} value={s.section_id}>
                {s.subject_code}-{s.section_code} | SY {s.school_year} sem {s.semester}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={btnSecondary}>
          Load roster
        </button>
      </form>

      {section ? (
        <Card title={`${section.subject_code} - ${section.subject_title} (Section ${section.section_code}, SY ${section.school_year} sem ${section.semester})`}>
          {roster.length === 0 ? (
            <p className="text-sm text-slate-600">No students are enrolled in this section.</p>
          ) : (
            <ActionForm action={saveGrades.bind(null, sectionId)} submitLabel="Save grades">
              <Table
                caption="Grade entry"
                head={
                  <>
                    <th className={thCls}>Student no.</th>
                    <th className={thCls}>Name</th>
                    <th className={thCls}>Enrollment</th>
                    <th className={thCls}>Grade</th>
                  </>
                }
              >
                {roster.map((r) => (
                  <tr key={r.enrollment_id}>
                    <td className={tdCls}>{r.student_no}</td>
                    <td className={tdCls}>{r.student_name}</td>
                    <td className={tdCls}>
                      <Badge value={r.status} />
                    </td>
                    <td className={tdCls}>
                      <label className="sr-only" htmlFor={`g_${r.enrollment_id}`}>
                        Grade for {r.student_name}
                      </label>
                      <select id={`g_${r.enrollment_id}`} name={`g_${r.enrollment_id}`} defaultValue={r.grade ?? ""} className={`${inputCls} w-32`}>
                        <option value="">No grade</option>
                        {GRADES.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </Table>
            </ActionForm>
          )}
        </Card>
      ) : null}
    </>
  );
}
