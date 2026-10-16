import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { btnSecondary } from "@/components/styles";
import { Card, Field, PageHeader } from "@/components/ui";
import { withDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { updateSubject } from "../../actions";

export const metadata: Metadata = { title: "Edit subject" };

export default async function EditSubjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("admin");
  const subjectId = Number.parseInt((await params).id, 10);
  if (!Number.isInteger(subjectId) || subjectId <= 0) notFound();

  const subject = await withDb(user, (db) =>
    db.one<{ code: string; title: string; units: number }>("SELECT code, title, units FROM subjects WHERE subject_id = $1", [subjectId]),
  );
  if (!subject) notFound();

  return (
    <>
      <PageHeader
        title="Edit subject"
        actions={
          <Link href="/subjects" className={btnSecondary}>
            Back to list
          </Link>
        }
      />
      <Card className="max-w-xl">
        <ActionForm action={updateSubject.bind(null, subjectId)} submitLabel="Save changes">
          <Field label="Code" name="code" required maxLength={20} defaultValue={subject.code} />
          <Field label="Title" name="title" required maxLength={150} defaultValue={subject.title} />
          <Field label="Units" name="units" type="number" required min={1} max={6} defaultValue={subject.units} />
        </ActionForm>
      </Card>
    </>
  );
}
