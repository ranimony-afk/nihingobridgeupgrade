import Link from "next/link";
import { notFound } from "next/navigation";
import { DictionaryService } from "@/services/knowledge/DictionaryService";
import type { DictionaryEntryDetail } from "@/types/dictionary";
import { AudioButton } from "./AudioButton";

export const dynamic = "force-dynamic";

/*
 * Server Component. It obtains its data from the canonical DictionaryService —
 * the same service the /api/v2 routes use. It never imports @/db or Drizzle,
 * so the "UI must not query the database" rule holds: the service boundary is
 * the single access path for web, API, and future mobile clients.
 */
const dictionaryService = new DictionaryService();

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return { title: "Dictionary — Nihongo Bridge" };
  const entry = await dictionaryService.getById(Number.parseInt(id, 10));
  if (!entry) return { title: "Not found — Nihongo Bridge" };
  const gloss = entry.senses[0]?.glosses[0] ?? "";
  return {
    title: `${entry.headword} (${entry.primaryReading}) — ${gloss} — Nihongo Bridge`,
    description: `${entry.headword} · ${entry.primaryReading} · ${gloss}`,
  };
}

/* ------------------------------ sub-components ---------------------------- */

function Furigana({ entry }: { entry: DictionaryEntryDetail }) {
  const enrichment = entry.enrichments.find((item) => item.kind === "furigana");
  const rawSegments = enrichment?.value.segments;
  if (!Array.isArray(rawSegments)) return <span>{entry.headword}</span>;

  return (
    <span>
      {rawSegments.map((item, index) => {
        const segment = item as { text?: unknown; reading?: unknown; ruby?: unknown };
        const text = typeof segment.text === "string" ? segment.text : "";
        const reading = typeof segment.reading === "string" ? segment.reading : "";
        return segment.ruby === true ? (
          <ruby key={`${text}-${index}`}>
            {text}
            <rt className="text-[0.4em] font-medium text-rose-500">{reading}</rt>
          </ruby>
        ) : (
          <span key={`${text}-${index}`}>{text}</span>
        );
      })}
    </span>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{children}</h2>
  );
}

function Readings({ entry }: { entry: DictionaryEntryDetail }) {
  return (
    <section data-testid="section-readings" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <SectionHeading>Readings</SectionHeading>
      <ul className="mt-3 flex flex-wrap gap-2">
        {entry.readings.map((reading) => (
          <li
            key={reading.text}
            className={`rounded-xl px-3 py-2 text-lg font-semibold ${
              reading.common ? "bg-rose-50 text-rose-700" : "bg-slate-50 text-slate-700"
            }`}
          >
            {reading.text}
            {reading.common && (
              <span className="ml-2 align-middle text-[10px] font-bold uppercase tracking-wide text-rose-500">
                common
              </span>
            )}
          </li>
        ))}
      </ul>
      {entry.kanji.length > 1 && (
        <p className="mt-3 text-sm text-slate-500">
          Also written: {entry.kanji.slice(1).map((form) => form.text).join(" · ")}
        </p>
      )}
    </section>
  );
}

function Meanings({ entry }: { entry: DictionaryEntryDetail }) {
  return (
    <section data-testid="section-meanings" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <SectionHeading>Meanings</SectionHeading>
      <ol className="mt-3 space-y-3">
        {entry.senses.map((sense, index) => (
          <li key={`${sense.glosses.join("-")}-${index}`} className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-rose-50 text-xs font-bold text-rose-600">
              {index + 1}
            </span>
            <div>
              <p className="font-semibold text-slate-800">{sense.glosses.join("; ")}</p>
              {(sense.partsOfSpeech.length > 0 || sense.fields.length > 0 || sense.misc.length > 0) && (
                <p className="mt-0.5 text-xs text-slate-500">
                  {[...sense.partsOfSpeech, ...sense.fields, ...sense.misc].join(" · ")}
                </p>
              )}
              {sense.info && <p className="mt-0.5 text-xs italic text-slate-500">{sense.info}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function JlptBadges({ entry }: { entry: DictionaryEntryDetail }) {
  return (
    <section data-testid="section-jlpt" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <SectionHeading>JLPT</SectionHeading>
      {entry.jlptLevels.length > 0 ? (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {entry.jlptLevels.map((level) => (
              <span
                key={level}
                data-testid="jlpt-level"
                className="rounded-full bg-violet-100 px-3 py-1 text-sm font-bold text-violet-700"
              >
                {level}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Source-curated level. The JLPT does not publish an official vocabulary list.
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm text-slate-500" data-testid="jlpt-none">
          No JLPT level recorded for this entry.
        </p>
      )}
    </section>
  );
}

function KanjiBreakdown({ entry }: { entry: DictionaryEntryDetail }) {
  if (entry.kanjiComponents.length === 0) return null;
  return (
    <section data-testid="section-kanji" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <SectionHeading>Kanji</SectionHeading>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {entry.kanjiComponents.map((kanji) => (
          <li key={kanji.id} data-testid="kanji-component" className="flex gap-4 rounded-xl bg-slate-50 p-4">
            <span className="text-5xl font-bold leading-none text-slate-900">{kanji.literal}</span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold text-slate-800">{kanji.meanings.join(", ")}</p>
              {kanji.onReadings.length > 0 && (
                <p className="mt-1 text-slate-600">
                  <span className="text-xs font-bold uppercase text-slate-400">On </span>
                  {kanji.onReadings.join("、")}
                </p>
              )}
              {kanji.kunReadings.length > 0 && (
                <p className="text-slate-600">
                  <span className="text-xs font-bold uppercase text-slate-400">Kun </span>
                  {kanji.kunReadings.join("、")}
                </p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                {kanji.strokeCount !== null && `${kanji.strokeCount} strokes`}
                {kanji.grade !== null && ` · grade ${kanji.grade}`}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Examples({ entry }: { entry: DictionaryEntryDetail }) {
  return (
    <section data-testid="section-examples" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <SectionHeading>Example sentences</SectionHeading>
      {entry.examples.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500" data-testid="examples-none">
          No example sentences in this corpus yet.
        </p>
      ) : (
        <>
          <ul className="mt-3 space-y-4">
            {entry.examples.map((example) => (
              <li key={example.id} data-testid="example-sentence" className="rounded-xl bg-slate-50 p-4">
                <p className="text-lg text-slate-900">{example.text}</p>
                {example.translation && (
                  <p className="mt-1 text-sm text-slate-600">{example.translation}</p>
                )}
                <p className="mt-2 text-[11px] text-slate-400" data-testid="example-attribution">
                  {example.attribution}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[11px] text-slate-400">
            Example sentences from{" "}
            <a href="https://tatoeba.org" className="underline" rel="noreferrer" target="_blank">
              Tatoeba
            </a>
            , released under CC BY 2.0 FR. Individual sentences are attributed to their
            contributors.
          </p>
        </>
      )}
    </section>
  );
}

function Conjugations({ entry }: { entry: DictionaryEntryDetail }) {
  const enrichment = entry.enrichments.find((item) => item.kind === "conjugation");
  const rawForms = enrichment?.value.forms;
  if (!Array.isArray(rawForms)) return null;

  const forms = rawForms
    .map((item) => item as { form?: unknown; text?: unknown; reading?: unknown })
    .filter(
      (item): item is { form: string; text: string; reading: string } =>
        typeof item.form === "string" &&
        typeof item.text === "string" &&
        typeof item.reading === "string",
    );
  if (forms.length === 0) return null;

  const verbClass =
    typeof enrichment?.value.verbClass === "string" ? enrichment.value.verbClass : null;

  return (
    <section data-testid="section-conjugations" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between">
        <SectionHeading>Conjugations</SectionHeading>
        {verbClass && <span className="text-xs text-slate-500">{verbClass}</span>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {forms.map((form) => (
          <div key={form.form} data-testid="conjugation-form" className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-semibold capitalize text-slate-500">{form.form}</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{form.text}</p>
            <p className="text-xs text-rose-500">{form.reading}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Related({ entry }: { entry: DictionaryEntryDetail }) {
  return (
    <section data-testid="section-related" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <SectionHeading>Related</SectionHeading>
      {entry.related.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500" data-testid="related-none">
          No related entries yet.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {entry.related.map((item) => (
            <li key={item.id}>
              <Link
                href={`/dictionary/${item.id}`}
                data-testid="related-entry"
                className="flex items-center gap-3 py-2.5 transition hover:text-rose-600"
              >
                <span className="text-lg font-bold">{item.headword}</span>
                <span className="text-sm text-rose-500">{item.primaryReading}</span>
                <span className="ml-auto text-[10px] font-medium uppercase tracking-wide text-slate-400">
                  {item.reason === "shares_kanji" ? "shares kanji" : "same reading"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* --------------------------------- page ---------------------------------- */

export default async function DictionaryEntryPage({ params }: Props) {
  const { id: rawId } = await params;
  if (!/^\d+$/.test(rawId)) notFound();

  const entry = await dictionaryService.getDetail(Number.parseInt(rawId, 10));
  if (!entry) notFound();

  const isFixture = entry.provenance?.isFixture === true;

  return (
    <main className="mx-auto max-w-3xl px-5 py-10" data-testid="dictionary-entry-page">
      <Link href="/dictionary" className="text-sm font-semibold text-rose-500 hover:text-rose-600">
        ← Dictionary
      </Link>

      {/* Header */}
      <header className="mt-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1
              data-testid="entry-headword"
              className="text-5xl font-extrabold leading-tight tracking-tight text-slate-950 sm:text-6xl"
            >
              <Furigana entry={entry} />
            </h1>
            <p data-testid="entry-reading" className="mt-2 text-xl font-medium text-rose-500">
              {entry.primaryReading}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <AudioButton audio={entry.audio} />
            {entry.isCommon && (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                Common word
              </span>
            )}
          </div>
        </div>
        {entry.senses[0] && (
          <p className="mt-4 text-lg text-slate-700">{entry.senses[0].glosses.join("; ")}</p>
        )}
      </header>

      <div className="mt-6 grid gap-5">
        <Readings entry={entry} />
        <Meanings entry={entry} />
        <div className="grid gap-5 sm:grid-cols-2">
          <JlptBadges entry={entry} />
          <Related entry={entry} />
        </div>
        <KanjiBreakdown entry={entry} />
        <Examples entry={entry} />
        <Conjugations entry={entry} />
      </div>

      {entry.provenance && (
        <aside
          data-testid="section-provenance"
          className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600"
        >
          {isFixture && (
            <p className="mb-2 font-bold text-amber-700" data-testid="fixture-notice">
              Development fixture data — not a production corpus record.
            </p>
          )}
          <p>
            Source: <strong>{entry.provenance.source}</strong> · {entry.provenance.attribution}
          </p>
          <p className="mt-1">
            License: {entry.provenance.license} · Source record: {entry.provenance.sourceId}
          </p>
        </aside>
      )}
    </main>
  );
}
