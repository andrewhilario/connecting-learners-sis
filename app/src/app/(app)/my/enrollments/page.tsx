import type { Metadata } from "next";
import { PrintButton } from "@/components/ActionForm";
import { tdCls, thCls } from "@/components/styles";
import { Badge, Card, PageHeader, Table } from "@/components/ui";
import { withDb } from "@/lib/db";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "My enrollments" };

export default async function MyEnrollmentsPage() {
  const user = await requireRole("student");

  if (user.studentId === null) {
    return (
      <>
        <PageHeader title="My Enrollments" />
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
      program_name: string;
      year_level: number;
      status: string;
    }>(
      `SELECT s.student_no, s.first_name, s.middle_name, s.last_name,
              p.code AS program_code, p.name AS program_name, s.year_level, s.status
         FROM students s JOIN programs p ON p.program_id = s.program_id
        WHERE s.student_id = $1`,
      [studentId],
    ),
    summary: await db.one<{ enrolled_subjects: string; enrolled_units: string }>(
      "SELECT enrolled_subjects, enrolled_units FROM v_student_enrollment_summary WHERE student_id = $1",
      [studentId],
    ),
    enrollments: await db.query<{
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
    }>(
      `SELECT e.enrollment_id, sec.school_year, sec.semester,
              sub.code AS subject_code, sub.title AS subject_title,
              sec.section_code, sub.units, sec.schedule, sec.room,
              COALESCE(i.last_name || ', ' || i.first_name, 'TBA') AS instructor,
              e.status
         FROM enrollments e
         JOIN sections sec ON sec.section_id = e.section_id
         JOIN subjects sub ON sub.subject_id = sec.subject_id
         LEFT JOIN instructors i ON i.instructor_id = sec.instructor_id
        WHERE e.student_id = $1
        ORDER BY sec.school_year DESC, sec.semester DESC, sub.code`,
      [studentId],
    ),
  }));

  const currentEnrollments = data.enrollments.filter((e) => e.status === "enrolled");
  const pastEnrollments = data.enrollments.filter((e) => e.status !== "enrolled");
  const fullName = data.profile
    ? [data.profile.first_name, data.profile.middle_name, data.profile.last_name].filter(Boolean).join(" ")
    : user.username;

  return (
    <>
      <PageHeader
        title="My Enrollments (Study Load)"
        subtitle="Your official Certificate of Registration (COR) and subject schedule."
        actions={<PrintButton label="Print study load" />}
      />

      {data.profile ? (
        <Card title="Student registration header" className="mb-6">
          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-slate-600">Student name</dt>
              <dd className="font-medium text-slate-900">{fullName}</dd>
            </div>
            <div>
              <dt className="text-slate-600">Student number</dt>
              <dd className="font-medium text-slate-900">{data.profile.student_no}</dd>
            </div>
            <div>
              <dt className="text-slate-600">Program &amp; year</dt>
              <dd className="font-medium text-slate-900">
                {data.profile.program_code} - Year {data.profile.year_level}
              </dd>
            </div>
            <div>
              <dt className="text-slate-600">Current enrolled load</dt>
              <dd className="font-medium text-indigo-800">
                {data.summary?.enrolled_subjects ?? 0} subjects ({data.summary?.enrolled_units ?? 0} units)
              </dd>
            </div>
          </dl>
        </Card>
      ) : null}

      <h2 className="mb-2 text-lg font-semibold text-slate-900">Current enrolled subjects</h2>
      <Table
        caption="Currently enrolled subjects"
        empty={currentEnrollments.length === 0}
        head={
          <>
            <th className={thCls}>Term</th>
            <th className={thCls}>Subject code</th>
            <th className={thCls}>Descriptive title</th>
            <th className={thCls}>Section</th>
            <th className={thCls}>Units</th>
            <th className={thCls}>Schedule</th>
            <th className={thCls}>Room</th>
            <th className={thCls}>Instructor</th>
          </>
        }
      >
        {currentEnrollments.map((e) => (
          <tr key={e.enrollment_id}>
            <td className={tdCls}>
              SY {e.school_year}, Sem {e.semester}
            </td>
            <td className={`${tdCls} font-semibold text-indigo-900`}>{e.subject_code}</td>
            <td className={tdCls}>{e.subject_title}</td>
            <td className={tdCls}>{e.section_code}</td>
            <td className={tdCls}>{e.units}</td>
            <td className={tdCls}>{e.schedule ?? "TBA"}</td>
            <td className={tdCls}>{e.room ?? "TBA"}</td>
            <td className={tdCls}>{e.instructor}</td>
          </tr>
        ))}
      </Table>

      <h2 className="mb-2 mt-8 text-lg font-semibold text-slate-900">Past / completed enrollments</h2>
      <Table
        caption="Past enrollments"
        empty={pastEnrollments.length === 0}
        head={
          <>
            <th className={thCls}>Term</th>
            <th className={thCls}>Subject</th>
            <th className={thCls}>Section</th>
            <th className={thCls}>Units</th>
            <th className={thCls}>Instructor</th>
            <th className={thCls}>Status</th>
          </>
        }
      >
        {pastEnrollments.map((e) => (
          <tr key={e.enrollment_id}>
            <td className={tdCls}>
              SY {e.school_year}, Sem {e.semester}
            </td>
            <td className={tdCls}>
              {e.subject_code} - {e.subject_title}
            </td>
            <td className={tdCls}>{e.section_code}</td>
            <td className={tdCls}>{e.units}</td>
            <td className={tdCls}>{e.instructor}</td>
            <td className={tdCls}>
              <Badge value={e.status} />
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
