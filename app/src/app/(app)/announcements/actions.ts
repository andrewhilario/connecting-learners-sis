"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, type ActionState } from "@/lib/action-state";
import { friendlyDbError, withDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { parseForm } from "@/lib/validate";

const schema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(150, "Title is too long (150 max)."),
  body: z.string().trim().min(1, "Message is required.").max(5000, "Message is too long (5000 max)."),
  audience: z.enum(["all", "students", "staff"], { error: "Select an audience." }),
});

export async function postAnnouncement(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const parsed = parseForm(schema, formData);
  if (!parsed.ok) return fail(parsed.error);
  try {
    await withDb(user, (db) =>
      db.query("INSERT INTO announcements (title, body, audience, posted_by) VALUES ($1,$2,$3,$4)", [
        parsed.data.title,
        parsed.data.body,
        parsed.data.audience,
        user.userId,
      ]),
    );
  } catch (err) {
    return fail(friendlyDbError(err));
  }
  revalidatePath("/announcements");
  revalidatePath("/dashboard");
  return ok("Announcement posted.");
}

export async function deleteAnnouncement(announcementId: number, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  try {
    const row = await withDb(user, (db) => db.one("DELETE FROM announcements WHERE announcement_id = $1 RETURNING announcement_id", [announcementId]));
    if (!row) return fail("Announcement not found.");
  } catch (err) {
    return fail(friendlyDbError(err));
  }
  revalidatePath("/announcements");
  revalidatePath("/dashboard");
  return ok("Announcement deleted.");
}
