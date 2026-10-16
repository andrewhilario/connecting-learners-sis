import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmActionButton } from "@/components/ActionForm";
import { btnPrimary, btnSecondary, inputCls, tdCls, thCls } from "@/components/styles";
import { Badge, PageHeader, Pagination, Table, first, likePattern, parsePage, type SearchParams } from "@/components/ui";
import { withDb } from "@/lib/db";
import { requireRole, STAFF } from "@/lib/session";
import { deleteStudent } from "./actions";

export const metadata: Metadata = { title: "Students" };
const PAGE_SIZE = 10;

interface Row {
  student_id: number;
  student_no: string;
  last_name: string;
  first_name: string;
  email: string;
  program: string;
  year_level: number;
  status: string;
  total: string;
}

export default async function StudentsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireRole(...STAFF);
  const sp = await searchParams;
  const q = first(sp.q).trim().slice(0, 100);
  const status = ["active", "inactive", "graduated", "dropped"].includes(first(sp.status)) ? first(sp.status) : "";
  const programId = Number.parseInt(first(sp.program), 10);
  const page = parsePage(first(sp.page));

  const { rows, programs } = await withDb(user, async (db) => ({
    rows: await db.query<Row>(
      `SELECT s.student_id, s.student_no, s.last_name, s.first_name, s.email, p.code AS program, s.year_level, s.status,
              COUNT(*) OVER() AS total
         FROM students s JOIN programs p ON p.program_id = s.program_id
        WHERE ($1::text = '' OR s.student_no ILIKE $2 OR s.first_name ILIKE $2 OR s.last_name ILIKE $2
               OR s.email ILIKE $2 OR (s.first_name || ' ' || s.last_name) ILIKE $2)
          AND ($3::int IS NULL OR s.program_id = $3)
          AND ($4::text = '' OR s.status = $4)
        ORDER BY s.last_name, s.first_name, s.student_id
        LIMIT ${PAGE_SIZE} OFFSET $5`,
      [q, likePattern(q), Number.isFinite(programId) ? programId : null, status, (page - 1) * PAGE_SIZE],
    ),
    programs: await db.query<{ program_id: number; code: string }>("SELECT program_id, code FROM programs ORDER BY code"),
  }));

  const total = rows[0] ? Number(rows[0].total) : 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const params: Record<string, string> = {};
  if (q) params.q = q;
  if (status) params.status = status;
  if (Number.isFinite(programId)) params.program = String(programId);

  return (
    <>
      <PageHeader
        title="Students"
        subtitle={`${total} record${total === 1 ? "" : "s"} found`}
        actions={
          <Link href="/students/new" className={btnPrimary}>
            Add student
          </Link>
        }
      />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3" role="search">
        <div className="min-w-56 flex-1">
          <label htmlFor="q" className="mb-1 block text-sm font-medium text-slate-700">
            Search
          </label>
          <input id="q" name="q" defaultValue={q} placeholder="Name, student number, or e-mail" maxLength={100} className={inputCls} />
        </div>
        <div>
          <label htmlFor="program" className="mb-1 block text-sm font-medium text-slate-700">
            Program
          </label>
          <select id="program" name="program" defaultValue={Number.isFinite(programId) ? programId : ""} className={inputCls}>
            <option value="">All</option>
            {programs.map((p) => (
              <option key={p.program_id} value={p.program_id}>
                {p.code}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="status" className="mb-1 block text-sm font-medium text-slate-700">
            Status
          </label>
          <select id="status" name="status" defaultValue={status} className={inputCls}>
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="graduated">Graduated</option>
            <option value="dropped">Dropped</option>
          </select>
        </div>
        <button type="submit" className={btnSecondary}>
          Search
        </button>
      </form>

      <Table
        caption="Students"
        empty={rows.length === 0}
        head={
          <>
            <th className={thCls}>Student no.</th>
            <th className={thCls}>Name</th>
            <th className={thCls}>E-mail</th>
            <th className={thCls}>Program</th>
            <th className={thCls}>Year</th>
            <th className={thCls}>Status</th>
            <th className={thCls}>Actions</th>
          </>
        }
      >
        {rows.map((s) => (
          <tr key={s.student_id}>
            <td className={tdCls}>{s.student_no}</td>
            <td className={tdCls}>
              <Link href={`/students/${s.student_id}`} className="font-medium text-indigo-800 hover:underline">
                {s.last_name}, {s.first_name}
              </Link>
            </td>
            <td className={tdCls}>{s.email}</td>
            <td className={tdCls}>{s.program}</td>
            <td className={tdCls}>{s.year_level}</td>
            <td className={tdCls}>
              <Badge value={s.status} />
            </td>
            <td className={tdCls}>
              <div className="flex items-start gap-2">
                <Link href={`/students/${s.student_id}`} className={`${btnSecondary} px-2 py-1 text-xs`}>
                  View
                </Link>
                <Link href={`/students/${s.student_id}/edit`} className={`${btnSecondary} px-2 py-1 text-xs`}>
                  Edit
                </Link>
                {user.role === "admin" ? (
                  <ConfirmActionButton
                    action={deleteStudent.bind(null, s.student_id)}
                    label="Delete"
                    confirmText={`Permanently delete ${s.first_name} ${s.last_name}? Their enrollments and grades will be deleted too. To keep history, set the status to Inactive instead.`}
                  />
                ) : null}
              </div>
            </td>
          </tr>
        ))}
      </Table>
      <Pagination page={page} totalPages={totalPages} basePath="/students" params={params} />
    </>
  );
}
