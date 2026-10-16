import type { Metadata } from "next";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Card, Field, PageHeader, formatDateTime } from "@/components/ui";
import { withDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { changeOwnPassword } from "./actions";

export const metadata: Metadata = { title: "My account" };

const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin:
    "Full system control (`sis_admin` role): manage students, programs, subjects, instructors, sections, enrollments, grades, announcements, user accounts, and view the immutable audit log.",
  registrar:
    "Registrar operations (`sis_registrar` role): manage student records, process enrollments and section transfers via atomic stored procedures, encode grades, and generate official academic reports.",
  student:
    "Student self-service (`sis_student` role with PostgreSQL Row-Level Security): view your personal profile, study load (COR), semester grades, cumulative GPA, class schedules, and school announcements.",
};

export default async function AccountPage() {
  const user = await requireUser();

  const meta = await withDb(null, (db) =>
    db.one<{
      username: string;
      role: string;
      is_active: boolean;
      last_login_at: Date | null;
      created_at: Date;
      student_no: string | null;
      student_name: string | null;
    }>(
      `SELECT u.username, u.role, u.is_active, u.last_login_at, u.created_at,
              s.student_no,
              s.last_name || ', ' || s.first_name AS student_name
         FROM users u
         LEFT JOIN students s ON s.user_id = u.user_id
        WHERE u.user_id = $1`,
      [user.userId],
    ),
  );

  return (
    <>
      <PageHeader
        title="My Account"
        subtitle="Manage your portal credentials and view your assigned database security role."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Account information">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-slate-600">Username</dt>
              <dd className="font-semibold text-slate-900">{meta?.username ?? user.username}</dd>
            </div>
            <div>
              <dt className="text-slate-600">Assigned role</dt>
              <dd className="mt-0.5 capitalize">
                <Badge value={meta?.role ?? user.role} />
              </dd>
            </div>
            <div>
              <dt className="text-slate-600">Account status</dt>
              <dd className="mt-0.5">
                <Badge value={meta?.is_active ? "active" : "inactive"} />
              </dd>
            </div>
            {meta?.student_no ? (
              <div>
                <dt className="text-slate-600">Linked student record</dt>
                <dd className="font-medium text-slate-900">
                  {meta.student_no} — {meta.student_name}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="text-slate-600">Last sign-in</dt>
              <dd className="font-medium text-slate-900">{formatDateTime(meta?.last_login_at ?? null)}</dd>
            </div>
            <div>
              <dt className="text-slate-600">Account created</dt>
              <dd className="font-medium text-slate-900">{formatDateTime(meta?.created_at ?? null)}</dd>
            </div>
            <div className="border-t border-slate-200 pt-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Database security privileges
              </dt>
              <dd className="mt-1 text-xs leading-relaxed text-slate-600">
                {ROLE_DESCRIPTIONS[user.role]}
              </dd>
            </div>
          </dl>
        </Card>

        <Card title="Change password">
          <ActionForm action={changeOwnPassword} submitLabel="Update password" resetOnSuccess>
            <Field
              label="Current password"
              name="current_password"
              type="password"
              required
              maxLength={200}
              autoComplete="current-password"
            />
            <Field
              label="New password"
              name="new_password"
              type="password"
              required
              maxLength={72}
              autoComplete="new-password"
              hint="At least 8 characters containing a letter and a number."
            />
            <Field
              label="Confirm new password"
              name="confirm_password"
              type="password"
              required
              maxLength={72}
              autoComplete="new-password"
            />
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
