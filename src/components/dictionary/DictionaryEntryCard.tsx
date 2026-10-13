import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buildDictionaryEntryHref } from "@/lib/dictionary/searchState";

export interface DictionaryEntryCardEntry {
  id: string;
  headword: string;
  reading: string;
  romaji: string | null;
  jlptLevel: string | null;
  isCommon: boolean;
  partsOfSpeech: string[];
  senses: Array<{ glosses: string[]; note?: string | null }>;
  tags: string[];
}

interface DictionaryEntryCardProps {
  entry: DictionaryEntryCardEntry;
  returnTo?: string;
}

const KNOWN_JLPT_LEVELS: ReadonlySet<string> = new Set(["N5", "N4", "N3", "N2", "N1"]);

/**
 * Learner-facing dictionary search result. Unknown or invalid JLPT values are
 * shown as unclassified rather than being presented as genuine test levels.
 */
export function DictionaryEntryCard({ entry, returnTo }: DictionaryEntryCardProps) {
  const jlptLevel =
    entry.jlptLevel && KNOWN_JLPT_LEVELS.has(entry.jlptLevel) ? entry.jlptLevel : null;
  const primarySenses = Array.isArray(entry.senses) ? entry.senses : [];

  return (
    <Link
      href={buildDictionaryEntryHref(entry.id, returnTo)}
      aria-label={`View dictionary entry ${entry.headword} (${entry.reading})`}
      className="group flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-5 transition-all hover:border-red-400 hover:shadow-md"
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-baseline gap-2.5">
            <span className="font-japanese text-2xl font-black text-slate-900 transition-colors group-hover:text-red-600">
              {entry.headword}
            </span>
            <span className="font-japanese text-sm font-medium text-slate-500">
              {entry.reading}
            </span>
            {entry.romaji && (
              <span className="font-mono text-xs text-slate-400">({entry.romaji})</span>
            )}
          </div>

          <div className="flex flex-shrink-0 items-center gap-1.5">
            {entry.isCommon && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                Common
              </span>
            )}
            {jlptLevel ? (
              <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-800">
                JLPT {jlptLevel}
              </span>
            ) : (
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                JLPT unclassified
              </span>
            )}
          </div>
        </div>

        {entry.partsOfSpeech.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {entry.partsOfSpeech.map((partOfSpeech) => (
              <span
                key={partOfSpeech}
                className="text-[11px] font-semibold italic text-slate-400"
              >
                [{partOfSpeech}]
              </span>
            ))}
          </div>
        )}

        <div className="mt-3 text-sm font-medium leading-relaxed text-slate-700">
          {primarySenses.length > 0 ? (
            <ol className="list-inside list-decimal space-y-1">
              {primarySenses.slice(0, 2).map((sense, index) => (
                <li key={index} className="truncate">
                  <span>{sense.glosses.join("; ") || "Definition unavailable"}</span>
                  {sense.note && (
                    <span className="ml-1 text-xs italic text-slate-400">— {sense.note}</span>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-slate-500">Definition unavailable</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
        <div className="flex items-center gap-1.5 overflow-hidden">
          {entry.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded border border-slate-200/60 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600"
            >
              #{tag}
            </span>
          ))}
        </div>

        <span className="flex items-center gap-1 font-semibold text-red-600 transition-transform group-hover:translate-x-0.5">
          Details
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}
