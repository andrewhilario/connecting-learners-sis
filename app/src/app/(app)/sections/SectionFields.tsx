import { Field, SelectField } from "@/components/ui";

export interface SectionValues {
  subject_id?: number;
  instructor_id?: number | null;
  section_code?: string;
  school_year?: string;
  semester?: number;
  schedule?: string | null;
  room?: string | null;
  capacity?: number;
}

export function SectionFields({
  subjects,
  instructors,
  values = {},
}: {
  subjects: { subject_id: number; code: string; title: string }[];
  instructors: { instructor_id: number; first_name: string; last_name: string }[];
  values?: SectionValues;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField label="Subject" name="subject_id" required defaultValue={values.subject_id}>
        <option value="">Select a subject</option>
        {subjects.map((s) => (
          <option key={s.subject_id} value={s.subject_id}>
            {s.code} - {s.title}
          </option>
        ))}
      </SelectField>
      <SelectField label="Instructor" name="instructor_id" defaultValue={values.instructor_id}>
        <option value="">To be announced</option>
        {instructors.map((i) => (
          <option key={i.instructor_id} value={i.instructor_id}>
            {i.last_name}, {i.first_name}
          </option>
        ))}
      </SelectField>
      <Field label="Section code" name="section_code" required maxLength={20} defaultValue={values.section_code} placeholder="A" />
      <Field label="School year" name="school_year" required maxLength={9} defaultValue={values.school_year} placeholder="2026-2027" hint="Format: 2026-2027" />
      <SelectField label="Semester" name="semester" required defaultValue={values.semester ?? 1}>
        <option value="1">1st semester</option>
        <option value="2">2nd semester</option>
        <option value="3">Summer</option>
      </SelectField>
      <Field label="Capacity" name="capacity" type="number" required min={1} max={100} defaultValue={values.capacity ?? 40} />
      <Field label="Schedule" name="schedule" maxLength={60} defaultValue={values.schedule} placeholder="MWF 08:00-09:00" />
      <Field label="Room" name="room" maxLength={20} defaultValue={values.room} placeholder="Rm 101" />
    </div>
  );
}
