import "server-only";
import type { ZodType } from "zod";

export type Parsed<T> = { ok: true; data: T } | { ok: false; error: string };

/** Validates form data against a zod schema and returns the first human-readable error. */
export function parseForm<T>(schema: ZodType<T>, formData: FormData): Parsed<T> {
  const raw: Record<string, FormDataEntryValue> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION")) continue; // internal React/Next fields
    raw[key] = value;
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    return { ok: false, error: issue?.message ?? "Invalid input." };
  }
  return { ok: true, data: result.data };
}
