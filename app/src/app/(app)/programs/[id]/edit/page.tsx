import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { btnSecondary } from "@/components/styles";
import { Card, Field, PageHeader } from "@/components/ui";
import { withDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { updateProgram } from "../../actions";

export const metadata: Metadata = { title: "Edit program" };

export default async function EditProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("admin");
  const { id } = await params;
  const programId = Number.parseInt(id, 10);
  if (!Number.isInteger(programId) || programId <= 0) notFound();

  const program = await withDb(user, (db) =>
    db.one<{ program_id: number; code: string; name: string }>(
      "SELECT program_id, code, name FROM programs WHERE program_id = $1",
      [programId],
    ),
  );
  if (!program) notFound();

  return (
    <>
      <PageHeader
        title={`Edit ${program.code}`}
        actions={
          <Link href="/programs" className={btnSecondary}>
            Back to programs
          </Link>
        }
      />
      <Card className="max-w-2xl">
        <ActionForm action={updateProgram.bind(null, program.program_id)} submitLabel="Save changes">
          <Field label="Program code" name="code" required maxLength={10} defaultValue={program.code} />
          <Field label="Full degree title" name="name" required maxLength={120} defaultValue={program.name} />
        </ActionForm>
      </Card>
    </>
  );
}
