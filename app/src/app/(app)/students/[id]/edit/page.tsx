import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { btnSecondary } from "@/components/styles";
import { Card, PageHeader } from "@/components/ui";
import { withDb } from "@/lib/db";
import { requireRole, STAFF } from "@/lib/session";
import { updateStudent } from "../../actions";
import { StudentFields, type StudentValues } from "../../StudentFields";

export const metadata: Metadata = { title: "Edit student" };

export default async function EditStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(...STAFF);
  const studentId = Number.parseInt((await params).id, 10);
  if (!Number.isInteger(studentId) || studentId <= 0) notFound();

  const { student, programs } = await withDb(user, async (db) => ({
    student: await db.one<StudentValues>(
      `SELECT student_no, first_name, middle_name, last_name, email, contact_no, birth_date::text AS birth_date,
              program_id, year_level, status
         FROM students WHERE student_id = $1`,
      [studentId],
    ),
    programs: await db.query<{ program_id: number; code: string; name: string }>("SELECT program_id, code, name FROM programs ORDER BY code"),
  }));
  if (!student) notFound();

  return (
    <>
      <PageHeader
        title="Edit student"
        subtitle={`${student.last_name}, ${student.first_name}`}
        actions={
          <Link href="/students" className={btnSecondary}>
            Back to list
          </Link>
        }
      />
      <Card className="max-w-3xl">
        <ActionForm action={updateStudent.bind(null, studentId)} submitLabel="Save changes">
          <StudentFields programs={programs} values={student} />
        </ActionForm>
      </Card>
    </>
  );
}
