import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, ConfirmActionButton } from "@/components/ActionForm";
import { btnSecondary, inputCls, tdCls, thCls } from "@/components/styles";
import { Card, Field, PageHeader, Table, first, likePattern, type SearchParams } from "@/components/ui";
import { withDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { createProgram, deleteProgram } from "./actions";

export const metadata: Metadata = { title: "Programs" };

interface ProgramRow {
  program_id: number;
  code: string;
  name: string;
  active_students: string;
  total_students: string;
}

export default async function ProgramsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = first(sp.q).trim().slice(0, 100);
  const isAdmin = user.role === "admin";
  const isStaff = user.role === "admin" || user.role === "registrar";

  const rows = await withDb(user, (db) =>
    db.query<ProgramRow>(
      `SELECT p.program_id, p.code, p.name,
              COUNT(s.student_id) FILTER (WHERE s.status = 'active') AS active_students,
              COUNT(s.student_id) AS total_students
         FROM programs p
         LEFT JOIN students s ON s.program_id = p.program_id
        WHERE $1::text = '' OR p.code ILIKE $2 OR p.name ILIKE $2
        GROUP BY p.program_id
        ORDER BY p.code`,
      [q, likePattern(q)],
    ),
  );

  return (
    <>
      <PageHeader
        title="Academic Programs"
        subtitle={
          isAdmin
            ? "Manage degree programs offered by ICCT Colleges."
            : "Degree programs offered by ICCT Colleges."
        }
      />

      {isAdmin ? (
        <Card title="Add degree program" className="mb-6 max-w-3xl">
          <ActionForm action={createProgram} submitLabel="Add program" resetOnSuccess>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Program code" name="code" required maxLength={10} placeholder="BSIT" />
              <div className="sm:col-span-2">
                <Field
                  label="Full degree title"
                  name="name"
                  required
                  maxLength={120}
                  placeholder="Bachelor of Science in Information Technology"
                />
              </div>
            </div>
          </ActionForm>
        </Card>
      ) : null}

      <form method="get" className="mb-4 flex items-end gap-3" role="search">
        <div className="min-w-56 flex-1">
          <label htmlFor="q" className="mb-1 block text-sm font-medium text-slate-700">
            Search
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="Code or degree title"
            maxLength={100}
            className={inputCls}
          />
        </div>
        <button type="submit" className={btnSecondary}>
          Search
        </button>
      </form>

      <Table
        caption="Academic programs"
        empty={rows.length === 0}
        head={
          <>
            <th className={thCls}>Code</th>
            <th className={thCls}>Degree program</th>
            {isStaff ? <th className={thCls}>Active students</th> : null}
            {isStaff ? <th className={thCls}>Total students</th> : null}
            {isAdmin ? <th className={thCls}>Actions</th> : null}
          </>
        }
      >
        {rows.map((p) => (
          <tr key={p.program_id}>
            <td className={`${tdCls} font-semibold text-indigo-900`}>{p.code}</td>
            <td className={tdCls}>{p.name}</td>
            {isStaff ? <td className={tdCls}>{p.active_students}</td> : null}
            {isStaff ? (
              <td className={tdCls}>
                <Link href={`/students?program=${p.program_id}`} className="text-indigo-700 underline">
                  {p.total_students}
                </Link>
              </td>
            ) : null}
            {isAdmin ? (
              <td className={tdCls}>
                <div className="flex items-start gap-2">
                  <Link href={`/programs/${p.program_id}/edit`} className={`${btnSecondary} px-2 py-1 text-xs`}>
                    Edit
                  </Link>
                  <ConfirmActionButton
                    action={deleteProgram.bind(null, p.program_id)}
                    label="Delete"
                    confirmText={`Delete program ${p.code} (${p.name})? Programs with assigned students cannot be deleted.`}
                  />
                </div>
              </td>
            ) : null}
          </tr>
        ))}
      </Table>
    </>
  );
}
