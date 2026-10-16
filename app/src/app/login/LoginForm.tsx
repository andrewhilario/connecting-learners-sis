"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { btnPrimary, inputCls, labelCls } from "@/components/styles";
import { loginAction } from "./actions";

export function LoginForm() {
  const [state, dispatch, pending] = useActionState(loginAction, null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => dispatch(data));
  }

  return (
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
          placeholder="Enter your username"
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
          placeholder="Enter your password"
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
  );
}
