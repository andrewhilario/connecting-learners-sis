"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { btnPrimary, btnSecondary, inputCls, labelCls } from "@/components/styles";
import { loginAction } from "./actions";

const DEMO_ACCOUNTS = [
  { label: "Admin", username: "admin", password: "Admin@12345" },
  { label: "Registrar", username: "registrar", password: "Registrar@12345" },
  { label: "Student 1", username: "student1", password: "Student@12345" },
];

export function LoginForm() {
  const [state, dispatch, pending] = useActionState(loginAction, null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => dispatch(data));
  }

  function quickSignIn(u: string, p: string) {
    setUsername(u);
    setPassword(p);
    const data = new FormData();
    data.set("username", u);
    data.set("password", p);
    startTransition(() => dispatch(data));
  }

  return (
    <div className="space-y-5">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="f-username" className={labelCls}>
            Username <span aria-hidden="true" className="text-red-600">*</span>
          </label>
          <input
            id="f-username"
            name="username"
            type="text"
            required
            maxLength={50}
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin, registrar, or student1"
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="f-password" className={labelCls}>
            Password <span aria-hidden="true" className="text-red-600">*</span>
          </label>
          <input
            id="f-password"
            name="password"
            type="password"
            required
            maxLength={200}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin@12345"
            className={inputCls}
          />
        </div>
        {state && !state.ok ? (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">
            {state.message}
          </p>
        ) : null}
        <button type="submit" disabled={pending} className={`${btnPrimary} w-full`}>
          {pending ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <div className="border-t border-slate-200 pt-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          One-Click Demo Accounts
        </p>
        <div className="grid grid-cols-3 gap-2">
          {DEMO_ACCOUNTS.map((acc) => (
            <button
              key={acc.username}
              type="button"
              disabled={pending}
              onClick={() => quickSignIn(acc.username, acc.password)}
              className={`${btnSecondary} px-2 py-1.5 text-xs`}
            >
              {acc.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Or enter manually: <code className="rounded bg-slate-100 px-1">admin</code> /{" "}
          <code className="rounded bg-slate-100 px-1">Admin@12345</code>,{" "}
          <code className="rounded bg-slate-100 px-1">registrar</code> /{" "}
          <code className="rounded bg-slate-100 px-1">Registrar@12345</code>,{" "}
          <code className="rounded bg-slate-100 px-1">student1..5</code> /{" "}
          <code className="rounded bg-slate-100 px-1">Student@12345</code>
        </p>
      </div>
    </div>
  );
}
