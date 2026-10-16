import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, ConfirmActionButton } from "@/components/ActionForm";
import { btnSecondary, inputCls, tdCls, thCls } from "@/components/styles";
import { Card, Field, PageHeader, Pagination, Table, first, likePattern, parsePage, type SearchParams } from "@/components/ui";
import { withDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { createInstructor, deleteInstructor } from "./actions";

export const metadata: Metadata = { title: "Instructors" };
const PAGE_SIZE = 10;

interface InstructorRow {
  instructor_id: number;
  first_name: string;
  last_name: string;
  email: string;
  sections_count: string;
  total: string;
}

export default async function InstructorsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = first(sp.q).trim().slice(0, 100);
  const page = parsePage(first(sp.page));
  const isAdmin = user.role === "admin";

  const rows = await withDb(user, (db) =>
    db.query<InstructorRow>(
      `SELECT i.instructor_id, i.first_name, i.last_name, i.email,
              (SELECT COUNT(*) FROM sections sec WHERE sec.instructor_id = i.instructor_id) AS sections_count,
              COUNT(*) OVER() AS total
         FROM instructors i
        WHERE $1::text = '' OR i.first_name ILIKE $2 OR i.last_name ILIKE $2
           OR i.email ILIKE $2 OR (i.first_name || ' ' || i.last_name) ILIKE $2
        ORDER BY i.last_name, i.first_name
        LIMIT ${PAGE_SIZE} OFFSET $3`,
      [q, likePattern(q), (page - 1) * PAGE_SIZE],
    ),
  );
  const total = rows[0] ? Number(rows[0].total) : 0;

  return (
    <>
      <PageHeader
        title="Instructors"
        subtitle={
          isAdmin
            ? "Manage faculty records and view teaching assignments."
            : "Faculty directory and assigned class sections."
        }
      />

      {isAdmin ? (
        <Card title="Add instructor" className="mb-6 max-w-3xl">
          <ActionForm action={createInstructor} submitLabel="Add instructor" resetOnSuccess>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="First name" name="first_name" required maxLength={60} />
              <Field label="Last name" name="last_name" required maxLength={60} />
              <Field label="E-mail" name="email" type="email" required maxLength={120} placeholder="faculty@example.com" />
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
            placeholder="Instructor name or e-mail"
            maxLength={100}
            className={inputCls}
          />
        </div>
        <button type="submit" className={btnSecondary}>
          Search
        </button>
      </form>

      <Table
        caption="Instructors"
        empty={rows.length === 0}
        head={
          <>
            <th className={thCls}>Name</th>
            <th className={thCls}>E-mail</th>
            <th className={thCls}>Assigned sections</th>
            {isAdmin ? <th className={thCls}>Actions</th> : null}
          </>
        }
      >
        {rows.map((i) => (
          <tr key={i.instructor_id}>
            <td className={`${tdCls} font-medium`}>
              {i.last_name}, {i.first_name}
            </td>
            <td className={tdCls}>{i.email}</td>
            <td className={tdCls}>
              <Link href={`/sections?q=${encodeURIComponent(i.last_name)}`} className="text-indigo-700 underline">
                {i.sections_count} section{Number(i.sections_count) === 1 ? "" : "s"}
              </Link>
            </td>
            {isAdmin ? (
              <td className={tdCls}>
                <div className="flex items-start gap-2">
                  <Link href={`/instructors/${i.instructor_id}/edit`} className={`${btnSecondary} px-2 py-1 text-xs`}>
                    Edit
                  </Link>
                  <ConfirmActionButton
                    action={deleteInstructor.bind(null, i.instructor_id)}
                    label="Delete"
                    confirmText={`Delete instructor ${i.first_name} ${i.last_name}? Their assigned sections will be set to TBA.`}
                  />
                </div>
              </td>
            ) : null}
          </tr>
        ))}
      </Table>
      <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} basePath="/instructors" params={q ? { q } : {}} />
    </>
  );
}
