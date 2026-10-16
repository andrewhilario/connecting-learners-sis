import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/ActionForm";
import { btnPrimary, btnSecondary, tdCls, thCls } from "@/components/styles";
import { Badge, Card, PageHeader, Table } from "@/components/ui";
import { withDb } from "@/lib/db";
import { requireRole, STAFF } from "@/lib/session";

export const metadata: Metadata = { title: "Section roster" };

export default async function SectionRosterPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(...STAFF);
  const { id } = await params;
  const sectionId = Number.parseInt(id, 10);
  if (!Number.isInteger(sectionId) || sectionId <= 0) notFound();

  const data = await withDb(user, async (db) => {
    const section = await db.one<{
      section_id: number;
      subject_code: string;
      subject_title: string;
      units: number;
      section_code: string;
      school_year: string;
      semester: number;
      schedule: string | null;
      room: string | null;
      instructor: string;
      capacity: number;
      enrolled_count: string;
      seats_left: string;
    }>("SELECT * FROM v_section_roster WHERE section_id = $1", [sectionId]);
    if (!section) return null;

    const students = await db.query<{
      enrollment_id: number;
      student_id: number;
      student_no: string;
      student_name: string;
      program_code: string;
      year_level: number;
      status: string;
      grade_value: string | null;
      remarks: string;
    }>(
      `SELECT e.enrollment_id, st.student_id, st.student_no,
              st.last_name || ', ' || st.first_name AS student_name,
              p.code AS program_code, st.year_level, e.status,
              to_char(g.grade_value, 'FM0.00') AS grade_value,
              CASE
                WHEN g.grade_value IS NULL THEN 'No grade yet'
                WHEN g.grade_value <= 3.00 THEN 'Passed'
                ELSE 'Failed'
              END AS remarks
         FROM enrollments e
         JOIN students st ON st.student_id = e.student_id
         JOIN programs p ON p.program_id = st.program_id
         LEFT JOIN grades g ON g.enrollment_id = e.enrollment_id
        WHERE e.section_id = $1
        ORDER BY st.last_name, st.first_name`,
      [sectionId],
    );

    return { section, students };
  });

  if (!data) notFound();
  const { section, students } = data;

  return (
    <>
      <PageHeader
        title={`${section.subject_code}-${section.section_code}: ${section.subject_title}`}
        subtitle={`SY ${section.school_year}, Semester ${section.semester} • ${section.units} units`}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <PrintButton label="Print class roster" />
            <Link href={`/grades?section=${section.section_id}`} className={btnPrimary}>
              Encode grades
            </Link>
            {user.role === "admin" ? (
              <Link href={`/sections/${section.section_id}/edit`} className={btnSecondary}>
                Edit section
              </Link>
            ) : null}
            <Link href="/sections" className={btnSecondary}>
              Back to sections
            </Link>
          </div>
        }
      />

      <Card title="Section details" className="mb-6">
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-slate-600">Instructor</dt>
            <dd className="font-medium text-slate-900">{section.instructor}</dd>
          </div>
          <div>
            <dt className="text-slate-600">Schedule</dt>
            <dd className="font-medium text-slate-900">{section.schedule ?? "TBA"}</dd>
          </div>
          <div>
            <dt className="text-slate-600">Room</dt>
            <dd className="font-medium text-slate-900">{section.room ?? "TBA"}</dd>
          </div>
          <div>
            <dt className="text-slate-600">Seat capacity</dt>
            <dd className="font-medium text-slate-900">
              {section.enrolled_count} / {section.capacity} ({section.seats_left} seats remaining)
            </dd>
          </div>
        </dl>
      </Card>

      <h2 className="mb-2 text-lg font-semibold text-slate-900">
        Class roster ({students.length} record{students.length === 1 ? "" : "s"})
      </h2>
      <Table
        caption="Section class roster"
        empty={students.length === 0}
        head={
          <>
            <th className={thCls}>#</th>
            <th className={thCls}>Student no.</th>
            <th className={thCls}>Student name</th>
            <th className={thCls}>Program &amp; year</th>
            <th className={thCls}>Status</th>
            <th className={thCls}>Grade</th>
            <th className={thCls}>Remarks</th>
          </>
        }
      >
        {students.map((st, idx) => (
          <tr key={st.enrollment_id}>
            <td className={tdCls}>{idx + 1}</td>
            <td className={tdCls}>{st.student_no}</td>
            <td className={tdCls}>
              <Link href={`/students/${st.student_id}`} className="font-medium text-indigo-800 hover:underline">
                {st.student_name}
              </Link>
            </td>
            <td className={tdCls}>
              {st.program_code} - Year {st.year_level}
            </td>
            <td className={tdCls}>
              <Badge value={st.status} />
            </td>
            <td className={`${tdCls} font-semibold`}>{st.grade_value ?? "-"}</td>
            <td className={tdCls}>{st.grade_value ? <Badge value={st.remarks} /> : "-"}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
