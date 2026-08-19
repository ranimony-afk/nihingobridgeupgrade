import Link from "next/link";

export const dynamic = "force-dynamic";

const docs = [
  { slug: "read-first", file: "00_READ_FIRST.md", title: "Read This First", icon: "📖", desc: "Start here — understand the repository structure and rules" },
  { slug: "roadmap", file: "MASTER_ROADMAP.md", title: "Master Roadmap", icon: "🗓️", desc: "Complete 10-phase integration plan with deliverables and gates" },
  { slug: "architecture", file: "TARGET_ARCHITECTURE.md", title: "Target Architecture", icon: "🏛️", desc: "System architecture, tech stack, and directory structure" },
  { slug: "domain-model", file: "DOMAIN_MODEL.md", title: "Domain Model", icon: "📐", desc: "Domain entities, relationships, and provenance model" },
  { slug: "api-contract", file: "API_CONTRACT.md", title: "API Contract", icon: "📡", desc: "API versioning, endpoints, and compatibility rules" },
  { slug: "decisions", file: "DECISION_LOG.md", title: "Decision Log", icon: "📋", desc: "All architectural and integration decisions with rationale" },
  { slug: "risks", file: "RISK_REGISTER.md", title: "Risk Register", icon: "⚠️", desc: "Known risks, mitigations, and contingencies" },
];

export default function DocsIndex() {
  return (
    <main className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-950">
        <div className="mx-auto max-w-5xl px-6 py-6">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-accent transition-colors mb-4">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Control Tower
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-3xl">📄</span>
            <div>
              <h1 className="text-3xl font-bold text-slate-100">Control Documents</h1>
              <p className="text-sm text-slate-500">All core integration documents</p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {docs.map((doc) => (
            <Link
              key={doc.slug}
              href={`/docs/${doc.slug}`}
              className="group rounded-xl border border-slate-800 bg-slate-900/50 p-6 hover:border-indigo-accent/50 transition-all"
            >
              <div className="flex items-start gap-4">
                <span className="text-3xl">{doc.icon}</span>
                <div>
                  <h2 className="text-lg font-semibold text-slate-200 group-hover:text-indigo-accent transition-colors">{doc.title}</h2>
                  <p className="text-xs font-mono text-slate-600 mt-0.5">{doc.file}</p>
                  <p className="text-sm text-slate-500 mt-2">{doc.desc}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
