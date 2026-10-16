import Link from "next/link";
import type { ReactNode } from "react";
import { inputCls, labelCls, btnSecondary } from "@/components/styles";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2 print:hidden">{actions}</div> : null}
    </div>
  );
}

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {title ? <h2 className="mb-3 text-base font-semibold text-slate-900">{title}</h2> : null}
      {children}
    </section>
  );
}

export function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required,
  maxLength,
  placeholder,
  hint,
  min,
  max,
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number | null;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  hint?: string;
  min?: number | string;
  max?: number | string;
  autoComplete?: string;
}) {
  const id = `f-${name}`;
  return (
    <div>
      <label htmlFor={id} className={labelCls}>
        {label}
        {required ? <span aria-hidden="true" className="text-red-600"> *</span> : null}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        min={min}
        max={max}
        autoComplete={autoComplete}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={inputCls}
      />
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function SelectField({
  label,
  name,
  defaultValue,
  required,
  children,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  required?: boolean;
  children: ReactNode;
}) {
  const id = `f-${name}`;
  return (
    <div>
      <label htmlFor={id} className={labelCls}>
        {label}
        {required ? <span aria-hidden="true" className="text-red-600"> *</span> : null}
      </label>
      <select id={id} name={name} defaultValue={defaultValue ?? ""} required={required} className={inputCls}>
        {children}
      </select>
    </div>
  );
}

const BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  enrolled: "bg-blue-100 text-blue-800",
  completed: "bg-slate-200 text-slate-800",
  Passed: "bg-green-100 text-green-800",
  Failed: "bg-red-100 text-red-800",
  dropped: "bg-red-100 text-red-800",
  inactive: "bg-amber-100 text-amber-800",
  graduated: "bg-purple-100 text-purple-800",
};

export function Badge({ value }: { value: string }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[value] ?? "bg-slate-100 text-slate-700"}`}>
      {value}
    </span>
  );
}

export function Table({ caption, head, children, empty }: { caption: string; head: ReactNode; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-slate-50">
          <tr>{head}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
      {empty ? <p className="px-4 py-8 text-center text-sm text-slate-500">No records found.</p> : null}
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  basePath,
  params,
}: {
  page: number;
  totalPages: number;
  basePath: string;
  params: Record<string, string>;
}) {
  if (totalPages <= 1) return null;
  const href = (p: number) => {
    const qs = new URLSearchParams({ ...params, page: String(p) });
    return `${basePath}?${qs.toString()}`;
  };
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm print:hidden">
      <span className="text-slate-600">
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={btnSecondary}>
            Previous
          </Link>
        ) : null}
        {page < totalPages ? (
          <Link href={href(page + 1)} className={btnSecondary}>
            Next
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

/** Parses ?page= safely: positive integer, defaults to 1. */
export function parsePage(value: string): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 && n < 100000 ? n : 1;
}

/** Escapes LIKE wildcards so user search text is matched literally. */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function formatDate(value: Date | string | null): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(value: Date | string | null): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString("en-PH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
