import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader, formatDateTime } from "@/components/ui";
import { AUDIENCES } from "@/lib/audiences";
import { withDb } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Dashboard" };

function Stat({ label, value, href }: { label: string; value: string | number; href?: string }) {
  const inner = (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-200">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-indigo-800">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
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
        ? await db.one<{ gpa: string; graded_units: string }>(
            "SELECT gpa, graded_units FROM v_student_gpa WHERE student_id = $1",
            [user.studentId],
          )
        : null;
      return { announcements, summary, gpa, staff: null };
    }

    const staff = await db.one<{
      students: string;
      enrolled: string;
      sections: string;
      subjects: string;
      programs: string;
      instructors: string;
    }>(
      `SELECT (SELECT COUNT(*) FROM students WHERE status = 'active') AS students,
              (SELECT COUNT(*) FROM enrollments WHERE status = 'enrolled') AS enrolled,
              (SELECT COUNT(*) FROM sections) AS sections,
              (SELECT COUNT(*) FROM subjects) AS subjects,
              (SELECT COUNT(*) FROM programs) AS programs,
              (SELECT COUNT(*) FROM instructors) AS instructors`,
    );
    return { announcements, summary: null, gpa: null, staff };
  });

  return (
    <>
      <PageHeader title={`Welcome, ${user.username}`} subtitle="Here is a quick overview of your account." />

      {user.role === "student" ? (
        user.studentId ? (
          <>
            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Program" value={data.summary?.program_code ?? "-"} href="/programs" />
              <Stat label="Year level" value={data.summary?.year_level ?? "-"} href="/my" />
              <Stat label="Subjects enrolled this term" value={data.summary?.enrolled_subjects ?? 0} href="/my/enrollments" />
              <Stat label="GPA (graded subjects)" value={data.gpa?.gpa ?? "N/A"} href="/my/grades" />
            </div>

            <div className="mb-6 grid gap-4 sm:grid-cols-3">
              <Link
                href="/my/enrollments"
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-300"
              >
                <p className="font-semibold text-indigo-900">My Study Load (COR)</p>
                <p className="mt-1 text-xs text-slate-600">
                  View and print your current semester subjects, schedule, rooms, and assigned instructors.
                </p>
              </Link>
              <Link
                href="/my/grades"
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-300"
              >
                <p className="font-semibold text-indigo-900">Official Grade Report</p>
                <p className="mt-1 text-xs text-slate-600">
                  Check your recorded final grades per term, remarks, and cumulative weighted GPA.
                </p>
              </Link>
              <Link
                href="/sections"
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-300"
              >
                <p className="font-semibold text-indigo-900">Class Schedule &amp; Offerings</p>
                <p className="mt-1 text-xs text-slate-600">
                  Browse offered sections, room assignments, and live seat availability across terms.
                </p>
              </Link>
            </div>
          </>
        ) : (
          <p className="mb-6 rounded-md bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
            Your account is not linked to a student record yet. Please contact the registrar.
          </p>
        )
      ) : (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <Stat label="Active students" value={data.staff?.students ?? 0} href="/students" />
          <Stat label="Current enrollments" value={data.staff?.enrolled ?? 0} href="/enrollments" />
          <Stat label="Programs" value={data.staff?.programs ?? 0} href="/programs" />
          <Stat label="Subjects" value={data.staff?.subjects ?? 0} href="/subjects" />
          <Stat label="Instructors" value={data.staff?.instructors ?? 0} href="/instructors" />
          <Stat label="Sections" value={data.staff?.sections ?? 0} href="/sections" />
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
