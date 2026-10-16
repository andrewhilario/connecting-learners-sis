import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { btnSecondary } from "@/components/styles";
import { Card, PageHeader } from "@/components/ui";
import { withDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { updateSection } from "../../actions";
import { SectionFields, type SectionValues } from "../../SectionFields";

export const metadata: Metadata = { title: "Edit section" };

export default async function EditSectionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("admin");
  const sectionId = Number.parseInt((await params).id, 10);
  if (!Number.isInteger(sectionId) || sectionId <= 0) notFound();

  const { section, subjects, instructors } = await withDb(user, async (db) => ({
    section: await db.one<SectionValues>(
      `SELECT subject_id, instructor_id, section_code, school_year, semester, schedule, room, capacity
         FROM sections WHERE section_id = $1`,
      [sectionId],
    ),
    subjects: await db.query<{ subject_id: number; code: string; title: string }>("SELECT subject_id, code, title FROM subjects ORDER BY code"),
    instructors: await db.query<{ instructor_id: number; first_name: string; last_name: string }>(
      "SELECT instructor_id, first_name, last_name FROM instructors ORDER BY last_name, first_name",
    ),
  }));
  if (!section) notFound();

  return (
    <>
      <PageHeader
        title="Edit section"
        actions={
          <Link href="/sections" className={btnSecondary}>
            Back to list
          </Link>
        }
      />
      <Card className="max-w-3xl">
        <ActionForm action={updateSection.bind(null, sectionId)} submitLabel="Save changes">
          <SectionFields subjects={subjects} instructors={instructors} values={section} />
        </ActionForm>
      </Card>
    </>
  );
}
