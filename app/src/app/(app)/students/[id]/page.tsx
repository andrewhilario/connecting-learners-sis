import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/ActionForm";
import { btnPrimary, btnSecondary, tdCls, thCls } from "@/components/styles";
import { Badge, Card, PageHeader, Table, formatDate } from "@/components/ui";
import { withDb } from "@/lib/db";
import { requireRole, STAFF } from "@/lib/session";

export const metadata: Metadata = { title: "Student academic record" };

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(...STAFF);
  const { id } = await params;
  const studentId = Number.parseInt(id, 10);
  if (!Number.isInteger(studentId) || studentId <= 0) notFound();

  const data = await withDb(user, async (db) => {
    const student = await db.one<{
      student_id: number;
      student_no: string;
      first_name: string;
      middle_name: string | null;
      last_name: string;
      email: string;
      contact_no: string | null;
      birth_date: Date;
      program_code: string;
      program_name: string;
      year_level: number;
      status: string;
      username: string | null;
    }>(
      `SELECT s.student_id, s.student_no, s.first_name, s.middle_name, s.last_name,
              s.email, s.contact_no, s.birth_date, p.code AS program_code, p.name AS program_name,
              s.year_level, s.status,
              ${user.role === "admin" ? "u.username" : "NULL::text AS username"}
         FROM students s
         JOIN programs p ON p.program_id = s.program_id
         ${user.role === "admin" ? "LEFT JOIN users u ON u.user_id = s.user_id" : ""}
        WHERE s.student_id = $1`,
      [studentId],
    );
    if (!student) return null;

    const summary = await db.one<{ enrolled_subjects: string; enrolled_units: string }>(
      "SELECT enrolled_subjects, enrolled_units FROM v_student_enrollment_summary WHERE student_id = $1",
      [studentId],
    );
    const gpa = await db.one<{ gpa: string; graded_subjects: string; graded_units: string }>(
      "SELECT gpa, graded_subjects, graded_units FROM v_student_gpa WHERE student_id = $1",
      [studentId],
    );
    const enrollments = await db.query<{
      enrollment_id: number;
      school_year: string;
      semester: number;
      subject_code: string;
      subject_title: string;
      section_code: string;
      units: number;
      schedule: string | null;
      room: string | null;
      instructor: string;
      status: string;
      grade_value: string | null;
      remarks: string;
    }>(
      `SELECT e.enrollment_id, sec.school_year, sec.semester,
              sub.code AS subject_code, sub.title AS subject_title,
              sec.section_code, sub.units, sec.schedule, sec.room,
              COALESCE(i.last_name || ', ' || i.first_name, 'TBA') AS instructor,
              e.status,
              to_char(g.grade_value, 'FM0.00') AS grade_value,
              CASE
                WHEN g.grade_value IS NULL THEN 'No grade yet'
                WHEN g.grade_value <= 3.00 THEN 'Passed'
                ELSE 'Failed'
              END AS remarks
         FROM enrollments e
         JOIN sections sec ON sec.section_id = e.section_id
         JOIN subjects sub ON sub.subject_id = sec.subject_id
         LEFT JOIN instructors i ON i.instructor_id = sec.instructor_id
         LEFT JOIN grades g ON g.enrollment_id = e.enrollment_id
        WHERE e.student_id = $1
        ORDER BY sec.school_year DESC, sec.semester DESC, sub.code`,
      [studentId],
    );

    return { student, summary, gpa, enrollments };
  });

  if (!data) notFound();
  const { student, summary, gpa, enrollments } = data;
  const fullName = [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(" ");

  return (
    <>
      <PageHeader
        title={`${student.last_name}, ${student.first_name}`}
        subtitle={`Student No. ${student.student_no} • ${student.program_code} (${student.program_name})`}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <PrintButton label="Print academic record" />
            <Link href={`/students/${student.student_id}/edit`} className={btnPrimary}>
              Edit profile
            </Link>
            <Link href="/students" className={btnSecondary}>
              Back to students
            </Link>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-600">Academic status</p>
          <div className="mt-2">
            <Badge value={student.status} />
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-600">Program &amp; year</p>
          <p className="mt-1 text-2xl font-semibold text-indigo-800">
            {student.program_code} - Year {student.year_level}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-600">Current load</p>
          <p className="mt-1 text-2xl font-semibold text-indigo-800">
            {summary?.enrolled_subjects ?? 0} subj ({summary?.enrolled_units ?? 0} units)
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-600">Cumulative GPA</p>
          <p className="mt-1 text-2xl font-semibold text-indigo-800">
            {gpa ? `${gpa.gpa} (${gpa.graded_units}u)` : "N/A"}
          </p>
        </div>
      </div>

      <Card title="Personal & academic information" className="mb-6">
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-slate-600">Full name</dt>
            <dd className="font-medium text-slate-900">{fullName}</dd>
          </div>
          <div>
            <dt className="text-slate-600">Student number</dt>
            <dd className="font-medium text-slate-900">{student.student_no}</dd>
          </div>
          <div>
            <dt className="text-slate-600">Birth date</dt>
            <dd className="font-medium text-slate-900">{formatDate(student.birth_date)}</dd>
          </div>
          <div>
            <dt className="text-slate-600">E-mail address</dt>
            <dd className="font-medium text-slate-900">{student.email}</dd>
          </div>
          <div>
            <dt className="text-slate-600">Contact number</dt>
            <dd className="font-medium text-slate-900">{student.contact_no ?? "-"}</dd>
          </div>
          {user.role === "admin" ? (
            <div>
              <dt className="text-slate-600">Portal account</dt>
              <dd className="font-medium text-slate-900">{student.username ?? "Not linked"}</dd>
            </div>
          ) : null}
        </dl>
      </Card>

      <h2 className="mb-2 text-lg font-semibold text-slate-900">Enrollment &amp; grade history</h2>
      <Table
        caption="Student enrollment and grade history"
        empty={enrollments.length === 0}
        head={
          <>
            <th className={thCls}>Term</th>
            <th className={thCls}>Subject</th>
            <th className={thCls}>Sec</th>
            <th className={thCls}>Units</th>
            <th className={thCls}>Schedule &amp; room</th>
            <th className={thCls}>Instructor</th>
            <th className={thCls}>Status</th>
            <th className={thCls}>Grade</th>
            <th className={thCls}>Remarks</th>
          </>
        }
      >
        {enrollments.map((e) => (
          <tr key={e.enrollment_id}>
            <td className={tdCls}>
              {e.school_year}, sem {e.semester}
            </td>
            <td className={tdCls}>
              <span className="font-medium">{e.subject_code}</span>
              <br />
              <span className="text-xs text-slate-600">{e.subject_title}</span>
            </td>
            <td className={tdCls}>{e.section_code}</td>
            <td className={tdCls}>{e.units}</td>
            <td className={tdCls}>
              {e.schedule ?? "TBA"}
              {e.room ? ` (${e.room})` : ""}
            </td>
            <td className={tdCls}>{e.instructor}</td>
            <td className={tdCls}>
              <Badge value={e.status} />
            </td>
            <td className={`${tdCls} font-semibold`}>{e.grade_value ?? "-"}</td>
            <td className={tdCls}>{e.grade_value ? <Badge value={e.remarks} /> : "-"}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
