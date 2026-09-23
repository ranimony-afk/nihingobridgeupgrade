/**
 * Version comparison view — Phase 13.5D-2.
 *
 * Read-only rendering of the deterministic JSON diff. Change kinds are
 * conveyed with text labels (Added/Removed/Changed), never color alone.
 * Snapshot payloads render as plain React text — never HTML.
 */
import { useMemo } from "react";
import { changedEntries, diffSnapshots } from "@/lib/cms-review/diff";
import type { DiffKind } from "@/lib/cms-review/diff";

const KIND_LABEL: Record<DiffKind, string> = {
  added: "Added",
  removed: "Removed",
  changed: "Changed",
  unchanged: "Unchanged",
};

const KIND_BADGE: Record<DiffKind, string> = {
  added: "bg-emerald-100 text-emerald-800 border-emerald-200",
  removed: "bg-red-100 text-red-800 border-red-200",
  changed: "bg-amber-100 text-amber-800 border-amber-200",
  unchanged: "bg-slate-100 text-slate-600 border-slate-200",
};

function formatValue(value: unknown): string {
  if (value === undefined) return "—";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? "—";
  } catch {
    return "—";
  }
}

export function VersionDiff({
  beforeLabel,
  afterLabel,
  before,
  after,
}: {
  beforeLabel: string;
  afterLabel: string;
  before: unknown;
  after: unknown;
}) {
  const changes = useMemo(
    () => changedEntries(diffSnapshots(before, after)),
    [before, after]
  );

  if (changes.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No differences between {beforeLabel} and {afterLabel}.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-500" role="status">
        {changes.length} changed field{changes.length === 1 ? "" : "s"}{" "}
        between {beforeLabel} and {afterLabel}.
      </p>
      <ul className="space-y-2">
        {changes.map((entry) => (
          <li
            key={`${entry.kind}:${entry.path}`}
            className="rounded-2xl border border-slate-200 bg-white p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${KIND_BADGE[entry.kind]}`}
              >
                {KIND_LABEL[entry.kind]}
              </span>
              <code className="text-[11px] font-mono font-bold text-slate-700 break-all">
                {entry.path === "" ? "(root)" : entry.path}
              </code>
            </div>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="rounded-xl bg-slate-50 p-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {beforeLabel} (before)
                </p>
                <p className="mt-1 text-xs font-mono text-slate-700 whitespace-pre-wrap break-words">
                  {formatValue(entry.before)}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {afterLabel} (after)
                </p>
                <p className="mt-1 text-xs font-mono text-slate-700 whitespace-pre-wrap break-words">
                  {formatValue(entry.after)}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
