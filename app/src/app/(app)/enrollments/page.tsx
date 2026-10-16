import type { Metadata } from "next";
import { ActionForm, ConfirmActionButton } from "@/components/ActionForm";
import { btnSecondary, inputCls, tdCls, thCls } from "@/components/styles";
import { Badge, Card, Field, PageHeader, Pagination, SelectField, Table, first, likePattern, parsePage, type SearchParams } from "@/components/ui";
import { withDb } from "@/lib/db";
import { requireRole, STAFF } from "@/lib/session";
import { dropEnrollment, enrollStudent, transferStudent } from "./actions";

export const metadata: Metadata = { title: "Enrollments" };
const PAGE_SIZE = 12;

interface Row {
  enrollment_id: number;
  student_no: string;
  student_name: string;
  subject_code: string;
  section_code: string;
  school_year: string;
  semester: number;
  status: string;
  total: string;
}

export default async function EnrollmentsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireRole(...STAFF);
  const sp = await searchParams;
  const q = first(sp.q).trim().slice(0, 100);
  const status = ["enrolled", "dropped", "completed"].includes(first(sp.status)) ? first(sp.status) : "";
  const page = parsePage(first(sp.page));

  const { rows, sections } = await withDb(user, async (db) => ({
    rows: await db.query<Row>(
      `SELECT e.enrollment_id, st.student_no, st.last_name || ', ' || st.first_name AS student_name,
              sub.code AS subject_code, sec.section_code, sec.school_year, sec.semester, e.status,
              COUNT(*) OVER() AS total
         FROM enrollments e
         JOIN students st  ON st.student_id = e.student_id
         JOIN sections sec ON sec.section_id = e.section_id
         JOIN subjects sub ON sub.subject_id = sec.subject_id
        WHERE ($1::text = '' OR st.student_no ILIKE $2 OR st.last_name ILIKE $2 OR st.first_name ILIKE $2
               OR sub.code ILIKE $2 OR sub.title ILIKE $2)
          AND ($3::text = '' OR e.status = $3)
        ORDER BY sec.school_year DESC, sec.semester DESC, st.last_name, st.first_name, sub.code
        LIMIT ${PAGE_SIZE} OFFSET $4`,
      [q, likePattern(q), status, (page - 1) * PAGE_SIZE],
    ),
    sections: await db.query<{ section_id: number; subject_code: string; section_code: string; school_year: string; semester: number; enrolled_count: string; capacity: number }>(
      `SELECT section_id, subject_code, section_code, school_year, semester, enrolled_count, capacity
         FROM v_section_roster ORDER BY school_year DESC, semester DESC, subject_code, section_code LIMIT 300`,
    ),
  }));

  const total = rows[0] ? Number(rows[0].total) : 0;
  const params: Record<string, string> = {};
  if (q) params.q = q;
  if (status) params.status = status;

  const sectionOptions = sections.map((s) => (
    <option key={s.section_id} value={s.section_id}>
      {s.subject_code}-{s.section_code} | SY {s.school_year} sem {s.semester} | {s.enrolled_count}/{s.capacity}
    </option>
  ));

  return (
    <>
      <PageHeader title="Enrollments" subtitle="Enroll, transfer and drop students. Enrollment runs through a database transaction (stored procedure)." />

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Enroll a student">
          <ActionForm action={enrollStudent} submitLabel="Enroll" resetOnSuccess>
            <Field label="Student number" name="student_no" required maxLength={20} placeholder="2026-00001" />
            <SelectField label="Section" name="section_id" required>
              <option value="">Select a section</option>
              {sectionOptions}
            </SelectField>
          </ActionForm>
        </Card>
        <Card title="Transfer between sections (same subject and term)">
          <ActionForm action={transferStudent} submitLabel="Transfer" resetOnSuccess>
            <Field label="Student number" name="student_no" required maxLength={20} />
            <SelectField label="From section" name="from_section_id" required>
              <option value="">Select current section</option>
              {sectionOptions}
            </SelectField>
            <SelectField label="To section" name="to_section_id" required>
              <option value="">Select new section</option>
              {sectionOptions}
            </SelectField>
          </ActionForm>
        </Card>
      </div>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3" role="search">
        <div className="min-w-56 flex-1">
          <label htmlFor="q" className="mb-1 block text-sm font-medium text-slate-700">
            Search
          </label>
          <input id="q" name="q" defaultValue={q} placeholder="Student name/number or subject" maxLength={100} className={inputCls} />
        </div>
        <div>
          <label htmlFor="status" className="mb-1 block text-sm font-medium text-slate-700">
            Status
          </label>
          <select id="status" name="status" defaultValue={status} className={inputCls}>
            <option value="">All</option>
            <option value="enrolled">Enrolled</option>
            <option value="completed">Completed</option>
            <option value="dropped">Dropped</option>
          </select>
        </div>
        <button type="submit" className={btnSecondary}>
          Search
        </button>
      </form>

      <Table
        caption="Enrollments"
        empty={rows.length === 0}
        head={
          <>
            <th className={thCls}>Student</th>
            <th className={thCls}>Subject</th>
            <th className={thCls}>Section</th>
            <th className={thCls}>Term</th>
            <th className={thCls}>Status</th>
            <th className={thCls}>Actions</th>
          </>
        }
      >
        {rows.map((e) => (
          <tr key={e.enrollment_id}>
            <td className={tdCls}>
              {e.student_name}
              <br />
              <span className="text-xs text-slate-600">{e.student_no}</span>
            </td>
            <td className={tdCls}>{e.subject_code}</td>
            <td className={tdCls}>{e.section_code}</td>
            <td className={tdCls}>
              {e.school_year}, sem {e.semester}
            </td>
            <td className={tdCls}>
              <Badge value={e.status} />
            </td>
            <td className={tdCls}>
              {e.status === "enrolled" ? (
                <ConfirmActionButton
                  action={dropEnrollment.bind(null, e.enrollment_id)}
                  label="Drop"
                  confirmText={`Drop ${e.student_name} from ${e.subject_code}-${e.section_code}?`}
                />
              ) : null}
            </td>
          </tr>
        ))}
      </Table>
      <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} basePath="/enrollments" params={params} />
    </>
  );
}
