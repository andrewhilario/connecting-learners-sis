import type { Metadata } from "next";
import { PrintButton } from "@/components/ActionForm";
import { tdCls, thCls } from "@/components/styles";
import { Badge, Card, PageHeader, Table } from "@/components/ui";
import { withDb } from "@/lib/db";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "My grades" };

export default async function MyGradesPage() {
  const user = await requireRole("student");

  if (user.studentId === null) {
    return (
      <>
        <PageHeader title="My Grades" />
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Your account is not linked to a student record yet. Please contact the registrar.
        </p>
      </>
    );
  }

  const studentId = user.studentId;
  const data = await withDb(user, async (db) => ({
    profile: await db.one<{
      student_no: string;
      first_name: string;
      middle_name: string | null;
      last_name: string;
      program_code: string;
      year_level: number;
    }>(
      `SELECT s.student_no, s.first_name, s.middle_name, s.last_name, p.code AS program_code, s.year_level
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
    gpa: await db.one<{ gpa: string; graded_subjects: string; graded_units: string }>(
      "SELECT gpa, graded_subjects, graded_units FROM v_student_gpa WHERE student_id = $1",
      [studentId],
    ),
  }));

  const passedUnits = data.grades
    .filter((g) => g.remarks === "Passed")
    .reduce((sum, g) => sum + Number(g.units), 0);

  return (
    <>
      <PageHeader
        title="My Grades & GPA"
        subtitle="Official summary of your recorded grades and cumulative General Weighted Average."
        actions={<PrintButton label="Print grade report" />}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-600">Student number</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{data.profile?.student_no ?? "-"}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-600">Cumulative GPA</p>
          <p className="mt-1 text-3xl font-semibold text-indigo-800">{data.gpa?.gpa ?? "N/A"}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-600">Graded subjects</p>
          <p className="mt-1 text-3xl font-semibold text-indigo-800">{data.gpa?.graded_subjects ?? 0}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-600">Units earned (passed)</p>
          <p className="mt-1 text-3xl font-semibold text-emerald-700">{passedUnits}</p>
        </div>
      </div>

      <Table
        caption="Official grade report"
        empty={data.grades.length === 0}
        head={
          <>
            <th className={thCls}>Term</th>
            <th className={thCls}>Subject code</th>
            <th className={thCls}>Descriptive title</th>
            <th className={thCls}>Units</th>
            <th className={thCls}>Enrollment</th>
            <th className={thCls}>Final grade</th>
            <th className={thCls}>Remarks</th>
          </>
        }
      >
        {data.grades.map((g) => (
          <tr key={g.enrollment_id}>
            <td className={tdCls}>
              SY {g.school_year}, Sem {g.semester}
            </td>
            <td className={`${tdCls} font-semibold text-indigo-900`}>{g.subject_code}</td>
            <td className={tdCls}>{g.subject_title}</td>
            <td className={tdCls}>{g.units}</td>
            <td className={tdCls}>
              <Badge value={g.enrollment_status} />
            </td>
            <td className={`${tdCls} font-semibold`}>{g.grade_value ?? "-"}</td>
            <td className={tdCls}>{g.grade_value ? <Badge value={g.remarks} /> : <span className="text-xs text-slate-500">In progress</span>}</td>
          </tr>
        ))}
      </Table>

      <Card title="ICCT Colleges Grading Scale Reference" className="mt-6">
        <p className="text-xs text-slate-600">
          <strong>1.00</strong> (Excellent / Highest) &bull; <strong>1.25 – 1.50</strong> (Very Good) &bull;{" "}
          <strong>1.75 – 2.25</strong> (Good) &bull; <strong>2.50 – 2.75</strong> (Satisfactory) &bull;{" "}
          <strong>3.00</strong> (Passing) &bull; <strong>5.00</strong> (Failed)
        </p>
      </Card>
    </>
  );
}
