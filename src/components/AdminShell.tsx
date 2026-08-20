import Link from "next/link";
import type { ReactNode } from "react";
import { AdminLogout } from "@/components/AdminLogout";

export function AdminShell({
  staff,
  children,
}: {
  staff: { name: string; email: string; role: string };
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0f172a] text-white">
      <header className="border-b border-white/10 bg-[#111827]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#58cc02]">CMS</p>
            <Link href="/admin" className="text-xl font-black">
              NihongoBridge Admin
            </Link>
          </div>
          <nav className="flex items-center gap-4 text-sm font-bold text-white/70">
            <Link href="/admin">Audit</Link>
            <Link href="/admin/analytics">Analytics</Link>
            <Link href="/admin/seo">SEO</Link>
            <Link href="/admin/infra">Infra</Link>
            <Link href="/admin/identity">Identity</Link>
            <Link href="/admin/billing">Billing</Link>
            <Link href="/admin/affiliates">Affiliates</Link>
            <Link href="/admin/kg">Graph</Link>
            <Link href="/admin/kanji">Kanji</Link>
            <Link href="/admin/grammar">Grammar</Link>
            <Link href="/admin/tutor">Tutor</Link>
            <Link href="/admin/content">Content</Link>
            <Link href="/admin/search">Search</Link>
            <Link href="/audit">Public report</Link>
            <Link href="/learn">LMS</Link>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs">
              {staff.name} · {staff.role}
            </span>
            <AdminLogout />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
