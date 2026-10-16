import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { btnSecondary } from "@/components/styles";
import { Card, PageHeader } from "@/components/ui";
import { withDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { createSection } from "../actions";
import { SectionFields } from "../SectionFields";

export const metadata: Metadata = { title: "Add section" };

export default async function NewSectionPage() {
  const user = await requireRole("admin");
  const { subjects, instructors } = await withDb(user, async (db) => ({
    subjects: await db.query<{ subject_id: number; code: string; title: string }>("SELECT subject_id, code, title FROM subjects ORDER BY code"),
    instructors: await db.query<{ instructor_id: number; first_name: string; last_name: string }>(
      "SELECT instructor_id, first_name, last_name FROM instructors ORDER BY last_name, first_name",
    ),
  }));

  return (
    <>
      <PageHeader
        title="Add section"
        actions={
          <Link href="/sections" className={btnSecondary}>
            Back to list
          </Link>
        }
      />
      <Card className="max-w-3xl">
        <ActionForm action={createSection} submitLabel="Create section">
          <SectionFields subjects={subjects} instructors={instructors} />
        </ActionForm>
      </Card>
    </>
  );
}
