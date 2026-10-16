"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, type ActionState } from "@/lib/action-state";
import { friendlyDbError, withDb, type Db } from "@/lib/db";
import { requireRole, STAFF } from "@/lib/session";
import { parseForm } from "@/lib/validate";

const studentNo = z.string().trim().min(1, "Student number is required.").max(20);
const sectionId = (label: string) => z.coerce.number().int().positive(`Select ${label}.`);

const enrollSchema = z.object({ student_no: studentNo, section_id: sectionId("a section") });
const transferSchema = z.object({
  student_no: studentNo,
  from_section_id: sectionId("the current section"),
  to_section_id: sectionId("the new section"),
});

async function findStudentId(db: Db, no: string): Promise<number | null> {
  const row = await db.one<{ student_id: number }>("SELECT student_id FROM students WHERE student_no = $1", [no]);
  return row?.student_id ?? null;
}

/** Calls the stored procedure sp_enroll_student (atomic: capacity, duplicate and status checks). */
export async function enrollStudent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(...STAFF);
  const parsed = parseForm(enrollSchema, formData);
  if (!parsed.ok) return fail(parsed.error);
  try {
    const found = await withDb(user, async (db) => {
      const id = await findStudentId(db, parsed.data.student_no);
      if (id === null) return false;
      await db.query("CALL sp_enroll_student($1::int, $2::int)", [id, parsed.data.section_id]);
      return true;
    });
    if (!found) return fail("No student found with that student number.");
  } catch (err) {
    return fail(friendlyDbError(err));
  }
  revalidatePath("/enrollments");
  return ok("Student enrolled.");
}

/** Calls sp_transfer_section: the drop and the new enrollment succeed or fail together. */
export async function transferStudent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(...STAFF);
  const parsed = parseForm(transferSchema, formData);
  if (!parsed.ok) return fail(parsed.error);
  try {
    const found = await withDb(user, async (db) => {
      const id = await findStudentId(db, parsed.data.student_no);
      if (id === null) return false;
      await db.query("CALL sp_transfer_section($1::int, $2::int, $3::int)", [id, parsed.data.from_section_id, parsed.data.to_section_id]);
      return true;
    });
    if (!found) return fail("No student found with that student number.");
  } catch (err) {
    return fail(friendlyDbError(err));
  }
  revalidatePath("/enrollments");
  return ok("Student transferred.");
}

export async function dropEnrollment(enrollmentId: number, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  const user = await requireRole(...STAFF);
  try {
    const row = await withDb(user, (db) =>
      db.one("UPDATE enrollments SET status = 'dropped' WHERE enrollment_id = $1 AND status = 'enrolled' RETURNING enrollment_id", [enrollmentId]),
    );
    if (!row) return fail("Only currently enrolled subjects can be dropped.");
  } catch (err) {
    return fail(friendlyDbError(err));
  }
  revalidatePath("/enrollments");
  return ok("Enrollment dropped.");
}
