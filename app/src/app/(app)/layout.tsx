import Link from "next/link";
import { Logo } from "@/components/Logo";
import { NavLinks, type NavItem } from "@/components/NavLinks";
import { btnSecondary } from "@/components/styles";
import { logoutAction } from "@/app/login/actions";
import { requireUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  const nav: NavItem[] = [{ href: "/dashboard", label: "Dashboard" }];
  if (user.role === "student") {
    nav.push(
      { href: "/my", label: "My profile" },
      { href: "/my/enrollments", label: "My enrollments" },
      { href: "/my/grades", label: "My grades" },
      { href: "/sections", label: "Class schedule" },
      { href: "/subjects", label: "Subjects" },
      { href: "/programs", label: "Programs" },
      { href: "/instructors", label: "Instructors" },
    );
  } else {
    nav.push(
      { href: "/students", label: "Students" },
      { href: "/programs", label: "Programs" },
      { href: "/subjects", label: "Subjects" },
      { href: "/instructors", label: "Instructors" },
      { href: "/sections", label: "Sections" },
      { href: "/enrollments", label: "Enrollments" },
      { href: "/grades", label: "Grades" },
      { href: "/reports", label: "Reports" },
    );
  }
  nav.push({ href: "/announcements", label: "Announcements" });
  if (user.role === "admin") {
    nav.push({ href: "/users", label: "Users" }, { href: "/audit-log", label: "Audit log" });
  }
  nav.push({ href: "/account", label: "My account" });

  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-slate-200 bg-white p-4 md:w-64 md:shrink-0 md:border-b-0 md:border-r print:hidden">
        <Link href="/dashboard" className="mb-5 block rounded-lg p-1 transition hover:bg-slate-50">
          <Logo size="sm" showSubtitle />
        </Link>
        <NavLinks items={nav} />
        <div className="mt-6 border-t border-slate-200 pt-4 text-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900">{user.username}</p>
              <p className="capitalize text-xs text-slate-500">{user.role}</p>
            </div>
            <Link href="/account" className="text-xs font-medium text-indigo-700 hover:underline">
              Settings
            </Link>
          </div>
          <form action={logoutAction}>
            <button type="submit" className={`${btnSecondary} w-full`}>
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main id="main" className="min-w-0 flex-1 p-4 md:p-8">
        <div className="mb-6 hidden border-b border-slate-300 pb-4 print:block">
          <Logo size="md" showSubtitle />
        </div>
        {children}
      </main>
    </div>
  );
}
