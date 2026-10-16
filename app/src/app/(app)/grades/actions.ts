"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, type ActionState } from "@/lib/action-state";
import { friendlyDbError, withDb } from "@/lib/db";
import { requireRole, STAFF } from "@/lib/session";

const ALLOWED = new Set(["1.00", "1.25", "1.50", "1.75", "2.00", "2.25", "2.50", "2.75", "3.00", "5.00"]);

/** Saves all grade inputs (fields named g_<enrollmentId>) for one section. Blank inputs are left unchanged. */
export async function saveGrades(sectionId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(...STAFF);

  const entries: { enrollmentId: number; value: string }[] = [];
  for (const [key, raw] of formData.entries()) {
    const m = /^g_(\d+)$/.exec(key);
    if (!m || typeof raw !== "string" || raw === "") continue;
    if (!ALLOWED.has(raw)) return fail(`"${raw}" is not a valid grade.`);
    entries.push({ enrollmentId: Number(m[1]), value: raw });
  }
  if (entries.length === 0) return fail("Enter at least one grade to save.");

  try {
    const saved = await withDb(user, async (db) => {
      const valid = await db.query<{ enrollment_id: number }>(
        "SELECT enrollment_id FROM enrollments WHERE section_id = $1 AND status <> 'dropped'",
        [sectionId],
      );
      const validIds = new Set(valid.map((r) => r.enrollment_id));
      let changed = 0;
      for (const e of entries) {
        if (!validIds.has(e.enrollmentId)) throw Object.assign(new Error("One of the students is not enrolled in this section."), { code: "P0001" });
        const rows = await db.query(
          `INSERT INTO grades (enrollment_id, grade_value, recorded_by) VALUES ($1, $2::numeric, $3)
           ON CONFLICT (enrollment_id) DO UPDATE
              SET grade_value = EXCLUDED.grade_value, recorded_by = EXCLUDED.recorded_by, recorded_at = now()
            WHERE grades.grade_value IS DISTINCT FROM EXCLUDED.grade_value
           RETURNING grade_id`,
          [e.enrollmentId, e.value, user.userId],
        );
        changed += rows.length;
      }
      return changed;
    });
    revalidatePath("/grades");
    return ok(saved === 0 ? "No changes to save." : `Saved ${saved} grade${saved === 1 ? "" : "s"}.`);
  } catch (err) {
    return fail(friendlyDbError(err));
  }
}
