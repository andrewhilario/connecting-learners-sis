"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fail, ok, type ActionState } from "@/lib/action-state";
import { friendlyDbError, withDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { parseForm } from "@/lib/validate";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters.`)
    .transform((v) => (v === "" ? null : v));

const sectionSchema = z.object({
  subject_id: z.coerce.number().int().positive("Select a subject."),
  instructor_id: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .pipe(z.number().int().positive().nullable()),
  section_code: z.string().trim().min(1, "Section code is required.").max(20),
  school_year: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{4}$/, "School year must look like 2026-2027.")
    .refine((v) => Number(v.slice(5)) === Number(v.slice(0, 4)) + 1, "School year must span consecutive years, e.g. 2026-2027."),
  semester: z.coerce.number().int().min(1, "Semester must be 1, 2 or 3 (summer).").max(3, "Semester must be 1, 2 or 3 (summer)."),
  schedule: optionalText(60),
  room: optionalText(20),
  capacity: z.coerce.number().int().min(1, "Capacity must be 1-100.").max(100, "Capacity must be 1-100."),
});

export async function createSection(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const parsed = parseForm(sectionSchema, formData);
  if (!parsed.ok) return fail(parsed.error);
  const d = parsed.data;
  try {
    await withDb(user, (db) =>
      db.query(
        `INSERT INTO sections (subject_id, instructor_id, section_code, school_year, semester, schedule, room, capacity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [d.subject_id, d.instructor_id, d.section_code, d.school_year, d.semester, d.schedule, d.room, d.capacity],
      ),
    );
  } catch (err) {
    return fail(friendlyDbError(err));
  }
  revalidatePath("/sections");
  redirect("/sections");
}

export async function updateSection(sectionId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const parsed = parseForm(sectionSchema, formData);
  if (!parsed.ok) return fail(parsed.error);
  const d = parsed.data;
  try {
    const row = await withDb(user, async (db) => {
      const taken = await db.one<{ n: string }>(
        "SELECT COUNT(*) AS n FROM enrollments WHERE section_id = $1 AND status <> 'dropped'",
        [sectionId],
      );
      if (taken && Number(taken.n) > d.capacity) {
        throw Object.assign(new Error(`Capacity cannot be lower than the ${taken.n} students already enrolled.`), { code: "P0001" });
      }
      return db.one(
        `UPDATE sections SET subject_id=$1, instructor_id=$2, section_code=$3, school_year=$4, semester=$5,
                schedule=$6, room=$7, capacity=$8
          WHERE section_id=$9 RETURNING section_id`,
        [d.subject_id, d.instructor_id, d.section_code, d.school_year, d.semester, d.schedule, d.room, d.capacity, sectionId],
      );
    });
    if (!row) return fail("Section not found.");
  } catch (err) {
    return fail(friendlyDbError(err));
  }
  revalidatePath("/sections");
  return ok("Section saved.");
}

export async function deleteSection(sectionId: number, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  try {
    const result = await withDb(user, async (db) => {
      const n = await db.one<{ n: string }>("SELECT COUNT(*) AS n FROM enrollments WHERE section_id = $1", [sectionId]);
      if (n && Number(n.n) > 0) return "has-enrollments" as const;
      const row = await db.one("DELETE FROM sections WHERE section_id=$1 RETURNING section_id", [sectionId]);
      return row ? ("deleted" as const) : ("missing" as const);
    });
    if (result === "has-enrollments") return fail("This section has enrollment records and cannot be deleted.");
    if (result === "missing") return fail("Section not found.");
  } catch (err) {
    return fail(friendlyDbError(err));
  }
  revalidatePath("/sections");
  return ok("Section deleted.");
}
