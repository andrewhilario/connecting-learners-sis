import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmActionButton } from "@/components/ActionForm";
import { btnPrimary, btnSecondary, inputCls, tdCls, thCls } from "@/components/styles";
import { PageHeader, Pagination, Table, first, likePattern, parsePage, type SearchParams } from "@/components/ui";
import { withDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { deleteSection } from "./actions";

export const metadata: Metadata = { title: "Sections" };
const PAGE_SIZE = 12;

interface Row {
  section_id: number;
  subject_code: string;
  subject_title: string;
  section_code: string;
  school_year: string;
  semester: number;
  schedule: string | null;
  room: string | null;
  instructor: string;
  capacity: number;
  enrolled_count: string;
  seats_left: string;
  total: string;
}

export default async function SectionsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = first(sp.q).trim().slice(0, 100);
  const termRaw = first(sp.term);
  const termMatch = /^(\d{4}-\d{4})\|([123])$/.exec(termRaw);
  const page = parsePage(first(sp.page));
  const isAdmin = user.role === "admin";
  const isStaff = user.role === "admin" || user.role === "registrar";

  const { rows, terms } = await withDb(user, async (db) => ({
    rows: await db.query<Row>(
      `SELECT r.*, COUNT(*) OVER() AS total
         FROM v_section_roster r
        WHERE ($1::text = '' OR r.subject_code ILIKE $2 OR r.subject_title ILIKE $2 OR r.instructor ILIKE $2)
          AND ($3::text IS NULL OR (r.school_year = $3 AND r.semester = $4::int))
        ORDER BY r.school_year DESC, r.semester DESC, r.subject_code, r.section_code
        LIMIT ${PAGE_SIZE} OFFSET $5`,
      [q, likePattern(q), termMatch ? termMatch[1] : null, termMatch ? termMatch[2] : null, (page - 1) * PAGE_SIZE],
    ),
    terms: await db.query<{ school_year: string; semester: number }>(
      "SELECT DISTINCT school_year, semester FROM sections ORDER BY school_year DESC, semester DESC",
    ),
  }));

  const total = rows[0] ? Number(rows[0].total) : 0;
  const params: Record<string, string> = {};
  if (q) params.q = q;
  if (termMatch) params.term = termRaw;

  return (
    <>
      <PageHeader
        title={user.role === "student" ? "Class schedule" : "Sections"}
        subtitle="Offered sections, schedules and seat availability."
        actions={
          isAdmin ? (
            <Link href="/sections/new" className={btnPrimary}>
              Add section
            </Link>
          ) : undefined
        }
      />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3" role="search">
        <div className="min-w-56 flex-1">
          <label htmlFor="q" className="mb-1 block text-sm font-medium text-slate-700">
            Search
          </label>
          <input id="q" name="q" defaultValue={q} placeholder="Subject or instructor" maxLength={100} className={inputCls} />
        </div>
        <div>
          <label htmlFor="term" className="mb-1 block text-sm font-medium text-slate-700">
            Term
          </label>
          <select id="term" name="term" defaultValue={termMatch ? termRaw : ""} className={inputCls}>
            <option value="">All terms</option>
            {terms.map((t) => (
              <option key={`${t.school_year}|${t.semester}`} value={`${t.school_year}|${t.semester}`}>
                SY {t.school_year}, sem {t.semester}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={btnSecondary}>
          Search
        </button>
      </form>

      <Table
        caption="Sections"
        empty={rows.length === 0}
        head={
          <>
            <th className={thCls}>Subject</th>
            <th className={thCls}>Section</th>
            <th className={thCls}>Term</th>
            <th className={thCls}>Schedule</th>
            <th className={thCls}>Room</th>
            <th className={thCls}>Instructor</th>
            <th className={thCls}>Seats</th>
            {isStaff ? <th className={thCls}>Actions</th> : null}
          </>
        }
      >
        {rows.map((s) => (
          <tr key={s.section_id}>
            <td className={tdCls}>
              <span className="font-medium">{s.subject_code}</span>
              <br />
              <span className="text-xs text-slate-600">{s.subject_title}</span>
            </td>
            <td className={tdCls}>{s.section_code}</td>
            <td className={tdCls}>
              {s.school_year}, sem {s.semester}
            </td>
            <td className={tdCls}>{s.schedule ?? "TBA"}</td>
            <td className={tdCls}>{s.room ?? "TBA"}</td>
            <td className={tdCls}>{s.instructor}</td>
            <td className={tdCls}>
              {s.enrolled_count}/{s.capacity}
              {Number(s.seats_left) <= 0 ? <span className="ml-1 text-xs font-medium text-red-700">Full</span> : null}
            </td>
            {isStaff ? (
              <td className={tdCls}>
                <div className="flex items-start gap-2">
                  <Link href={`/sections/${s.section_id}`} className={`${btnSecondary} px-2 py-1 text-xs`}>
                    Roster
                  </Link>
                  {isAdmin ? (
                    <>
                      <Link href={`/sections/${s.section_id}/edit`} className={`${btnSecondary} px-2 py-1 text-xs`}>
                        Edit
                      </Link>
                      <ConfirmActionButton
                        action={deleteSection.bind(null, s.section_id)}
                        label="Delete"
                        confirmText={`Delete section ${s.subject_code}-${s.section_code} (${s.school_year}, sem ${s.semester})?`}
                      />
                    </>
                  ) : null}
                </div>
              </td>
            ) : null}
          </tr>
        ))}
      </Table>
      <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} basePath="/sections" params={params} />
    </>
  );
}
