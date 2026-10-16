import "server-only";
import { promises as dns } from "dns";
import { Client, Pool, type PoolClient, type QueryResultRow } from "pg";

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

const globalForPool = globalThis as unknown as {
  __sisPool?: Pool;
  __sisPoolPromise?: Promise<Pool>;
};

export function getRawConnectionString(): string | undefined {
  return (
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.POSTGRES_PRISMA_URL?.trim() ||
    process.env.POSTGRES_URL_NON_POOLING?.trim() ||
    process.env.SUPABASE_DB_URL?.trim()
  );
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

interface ParsedDbConfig {
  user: string;
  password?: string;
  host: string;
  port: number;
  database: string;
  isLocal: boolean;
}

/**
 * Parses a PostgreSQL connection string without relying on `new URL()`, which throws
 * `ERR_INVALID_URL` whenever a database password contains raw `#`, `?`, `/`, or `[...]` characters.
 */
function parseConnectionUrl(rawUrl: string): ParsedDbConfig {
  let s = rawUrl.replace(/[\r\n]+/g, "").trim();
  s = s.replace(/^(DATABASE_URL|POSTGRES_URL|SUPABASE_DB_URL)\s*=\s*/i, "").trim();
  s = s.replace(/^psql\s+/i, "").trim();
  while (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'")) ||
    (s.startsWith("`") && s.endsWith("`"))
  ) {
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/^jdbc:/i, "");

  if (/^https?:\/\//i.test(s)) {
    throw Object.assign(
      new Error(
        "DATABASE_URL is set to an HTTP URL (https://...) instead of a PostgreSQL URI (postgresql://...). In Supabase, click 'Connect' (top bar) -> 'Session pooler' and copy the postgresql:// string.",
      ),
      { code: "INVALID_DB_URL_FORMAT" },
    );
  }
  if (/^eyJ[A-Za-z0-9_-]+\./.test(s) || /^sb_publishable_|^sbp_/.test(s)) {
    throw Object.assign(
      new Error(
        "DATABASE_URL is set to a Supabase API key instead of a PostgreSQL connection string. In Supabase, click 'Connect' (top bar) -> 'Session pooler' and copy the postgresql:// string.",
      ),
      { code: "INVALID_DB_URL_FORMAT" },
    );
  }

  // Handle key=value libpq style if someone pasted `host=... user=...`
  if (!/^[a-z]+:\/\//i.test(s) && /\bhost\s*=/i.test(s)) {
    const kv = Object.fromEntries(
      Array.from(s.matchAll(/(\w+)\s*=\s*('[^']*'|"[^"]*"|\S+)/g), (m) => [
        m[1].toLowerCase(),
        m[2].replace(/^['"]|['"]$/g, ""),
      ]),
    );
    const host = kv.host ?? "localhost";
    const port = Number.parseInt(kv.port ?? "5432", 10) || 5432;
    const user = kv.user ?? "postgres";
    const password = kv.password ?? "";
    const database = kv.dbname ?? kv.database ?? "postgres";
    const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
    return { user, password, host, port, database, isLocal };
  }

  const withoutScheme = s.replace(/^postgres(?:ql)?:\/\//i, "");
  const lastAt = withoutScheme.lastIndexOf("@");
  if (lastAt === -1) {
    throw Object.assign(
      new Error(
        "DATABASE_URL is not a complete PostgreSQL URI (missing 'user:password@host'). Copy the full 'postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres' string from Supabase -> Connect -> Session pooler.",
      ),
      { code: "INVALID_DB_URL_FORMAT" },
    );
  }

  const userInfo = withoutScheme.slice(0, lastAt);
  const hostAndRest = withoutScheme.slice(lastAt + 1);

  const firstColon = userInfo.indexOf(":");
  const rawUser = firstColon === -1 ? userInfo : userInfo.slice(0, firstColon);
  let rawPassword = firstColon === -1 ? "" : userInfo.slice(firstColon + 1);

  // Strip accidental square brackets from Supabase's `[YOUR-PASSWORD]` template.
  if (rawPassword.startsWith("[") && rawPassword.endsWith("]")) {
    rawPassword = rawPassword.slice(1, -1);
  }
  if (/^YOUR[-_]?PASSWORD$/i.test(rawPassword)) {
    throw Object.assign(
      new Error(
        "DATABASE_URL in Vercel still has the '[YOUR-PASSWORD]' placeholder. Replace [YOUR-PASSWORD] with your actual Supabase database password and redeploy.",
      ),
      { code: "INVALID_DB_URL_FORMAT" },
    );
  }

  const user = decodeSafe(rawUser.replace(/^\[|\]$/g, ""));
  const password = decodeSafe(rawPassword);

  const pathPart = hostAndRest.split(/[?#]/)[0] ?? "";
  const slashIdx = pathPart.indexOf("/");
  const hostPort = (slashIdx === -1 ? pathPart : pathPart.slice(0, slashIdx)).trim();
  const rawDb = slashIdx === -1 ? "postgres" : pathPart.slice(slashIdx + 1).trim();
  const database = decodeSafe(rawDb) || "postgres";

  const colonIdx = hostPort.lastIndexOf(":");
  const rawHost = colonIdx === -1 ? hostPort : hostPort.slice(0, colonIdx);
  const portStr = colonIdx === -1 ? "5432" : hostPort.slice(colonIdx + 1);
  const host = rawHost.replace(/^\[|\]$/g, "").trim();
  const port = Number.parseInt(portStr, 10) || 5432;

  if (!host || /YOUR[-_]?HOST/i.test(host)) {
    throw Object.assign(
      new Error(
        "DATABASE_URL in Vercel is missing a valid database hostname. Copy the 'Session pooler' URI from Supabase -> Connect.",
      ),
      { code: "INVALID_DB_URL_FORMAT" },
    );
  }

  const lowerHost = host.toLowerCase();
  const isLocal = lowerHost === "localhost" || lowerHost === "127.0.0.1" || lowerHost === "::1";
  return { user, password, host, port, database, isLocal };
}

const IPV6_PREFIX_TO_AWS_REGION: Array<[string, string]> = [
  ["2406:da18:", "ap-southeast-1"],
  ["2406:da14:", "ap-northeast-1"],
  ["2406:da12:", "ap-northeast-2"],
  ["2406:da1a:", "ap-south-1"],
  ["2406:da1c:", "ap-southeast-2"],
  ["2600:1f18:", "us-east-1"],
  ["2600:1f16:", "us-east-2"],
  ["2600:1f1c:", "us-west-1"],
  ["2600:1f14:", "us-west-2"],
  ["2a05:d014:", "eu-central-1"],
  ["2a05:d018:", "eu-west-1"],
  ["2a05:d01c:", "eu-west-2"],
  ["2a05:d012:", "eu-west-3"],
  ["2a05:d016:", "eu-north-1"],
  ["2a05:d022:", "eu-central-2"],
  ["2600:1f1e:", "sa-east-1"],
  ["2600:1f1a:", "ca-central-1"],
];

const SUPABASE_REGIONS = [
  "ap-southeast-1",
  "us-east-1",
  "ap-northeast-1",
  "ap-southeast-2",
  "ap-northeast-2",
  "ap-south-1",
  "us-west-1",
  "us-west-2",
  "us-east-2",
  "eu-central-1",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-north-1",
  "eu-central-2",
  "sa-east-1",
  "ca-central-1",
];

async function probePoolerHost(
  candidateHost: string,
  user: string,
  password: string | undefined,
  database: string,
): Promise<{ status: "ok"; host: string } | { status: "auth_error"; host: string; err: unknown } | { status: "not_found" }> {
  const client = new Client({
    host: candidateHost,
    port: 5432,
    user,
    password,
    database,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 3500,
  });
  try {
    await client.connect();
    await client.end().catch(() => {});
    return { status: "ok", host: candidateHost };
  } catch (err) {
    const e = err as { code?: string; message?: string };
    const msg = e?.message ?? "";
    if (e?.code === "28P01" || e?.code === "28000" || /password authentication failed|circuit breaker/i.test(msg)) {
      return { status: "auth_error", host: candidateHost, err };
    }
    return { status: "not_found" };
  }
}

/**
 * If the user configured Supabase's IPv6-only direct connection (`db.<project-ref>.supabase.co`),
 * Vercel (IPv4-only) cannot reach it directly. This automatically resolves the project's IPv4
 * Supavisor Session Pooler (`aws-{0|1}-<region>.pooler.supabase.com:5432`) and rewrites the user
 * to `postgres.<project-ref>`.
 */
async function resolveSupabaseDirectHost(cfg: ParsedDbConfig): Promise<ParsedDbConfig> {
  const directMatch = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(cfg.host);
  if (!directMatch) return cfg;

  const projectRef = directMatch[1].toLowerCase();
  const poolerUser = cfg.user.includes(".") ? cfg.user : `${cfg.user}.${projectRef}`;

  // 1. Try to identify the exact AWS region from the IPv6 AAAA record of db.<ref>.supabase.co.
  let hintedRegion: string | null = null;
  try {
    const ipv6List = await Promise.race([
      dns.resolve6(cfg.host),
      new Promise<string[]>((_, reject) => setTimeout(() => reject(new Error("dns timeout")), 1500)),
    ]);
    const addr = (ipv6List[0] ?? "").toLowerCase();
    for (const [prefix, region] of IPV6_PREFIX_TO_AWS_REGION) {
      if (addr.startsWith(prefix)) {
        hintedRegion = region;
        break;
      }
    }
  } catch {
    // Ignore DNS lookup failure; we will probe the pooler regions directly.
  }

  if (hintedRegion) {
    const fastCandidates = [
      `aws-0-${hintedRegion}.pooler.supabase.com`,
      `aws-1-${hintedRegion}.pooler.supabase.com`,
    ];
    const fastResults = await Promise.all(
      fastCandidates.map((h) => probePoolerHost(h, poolerUser, cfg.password, cfg.database)),
    );
    for (const res of fastResults) {
      if (res.status === "ok") {
        return { ...cfg, user: poolerUser, host: res.host, port: 5432, isLocal: false };
      }
      if (res.status === "auth_error") {
        throw res.err;
      }
    }
  }

  // 2. Probe all Supabase regions in parallel.
  const allCandidates: string[] = [];
  for (const r of SUPABASE_REGIONS) {
    if (r === hintedRegion) continue;
    allCandidates.push(`aws-0-${r}.pooler.supabase.com`, `aws-1-${r}.pooler.supabase.com`);
  }
  const allResults = await Promise.all(
    allCandidates.map((h) => probePoolerHost(h, poolerUser, cfg.password, cfg.database)),
  );
  for (const res of allResults) {
    if (res.status === "ok") {
      return { ...cfg, user: poolerUser, host: res.host, port: 5432, isLocal: false };
    }
    if (res.status === "auth_error") {
      throw res.err;
    }
  }

  throw Object.assign(
    new Error(
      `DATABASE_URL uses the direct host '${cfg.host}', which cannot be reached from Vercel (IPv4) and project '${projectRef}' was not found on any active Supabase pooler. Make sure your Supabase project is not paused, then copy the 'Session pooler' URI from Supabase -> Connect.`,
    ),
    { code: "INVALID_DB_URL_FORMAT" },
  );
}

async function createPool(): Promise<Pool> {
  const rawUrl = getRawConnectionString();
  if (!rawUrl) {
    throw Object.assign(
      new Error("DATABASE_URL is not configured. Add DATABASE_URL in Vercel Environment Variables and redeploy."),
      { code: "NO_DB_URL" },
    );
  }
  const parsed = parseConnectionUrl(rawUrl);
  const { user, password, host, port, database, isLocal } = await resolveSupabaseDirectHost(parsed);

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
    user,
    password,
    host,
    port,
    database,
    ssl,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on("error", (err) => console.error("[db] idle client error", err.message));
  return pool;
}

export async function getPool(): Promise<Pool> {
  if (globalForPool.__sisPool) return globalForPool.__sisPool;
  if (!globalForPool.__sisPoolPromise) {
    globalForPool.__sisPoolPromise = createPool()
      .then((pool) => {
        globalForPool.__sisPool = pool;
        return pool;
      })
      .catch((err) => {
        globalForPool.__sisPoolPromise = undefined;
        throw err;
      });
  }
  return globalForPool.__sisPoolPromise;
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
  const pool = await getPool();
  const client = await pool.connect();
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
  const e = err as { code?: string; message?: string; constraint?: string; hostname?: string; address?: string };
  if (e?.code === "NO_DB_URL" || e?.code === "INVALID_DB_URL_FORMAT") {
    return e.message ?? "DATABASE_URL is not configured properly.";
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
    case "ETIMEDOUT": {
      const target = e?.hostname || e?.address || "";
      return `Cannot reach the database host${target ? ` (${target})` : ""}. On Supabase, click 'Connect' -> 'Session pooler' (aws-0-...pooler.supabase.com:5432) instead of the direct connection.`;
    }
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
