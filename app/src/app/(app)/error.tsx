"use client";

import { btnPrimary } from "@/components/styles";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div role="alert" className="mx-auto max-w-lg rounded-lg border border-red-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Unable to load this page</h2>
      <p className="mt-2 text-sm text-slate-600">
        {error.message || "A temporary database connection issue occurred while loading this page."}
      </p>
      <div className="mt-4">
        <button type="button" onClick={() => reset()} className={btnPrimary}>
          Try again
        </button>
      </div>
    </div>
  );
}
