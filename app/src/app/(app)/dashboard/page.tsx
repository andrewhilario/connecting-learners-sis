import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader, formatDateTime } from "@/components/ui";
import { AUDIENCES } from "@/lib/audiences";
import { withDb } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Dashboard" };

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-indigo-800">{value}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();

  const data = await withDb(user, async (db) => {
    const announcements = await db.query<{ announcement_id: number; title: string; body: string; created_at: Date }>(
      `SELECT announcement_id, title, body, created_at FROM announcements
        WHERE audience = ANY($1::text[]) ORDER BY created_at DESC LIMIT 3`,
      [AUDIENCES[user.role]],
    );

    if (user.role === "student") {
      const summary = user.studentId
        ? await db.one<{ enrolled_subjects: string; enrolled_units: string; program_code: string; year_level: number }>(
            "SELECT enrolled_subjects, enrolled_units, program_code, year_level FROM v_student_enrollment_summary WHERE student_id = $1",
            [user.studentId],
          )
        : null;
      const gpa = user.studentId
        ? await db.one<{ gpa: string; graded_units: string }>("SELECT gpa, graded_units FROM v_student_gpa WHERE student_id = $1", [user.studentId])
        : null;
      return { announcements, summary, gpa, staff: null };
    }

    const staff = await db.one<{ students: string; enrolled: string; sections: string; subjects: string }>(
      `SELECT (SELECT COUNT(*) FROM students WHERE status = 'active') AS students,
              (SELECT COUNT(*) FROM enrollments WHERE status = 'enrolled') AS enrolled,
              (SELECT COUNT(*) FROM sections) AS sections,
              (SELECT COUNT(*) FROM subjects) AS subjects`,
    );
    return { announcements, summary: null, gpa: null, staff };
  });

  return (
    <>
      <PageHeader title={`Welcome, ${user.username}`} subtitle="Here is a quick overview of your account." />

      {user.role === "student" ? (
        user.studentId ? (
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Program" value={data.summary?.program_code ?? "-"} />
            <Stat label="Year level" value={data.summary?.year_level ?? "-"} />
            <Stat label="Subjects enrolled this term" value={data.summary?.enrolled_subjects ?? 0} />
            <Stat label="GPA (graded subjects)" value={data.gpa?.gpa ?? "N/A"} />
          </div>
        ) : (
          <p className="mb-6 rounded-md bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
            Your account is not linked to a student record yet. Please contact the registrar.
          </p>
        )
      ) : (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Active students" value={data.staff?.students ?? 0} />
          <Stat label="Current enrollments" value={data.staff?.enrolled ?? 0} />
          <Stat label="Sections" value={data.staff?.sections ?? 0} />
          <Stat label="Subjects" value={data.staff?.subjects ?? 0} />
        </div>
      )}

      <Card title="Latest announcements">
        {data.announcements.length === 0 ? (
          <p className="text-sm text-slate-600">No announcements yet.</p>
        ) : (
          <ul className="space-y-4">
            {data.announcements.map((a) => (
              <li key={a.announcement_id}>
                <p className="font-medium">{a.title}</p>
                <p className="whitespace-pre-line text-sm text-slate-700">{a.body}</p>
                <p className="mt-1 text-xs text-slate-500">{formatDateTime(a.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
        <Link href="/announcements" className="mt-4 inline-block text-sm font-medium text-indigo-700 underline">
          View all announcements
        </Link>
      </Card>
    </>
  );
}
