"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fail, ok, type ActionState } from "@/lib/action-state";
import { friendlyDbError, withDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { parseForm } from "@/lib/validate";

const programSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,10}$/, "Program code must be 2-10 uppercase letters, digits, or hyphens (e.g. BSIT)."),
  name: z.string().trim().min(3, "Program name is required.").max(120, "Program name is too long (120 max)."),
});

export async function createProgram(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const parsed = parseForm(programSchema, formData);
  if (!parsed.ok) return fail(parsed.error);

  try {
    await withDb(user, (db) =>
      db.query("INSERT INTO programs (code, name) VALUES ($1, $2)", [parsed.data.code, parsed.data.name]),
    );
  } catch (err) {
    return fail(friendlyDbError(err));
  }
  revalidatePath("/programs");
  revalidatePath("/students");
  revalidatePath("/reports");
  return ok(`Program ${parsed.data.code} added.`);
}

export async function updateProgram(programId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const parsed = parseForm(programSchema, formData);
  if (!parsed.ok) return fail(parsed.error);

  try {
    const updated = await withDb(user, (db) =>
      db.one("UPDATE programs SET code = $1, name = $2 WHERE program_id = $3 RETURNING program_id", [
        parsed.data.code,
        parsed.data.name,
        programId,
      ]),
    );
    if (!updated) return fail("Program not found.");
  } catch (err) {
    return fail(friendlyDbError(err));
  }
  revalidatePath("/programs");
  revalidatePath("/students");
  revalidatePath("/reports");
  redirect("/programs");
}

export async function deleteProgram(programId: number, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  try {
    const deleted = await withDb(user, (db) =>
      db.one("DELETE FROM programs WHERE program_id = $1 RETURNING program_id", [programId]),
    );
    if (!deleted) return fail("Program not found.");
  } catch (err) {
    return fail(friendlyDbError(err));
  }
  revalidatePath("/programs");
  revalidatePath("/students");
  revalidatePath("/reports");
  return ok("Program deleted.");
}
