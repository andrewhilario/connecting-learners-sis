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

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  }
  let ssl: false | { rejectUnauthorized: boolean; ca?: string } = false;
  if (process.env.DATABASE_SSL_CA) {
    ssl = { rejectUnauthorized: true, ca: process.env.DATABASE_SSL_CA.replace(/\\n/g, "\n") };
  } else if (process.env.DATABASE_SSL === "true") {
    // Encrypted, but the server certificate is not verified. Provide DATABASE_SSL_CA to verify it.
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

function getPool(): Pool {
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
        await client.query(`SET LOCAL ROLE ${DB_ROLE[user.role]}`);
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
    default:
      console.error("[db] unexpected error", err);
      return "Something went wrong. Please try again.";
  }
}
