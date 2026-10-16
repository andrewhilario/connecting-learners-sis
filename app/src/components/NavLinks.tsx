"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export interface NavItem {
  href: string;
  label: string;
}

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  const effectivePath = pendingHref ?? pathname;

  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto md:flex-col">
      {items.map((item) => {
        const active = effectivePath === item.href || effectivePath.startsWith(`${item.href}/`);
        const isLoading = pendingHref === item.href && pathname !== item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            onClick={() => {
              if (pathname !== item.href) setPendingHref(item.href);
            }}
            aria-current={active ? "page" : undefined}
            className={`flex items-center justify-between whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
              active ? "bg-indigo-700 text-white" : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            <span>{item.label}</span>
            {isLoading ? (
              <span
                aria-hidden="true"
                className="ml-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
