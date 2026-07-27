import Link from "next/link";
import { listBrands } from "@/lib/brands";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await ensureSeed();
  const brands = listBrands();

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-12">
      <section className="mx-auto max-w-5xl">
        <p className="text-sm uppercase tracking-[0.14em] text-slate-500">
          Unified Learning Platform
        </p>
        <h1 className="mt-3 text-4xl font-semibold text-slate-950 sm:text-5xl">
          One backend. Two brands. Every device.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-slate-700">
          Ascend Academy and Nihongo Bridge share a single Next.js + PostgreSQL
          backend that powers the CMS, LMS, digital asset management, editorial
          workflow, and multilingual content — ready for web, Android, iOS,
          desktop, a future AI Tutor, and marketplace.
        </p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {brands.map((b) => (
            <Link
              key={b.key}
              href={`/${b.slug}`}
              className="group rounded-3xl bg-white p-8 shadow-[0_18px_50px_rgba(16,24,40,0.08)] transition hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(16,24,40,0.14)]"
              style={{ borderTop: `4px solid ${b.theme.accent}` }}
            >
              <p
                className="text-xs uppercase tracking-[0.18em]"
                style={{ color: b.theme.accent }}
              >
                {b.key === "nihongo" ? "日本語" : "Learning"}
              </p>
              <h2 className="mt-3 text-2xl font-semibold" style={{ color: b.theme.primary }}>
                {b.name}
              </h2>
              <p className="mt-3 text-sm text-slate-600">{b.tagline}</p>
              <p className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-slate-900 group-hover:gap-3">
                Enter site →
              </p>
            </Link>
          ))}
        </div>

        <div className="mt-10 rounded-2xl bg-white/60 p-6 text-sm text-slate-600 backdrop-blur">
          <div className="flex items-center justify-between">
            <p className="font-medium text-slate-900">Shared REST API</p>
            <Link href="/admin" className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-800">
              ⚙️ CMS Admin
            </Link>
          </div>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            <li>
              <code>GET /api/v1/brands</code>
            </li>
            <li>
              <code>GET /api/v1/courses?brand=…</code>
            </li>
            <li>
              <code>GET /api/v1/pages?brand=…&amp;locale=…</code>
            </li>
            <li>
              <code>GET /api/v1/assets?brand=…&amp;kind=…</code>
            </li>
            <li>
              <code>POST /api/v1/translations</code>
            </li>
            <li>
              <code>POST /api/v1/pages/[id]/transition</code>
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
}
