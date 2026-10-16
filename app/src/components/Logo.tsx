import React from "react";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showSubtitle?: boolean;
  className?: string;
}

export function LogoMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id="icct-shield" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1e3a8a" />
          <stop offset="55%" stopColor="#312e81" />
          <stop offset="100%" stopColor="#1e1b4b" />
        </linearGradient>
        <linearGradient id="icct-gold" x1="16" y1="8" x2="48" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="50%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
      </defs>

      {/* Outer Collegiate Crest Shield */}
      <path
        d="M32 4L56 13V30C56 45.2 45.6 55.8 32 60C18.4 55.8 8 45.2 8 30V13L32 4Z"
        fill="url(#icct-shield)"
        stroke="url(#icct-gold)"
        strokeWidth="2.5"
      />

      {/* Inner Shield Trim */}
      <path
        d="M32 8.5L51.5 15.8V29.8C51.5 42.3 43 51.3 32 55C21 51.3 12.5 42.3 12.5 29.8V15.8L32 8.5Z"
        stroke="#818cf8"
        strokeOpacity="0.35"
        strokeWidth="1.2"
      />

      {/* Graduation Mortarboard Cap */}
      <path
        d="M32 14L46 20L32 26L18 20L32 14Z"
        fill="url(#icct-gold)"
      />
      <path
        d="M23 22.8V27.5C23 29.8 27 31.5 32 31.5C37 31.5 41 29.8 41 27.5V22.8"
        stroke="#fde68a"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {/* Cap Tassel */}
      <path
        d="M44.5 20.5V27.5"
        stroke="#fbbf24"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="44.5" cy="28.5" r="1.4" fill="#fbbf24" />

      {/* Open Book of Knowledge */}
      <path
        d="M19 36.5C22.8 35 27.4 35.4 32 37.8C36.6 35.4 41.2 35 45 36.5V46C41.2 44.5 36.6 44.9 32 47.3C27.4 44.9 22.8 44.5 19 46V36.5Z"
        fill="#ffffff"
        fillOpacity="0.95"
      />
      <path
        d="M32 37.8V47.3"
        stroke="#1e3a8a"
        strokeWidth="1.6"
        strokeLinecap="round"
      />

      {/* Connecting Learners Network Nodes */}
      <path
        d="M24 50.5L32 53.5L40 50.5"
        stroke="url(#icct-gold)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="24" cy="50.5" r="2" fill="#fde68a" />
      <circle cx="32" cy="53.5" r="2.3" fill="#fbbf24" />
      <circle cx="40" cy="50.5" r="2" fill="#fde68a" />
    </svg>
  );
}

export function Logo({ size = "md", showSubtitle = false, className = "" }: LogoProps) {
  if (size === "lg") {
    return (
      <div className={`flex flex-col items-center text-center ${className}`}>
        <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-950/5 p-1.5 shadow-sm ring-1 ring-indigo-900/10">
          <LogoMark className="h-14 w-14" />
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-indigo-800 ring-1 ring-indigo-200/80">
          ICCT Colleges
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
          Connecting Learners
        </h1>
        {showSubtitle ? (
          <p className="mt-1 text-sm text-slate-600">
            Student-Centered Academic &amp; Enrollment Information System
          </p>
        ) : null}
      </div>
    );
  }

  const markSize = size === "sm" ? "h-9 w-9" : "h-11 w-11";
  const titleSize = size === "sm" ? "text-sm" : "text-base";

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark className={`${markSize} shrink-0`} />
      <div className="min-w-0 leading-tight">
        <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-600">
          ICCT Colleges
        </span>
        <span className={`block truncate font-bold tracking-tight text-indigo-950 ${titleSize}`}>
          Connecting Learners
        </span>
        {showSubtitle ? (
          <span className="block truncate text-[11px] text-slate-500">
            Student Information System
          </span>
        ) : null}
      </div>
    </div>
  );
}
