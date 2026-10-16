import Link from "next/link";
import { NavLinks, type NavItem } from "@/components/NavLinks";
import { btnSecondary } from "@/components/styles";
import { logoutAction } from "@/app/login/actions";
import { requireUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  const nav: NavItem[] = [{ href: "/dashboard", label: "Dashboard" }];
  if (user.role === "student") {
    nav.push({ href: "/my", label: "My records" }, { href: "/sections", label: "Class schedule" });
  } else {
    nav.push(
      { href: "/students", label: "Students" },
      { href: "/subjects", label: "Subjects" },
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

  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-slate-200 bg-white p-4 md:w-60 md:shrink-0 md:border-b-0 md:border-r print:hidden">
        <Link href="/dashboard" className="mb-4 block text-lg font-bold text-indigo-800">
          Connecting Learners
        </Link>
        <NavLinks items={nav} />
        <div className="mt-6 border-t border-slate-200 pt-4 text-sm">
          <p className="font-medium text-slate-900">{user.username}</p>
          <p className="mb-3 capitalize text-slate-600">{user.role}</p>
          <form action={logoutAction}>
            <button type="submit" className={`${btnSecondary} w-full`}>
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main id="main" className="min-w-0 flex-1 p-4 md:p-8">
        {children}
      </main>
    </div>
  );
}
