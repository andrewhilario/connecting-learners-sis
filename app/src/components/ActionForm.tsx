"use client";

import { startTransition, useActionState, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import type { ActionState } from "@/lib/action-state";
import { btnDanger, btnPrimary, btnSecondary } from "@/components/styles";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

function Message({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={`rounded-md px-3 py-2 text-sm ${
        state.ok ? "bg-green-50 text-green-800 ring-1 ring-green-200" : "bg-red-50 text-red-800 ring-1 ring-red-200"
      }`}
    >
      {state.message}
    </p>
  );
}

/**
 * Form wired to a server action. Submits through onSubmit (not the `action` prop) so that React does not
 * wipe the user's input when validation fails; the form is only reset after a successful submit.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  resetOnSuccess = false,
  className = "space-y-4",
}: {
  action: Action;
  children: ReactNode;
  submitLabel: string;
  resetOnSuccess?: boolean;
  className?: string;
}) {
  const [state, dispatch, pending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => dispatch(data));
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className={className} noValidate={false}>
      {children}
      <Message state={state} />
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}

/** Small inline button (e.g. Delete / Drop) that asks for confirmation and shows any error. */
export function ConfirmActionButton({
  action,
  label,
  confirmText,
  variant = "danger",
}: {
  action: Action;
  label: string;
  confirmText: string;
  variant?: "danger" | "secondary";
}) {
  const [state, dispatch, pending] = useActionState(action, null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!window.confirm(confirmText)) return;
    const data = new FormData(e.currentTarget);
    startTransition(() => dispatch(data));
  }

  return (
    <form onSubmit={onSubmit} className="inline-flex flex-col items-start gap-1">
      <button type="submit" disabled={pending} className={`${variant === "danger" ? btnDanger : btnSecondary} px-2 py-1 text-xs`}>
        {pending ? "..." : label}
      </button>
      {state && !state.ok ? (
        <span role="alert" className="max-w-56 text-xs text-red-700">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={`${btnSecondary} print:hidden`}>
      Print / Save as PDF
    </button>
  );
}
