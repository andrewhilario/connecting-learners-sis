import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

export type Role = "admin" | "registrar" | "student";

export interface SessionUser {
  userId: number;
  username: string;
  role: Role;
  /** Set only for student accounts linked to a student record. */
  studentId: number | null;
}

/** Whitelist: role names are interpolated into SET LOCAL ROLE, so they must never come from user input. */
const DB_ROLE: Record<Role, string> = {
  admin: "sis_admin",
  registrar: "sis_registrar",
  student: "sis_student",
};

const globalForPool = globalThis as unknown as { __sisPool?: Pool };

export function getRawConnectionString(): string | undefined {
  return (
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.POSTGRES_PRISMA_URL?.trim() ||
    process.env.POSTGRES_URL_NON_POOLING?.trim() ||
    process.env.SUPABASE_DB_URL?.trim()
  );
}

function normalizeConnection(rawUrl: string): { connectionString: string; isLocal: boolean } {
  try {
    const parsed = new URL(rawUrl);
    // pg-connection-string treats sslmode=require/prefer as verify-full and overwrites `ssl: { rejectUnauthorized: false }`.
    parsed.searchParams.delete("sslmode");
    parsed.searchParams.delete("ssl");
    parsed.searchParams.delete("uselibpqcompat");
    const host = parsed.hostname.toLowerCase();
    const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
    return { connectionString: parsed.toString(), isLocal };
  } catch {
    const cleaned = rawUrl
      .replace(/([?&])(sslmode|ssl|uselibpqcompat)=[^&]*(&|$)/gi, "$1")
      .replace(/[?&]+$/, "");
    const isLocal = /@(localhost|127\.0\.0\.1)(:|\/)/i.test(cleaned);
    return { connectionString: cleaned, isLocal };
  }
}

function createPool(): Pool {
  const rawUrl = getRawConnectionString();
  if (!rawUrl) {
    throw Object.assign(
      new Error("DATABASE_URL is not configured. Add DATABASE_URL in Vercel Environment Variables and redeploy."),
      { code: "NO_DB_URL" },
    );
  }
  const { connectionString, isLocal } = normalizeConnection(rawUrl);

  let ssl: false | { rejectUnauthorized: boolean; ca?: string } = false;
  if (process.env.DATABASE_SSL_CA) {
    ssl = { rejectUnauthorized: true, ca: process.env.DATABASE_SSL_CA.replace(/\\n/g, "\n") };
  } else if (process.env.DATABASE_SSL?.trim().toLowerCase() === "false") {
    ssl = false;
  } else if (!isLocal || process.env.DATABASE_SSL?.trim().toLowerCase() === "true") {
    // Cloud Postgres (e.g. Supabase pooler) requires TLS and uses an internal CA chain.
    ssl = { rejectUnauthorized: false };
  }

  const pool = new Pool({
    connectionString,
    ssl,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on("error", (err) => console.error("[db] idle client error", err.message));
  return pool;
}

export function getPool(): Pool {
  if (!globalForPool.__sisPool) globalForPool.__sisPool = createPool();
  return globalForPool.__sisPool;
}

export interface Db {
  query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<T[]>;
  /** First row or null. */
  one<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<T | null>;
}

function wrap(client: PoolClient): Db {
  return {
    async query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
      const res = await client.query<T>(text, params);
      return res.rows;
    },
    async one<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
      const res = await client.query<T>(text, params);
      return (res.rows[0] as T | undefined) ?? null;
    },
  };
}

/**
 * Runs `fn` inside one transaction. When a user is supplied (and DB_ENFORCE_ROLES is not "false")
 * the transaction switches to that user's PostgreSQL role, so database privileges and row-level
 * security are enforced in addition to the application checks. The acting user's name is exposed
 * to the audit triggers as `app.current_user`.
 */
export async function withDb<T>(user: SessionUser | null, fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    if (user) {
      if (process.env.DB_ENFORCE_ROLES !== "false") {
        await client.query("SAVEPOINT sp_role");
        try {
          await client.query(`SET LOCAL ROLE ${DB_ROLE[user.role]}`);
          await client.query("RELEASE SAVEPOINT sp_role");
        } catch {
          // If the cloud pooler user cannot SET ROLE, fall back cleanly to app-level role checks.
          await client.query("ROLLBACK TO SAVEPOINT sp_role");
        }
      }
      await client.query("SELECT set_config('app.current_user', $1, true), set_config('app.student_id', $2, true)", [
        user.username,
        user.studentId === null ? "" : String(user.studentId),
      ]);
    }
    const result = await fn(wrap(client));
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      console.error("[db] rollback failed", rollbackErr);
    }
    throw err;
  } finally {
    client.release();
  }
}

const UNIQUE_MESSAGES: Record<string, string> = {
  students_student_no_key: "That student number is already in use.",
  students_email_key: "That e-mail address is already used by another student.",
  students_user_id_key: "That user account is already linked to another student.",
  users_username_key: "That username is already taken.",
  subjects_code_key: "A subject with that code already exists.",
  uq_sections_offering: "That section already exists for this subject and term.",
  uq_enrollments_student_section: "The student is already enrolled in that section.",
  instructors_email_key: "An instructor with that e-mail already exists.",
};

/** Converts a database error into a message that is safe to show to the user. */
export function friendlyDbError(err: unknown): string {
  const e = err as { code?: string; message?: string; constraint?: string };
  if (e?.code === "NO_DB_URL") {
    return "DATABASE_URL is not set. Add DATABASE_URL in your Vercel project Environment Variables and redeploy.";
  }
  switch (e?.code) {
    case "P0001": // RAISE EXCEPTION from our procedures/triggers: written for end users
      return e.message ?? "The operation was rejected.";
    case "23505":
      return UNIQUE_MESSAGES[e.constraint ?? ""] ?? "A record with the same unique value already exists.";
    case "23503":
      return "This record is referenced by other data, or the referenced record does not exist.";
    case "23514":
      return "One of the values is outside the allowed range.";
    case "23502":
      return "A required field is missing.";
    case "22P02":
    case "22007":
    case "22008":
      return "One of the values has an invalid format.";
    case "42501":
      return "You do not have permission to perform this action.";
    case "28P01":
    case "28000":
      return "Database authentication failed. Check the database password inside DATABASE_URL in Vercel.";
    case "3D000":
      return "The database name in DATABASE_URL does not exist (on Supabase, the database name is '/postgres').";
    case "ENOTFOUND":
    case "ENETUNREACH":
    case "ECONNREFUSED":
    case "ETIMEDOUT":
      return "Cannot reach the database host. On Supabase, use the 'Session pooler' connection string (aws-0-...pooler.supabase.com:5432), not the direct db.<ref>.supabase.co host.";
    case "SELF_SIGNED_CERT_IN_CHAIN":
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
      return "Database TLS certificate error. Ensure the latest deployment is active.";
    default:
      console.error("[db] unexpected error", err);
      if (e?.message && /Tenant or user not found/i.test(e.message)) {
        return "Supabase pooler rejected the username/project-ref in DATABASE_URL. Copy the exact 'Session pooler' URI from Supabase -> Connect.";
      }
      if (e?.message && /password authentication failed/i.test(e.message)) {
        return "Database password authentication failed. Check the password in DATABASE_URL.";
      }
      return `Database error${e?.code ? ` (${e.code})` : ""}: ${e?.message ?? "Please check your DATABASE_URL configuration."}`;
  }
}
