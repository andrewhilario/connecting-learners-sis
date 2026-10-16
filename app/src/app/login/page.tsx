import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { Field } from "@/components/ui";
import { getCurrentUser } from "@/lib/session";
import { loginAction } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <main id="main" className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-indigo-800">Connecting Learners</h1>
          <p className="mt-1 text-sm text-slate-600">A student-centered information system for ICCT Colleges</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Sign in</h2>
          <ActionForm action={loginAction} submitLabel="Sign in">
            <Field label="Username" name="username" required maxLength={50} autoComplete="username" />
            <Field label="Password" name="password" type="password" required maxLength={200} autoComplete="current-password" />
          </ActionForm>
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">
          Forgot your password? Contact the registrar or system administrator.
        </p>
      </div>
    </main>
  );
}
