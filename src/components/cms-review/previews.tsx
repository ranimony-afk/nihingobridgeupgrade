/**
 * Review preview panels — Phase 13.5D-2.
 *
 * Type-dispatched read-only renderers for the staged CMS payload.
 * Dictionary uses the existing payload shaper vocabulary; translation
 * shows the proposal as UNPUBLISHED until verified; unknown future
 * types fall back to a safe generic JSON panel (never a crash).
 */
import { AlertTriangle, Languages } from "lucide-react";
import { parseStagedPayload } from "@/lib/cms-admin/payload";
import { parseTranslationProposal } from "@/lib/cms-review/translation";
import { extraTranslationKeys } from "@/lib/cms-review/translation";
import type { AdminCmsItem } from "@/lib/cms-admin/types";

const labelClass = "block text-xs font-bold text-slate-700 mb-1";
const valueClass = "text-sm font-medium text-slate-900";

const KNOWN_DICTIONARY_KEYS = new Set([
  "headword",
  "reading",
  "romaji",
  "jlptLevel",
  "isCommon",
  "partsOfSpeech",
  "senses",
  "kanjiCharacters",
  "tags",
]);

function AdditionalData({ data }: { data: Record<string, unknown> }) {
  const keys = Object.keys(data).sort();
  if (keys.length === 0) return null;
  const subset: Record<string, unknown> = {};
  for (const key of keys) subset[key] = data[key];
  return (
    <details className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
      <summary className="cursor-pointer text-xs font-bold text-slate-700">
        Additional data ({keys.length} field{keys.length === 1 ? "" : "s"})
      </summary>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-[11px] font-mono text-slate-600">
        {JSON.stringify(subset, null, 2)}
      </pre>
    </details>
  );
}

export function DictionaryReviewPreview({ item }: { item: AdminCmsItem }) {
  const parsed = parseStagedPayload(item.stagedPayload);
  const payload =
    typeof item.stagedPayload === "object" && item.stagedPayload !== null
      ? (item.stagedPayload as Record<string, unknown>)
      : {};
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!KNOWN_DICTIONARY_KEYS.has(key)) extra[key] = value;
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <span className={labelClass}>Headword</span>
          <p className="font-japanese text-lg font-extrabold text-slate-900">
            {parsed.headword || "—"}
          </p>
        </div>
        <div>
          <span className={labelClass}>Reading</span>
          <p className="font-japanese text-lg font-bold text-slate-900">
            {parsed.reading || "—"}
          </p>
        </div>
        <div>
          <span className={labelClass}>Romaji</span>
          <p className={valueClass}>{parsed.romaji || "—"}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {parsed.jlptLevel && (
          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-800 border border-blue-200">
            {parsed.jlptLevel}
          </span>
        )}
        {parsed.isCommon && (
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 border border-emerald-200">
            Common word
          </span>
        )}
        {parsed.partsOfSpeech.map((pos) => (
          <span
            key={pos}
            className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-700 border border-slate-200"
          >
            {pos}
          </span>
        ))}
        {parsed.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-violet-100 px-2.5 py-0.5 text-[11px] font-bold text-violet-800 border border-violet-200"
          >
            #{tag}
          </span>
        ))}
      </div>
      <div>
        <span className={labelClass}>Meanings / senses</span>
        {parsed.senses.length === 0 ? (
          <p className="text-sm text-slate-400">No senses provided.</p>
        ) : (
          <ol className="list-decimal ml-5 space-y-1.5">
            {parsed.senses.map((sense, i) => (
              <li key={i} className="font-japanese text-sm text-slate-900">
                {sense.glosses.join("; ")}
                {sense.note && (
                  <span className="text-slate-500"> — {sense.note}</span>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
      <AdditionalData data={extra} />
    </div>
  );
}

export function TranslationReviewPreview({ item }: { item: AdminCmsItem }) {
  const proposal = parseTranslationProposal(item.stagedPayload);
  if (!proposal) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-amber-800">
          Preview unavailable — the staged proposal could not be read.
        </p>
        <GenericReviewPreview item={item} />
      </div>
    );
  }
  const needsVerification = item.status === "approved";
  const extras = extraTranslationKeys(
    item.stagedPayload as Record<string, unknown>
  );
  const extra: Record<string, unknown> = {};
  for (const key of extras) {
    extra[key] = (item.stagedPayload as Record<string, unknown>)[key];
  }
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3">
        <Languages className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-700" />
        <p className="text-xs font-semibold text-amber-900">
          Proposed translation — not yet published. It takes effect only
          after verification.
        </p>
      </div>
      {needsVerification && (
        <div className="flex items-start gap-2 rounded-2xl border border-blue-200 bg-blue-50 p-3">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-700" />
          <p className="text-xs font-bold text-blue-900">
            Verification required — an approved proposal awaiting final
            disposition.
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <span className={labelClass}>Entity type</span>
          <p className={`${valueClass} font-mono text-xs`}>{proposal.entityType}</p>
        </div>
        <div>
          <span className={labelClass}>Canonical entity ID</span>
          <p className={`${valueClass} font-mono text-xs break-all`}>
            {item.entityId ?? "—"}
          </p>
        </div>
        <div>
          <span className={labelClass}>Language</span>
          <p className={valueClass}>{proposal.language}</p>
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
        <span className={labelClass}>Translated text</span>
        <p className="text-base font-semibold text-slate-900 whitespace-pre-wrap">
          {proposal.translatedText}
        </p>
        {proposal.secondaryText && (
          <div className="mt-3">
            <span className={labelClass}>Secondary text</span>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">
              {proposal.secondaryText}
            </p>
          </div>
        )}
      </div>
      {proposal.contextNotes && (
        <div>
          <span className={labelClass}>Context notes</span>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">
            {proposal.contextNotes}
          </p>
        </div>
      )}
      <div>
        <span className={labelClass}>Proposal source reference</span>
        <p className="text-xs font-mono text-slate-600">
          {proposal.sourceRef ?? item.sourceRef}
        </p>
      </div>
      <AdditionalData data={extra} />
    </div>
  );
}

export function GenericReviewPreview({ item }: { item: AdminCmsItem }) {
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div>
          <dt className={labelClass}>Content type</dt>
          <dd className="font-mono text-slate-900">{item.contentType}</dd>
        </div>
        <div>
          <dt className={labelClass}>Entity ID</dt>
          <dd className="font-mono text-slate-900 break-all">
            {item.entityId ?? "—"}
          </dd>
        </div>
        <div>
          <dt className={labelClass}>Status</dt>
          <dd className="font-semibold text-slate-900">{item.status}</dd>
        </div>
        <div>
          <dt className={labelClass}>Version</dt>
          <dd className="font-semibold text-slate-900">
            v{item.currentVersion}
          </dd>
        </div>
      </dl>
      <div>
        <span className={labelClass}>Staged payload (read-only)</span>
        <pre className="mt-1 max-h-96 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] font-mono text-slate-700 whitespace-pre-wrap break-words">
          {JSON.stringify(item.stagedPayload, null, 2)}
        </pre>
      </div>
    </div>
  );
}
