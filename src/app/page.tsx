import { db } from "@/db";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface PhaseInfo {
  id: number;
  name: string;
  description: string;
  status: "pending" | "active" | "complete";
  icon: string;
}

const phases: PhaseInfo[] = [
  { id: 0, name: "Discovery & Audit", description: "Complete — Conditional gate pass granted (DEC-0007)", status: "complete", icon: "🔍" },
  { id: 1, name: "Foundation & Schema", description: "Database schema consolidation", status: "pending", icon: "🏗️" },
  { id: 2, name: "Knowledge ETL", description: "Dictionary, kanji, grammar pipelines", status: "pending", icon: "📚" },
  { id: 3, name: "Search & Retrieval", description: "Search infrastructure and API", status: "pending", icon: "🔎" },
  { id: 4, name: "Learning Engine", description: "Courses, lessons, quizzes, progress", status: "pending", icon: "🎓" },
  { id: 5, name: "SRS & Review", description: "Spaced repetition system", status: "pending", icon: "🧠" },
  { id: 6, name: "AI Integration", description: "AI tutor, RAG, explanations", status: "pending", icon: "🤖" },
  { id: 7, name: "Gamification", description: "XP, streaks, achievements", status: "pending", icon: "🏆" },
  { id: 8, name: "Mobile (Flutter)", description: "Flutter client integration", status: "pending", icon: "📱" },
  { id: 9, name: "Production & Deploy", description: "CI/CD, monitoring, security", status: "pending", icon: "🚀" },
];

const principles = [
  { icon: "🛡️", title: "Preservation First", desc: "Existing functionality is an asset" },
  { icon: "📊", title: "Evidence-Based", desc: "Every decision requires evidence" },
  { icon: "♻️", title: "Non-Destructive", desc: "No blind resets or drops" },
  { icon: "⬅️", title: "Backward Compatible", desc: "Existing APIs must continue to work" },
  { icon: "🔒", title: "Security", desc: "Auth, secrets, access control" },
  { icon: "🧪", title: "Testability", desc: "Verified at every gate" },
  { icon: "📐", title: "Maintainability", desc: "Clean, documented, sustainable" },
  { icon: "📦", title: "Incremental", desc: "Small, logical, reversible steps" },
  { icon: "✅", title: "Explicit Verification", desc: "Never claim without proof" },
  { icon: "↩️", title: "Rollback Capability", desc: "Every change can be undone" },
];

const risks = [
  { id: "RISK-0001", title: "Schema Conflicts", severity: "LOW", status: "REVISED", note: "Was HIGH — Repo A has no schema" },
  { id: "RISK-0002", title: "Auth Incompatibility", severity: "MEDIUM", status: "REVISED", note: "Was CRITICAL — Repo A has no auth" },
  { id: "RISK-0003", title: "Data Loss During ETL", severity: "LOW", status: "REVISED", note: "Was HIGH — No existing data" },
  { id: "RISK-0004", title: "API Breaking Changes", severity: "LOW", status: "REVISED", note: "Was HIGH — No existing APIs" },
  { id: "RISK-0005", title: "Knowledge Data Licensing", severity: "MEDIUM", status: "OPEN", note: "" },
  { id: "RISK-0006", title: "AI Cost Overrun", severity: "MEDIUM", status: "OPEN", note: "" },
  { id: "RISK-0007", title: "Mobile Sync Corruption", severity: "HIGH", status: "OPEN", note: "" },
  { id: "RISK-0008", title: "Performance Degradation", severity: "MEDIUM", status: "OPEN", note: "" },
  { id: "RISK-0009", title: "Repo B Unavailable for Inspection", severity: "HIGH", status: "NEW", note: "Identified during Phase 00 audit" },
  { id: "RISK-0010", title: "Auth Without Repo B Reference", severity: "HIGH", status: "NEW", note: "Must choose auth blind" },
  { id: "RISK-0011", title: "Control Tower / App Code Mixed", severity: "MEDIUM", status: "NEW", note: "Dashboard in src/app/" },
];

function countFiles(dir: string): number {
  try {
    return fs.readdirSync(dir).filter((f) => !f.startsWith(".")).length;
  } catch {
    return 0;
  }
}

export default async function HomePage() {
  // Verify DB connection
  await db.execute(sql`select 1`);

  const rootDir = path.join(process.cwd(), "nihongobridge-integration-masterplan");

  // Count files
  const docFiles = ["00_READ_FIRST.md", "MASTER_ROADMAP.md", "TARGET_ARCHITECTURE.md", "DOMAIN_MODEL.md", "API_CONTRACT.md", "DECISION_LOG.md", "RISK_REGISTER.md"];
  const docCount = docFiles.filter((f) => {
    try { fs.accessSync(path.join(rootDir, f)); return true; } catch { return false; }
  }).length;

  const promptCount = Array.from({ length: 10 }, (_, i) =>
    countFiles(path.join(rootDir, "prompts", `phase-0${i}`))
  ).reduce((a, b) => a + b, 0);

  const checklistCount = countFiles(path.join(rootDir, "checklists"));

  const reportDirs = ["audits", "database", "etl", "search", "ai", "mobile", "testing", "deployment"];
  const reportDirCount = reportDirs.length;

  const totalFiles = docCount + promptCount + checklistCount + reportDirCount;

  return (
    <main className="min-h-screen">
      {/* Hero Section */}
      <header className="relative overflow-hidden border-b border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 text-9xl text-indigo-accent select-none">橋</div>
          <div className="absolute bottom-10 right-10 text-8xl text-sakura select-none">日本語</div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[12rem] text-slate-700 select-none opacity-20">⛩️</div>
        </div>
        <div className="relative z-10 mx-auto max-w-7xl px-6 py-16 sm:py-24">
          <div className="animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-4xl">⛩️</span>
              <span className="text-sm font-semibold uppercase tracking-widest text-indigo-accent">Integration Control Tower</span>
            </div>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
              NihongoBridge
            </h1>
            <p className="mt-3 text-xl sm:text-2xl text-slate-400 max-w-3xl">
              Master integration control for safely building a production-grade Japanese learning ecosystem.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <StatusBadge label="Database" status="connected" />
              <StatusBadge label={`${docCount} Core Documents`} status="ready" />
              <StatusBadge label={`${promptCount} Prompt Files`} status="ready" />
              <StatusBadge label={`${checklistCount} Checklists`} status="ready" />
              <StatusBadge label={`${reportDirCount} Report Dirs`} status="ready" />
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-12 space-y-16">
        {/* Repository Map */}
        <section>
          <SectionHeader icon="🗺️" title="Repository Map" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
            <RepoCard
              name="nihingobridgeupgrade"
              label="CANONICAL"
              labelColor="bg-jade"
              description="Primary application repository. All production code lives here. Contains auth, API, UI, and infrastructure."
              role="PRIMARY — Do not rebuild"
            />
            <RepoCard
              name="Knowledge-base-NihongoBridge"
              label="SOURCE"
              labelColor="bg-gold"
              description="Knowledge, ETL, UI, CMS, test, and mobile source. Selected components only after verification."
              role="SECONDARY — Integrate selectively"
            />
            <RepoCard
              name="integration-masterplan"
              label="CONTROL"
              labelColor="bg-indigo-accent"
              description="This repository. Planning, prompts, reports, checklists. No application code. Your control tower."
              role="CONTROL — Documentation only"
            />
          </div>
        </section>

        {/* Guiding Principles */}
        <section>
          <SectionHeader icon="⚖️" title="Guiding Principles" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mt-6">
            {principles.map((p) => (
              <div key={p.title} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-center hover:border-indigo-accent/50 transition-colors">
                <div className="text-2xl mb-2">{p.icon}</div>
                <div className="text-sm font-semibold text-slate-200">{p.title}</div>
                <div className="text-xs text-slate-500 mt-1">{p.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Phase Roadmap */}
        <section>
          <SectionHeader icon="🗓️" title="Integration Phases" subtitle="10 phases from discovery to production" />
          <div className="mt-6 space-y-3">
            {phases.map((phase) => (
              <PhaseCard key={phase.id} phase={phase} />
            ))}
          </div>
        </section>

        {/* Phase 00 Audit Results */}
        <section>
          <SectionHeader icon="✅" title="Phase 00 Audit Results" subtitle="Completed — Conditional gate pass granted" />
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-6">
              <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider mb-4">Key Findings</h3>
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="flex items-start gap-2"><span className="text-emerald-400 mt-0.5">✓</span> Repo A is a clean Next.js + PostgreSQL starter</li>
                <li className="flex items-start gap-2"><span className="text-emerald-400 mt-0.5">✓</span> Database is empty — 0 tables, no data at risk</li>
                <li className="flex items-start gap-2"><span className="text-emerald-400 mt-0.5">✓</span> Zero conflicts between repositories</li>
                <li className="flex items-start gap-2"><span className="text-emerald-400 mt-0.5">✓</span> No auth exists — must be built fresh</li>
                <li className="flex items-start gap-2"><span className="text-emerald-400 mt-0.5">✓</span> No API contracts to honor (except /api/health)</li>
                <li className="flex items-start gap-2"><span className="text-emerald-400 mt-0.5">✓</span> All dependencies are modern and current</li>
              </ul>
            </div>
            <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-6">
              <h3 className="text-sm font-semibold text-amber-400 uppercase tracking-wider mb-4">Open Items</h3>
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="flex items-start gap-2"><span className="text-amber-400 mt-0.5">⚠</span> Repo B not available for inspection (RISK-0009)</li>
                <li className="flex items-start gap-2"><span className="text-amber-400 mt-0.5">⚠</span> Auth strategy pending decision (DEC-0005)</li>
                <li className="flex items-start gap-2"><span className="text-amber-400 mt-0.5">⚠</span> Zero test infrastructure exists</li>
              </ul>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
              <h3 className="text-sm font-semibold text-indigo-accent uppercase tracking-wider mb-4">Audit Deliverables</h3>
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="flex items-center gap-2"><span className="text-indigo-accent">📄</span> repo-audit.md</li>
                <li className="flex items-center gap-2"><span className="text-indigo-accent">📊</span> repo-a-inventory.csv</li>
                <li className="flex items-center gap-2"><span className="text-indigo-accent">📊</span> repo-b-inventory.csv</li>
                <li className="flex items-center gap-2"><span className="text-indigo-accent">📋</span> decision-matrix-draft.md</li>
                <li className="flex items-center gap-2"><span className="text-indigo-accent">⚠️</span> risk-analysis.md</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Absolute Rules */}
        <section>
          <SectionHeader icon="🚫" title="Absolute Rules" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <RuleCard
              rule="DO NOT rebuild from scratch"
              detail="Extend and improve the existing implementation in Repository 1."
              severity="critical"
            />
            <RuleCard
              rule="DO NOT perform destructive DB ops"
              detail="No DROP TABLE, TRUNCATE, or blind resets without explicit authorization."
              severity="critical"
            />
            <RuleCard
              rule="DO NOT replace Repository 1 auth"
              detail="Repository 1 authentication is authoritative. Adapt, don't replace."
              severity="critical"
            />
            <RuleCard
              rule="DO NOT silently start future phases"
              detail="Work only on the requested phase. Document dependencies on future phases."
              severity="high"
            />
            <RuleCard
              rule="DO NOT claim without evidence"
              detail="Never say something exists unless you can provide file path and evidence."
              severity="high"
            />
            <RuleCard
              rule="STOP when uncertain"
              detail="If you cannot determine safe integration, stop and report — don't guess."
              severity="high"
            />
          </div>
        </section>

        {/* Risk Register Summary */}
        <section>
          <SectionHeader icon="⚠️" title="Risk Register" subtitle={`${risks.length} identified risks`} />
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left">
                  <th className="py-3 px-4 text-slate-400 font-medium">ID</th>
                  <th className="py-3 px-4 text-slate-400 font-medium">Risk</th>
                  <th className="py-3 px-4 text-slate-400 font-medium">Severity</th>
                  <th className="py-3 px-4 text-slate-400 font-medium">Status</th>
                  <th className="py-3 px-4 text-slate-400 font-medium hidden sm:table-cell">Notes</th>
                </tr>
              </thead>
              <tbody>
                {risks.map((risk) => {
                  const statusColors: Record<string, string> = {
                    OPEN: "bg-amber-950 text-amber-300",
                    REVISED: "bg-blue-950 text-blue-300",
                    NEW: "bg-violet-950 text-violet-300",
                  };
                  const dotColors: Record<string, string> = {
                    OPEN: "bg-amber-400",
                    REVISED: "bg-blue-400",
                    NEW: "bg-violet-400",
                  };
                  return (
                    <tr key={risk.id} className="border-b border-slate-800/50 hover:bg-slate-900/50">
                      <td className="py-3 px-4 font-mono text-xs text-slate-500">{risk.id}</td>
                      <td className="py-3 px-4 text-slate-200">{risk.title}</td>
                      <td className="py-3 px-4">
                        <SeverityBadge severity={risk.severity} />
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[risk.status] || "bg-slate-800 text-slate-400"}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${dotColors[risk.status] || "bg-slate-500"}`} />
                          {risk.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500 hidden sm:table-cell">{risk.note}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Integration Classification */}
        <section>
          <SectionHeader icon="🏷️" title="Integration Classifications" subtitle="Every component must be classified" />
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mt-6">
            {[
              { label: "KEEP", color: "bg-emerald-900 text-emerald-300 border-emerald-700", desc: "Preserve as-is" },
              { label: "MODIFY", color: "bg-blue-900 text-blue-300 border-blue-700", desc: "Change carefully" },
              { label: "MERGE", color: "bg-violet-900 text-violet-300 border-violet-700", desc: "Combine sources" },
              { label: "MOVE", color: "bg-cyan-900 text-cyan-300 border-cyan-700", desc: "Relocate" },
              { label: "DEPRECATE", color: "bg-yellow-900 text-yellow-300 border-yellow-700", desc: "Phase out" },
              { label: "REPLACE", color: "bg-orange-900 text-orange-300 border-orange-700", desc: "Swap fully" },
              { label: "ARCHIVE", color: "bg-slate-800 text-slate-400 border-slate-600", desc: "Store for reference" },
            ].map((c) => (
              <div key={c.label} className={`rounded-lg border p-3 text-center ${c.color}`}>
                <div className="text-sm font-bold">{c.label}</div>
                <div className="text-xs mt-1 opacity-75">{c.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Control Repository Structure */}
        <section>
          <SectionHeader icon="📁" title="Control Repository Structure" />
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
              <h3 className="text-lg font-semibold text-slate-200 mb-4">📄 Core Documents</h3>
              <div className="space-y-2">
                {[
                  { file: "00_READ_FIRST.md", desc: "Start here — repository guide" },
                  { file: "MASTER_ROADMAP.md", desc: "Full 10-phase integration plan" },
                  { file: "TARGET_ARCHITECTURE.md", desc: "System architecture & tech stack" },
                  { file: "DOMAIN_MODEL.md", desc: "Entity catalog & relationships" },
                  { file: "API_CONTRACT.md", desc: "API surface & versioning rules" },
                  { file: "DECISION_LOG.md", desc: "All integration decisions" },
                  { file: "RISK_REGISTER.md", desc: "Known risks & mitigations" },
                ].map((d) => (
                  <div key={d.file} className="flex items-center gap-3 rounded-lg bg-slate-800/50 px-3 py-2">
                    <span className="text-indigo-accent">📄</span>
                    <div>
                      <div className="text-sm font-mono text-slate-300">{d.file}</div>
                      <div className="text-xs text-slate-500">{d.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
                <h3 className="text-lg font-semibold text-slate-200 mb-4">📋 Prompts (per phase)</h3>
                <div className="grid grid-cols-5 gap-2">
                  {Array.from({ length: 10 }, (_, i) => (
                    <div key={i} className="rounded-lg bg-slate-800/70 p-2 text-center">
                      <div className="text-xs text-slate-500">Phase</div>
                      <div className="text-lg font-bold text-indigo-accent">0{i}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
                <h3 className="text-lg font-semibold text-slate-200 mb-4">📊 Report Directories</h3>
                <div className="grid grid-cols-4 gap-2">
                  {reportDirs.map((dir) => (
                    <div key={dir} className="rounded-lg bg-slate-800/70 px-2 py-1.5 text-center">
                      <div className="text-xs text-slate-400 capitalize">{dir}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
                <h3 className="text-lg font-semibold text-slate-200 mb-4">✅ Checklists</h3>
                <div className="text-sm text-slate-400">
                  <span className="text-2xl font-bold text-jade">{checklistCount}</span> phase checklists ready
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Target Platform */}
        <section>
          <SectionHeader icon="🎯" title="Target Platform Capabilities" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <CapabilityCard
              icon="📚"
              title="Knowledge"
              items={["Dictionary", "Vocabulary", "Kanji & Radicals", "Grammar", "Sentences", "Conjugations", "Frequency", "Provenance"]}
            />
            <CapabilityCard
              icon="🎓"
              title="Learning"
              items={["Courses & Modules", "Lessons", "Quizzes & Practice", "JLPT Prep", "Progress Tracking", "Listening & Reading"]}
            />
            <CapabilityCard
              icon="🧠"
              title="SRS"
              items={["Decks & Cards", "Review Scheduling", "FSRS/SM-2", "Review History", "Algorithm Abstraction", "Synchronization"]}
            />
            <CapabilityCard
              icon="🤖"
              title="AI"
              items={["AI Tutor", "Grammar Explanations", "Translation", "Correction", "Conversation", "RAG", "Context-Aware"]}
            />
            <CapabilityCard
              icon="🏆"
              title="Gamification"
              items={["XP & Levels", "Streaks", "Achievements", "Daily Goals", "Milestones", "Progress"]}
            />
            <CapabilityCard
              icon="🔧"
              title="Administration"
              items={["Dictionary Mgmt", "Content CMS", "Question Bank", "ETL Management", "User Admin", "Analytics"]}
            />
            <CapabilityCard
              icon="📱"
              title="Mobile"
              items={["Auth", "Dictionary", "Learning", "SRS", "AI Tutor", "Offline Cache", "Sync"]}
            />
            <CapabilityCard
              icon="🚀"
              title="Production"
              items={["CI/CD", "Testing", "Monitoring", "Backups", "DR", "Security", "Logging"]}
            />
          </div>
        </section>

        {/* Decision Log Summary */}
        <section>
          <SectionHeader icon="📋" title="Foundation Decisions" subtitle="Pre-phase architectural decisions" />
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { id: "DEC-0001", title: "Repository 1 Is Authoritative", confidence: "HIGH", risk: "LOW" },
              { id: "DEC-0002", title: "Non-Destructive Database Only", confidence: "HIGH", risk: "LOW" },
              { id: "DEC-0003", title: "Repository 1 Auth Is Authoritative", confidence: "HIGH", risk: "LOW" },
              { id: "DEC-0004", title: "PostgreSQL + Drizzle Is Canonical", confidence: "HIGH", risk: "LOW" },
            ].map((d) => (
              <div key={d.id} className="flex items-start gap-4 rounded-xl border border-slate-800 bg-slate-900/50 p-4 hover:border-indigo-accent/30 transition-colors">
                <div className="shrink-0 rounded-lg bg-indigo-accent/20 px-2.5 py-1 text-xs font-mono text-indigo-accent">{d.id}</div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-200">{d.title}</div>
                  <div className="mt-1 flex gap-2">
                    <span className="inline-flex items-center rounded-full bg-emerald-950 px-2 py-0.5 text-xs text-emerald-400">✓ ACCEPTED</span>
                    <span className="text-xs text-slate-500">Confidence: {d.confidence}</span>
                    <span className="text-xs text-slate-500">Risk: {d.risk}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Arena Master Instruction */}
        <section>
          <SectionHeader icon="🤖" title="Arena AI Master Instruction" subtitle="System-level context for every phase" />
          <div className="mt-6 rounded-xl border border-indigo-accent/30 bg-indigo-950/30 p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-2 w-2 rounded-full bg-indigo-accent animate-pulse" />
              <span className="text-sm font-semibold text-indigo-accent uppercase tracking-wider">Active Instruction</span>
            </div>
            <div className="space-y-3 text-sm text-slate-400">
              <p><strong className="text-slate-200">Role:</strong> Senior staff-level software engineering team for safe integration</p>
              <p><strong className="text-slate-200">Canonical App:</strong> <code className="text-indigo-300 bg-slate-800 px-1.5 py-0.5 rounded">nihingobridgeupgrade</code></p>
              <p><strong className="text-slate-200">Knowledge Source:</strong> <code className="text-indigo-300 bg-slate-800 px-1.5 py-0.5 rounded">Knowledge-base-NihongoBridge</code></p>
              <p><strong className="text-slate-200">Database:</strong> PostgreSQL + Drizzle ORM (authoritative)</p>
              <p><strong className="text-slate-200">Auth:</strong> Repository 1 only (authoritative)</p>
              <p><strong className="text-slate-200">Mobile:</strong> Flutter as API client (no duplicated logic)</p>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {["Phase Rule", "Evidence Rule", "Verification Rule", "Gate Rule", "Stop Rule", "Commit Rule", "Non-Destructive DB", "API Backward Compat", "AI Knowledge-Aware"].map((rule) => (
                  <div key={rule} className="rounded bg-slate-800/70 px-2 py-1 text-xs text-center text-slate-400">
                    {rule}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-slate-800 pt-8 pb-12">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">⛩️</span>
              <span className="text-sm text-slate-500">NihongoBridge Integration Control Tower</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600">
              <span>{totalFiles} control files</span>
              <span>•</span>
              <span>10 phases</span>
              <span>•</span>
              <span>0 application code files</span>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}

/* ——— Sub-components ——— */

function SectionHeader({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) {
  return (
    <div className="flex items-end gap-3">
      <span className="text-3xl">{icon}</span>
      <div>
        <h2 className="text-2xl font-bold text-slate-100">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
    </div>
  );
}

function StatusBadge({ label, status }: { label: string; status: "connected" | "ready" | "pending" }) {
  const colors = {
    connected: "bg-emerald-950 text-emerald-300 border-emerald-800",
    ready: "bg-indigo-950 text-indigo-300 border-indigo-800",
    pending: "bg-slate-800 text-slate-400 border-slate-700",
  };
  const dots = {
    connected: "bg-emerald-400",
    ready: "bg-indigo-400",
    pending: "bg-slate-500",
  };
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${colors[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dots[status]}`} />
      {label}
    </span>
  );
}

function RepoCard({ name, label, labelColor, description, role }: { name: string; label: string; labelColor: string; description: string; role: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 hover:border-slate-700 transition-colors">
      <div className="flex items-center gap-2 mb-3">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${labelColor}`}>{label}</span>
      </div>
      <h3 className="text-base font-mono font-semibold text-slate-200">{name}</h3>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
      <p className="mt-3 text-xs font-medium text-slate-400 border-t border-slate-800 pt-3">{role}</p>
    </div>
  );
}

function PhaseCard({ phase }: { phase: PhaseInfo }) {
  const statusColors = {
    pending: "border-slate-700 bg-slate-900/30",
    active: "border-indigo-accent/50 bg-indigo-950/30 animate-pulse-glow",
    complete: "border-emerald-700 bg-emerald-950/30",
  };
  const statusBadge = {
    pending: "bg-slate-800 text-slate-500",
    active: "bg-indigo-900 text-indigo-300",
    complete: "bg-emerald-900 text-emerald-300",
  };

  return (
    <div className={`flex items-center gap-4 rounded-xl border p-4 transition-all hover:bg-slate-900/60 ${statusColors[phase.status]}`}>
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-2xl">
        {phase.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-500">Phase {String(phase.id).padStart(2, "0")}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusBadge[phase.status]}`}>
            {phase.status}
          </span>
        </div>
        <h3 className="text-sm font-semibold text-slate-200">{phase.name}</h3>
        <p className="text-xs text-slate-500">{phase.description}</p>
      </div>
      <div className="shrink-0 text-slate-700">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
}

function RuleCard({ rule, detail, severity }: { rule: string; detail: string; severity: "critical" | "high" }) {
  const border = severity === "critical" ? "border-red-900/60" : "border-amber-900/60";
  const icon = severity === "critical" ? "🔴" : "🟡";
  return (
    <div className={`rounded-xl border ${border} bg-slate-900/50 p-4`}>
      <div className="flex items-start gap-2">
        <span className="text-sm">{icon}</span>
        <div>
          <div className="text-sm font-semibold text-slate-200">{rule}</div>
          <div className="text-xs text-slate-500 mt-1">{detail}</div>
        </div>
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    CRITICAL: "bg-red-950 text-red-300",
    HIGH: "bg-orange-950 text-orange-300",
    MEDIUM: "bg-yellow-950 text-yellow-300",
    LOW: "bg-green-950 text-green-300",
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[severity] || "bg-slate-800 text-slate-400"}`}>
      {severity}
    </span>
  );
}

function CapabilityCard({ icon, title, items }: { icon: string; title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 hover:border-slate-700 transition-colors">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">{icon}</span>
        <h3 className="text-sm font-bold text-slate-200">{title}</h3>
      </div>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-2 text-xs text-slate-400">
            <span className="h-1 w-1 rounded-full bg-slate-600 shrink-0" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
