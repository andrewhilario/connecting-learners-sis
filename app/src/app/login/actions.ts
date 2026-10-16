"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fail, type ActionState } from "@/lib/action-state";
import { friendlyDbError, withDb, type Role } from "@/lib/db";
import { createSession, destroySession } from "@/lib/session";

const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, "Enter your username.").max(50),
  password: z.string().min(1, "Enter your password.").max(200),
});

// Simple in-memory throttle: 5 failed attempts per username+IP per 15 minutes.
// (Per server instance; use Redis or the DB if you scale to multiple instances.)
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;
const failures = new Map<string, { count: number; resetAt: number }>();

function isBlocked(key: string): boolean {
  const entry = failures.get(key);
  if (!entry) return false;
  if (entry.resetAt < Date.now()) {
    failures.delete(key);
    return false;
  }
  return entry.count >= MAX_FAILS;
}

function recordFailure(key: string): void {
  const now = Date.now();
  const entry = failures.get(key);
  if (!entry || entry.resetAt < now) failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
  else entry.count += 1;
  if (failures.size > 5000) {
    for (const [k, v] of failures) if (v.resetAt < now) failures.delete(k);
  }
}

let dummyHash: string | null = null;

interface LoginRow {
  user_id: number;
  password_hash: string;
  is_active: boolean;
  role: Role;
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({ username: formData.get("username"), password: formData.get("password") });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { username, password } = parsed.data;

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const key = `${ip}|${username}`;
  if (isBlocked(key)) return fail("Too many failed attempts. Please wait 15 minutes and try again.");

  let userId: number | null = null;
  try {
    const row = await withDb(null, (db) =>
      db.one<LoginRow>("SELECT user_id, password_hash, is_active, role FROM users WHERE username = $1", [username]),
    );
    // Always run a bcrypt comparison so response time does not reveal whether the username exists.
    dummyHash ??= await bcrypt.hash("not-a-real-password", 10);
    const valid = await bcrypt.compare(password, row?.password_hash ?? dummyHash);
    if (row && valid && row.is_active) {
      userId = row.user_id;
      await withDb(null, (db) => db.query("UPDATE users SET last_login_at = now() WHERE user_id = $1", [row.user_id]));
    }
  } catch (err) {
    return fail(friendlyDbError(err));
  }

  if (userId === null) {
    recordFailure(key);
    return fail("Invalid username or password.");
  }
  failures.delete(key);
  await createSession(userId);
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
