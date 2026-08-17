import Link from "next/link";
import { getAuditBundle } from "@/lib/audit/repo";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  await seedReady();
  const bundle = await getAuditBundle();

  return (
    <main className="min-h-screen bg-[#f7f7f7] text-[#3c3c3c]">
      <header className="border-b-2 border-[#e5e5e5] bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#58cc02]">Phase 1</p>
            <h1 className="text-2xl font-black">Repository audit</h1>
          </div>
          <div className="flex gap-3 text-sm font-extrabold">
            <Link href="/" className="press bg-white px-3 py-2">
              Home
            </Link>
            <Link href="/admin" className="press bg-[#3c3c3c] px-3 py-2 text-white">
              Admin CMS
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <p className="max-w-3xl text-lg">{bundle.report?.summary}</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="card p-5">
            <p className="text-xs font-extrabold uppercase tracking-widest text-[#777]">Readiness</p>
            <p className="text-4xl font-black text-[#58cc02]">{bundle.score}</p>
          </div>
          <div className="card p-5">
            <p className="text-xs font-extrabold uppercase tracking-widest text-[#777]">Coverage</p>
            <p className="text-4xl font-black text-[#1cb0f6]">{bundle.coverage}%</p>
          </div>
          <div className="card p-5">
            <p className="text-xs font-extrabold uppercase tracking-widest text-[#777]">Findings</p>
            <p className="text-4xl font-black">{bundle.findings.length}</p>
          </div>
        </div>

        <h2 className="mt-10 text-2xl font-black">Prioritized roadmap</h2>
        <ol className="mt-4 grid gap-3">
          {bundle.roadmap.map((item) => (
            <li key={item.id} className="card p-4">
              <p className="text-xs font-extrabold uppercase tracking-widest text-[#777]">
                Phase {item.phase} · {item.status}
              </p>
              <p className="text-lg font-black">{item.title}</p>
              <p className="text-sm text-[#777]">{item.description}</p>
            </li>
          ))}
        </ol>

        <h2 className="mt-10 text-2xl font-black">Findings</h2>
        <div className="mt-4 grid gap-4">
          {bundle.findings.map((finding) => (
            <article key={finding.id} className="card p-5">
              <div className="flex flex-wrap items-center gap-2 text-xs font-extrabold uppercase tracking-widest">
                <span className="rounded-full bg-[#ffdfe0] px-2 py-1 text-[#ea2b2b]">{finding.severity}</span>
                <span className="text-[#777]">{finding.domain}</span>
                <span className="text-[#777]">{finding.status}</span>
              </div>
              <h3 className="mt-2 text-xl font-black">{finding.title}</h3>
              <p className="mt-2">{finding.description}</p>
              <p className="mt-3 font-mono text-xs text-[#1cb0f6]">{finding.evidence}</p>
              <p className="mt-2 text-sm text-[#777]">
                <strong>Next:</strong> {finding.recommendation}
              </p>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
