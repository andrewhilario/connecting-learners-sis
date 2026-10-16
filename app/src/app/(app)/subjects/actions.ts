"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fail, ok, type ActionState } from "@/lib/action-state";
import { friendlyDbError, withDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { parseForm } from "@/lib/validate";

const subjectSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, "Subject code is required.")
    .max(20, "Subject code is too long.")
    .regex(/^[A-Z0-9 -]+$/, "Subject code may only contain letters, digits, spaces and hyphens."),
  title: z.string().trim().min(1, "Title is required.").max(150),
  units: z.coerce.number().int("Units must be a whole number.").min(1, "Units must be 1-6.").max(6, "Units must be 1-6."),
});

export async function createSubject(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const parsed = parseForm(subjectSchema, formData);
  if (!parsed.ok) return fail(parsed.error);
  try {
    await withDb(user, (db) =>
      db.query("INSERT INTO subjects (code, title, units) VALUES ($1,$2,$3)", [parsed.data.code, parsed.data.title, parsed.data.units]),
    );
  } catch (err) {
    return fail(friendlyDbError(err));
  }
  revalidatePath("/subjects");
  return ok("Subject added.");
}

export async function updateSubject(subjectId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const parsed = parseForm(subjectSchema, formData);
  if (!parsed.ok) return fail(parsed.error);
  try {
    const row = await withDb(user, (db) =>
      db.one("UPDATE subjects SET code=$1, title=$2, units=$3 WHERE subject_id=$4 RETURNING subject_id", [
        parsed.data.code,
        parsed.data.title,
        parsed.data.units,
        subjectId,
      ]),
    );
    if (!row) return fail("Subject not found.");
  } catch (err) {
    return fail(friendlyDbError(err));
  }
  revalidatePath("/subjects");
  redirect("/subjects");
}

export async function deleteSubject(subjectId: number, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  try {
    const row = await withDb(user, (db) => db.one("DELETE FROM subjects WHERE subject_id=$1 RETURNING subject_id", [subjectId]));
    if (!row) return fail("Subject not found.");
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "23503") return fail("This subject has sections and cannot be deleted. Delete its sections first.");
    return fail(friendlyDbError(err));
  }
  revalidatePath("/subjects");
  return ok("Subject deleted.");
}
