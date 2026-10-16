import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { btnSecondary } from "@/components/styles";
import { Card, PageHeader } from "@/components/ui";
import { withDb } from "@/lib/db";
import { requireRole, STAFF } from "@/lib/session";
import { createStudent } from "../actions";
import { StudentFields } from "../StudentFields";

export const metadata: Metadata = { title: "Add student" };

export default async function NewStudentPage() {
  const user = await requireRole(...STAFF);
  const programs = await withDb(user, (db) => db.query<{ program_id: number; code: string; name: string }>("SELECT program_id, code, name FROM programs ORDER BY code"));

  return (
    <>
      <PageHeader
        title="Add student"
        actions={
          <Link href="/students" className={btnSecondary}>
            Back to list
          </Link>
        }
      />
      <Card className="max-w-3xl">
        <ActionForm action={createStudent} submitLabel="Create student">
          <StudentFields programs={programs} />
        </ActionForm>
      </Card>
    </>
  );
}
