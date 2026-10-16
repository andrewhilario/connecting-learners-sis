import type { Role } from "@/lib/db";

/** Which announcement audiences each role may read. */
export const AUDIENCES: Record<Role, string[]> = {
  admin: ["all", "students", "staff"],
  registrar: ["all", "staff"],
  student: ["all", "students"],
};
