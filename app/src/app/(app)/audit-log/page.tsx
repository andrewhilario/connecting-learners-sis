import type { Metadata } from "next";
import { btnSecondary, inputCls, tdCls, thCls } from "@/components/styles";
import { Badge, PageHeader, Pagination, Table, first, parsePage, formatDateTime, type SearchParams } from "@/components/ui";
import { withDb } from "@/lib/db";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Audit log" };
const PAGE_SIZE = 20;
const TABLES = ["students", "programs", "subjects", "instructors", "sections", "enrollments", "grades", "users", "announcements"];
const ACTIONS = ["INSERT", "UPDATE", "DELETE"];

type Json = Record<string, unknown> | null;

function summarize(action: string, oldData: Json, newData: Json): string {
  const fmt = (v: unknown) => (v === null || v === undefined ? "null" : String(v));
  if (action === "UPDATE" && oldData && newData) {
    const changes = Object.keys(newData)
      .filter((k) => k !== "updated_at" && JSON.stringify(oldData[k]) !== JSON.stringify(newData[k]))
      .map((k) => `${k}: ${fmt(oldData[k])} -> ${fmt(newData[k])}`);
    return changes.length ? changes.join("; ") : "(no visible change)";
  }
  const row = action === "DELETE" ? oldData : newData;
  if (!row) return "";
  return Object.entries(row)
    .filter(([k]) => !["created_at", "updated_at", "enrolled_at", "recorded_at"].includes(k))
    .slice(0, 6)
    .map(([k, v]) => `${k}: ${fmt(v)}`)
    .join("; ");
}

export default async function AuditLogPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = await requireRole("admin");
  const sp = await searchParams;
  const table = TABLES.includes(first(sp.table)) ? first(sp.table) : "";
  const action = ACTIONS.includes(first(sp.action)) ? first(sp.action) : "";
  const page = parsePage(first(sp.page));

  const rows = await withDb(admin, (db) =>
    db.query<{
      audit_id: string; table_name: string; record_id: string | null; action: string;
      old_data: Json; new_data: Json; changed_by: string; changed_at: Date; total: string;
    }>(
      `SELECT audit_id, table_name, record_id, action, old_data, new_data, changed_by, changed_at, COUNT(*) OVER() AS total
         FROM audit_log
        WHERE ($1::text = '' OR table_name = $1) AND ($2::text = '' OR action = $2)
        ORDER BY audit_id DESC
        LIMIT ${PAGE_SIZE} OFFSET $3`,
      [table, action, (page - 1) * PAGE_SIZE],
    ),
  );
  const total = rows[0] ? Number(rows[0].total) : 0;
  const params: Record<string, string> = {};
  if (table) params.table = table;
  if (action) params.action = action;

  return (
    <>
      <PageHeader title="Audit log" subtitle="Automatic, append-only history of data changes recorded by database triggers." />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="table" className="mb-1 block text-sm font-medium text-slate-700">
            Table
          </label>
          <select id="table" name="table" defaultValue={table} className={inputCls}>
            <option value="">All</option>
            {TABLES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="action" className="mb-1 block text-sm font-medium text-slate-700">
            Action
          </label>
          <select id="action" name="action" defaultValue={action} className={inputCls}>
            <option value="">All</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={btnSecondary}>
          Filter
        </button>
      </form>

      <Table
        caption="Audit log"
        empty={rows.length === 0}
        head={
          <>
            <th className={thCls}>When</th>
            <th className={thCls}>By</th>
            <th className={thCls}>Table</th>
            <th className={thCls}>Record</th>
            <th className={thCls}>Action</th>
            <th className={thCls}>Details</th>
          </>
        }
      >
        {rows.map((r) => (
          <tr key={r.audit_id}>
            <td className={`${tdCls} whitespace-nowrap`}>{formatDateTime(r.changed_at)}</td>
            <td className={tdCls}>{r.changed_by}</td>
            <td className={tdCls}>{r.table_name}</td>
            <td className={tdCls}>{r.record_id}</td>
            <td className={tdCls}>
              <Badge value={r.action === "DELETE" ? "dropped" : r.action === "INSERT" ? "active" : "enrolled"} />
              <span className="ml-1 text-xs">{r.action}</span>
            </td>
            <td className={`${tdCls} max-w-md break-words text-xs`}>{summarize(r.action, r.old_data, r.new_data)}</td>
          </tr>
        ))}
      </Table>
      <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} basePath="/audit-log" params={params} />
    </>
  );
}
