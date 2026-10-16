"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, type ActionState } from "@/lib/action-state";
import { friendlyDbError, withDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { parseForm } from "@/lib/validate";

const passwordChangeSchema = z.object({
  current_password: z.string().min(1, "Enter your current password.").max(200),
  new_password: z
    .string()
    .min(8, "New password must be at least 8 characters.")
    .max(72, "New password must be at most 72 characters.")
    .regex(/[A-Za-z]/, "New password must contain at least one letter.")
    .regex(/[0-9]/, "New password must contain at least one digit."),
  confirm_password: z.string().min(1, "Confirm your new password.").max(72),
});

export async function changeOwnPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parseForm(passwordChangeSchema, formData);
  if (!parsed.ok) return fail(parsed.error);

  const { current_password, new_password, confirm_password } = parsed.data;
  if (new_password !== confirm_password) {
    return fail("New password and confirmation do not match.");
  }
  if (current_password === new_password) {
    return fail("New password must be different from your current password.");
  }

  try {
    // Use system connection (null) because non-admin roles do not have direct table privileges on `users`,
    // while strictly scoping the update to `user.userId` and recording `app.current_user` for the audit trigger.
    const row = await withDb(null, (db) =>
      db.one<{ password_hash: string }>("SELECT password_hash FROM users WHERE user_id = $1", [user.userId]),
    );
    if (!row) return fail("User account not found.");

    const matches = await bcrypt.compare(current_password, row.password_hash);
    if (!matches) return fail("Your current password is incorrect.");

    const newHash = await bcrypt.hash(new_password, 10);
    await withDb(null, async (db) => {
      await db.query("SELECT set_config('app.current_user', $1, true)", [user.username]);
      await db.query("UPDATE users SET password_hash = $1 WHERE user_id = $2", [newHash, user.userId]);
    });
  } catch (err) {
    return fail(friendlyDbError(err));
  }

  revalidatePath("/account");
  return ok("Your password has been updated.");
}
