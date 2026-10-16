import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, ConfirmActionButton } from "@/components/ActionForm";
import { btnSecondary, inputCls, tdCls, thCls } from "@/components/styles";
import { Card, Field, PageHeader, Pagination, Table, first, likePattern, parsePage, type SearchParams } from "@/components/ui";
import { withDb } from "@/lib/db";
import { requireRole, STAFF } from "@/lib/session";
import { createSubject, deleteSubject } from "./actions";

export const metadata: Metadata = { title: "Subjects" };
const PAGE_SIZE = 10;

export default async function SubjectsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireRole(...STAFF);
  const sp = await searchParams;
  const q = first(sp.q).trim().slice(0, 100);
  const page = parsePage(first(sp.page));

  const rows = await withDb(user, (db) =>
    db.query<{ subject_id: number; code: string; title: string; units: number; sections: string; total: string }>(
      `SELECT sub.subject_id, sub.code, sub.title, sub.units,
              (SELECT COUNT(*) FROM sections sec WHERE sec.subject_id = sub.subject_id) AS sections,
              COUNT(*) OVER() AS total
         FROM subjects sub
        WHERE $1::text = '' OR sub.code ILIKE $2 OR sub.title ILIKE $2
        ORDER BY sub.code
        LIMIT ${PAGE_SIZE} OFFSET $3`,
      [q, likePattern(q), (page - 1) * PAGE_SIZE],
    ),
  );
  const total = rows[0] ? Number(rows[0].total) : 0;
  const isAdmin = user.role === "admin";

  return (
    <>
      <PageHeader title="Subjects" subtitle={isAdmin ? "Manage the subject catalog." : "Subject catalog (read-only for registrars)."} />

      {isAdmin ? (
        <Card title="Add subject" className="mb-6 max-w-3xl">
          <ActionForm action={createSubject} submitLabel="Add subject" resetOnSuccess>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Code" name="code" required maxLength={20} placeholder="IT301" />
              <div className="sm:col-span-1">
                <Field label="Title" name="title" required maxLength={150} />
              </div>
              <Field label="Units" name="units" type="number" required min={1} max={6} defaultValue={3} />
            </div>
          </ActionForm>
        </Card>
      ) : null}

      <form method="get" className="mb-4 flex items-end gap-3" role="search">
        <div className="min-w-56 flex-1">
          <label htmlFor="q" className="mb-1 block text-sm font-medium text-slate-700">
            Search
          </label>
          <input id="q" name="q" defaultValue={q} placeholder="Code or title" maxLength={100} className={inputCls} />
        </div>
        <button type="submit" className={btnSecondary}>
          Search
        </button>
      </form>

      <Table
        caption="Subjects"
        empty={rows.length === 0}
        head={
          <>
            <th className={thCls}>Code</th>
            <th className={thCls}>Title</th>
            <th className={thCls}>Units</th>
            <th className={thCls}>Sections</th>
            {isAdmin ? <th className={thCls}>Actions</th> : null}
          </>
        }
      >
        {rows.map((s) => (
          <tr key={s.subject_id}>
            <td className={tdCls}>{s.code}</td>
            <td className={tdCls}>{s.title}</td>
            <td className={tdCls}>{s.units}</td>
            <td className={tdCls}>{s.sections}</td>
            {isAdmin ? (
              <td className={tdCls}>
                <div className="flex items-start gap-2">
                  <Link href={`/subjects/${s.subject_id}/edit`} className={`${btnSecondary} px-2 py-1 text-xs`}>
                    Edit
                  </Link>
                  <ConfirmActionButton
                    action={deleteSubject.bind(null, s.subject_id)}
                    label="Delete"
                    confirmText={`Delete subject ${s.code} - ${s.title}?`}
                  />
                </div>
              </td>
            ) : null}
          </tr>
        ))}
      </Table>
      <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} basePath="/subjects" params={q ? { q } : {}} />
    </>
  );
}
