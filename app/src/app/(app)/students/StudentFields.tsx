import { Field, SelectField } from "@/components/ui";

export interface StudentValues {
  student_no?: string;
  first_name?: string;
  middle_name?: string | null;
  last_name?: string;
  email?: string;
  contact_no?: string | null;
  birth_date?: string;
  program_id?: number;
  year_level?: number;
  status?: string;
}

export function StudentFields({ programs, values = {} }: { programs: { program_id: number; code: string; name: string }[]; values?: StudentValues }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Student number" name="student_no" required maxLength={20} defaultValue={values.student_no} placeholder="2026-00001" />
      <Field label="E-mail" name="email" type="email" required maxLength={120} defaultValue={values.email} />
      <Field label="First name" name="first_name" required maxLength={60} defaultValue={values.first_name} />
      <Field label="Middle name" name="middle_name" maxLength={60} defaultValue={values.middle_name} />
      <Field label="Last name" name="last_name" required maxLength={60} defaultValue={values.last_name} />
      <Field label="Contact number" name="contact_no" type="tel" maxLength={20} defaultValue={values.contact_no} />
      <Field label="Birth date" name="birth_date" type="date" required defaultValue={values.birth_date} max={new Date().toISOString().slice(0, 10)} />
      <SelectField label="Program" name="program_id" required defaultValue={values.program_id}>
        <option value="">Select a program</option>
        {programs.map((p) => (
          <option key={p.program_id} value={p.program_id}>
            {p.code} - {p.name}
          </option>
        ))}
      </SelectField>
      <Field label="Year level" name="year_level" type="number" required min={1} max={5} defaultValue={values.year_level ?? 1} />
      <SelectField label="Status" name="status" required defaultValue={values.status ?? "active"}>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
        <option value="graduated">Graduated</option>
        <option value="dropped">Dropped</option>
      </SelectField>
    </div>
  );
}
