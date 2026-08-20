import fs from "fs";
import path from "path";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const docMap: Record<string, { file: string; title: string; icon: string }> = {
  "read-first": { file: "00_READ_FIRST.md", title: "Read This First", icon: "📖" },
  "roadmap": { file: "MASTER_ROADMAP.md", title: "Master Roadmap", icon: "🗓️" },
  "architecture": { file: "TARGET_ARCHITECTURE.md", title: "Target Architecture", icon: "🏛️" },
  "domain-model": { file: "DOMAIN_MODEL.md", title: "Domain Model", icon: "📐" },
  "api-contract": { file: "API_CONTRACT.md", title: "API Contract", icon: "📡" },
  "decisions": { file: "DECISION_LOG.md", title: "Decision Log", icon: "📋" },
  "risks": { file: "RISK_REGISTER.md", title: "Risk Register", icon: "⚠️" },
};

export function generateStaticParams() {
  return Object.keys(docMap).map((slug) => ({ slug }));
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = docMap[slug];
  if (!doc) notFound();

  const rootDir = path.join(process.cwd(), "nihongobridge-integration-masterplan");
  let content = "";
  try {
    content = fs.readFileSync(path.join(rootDir, doc.file), "utf-8");
  } catch {
    notFound();
  }

  // Parse markdown into sections
  const lines = content.split("\n");
  const sections: { level: number; title: string; content: string[] }[] = [];
  let currentSection: { level: number; title: string; content: string[] } | null = null;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      if (currentSection) sections.push(currentSection);
      currentSection = { level: headingMatch[1].length, title: headingMatch[2], content: [] };
    } else if (currentSection) {
      currentSection.content.push(line);
    } else {
      // Content before first heading
      if (!currentSection) {
        currentSection = { level: 0, title: "", content: [line] };
      }
    }
  }
  if (currentSection) sections.push(currentSection);

  const allDocs = Object.entries(docMap);

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950">
        <div className="mx-auto max-w-5xl px-6 py-6">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-accent transition-colors mb-4">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Control Tower
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{doc.icon}</span>
            <div>
              <h1 className="text-3xl font-bold text-slate-100">{doc.title}</h1>
              <p className="text-sm text-slate-500 font-mono">{doc.file}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex gap-8">
          {/* Sidebar nav */}
          <aside className="hidden lg:block w-48 shrink-0">
            <nav className="sticky top-8 space-y-1">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Documents</div>
              {allDocs.map(([s, d]) => (
                <Link
                  key={s}
                  href={`/docs/${s}`}
                  className={`block rounded-lg px-3 py-1.5 text-sm transition-colors ${
                    s === slug ? "bg-indigo-accent/20 text-indigo-300" : "text-slate-500 hover:text-slate-300 hover:bg-slate-900"
                  }`}
                >
                  {d.icon} {d.title}
                </Link>
              ))}
            </nav>
          </aside>

          {/* Content */}
          <article className="flex-1 min-w-0">
            <div className="prose prose-invert prose-sm max-w-none
              prose-headings:text-slate-100
              prose-p:text-slate-400
              prose-strong:text-slate-200
              prose-code:text-indigo-300 prose-code:bg-slate-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
              prose-li:text-slate-400
              prose-table:text-slate-400
              prose-th:text-slate-300 prose-th:border-slate-700
              prose-td:border-slate-800
              prose-hr:border-slate-800
              prose-blockquote:border-indigo-accent prose-blockquote:text-slate-400
              prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-800
            ">
              <MarkdownRenderer content={content} />
            </div>
          </article>
        </div>
      </div>
    </main>
  );
}

function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split("\n");
  const html: string[] = [];
  let inCodeBlock = false;
  let inTable = false;
  let inList = false;
  let codeLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        html.push(`<pre><code>${codeLines.join("\n")}</code></pre>`);
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      codeLines.push(escapeHtml(line));
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      if (inList) { inList = false; html.push("</ul>"); }
      if (inTable) { inTable = false; html.push("</tbody></table>"); }
      html.push("");
      continue;
    }

    // Headings
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      const level = h[1].length;
      html.push(`<h${level}>${formatInline(h[2])}</h${level}>`);
      continue;
    }

    // Horizontal rule
    if (line.match(/^---+$/)) {
      html.push("<hr />");
      continue;
    }

    // Table
    if (line.startsWith("|")) {
      const cells = line.split("|").filter(Boolean).map((c) => c.trim());
      if (!inTable) {
        // Check if next line is separator
        const nextLine = lines[i + 1] || "";
        if (nextLine.match(/^\|[-\s|]+\|$/)) {
          inTable = true;
          html.push(`<table><thead><tr>${cells.map((c) => `<th>${formatInline(c)}</th>`).join("")}</tr></thead><tbody>`);
          i++; // skip separator
          continue;
        }
      }
      if (inTable) {
        html.push(`<tr>${cells.map((c) => `<td>${formatInline(c)}</td>`).join("")}</tr>`);
        continue;
      }
    }

    // List items
    if (line.match(/^[-*]\s+/) || line.match(/^\d+\.\s+/)) {
      const isCheckbox = line.includes("[ ]") || line.includes("[x]");
      const text = line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "");
      if (!inList) { inList = true; html.push("<ul>"); }
      if (isCheckbox) {
        const checked = line.includes("[x]");
        const cleanText = text.replace(/\[[ x]\]\s*/, "");
        html.push(`<li class="flex items-center gap-2"><span class="${checked ? "text-emerald-400" : "text-slate-600"}">${checked ? "✅" : "⬜"}</span>${formatInline(cleanText)}</li>`);
      } else {
        html.push(`<li>${formatInline(text)}</li>`);
      }
      continue;
    }

    // Paragraph
    html.push(`<p>${formatInline(line)}</p>`);
  }

  if (inCodeBlock && codeLines.length > 0) {
    html.push(`<pre><code>${codeLines.join("\n")}</code></pre>`);
  }
  if (inList) html.push("</ul>");
  if (inTable) html.push("</tbody></table>");

  return <div dangerouslySetInnerHTML={{ __html: html.join("\n") }} />;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatInline(text: string): string {
  let result = escapeHtml(text);
  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic
  result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Inline code
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Links
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-indigo-accent hover:underline">$1</a>');
  return result;
}
