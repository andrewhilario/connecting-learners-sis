"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fail, ok, type ActionState } from "@/lib/action-state";
import { friendlyDbError, withDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { parseForm } from "@/lib/validate";

const instructorSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required.").max(60, "First name is too long (60 max)."),
  last_name: z.string().trim().min(1, "Last name is required.").max(60, "Last name is too long (60 max)."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(120, "E-mail is too long (120 max).")
    .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "Enter a valid e-mail address."),
});

export async function createInstructor(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const parsed = parseForm(instructorSchema, formData);
  if (!parsed.ok) return fail(parsed.error);

  try {
    await withDb(user, (db) =>
      db.query("INSERT INTO instructors (first_name, last_name, email) VALUES ($1, $2, $3)", [
        parsed.data.first_name,
        parsed.data.last_name,
        parsed.data.email,
      ]),
    );
  } catch (err) {
    return fail(friendlyDbError(err));
  }
  revalidatePath("/instructors");
  revalidatePath("/sections");
  return ok(`Instructor ${parsed.data.first_name} ${parsed.data.last_name} added.`);
}

export async function updateInstructor(instructorId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const parsed = parseForm(instructorSchema, formData);
  if (!parsed.ok) return fail(parsed.error);

  try {
    const updated = await withDb(user, (db) =>
      db.one(
        "UPDATE instructors SET first_name = $1, last_name = $2, email = $3 WHERE instructor_id = $4 RETURNING instructor_id",
        [parsed.data.first_name, parsed.data.last_name, parsed.data.email, instructorId],
      ),
    );
    if (!updated) return fail("Instructor not found.");
  } catch (err) {
    return fail(friendlyDbError(err));
  }
  revalidatePath("/instructors");
  revalidatePath("/sections");
  redirect("/instructors");
}

export async function deleteInstructor(instructorId: number, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  try {
    const deleted = await withDb(user, (db) =>
      db.one("DELETE FROM instructors WHERE instructor_id = $1 RETURNING instructor_id", [instructorId]),
    );
    if (!deleted) return fail("Instructor not found.");
  } catch (err) {
    return fail(friendlyDbError(err));
  }
  revalidatePath("/instructors");
  revalidatePath("/sections");
  return ok("Instructor deleted.");
}
