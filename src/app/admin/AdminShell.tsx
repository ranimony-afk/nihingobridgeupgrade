import React from "react";
import Link from "next/link";

export function AdminShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-black/10 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <Link href="/admin" className="font-semibold tracking-tight">
            ⚙️ Unified Platform — <span className="text-amber-700">Headless CMS Admin</span>
          </Link>
          <nav className="flex gap-4 text-xs font-medium text-slate-600">
            <Link href="/" className="hover:text-slate-900">Brand Hub</Link>
            <Link href="/api/v1/swagger" className="hover:text-slate-900">API Docs</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}
