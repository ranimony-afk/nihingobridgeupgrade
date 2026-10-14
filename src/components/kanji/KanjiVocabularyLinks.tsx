import Link from "next/link";
import { isValidRouteIdentifier } from "@/lib/api/routeParams";
import {
  buildDictionaryEntryHref,
  isDictionaryJlptLevel,
} from "@/lib/dictionary/searchState";

export type KanjiVocabularyLoadStatus = "loading" | "loaded" | "error";

interface KanjiVocabularyItem {
  key: string;
  entryId: string;
  headword: string;
  reading: string | null;
  glosses: string[];
  jlptLevel: string | null;
  isCommon: boolean;
  frequencyRank: number | null;
  sourceRef: string | null;
}

function getKanjiVocabularyItems(records: unknown): KanjiVocabularyItem[] {
  if (!Array.isArray(records)) {
    return [];
  }

  return records.flatMap((candidate, index): KanjiVocabularyItem[] => {
    if (typeof candidate !== "object" || candidate === null) {
      return [];
    }

    const record = candidate as Record<string, unknown>;
    if (
      !isValidRouteIdentifier(record.entryId) ||
      typeof record.headword !== "string" ||
      record.headword.trim().length === 0
    ) {
      return [];
    }

    const reading =
      typeof record.wordReading === "string" && record.wordReading.trim().length > 0
        ? record.wordReading
        : null;
    const glosses = Array.isArray(record.senses)
      ? record.senses.flatMap((sense) => {
          if (typeof sense !== "object" || sense === null) {
            return [];
          }
          const senseGlosses = (sense as { glosses?: unknown }).glosses;
          return Array.isArray(senseGlosses)
            ? senseGlosses.filter(
                (gloss): gloss is string =>
                  typeof gloss === "string" && gloss.trim().length > 0
              )
            : [];
        })
      : [];
    const jlptLevel =
      typeof record.jlptLevel === "string" &&
      isDictionaryJlptLevel(record.jlptLevel)
        ? record.jlptLevel
        : null;
    const frequencyRank =
      typeof record.frequencyRank === "number" &&
      Number.isInteger(record.frequencyRank) &&
      record.frequencyRank >= 0
        ? record.frequencyRank
        : null;
    const sourceRef =
      typeof record.sourceRef === "string" && record.sourceRef.trim().length > 0
        ? record.sourceRef
        : null;

    return [
      {
        key: `${record.entryId}-${index}`,
        entryId: record.entryId,
        headword: record.headword,
        reading,
        glosses,
        jlptLevel,
        isCommon: record.isCommon === true,
        frequencyRank,
        sourceRef,
      },
    ];
  });
}

interface KanjiVocabularyLinksProps {
  character: string;
  records: unknown;
  status: KanjiVocabularyLoadStatus;
  returnTo?: string | null;
}

export function KanjiVocabularyLinks({
  character,
  records,
  status,
  returnTo,
}: KanjiVocabularyLinksProps) {
  const items = getKanjiVocabularyItems(records);

  return (
    <section
      aria-labelledby="kanji-dictionary-entries-heading"
      className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-100"
    >
      <div className="mb-5">
        <h2
          id="kanji-dictionary-entries-heading"
          className="text-base font-bold text-slate-900"
        >
          Dictionary entries containing {character}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          These links come from the character list recorded on each dictionary
          entry. They indicate character usage, not structural decomposition. Up to 50
          matches are shown.
        </p>
      </div>

      {status === "loading" ? (
        <p role="status" className="text-sm text-slate-500">
          Loading linked dictionary entries…
        </p>
      ) : status === "error" ? (
        <p role="alert" className="text-sm text-amber-800">
          Linked dictionary entries are temporarily unavailable.
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">
          No linked dictionary entries are available for this character.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                href={buildDictionaryEntryHref(item.entryId, returnTo ?? undefined)}
                aria-label={`Open dictionary entry for ${item.headword}${item.reading ? ` (${item.reading})` : ""}`}
                className="block rounded-2xl border border-slate-200 p-4 transition-colors hover:border-red-400 hover:bg-red-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
              >
                <span className="font-japanese text-lg font-bold text-slate-900">
                  {item.headword}
                </span>
                {item.reading && (
                  <span className="ml-2 font-japanese text-xs text-slate-500">
                    {item.reading}
                  </span>
                )}
                {item.glosses.length > 0 && (
                  <span className="mt-1 block text-sm text-slate-700">
                    {item.glosses.slice(0, 2).join("; ")}
                  </span>
                )}
                <span className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-slate-500">
                  {item.jlptLevel && <span>JLPT {item.jlptLevel}</span>}
                  {item.isCommon && <span>Common</span>}
                  {item.frequencyRank !== null && (
                    <span>Frequency #{item.frequencyRank}</span>
                  )}
                </span>
                {item.sourceRef && (
                  <span className="mt-2 block break-all text-[10px] text-slate-400">
                    Source reference: {item.sourceRef}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
