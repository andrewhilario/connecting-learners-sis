import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { getRawConnectionString } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const hasDbUrl = Boolean(getRawConnectionString());
  if (hasDbUrl && (await getCurrentUser())) redirect("/dashboard");

  return (
    <main id="main" className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-indigo-50/40 p-4">
      <div className="w-full max-w-md">
        <Logo size="lg" showSubtitle className="mb-6" />
        {!hasDbUrl ? (
          <div role="alert" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Database connection not configured yet</p>
            <p className="mt-1">
              In your Vercel project, go to <strong>Settings &rarr; Environment Variables</strong>, add{" "}
              <code className="rounded bg-amber-100 px-1">DATABASE_URL</code> with your Supabase{" "}
              <strong>Session pooler</strong> connection string, and click <strong>Redeploy</strong>.
            </p>
          </div>
        ) : null}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Sign in to your account</h2>
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">
          Forgot your password? Contact the Office of the University Registrar or System Administrator.
        </p>
      </div>
    </main>
  );
}
