import "server-only";
import { createHash } from "crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { getRawConnectionString, withDb, type Role, type SessionUser } from "@/lib/db";

const COOKIE_NAME = "sis_session";
const SESSION_HOURS = 8;

function secretKey(): Uint8Array {
  const raw =
    process.env.SESSION_SECRET?.trim() ||
    getRawConnectionString() ||
    "connecting-learners-sis-default-session-secret-2026";
  // Derive a 32-byte (256-bit) key via SHA-256 so any length of SESSION_SECRET works safely with HS256.
  return new Uint8Array(createHash("sha256").update(raw).digest());
}

/** Issues a signed, httpOnly session cookie. Only the user id is stored in the token. */
export async function createSession(userId: number): Promise<void> {
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secretKey());

  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_HOURS * 60 * 60,
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

interface UserRow {
  user_id: number;
  username: string;
  role: Role;
  is_active: boolean;
  student_id: number | null;
}

/**
 * Resolves the logged-in user. The role and active flag are re-read from the database on every
 * request, so deactivating an account or changing its role takes effect immediately.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  let userId: number;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.uid !== "number") return null;
    userId = payload.uid;
  } catch {
    return null;
  }

  try {
    const row = await withDb(null, (db) =>
      db.one<UserRow>(
        `SELECT u.user_id, u.username, u.role, u.is_active, s.student_id
           FROM users u LEFT JOIN students s ON s.user_id = u.user_id
          WHERE u.user_id = $1`,
        [userId],
      ),
    );
    if (!row || !row.is_active) return null;
    return { userId: row.user_id, username: row.username, role: row.role, studentId: row.student_id };
  } catch (err) {
    console.error("[session] failed to load user", err);
    return null;
  }
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Page/action guard. Unauthenticated -> /login; authenticated but wrong role -> /dashboard. */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/dashboard");
  return user;
}

export const STAFF: Role[] = ["admin", "registrar"];
