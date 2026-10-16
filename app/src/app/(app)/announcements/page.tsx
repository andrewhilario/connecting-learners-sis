import type { Metadata } from "next";
import { ActionForm, ConfirmActionButton } from "@/components/ActionForm";
import { inputCls, labelCls } from "@/components/styles";
import { Badge, Card, Field, PageHeader, SelectField, formatDateTime } from "@/components/ui";
import { AUDIENCES } from "@/lib/audiences";
import { withDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { deleteAnnouncement, postAnnouncement } from "./actions";

export const metadata: Metadata = { title: "Announcements" };

export default async function AnnouncementsPage() {
  const user = await requireUser();
  const rows = await withDb(user, (db) =>
    db.query<{ announcement_id: number; title: string; body: string; audience: string; created_at: Date }>(
      `SELECT announcement_id, title, body, audience, created_at
         FROM announcements
        WHERE audience = ANY($1::text[])
        ORDER BY created_at DESC LIMIT 50`,
      [AUDIENCES[user.role]],
    ),
  );
  const isAdmin = user.role === "admin";

  return (
    <>
      <PageHeader title="Announcements" />

      {isAdmin ? (
        <Card title="Post an announcement" className="mb-6 max-w-3xl">
          <ActionForm action={postAnnouncement} submitLabel="Post" resetOnSuccess>
            <Field label="Title" name="title" required maxLength={150} />
            <div>
              <label htmlFor="f-body" className={labelCls}>
                Message <span aria-hidden="true" className="text-red-600">*</span>
              </label>
              <textarea id="f-body" name="body" required maxLength={5000} rows={4} className={inputCls} />
            </div>
            <SelectField label="Audience" name="audience" required defaultValue="all">
              <option value="all">Everyone</option>
              <option value="students">Students only</option>
              <option value="staff">Staff only</option>
            </SelectField>
          </ActionForm>
        </Card>
      ) : null}

      <div className="space-y-4">
        {rows.length === 0 ? <p className="text-sm text-slate-600">No announcements.</p> : null}
        {rows.map((a) => (
          <Card key={a.announcement_id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-base font-semibold">{a.title}</h2>
              <div className="flex items-center gap-2">
                {isAdmin ? <Badge value={a.audience} /> : null}
                {isAdmin ? (
                  <ConfirmActionButton action={deleteAnnouncement.bind(null, a.announcement_id)} label="Delete" confirmText={`Delete "${a.title}"?`} />
                ) : null}
              </div>
            </div>
            <p className="mt-2 whitespace-pre-line text-sm text-slate-800">{a.body}</p>
            <p className="mt-2 text-xs text-slate-500">{formatDateTime(a.created_at)}</p>
          </Card>
        ))}
      </div>
    </>
  );
}
