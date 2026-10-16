"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, type ActionState } from "@/lib/action-state";
import { friendlyDbError, withDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { parseForm } from "@/lib/validate";

const password = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(72, "Password must be at most 72 characters.")
  .regex(/[A-Za-z]/, "Password must contain a letter.")
  .regex(/[0-9]/, "Password must contain a digit.");

const createSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,50}$/, "Username must be 3-50 characters: letters, digits, dot, underscore, hyphen."),
  password,
  role: z.enum(["admin", "registrar", "student"], { error: "Select a role." }),
  student_no: z.string().trim().max(20),
});

export async function createUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireRole("admin");
  const parsed = parseForm(createSchema, formData);
  if (!parsed.ok) return fail(parsed.error);
  const d = parsed.data;
  if (d.role !== "student" && d.student_no) return fail("Only student accounts can be linked to a student number.");

  const hash = await bcrypt.hash(d.password, 10);
  try {
    await withDb(admin, async (db) => {
      const created = await db.one<{ user_id: number }>(
        "INSERT INTO users (username, password_hash, role) VALUES ($1,$2,$3) RETURNING user_id",
        [d.username, hash, d.role],
      );
      if (d.role === "student" && d.student_no) {
        const linked = await db.one(
          "UPDATE students SET user_id = $1 WHERE student_no = $2 AND user_id IS NULL RETURNING student_id",
          [created!.user_id, d.student_no],
        );
        if (!linked) {
          throw Object.assign(new Error("Student number not found, or that student already has an account."), { code: "P0001" });
        }
      }
    });
  } catch (err) {
    return fail(friendlyDbError(err));
  }
  revalidatePath("/users");
  return ok(`User "${d.username}" created.`);
}

const resetSchema = z.object({ password });

export async function resetPassword(userId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireRole("admin");
  const parsed = parseForm(resetSchema, formData);
  if (!parsed.ok) return fail(parsed.error);
  const hash = await bcrypt.hash(parsed.data.password, 10);
  try {
    const row = await withDb(admin, (db) => db.one("UPDATE users SET password_hash = $1 WHERE user_id = $2 RETURNING user_id", [hash, userId]));
    if (!row) return fail("User not found.");
  } catch (err) {
    return fail(friendlyDbError(err));
  }
  return ok("Password updated.");
}

export async function setUserActive(userId: number, active: boolean, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  const admin = await requireRole("admin");
  if (userId === admin.userId) return fail("You cannot deactivate your own account.");
  try {
    const row = await withDb(admin, (db) => db.one("UPDATE users SET is_active = $1 WHERE user_id = $2 RETURNING user_id", [active, userId]));
    if (!row) return fail("User not found.");
  } catch (err) {
    return fail(friendlyDbError(err));
  }
  revalidatePath("/users");
  return ok(active ? "User activated." : "User deactivated.");
}
