import type { Metadata } from "next";
import { ActionForm, ConfirmActionButton } from "@/components/ActionForm";
import { tdCls, thCls } from "@/components/styles";
import { Badge, Card, Field, PageHeader, SelectField, Table, formatDateTime } from "@/components/ui";
import { withDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { createUser, resetPassword, setUserActive } from "./actions";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const admin = await requireRole("admin");
  const users = await withDb(admin, (db) =>
    db.query<{ user_id: number; username: string; role: string; is_active: boolean; last_login_at: Date | null; student_no: string | null }>(
      `SELECT u.user_id, u.username, u.role, u.is_active, u.last_login_at, s.student_no
         FROM users u LEFT JOIN students s ON s.user_id = u.user_id
        ORDER BY u.role, u.username LIMIT 200`,
    ),
  );

  return (
    <>
      <PageHeader title="Users" subtitle="Create login accounts, reset passwords and deactivate access." />

      <Card title="Create user" className="mb-6 max-w-3xl">
        <ActionForm action={createUser} submitLabel="Create user" resetOnSuccess>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Username" name="username" required maxLength={50} autoComplete="off" />
            <Field label="Temporary password" name="password" type="password" required maxLength={72} autoComplete="new-password" hint="8+ characters with a letter and a digit." />
            <SelectField label="Role" name="role" required defaultValue="student">
              <option value="student">Student</option>
              <option value="registrar">Registrar</option>
              <option value="admin">Admin</option>
            </SelectField>
            <Field label="Link to student number (students only)" name="student_no" maxLength={20} placeholder="2026-00006" />
          </div>
        </ActionForm>
      </Card>

      <Table
        caption="User accounts"
        head={
          <>
            <th className={thCls}>Username</th>
            <th className={thCls}>Role</th>
            <th className={thCls}>Student no.</th>
            <th className={thCls}>Status</th>
            <th className={thCls}>Last login</th>
            <th className={thCls}>Reset password</th>
            <th className={thCls}>Access</th>
          </>
        }
      >
        {users.map((u) => (
          <tr key={u.user_id}>
            <td className={tdCls}>{u.username}</td>
            <td className={`${tdCls} capitalize`}>{u.role}</td>
            <td className={tdCls}>{u.student_no ?? "-"}</td>
            <td className={tdCls}>
              <Badge value={u.is_active ? "active" : "inactive"} />
            </td>
            <td className={tdCls}>{u.last_login_at ? formatDateTime(u.last_login_at) : "Never"}</td>
            <td className={tdCls}>
              <ActionForm action={resetPassword.bind(null, u.user_id)} submitLabel="Set" className="flex items-start gap-2">
                <div>
                  <label htmlFor={`pw-${u.user_id}`} className="sr-only">
                    New password for {u.username}
                  </label>
                  <input
                    id={`pw-${u.user_id}`}
                    name="password"
                    type="password"
                    required
                    maxLength={72}
                    autoComplete="new-password"
                    placeholder="New password"
                    className="w-36 rounded-md border border-slate-300 px-2 py-1 text-sm"
                  />
                </div>
              </ActionForm>
            </td>
            <td className={tdCls}>
              <ConfirmActionButton
                action={setUserActive.bind(null, u.user_id, !u.is_active)}
                label={u.is_active ? "Deactivate" : "Activate"}
                confirmText={`${u.is_active ? "Deactivate" : "Activate"} ${u.username}?`}
                variant={u.is_active ? "danger" : "secondary"}
              />
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
