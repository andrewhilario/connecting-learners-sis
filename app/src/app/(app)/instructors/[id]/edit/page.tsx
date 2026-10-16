import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { btnSecondary } from "@/components/styles";
import { Card, Field, PageHeader } from "@/components/ui";
import { withDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { updateInstructor } from "../../actions";

export const metadata: Metadata = { title: "Edit instructor" };

export default async function EditInstructorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("admin");
  const { id } = await params;
  const instructorId = Number.parseInt(id, 10);
  if (!Number.isInteger(instructorId) || instructorId <= 0) notFound();

  const instructor = await withDb(user, (db) =>
    db.one<{ instructor_id: number; first_name: string; last_name: string; email: string }>(
      "SELECT instructor_id, first_name, last_name, email FROM instructors WHERE instructor_id = $1",
      [instructorId],
    ),
  );
  if (!instructor) notFound();

  return (
    <>
      <PageHeader
        title={`Edit ${instructor.first_name} ${instructor.last_name}`}
        actions={
          <Link href="/instructors" className={btnSecondary}>
            Back to instructors
          </Link>
        }
      />
      <Card className="max-w-2xl">
        <ActionForm action={updateInstructor.bind(null, instructor.instructor_id)} submitLabel="Save changes">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" name="first_name" required maxLength={60} defaultValue={instructor.first_name} />
            <Field label="Last name" name="last_name" required maxLength={60} defaultValue={instructor.last_name} />
          </div>
          <Field label="E-mail" name="email" type="email" required maxLength={120} defaultValue={instructor.email} />
        </ActionForm>
      </Card>
    </>
  );
}
