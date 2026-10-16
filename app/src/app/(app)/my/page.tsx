import type { Metadata } from "next";
import Link from "next/link";
import { PrintButton } from "@/components/ActionForm";
import { btnPrimary, btnSecondary, tdCls, thCls } from "@/components/styles";
import { Badge, Card, PageHeader, Table, formatDate } from "@/components/ui";
import { withDb } from "@/lib/db";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "My profile" };

export default async function MyRecordsPage() {
  const user = await requireRole("student");

  if (user.studentId === null) {
    return (
      <>
        <PageHeader title="My Profile" />
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Your account is not linked to a student record yet. Please contact the registrar.
        </p>
      </>
    );
  }

  const studentId = user.studentId;
  // Row-level security restricts these queries to the logged-in student's own rows.
  const data = await withDb(user, async (db) => ({
    profile: await db.one<{
      student_no: string;
      first_name: string;
      middle_name: string | null;
      last_name: string;
      email: string;
      contact_no: string | null;
      birth_date: Date;
      program_code: string;
      program: string;
      year_level: number;
      status: string;
    }>(
      `SELECT s.student_no, s.first_name, s.middle_name, s.last_name, s.email, s.contact_no,
              s.birth_date, p.code AS program_code, p.name AS program, s.year_level, s.status
         FROM students s JOIN programs p ON p.program_id = s.program_id WHERE s.student_id = $1`,
      [studentId],
    ),
    grades: await db.query<{
      enrollment_id: number;
      subject_code: string;
      subject_title: string;
      units: number;
      school_year: string;
      semester: number;
      enrollment_status: string;
      grade_value: string | null;
      remarks: string;
    }>(
      `SELECT enrollment_id, subject_code, subject_title, units, school_year, semester, enrollment_status,
              to_char(grade_value, 'FM0.00') AS grade_value, remarks
         FROM v_student_grades WHERE student_id = $1
        ORDER BY school_year DESC, semester DESC, subject_code`,
      [studentId],
    ),
    gpa: await db.one<{ gpa: string; graded_units: string }>(
      "SELECT gpa, graded_units FROM v_student_gpa WHERE student_id = $1",
      [studentId],
    ),
  }));

  return (
    <>
      <PageHeader
        title="My Student Profile"
        subtitle="Your official personal information, degree program, and academic summary."
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <PrintButton label="Print profile" />
            <Link href="/my/enrollments" className={btnPrimary}>
              View study load
            </Link>
            <Link href="/my/grades" className={btnSecondary}>
              View grade report
            </Link>
          </div>
        }
      />

      {data.profile ? (
        <Card title="Personal & Academic Profile" className="mb-6">
          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Student number", data.profile.student_no],
              ["Full name", [data.profile.first_name, data.profile.middle_name, data.profile.last_name].filter(Boolean).join(" ")],
              ["Birth date", formatDate(data.profile.birth_date)],
              ["E-mail address", data.profile.email],
              ["Contact number", data.profile.contact_no ?? "-"],
              ["Degree program", `${data.profile.program_code} — ${data.profile.program}`],
              ["Year level", `Year ${data.profile.year_level}`],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-slate-600">{label}</dt>
                <dd className="font-medium text-slate-900">{value}</dd>
              </div>
            ))}
            <div>
              <dt className="text-slate-600">Enrollment status</dt>
              <dd className="mt-0.5">
                <Badge value={data.profile.status} />
              </dd>
            </div>
            <div>
              <dt className="text-slate-600">GPA (graded subjects)</dt>
              <dd className="font-medium text-indigo-800">
                {data.gpa ? `${data.gpa.gpa} (${data.gpa.graded_units} units)` : "N/A"}
              </dd>
            </div>
          </dl>
        </Card>
      ) : null}

      <h2 className="mb-2 text-lg font-semibold">Academic History Overview</h2>
      <Table
        caption="My subjects and grades"
        empty={data.grades.length === 0}
        head={
          <>
            <th className={thCls}>Term</th>
            <th className={thCls}>Subject</th>
            <th className={thCls}>Units</th>
            <th className={thCls}>Status</th>
            <th className={thCls}>Grade</th>
            <th className={thCls}>Remarks</th>
          </>
        }
      >
        {data.grades.map((g) => (
          <tr key={g.enrollment_id}>
            <td className={tdCls}>
              {g.school_year}, sem {g.semester}
            </td>
            <td className={tdCls}>
              {g.subject_code} - {g.subject_title}
            </td>
            <td className={tdCls}>{g.units}</td>
            <td className={tdCls}>
              <Badge value={g.enrollment_status} />
            </td>
            <td className={tdCls}>{g.grade_value ?? "-"}</td>
            <td className={tdCls}>{g.grade_value ? <Badge value={g.remarks} /> : "-"}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
