/**
 * Audit trail timeline — Phase 13.5D-2.
 *
 * Chronological rendering of the 13.5D-1 audit events. Structured detail
 * fields (transition, version, reason, override, translation identity)
 * render inline; everything else hides behind an expandable Details
 * section. `ipAddress` is stripped before render as defense in depth.
 */
import {
  AUDIT_INLINE_KEYS,
  formatAuditAction,
  sortAuditChronological,
  stripIpAddress,
  summarizeAuditDetails,
} from "@/lib/cms-review/audit";
import type { ReviewAuditEvent } from "@/lib/cms-review/types";

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? "—";
  } catch {
    return "—";
  }
}

export function AuditTimeline({ events }: { events: readonly ReviewAuditEvent[] }) {
  const ordered = sortAuditChronological(events);
  if (ordered.length === 0) {
    return <p className="text-sm text-slate-500">No audit events recorded.</p>;
  }
  return (
    <ol className="relative ml-2 space-y-4 border-l-2 border-slate-200 pl-5">
      {ordered.map((event) => {
        const details = stripIpAddress(event.details);
        const summary = summarizeAuditDetails(details);
        const extraKeys = Object.keys(details)
          .filter((key) => !AUDIT_INLINE_KEYS.has(key))
          .sort();
        return (
          <li key={event.id} className="relative">
            <span
              aria-hidden="true"
              className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-red-500 shadow"
            />
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <p className="text-sm font-bold text-slate-900">
                {formatAuditAction(event.action)}
              </p>
              {summary.adminOverride && (
                <span className="rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">
                  Admin override
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] font-mono text-slate-500">
              {event.actorId} · {formatDate(event.occurredAt)}
            </p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-700">
              {summary.fromStatus && summary.toStatus && (
                <span className="font-semibold">
                  {summary.fromStatus} → {summary.toStatus}
                </span>
              )}
              {summary.versionNumber !== undefined && (
                <span>v{summary.versionNumber}</span>
              )}
              {summary.targetVersion !== undefined && (
                <span>target v{summary.targetVersion}</span>
              )}
              {summary.entityType && <span>entity: {summary.entityType}</span>}
              {summary.language && <span>language: {summary.language}</span>}
              {summary.translationId && (
                <span className="font-mono">translation {summary.translationId}</span>
              )}
            </div>
            {summary.reason && (
              <blockquote className="mt-1.5 border-l-2 border-slate-200 pl-2 text-xs italic text-slate-600">
                “{summary.reason}”
              </blockquote>
            )}
            {extraKeys.length > 0 && (
              <details className="mt-1.5">
                <summary className="cursor-pointer text-[11px] font-bold text-slate-500">
                  Details ({extraKeys.length})
                </summary>
                <dl className="mt-1 space-y-0.5 rounded-xl bg-slate-50 p-2 text-[11px]">
                  {extraKeys.map((key) => (
                    <div key={key} className="flex gap-2">
                      <dt className="font-mono font-bold text-slate-500 shrink-0">
                        {key}:
                      </dt>
                      <dd className="font-mono text-slate-700 break-all">
                        {formatDetailValue(details[key])}
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
          </li>
        );
      })}
    </ol>
  );
}
