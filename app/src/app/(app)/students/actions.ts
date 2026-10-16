"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fail, ok, type ActionState } from "@/lib/action-state";
import { friendlyDbError, withDb } from "@/lib/db";
import { requireRole, STAFF } from "@/lib/session";
import { parseForm } from "@/lib/validate";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters.`)
    .transform((v) => (v === "" ? null : v));

const studentSchema = z.object({
  student_no: z.string().trim().min(1, "Student number is required.").max(20, "Student number is too long."),
  first_name: z.string().trim().min(1, "First name is required.").max(60),
  middle_name: optionalText(60),
  last_name: z.string().trim().min(1, "Last name is required.").max(60),
  email: z.string().trim().toLowerCase().max(120).pipe(z.email("Enter a valid e-mail address.")),
  contact_no: z
    .string()
    .trim()
    .max(20)
    .regex(/^[0-9+\-\s()]*$/, "Contact number may only contain digits, spaces, + - ( ).")
    .transform((v) => (v === "" ? null : v)),
  birth_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Birth date is required.")
    .refine((v) => !Number.isNaN(Date.parse(v)) && v < new Date().toISOString().slice(0, 10), "Birth date must be in the past."),
  program_id: z.coerce.number().int().positive("Select a program."),
  year_level: z.coerce.number().int().min(1, "Year level must be 1-5.").max(5, "Year level must be 1-5."),
  status: z.enum(["active", "inactive", "graduated", "dropped"], { error: "Select a valid status." }),
});

export async function createStudent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(...STAFF);
  const parsed = parseForm(studentSchema, formData);
  if (!parsed.ok) return fail(parsed.error);
  const d = parsed.data;
  try {
    await withDb(user, (db) =>
      db.query(
        `INSERT INTO students (student_no, first_name, middle_name, last_name, email, contact_no, birth_date, program_id, year_level, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [d.student_no, d.first_name, d.middle_name, d.last_name, d.email, d.contact_no, d.birth_date, d.program_id, d.year_level, d.status],
      ),
    );
  } catch (err) {
    return fail(friendlyDbError(err));
  }
  revalidatePath("/students");
  redirect("/students");
}

export async function updateStudent(studentId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(...STAFF);
  const parsed = parseForm(studentSchema, formData);
  if (!parsed.ok) return fail(parsed.error);
  const d = parsed.data;
  try {
    const updated = await withDb(user, (db) =>
      db.one(
        `UPDATE students SET student_no=$1, first_name=$2, middle_name=$3, last_name=$4, email=$5, contact_no=$6,
                birth_date=$7, program_id=$8, year_level=$9, status=$10
          WHERE student_id=$11 RETURNING student_id`,
        [d.student_no, d.first_name, d.middle_name, d.last_name, d.email, d.contact_no, d.birth_date, d.program_id, d.year_level, d.status, studentId],
      ),
    );
    if (!updated) return fail("Student not found.");
  } catch (err) {
    return fail(friendlyDbError(err));
  }
  revalidatePath("/students");
  return ok("Student saved.");
}

export async function deleteStudent(studentId: number, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  try {
    const deleted = await withDb(user, (db) => db.one("DELETE FROM students WHERE student_id=$1 RETURNING student_id", [studentId]));
    if (!deleted) return fail("Student not found.");
  } catch (err) {
    return fail(friendlyDbError(err));
  }
  revalidatePath("/students");
  return ok("Student deleted.");
}
