import Link from "next/link";
import { Network } from "lucide-react";
import { isKanjiRouteCharacter } from "@/lib/api/routeParams";
import { isDictionaryJlptLevel } from "@/lib/dictionary/searchState";
import { buildKanjiDetailHref } from "@/lib/kanji/navigation";

interface RelatedKanjiItem {
  key: string;
  character: string;
  href: string;
  meaning: string | null;
  readingsKun: string[];
  jlptLevel: string | null;
  strokeCount: number | null;
  sourceRef: string | null;
}

function getRelatedKanjiItems(
  records: unknown,
  returnTo: string
): RelatedKanjiItem[] {
  if (!Array.isArray(records)) {
    return [];
  }

  return records.flatMap((candidate, index): RelatedKanjiItem[] => {
    if (typeof candidate !== "object" || candidate === null) {
      return [];
    }

    const record = candidate as Record<string, unknown>;
    if (!isKanjiRouteCharacter(record.character)) {
      return [];
    }

    const href = buildKanjiDetailHref(record.character, returnTo);
    if (!href) {
      return [];
    }

    const meaning =
      typeof record.meaning === "string" && record.meaning.trim().length > 0
        ? record.meaning
        : null;
    const readingsKun = Array.isArray(record.readingsKun)
      ? record.readingsKun.filter(
          (reading): reading is string =>
            typeof reading === "string" && reading.trim().length > 0
        )
      : [];
    const jlptLevel =
      typeof record.jlptLevel === "string" &&
      isDictionaryJlptLevel(record.jlptLevel)
        ? record.jlptLevel
        : null;
    const strokeCount =
      typeof record.strokeCount === "number" &&
      Number.isInteger(record.strokeCount) &&
      record.strokeCount > 0
        ? record.strokeCount
        : null;
    const sourceRef =
      typeof record.sourceRef === "string" && record.sourceRef.trim().length > 0
        ? record.sourceRef
        : null;
    const recordId =
      typeof record.id === "string" && record.id.trim().length > 0
        ? record.id
        : record.character;

    return [
      {
        key: `${recordId}-${index}`,
        character: record.character,
        href,
        meaning,
        readingsKun,
        jlptLevel,
        strokeCount,
        sourceRef,
      },
    ];
  });
}

interface DictionaryRelatedKanjiProps {
  records: unknown;
  returnTo: string;
}

export function DictionaryRelatedKanji({
  records,
  returnTo,
}: DictionaryRelatedKanjiProps) {
  const items = getRelatedKanjiItems(records, returnTo);
  if (items.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="dictionary-related-kanji-heading"
      className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <div className="mb-6">
        <h2
          id="dictionary-related-kanji-heading"
          className="flex items-center gap-2 text-lg font-bold text-slate-900"
        >
          <Network className="h-5 w-5 text-red-600" aria-hidden="true" />
          Kanji used in this word
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          These characters are listed on the vocabulary record. This is a
          character match, not a structural decomposition.
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              aria-label={`Open Kanji Detail for ${item.character}${item.meaning ? ` (${item.meaning})` : ""}`}
              className="group flex h-full items-start gap-4 rounded-2xl border border-slate-200 p-4 transition-all hover:border-red-400 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
            >
              <span className="font-japanese text-4xl font-black text-slate-900 transition-colors group-hover:text-red-600">
                {item.character}
              </span>
              <span className="min-w-0">
                {item.meaning && (
                  <span className="block text-sm font-bold text-slate-800">
                    {item.meaning}
                  </span>
                )}
                {item.readingsKun.length > 0 && (
                  <span className="mt-0.5 block font-japanese text-xs text-slate-500">
                    {item.readingsKun.slice(0, 2).join(", ")}
                  </span>
                )}
                <span className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                    {item.jlptLevel
                      ? `JLPT ${item.jlptLevel}`
                      : "JLPT unclassified"}
                  </span>
                  {item.strokeCount !== null && (
                    <span className="text-[10px] text-slate-400">
                      {item.strokeCount} strokes
                    </span>
                  )}
                </span>
                {item.sourceRef && (
                  <span className="mt-2 block break-all text-[10px] text-slate-400">
                    Source reference: {item.sourceRef}
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
