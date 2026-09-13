"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type {
  DictionaryV2ApiError,
  DictionaryV2Entry,
} from "@/types/dictionary-v2";
import PronunciationButton from "@/components/PronunciationButton";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-7">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Furigana({ entry }: { entry: DictionaryV2Entry }) {
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
            <rt>{reading}</rt>
          </ruby>
        ) : (
          <span key={`${text}-${index}`}>{text}</span>
        );
      })}
    </span>
  );
}

function AudioControl({ entry }: { entry: DictionaryV2Entry }) {
  return (
    <PronunciationButton
      text={entry.headword}
      ariaLabel={`Play audio for ${entry.headword}`}
    />
  );
}

function Conjugations({ entry }: { entry: DictionaryV2Entry }) {
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

  return (
    <Section title="Conjugations">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {forms.map((form) => (
          <div key={form.form} className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-semibold capitalize text-slate-500">{form.form}</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{form.text}</p>
            <p className="text-xs text-rose-500">{form.reading}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function KanjiBreakdown({ entry }: { entry: DictionaryV2Entry }) {
  if (entry.kanjiComponents.length === 0) return null;

  return (
    <Section title="Kanji">
      <div className="grid gap-3 sm:grid-cols-2">
        {entry.kanjiComponents.map((component) => (
          <div
            key={component.literal}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="flex items-baseline justify-between">
              <span className="text-4xl font-bold text-slate-900">{component.literal}</span>
              <span className="text-xs font-medium text-slate-500">
                {component.strokeCount ?? "?"} strokes
                {component.grade ? ` · grade ${component.grade}` : ""}
              </span>
            </div>
            {component.meanings.length > 0 && (
              <p className="mt-2 text-sm text-slate-700">{component.meanings.join(", ")}</p>
            )}
            <dl className="mt-2 space-y-1 text-xs text-slate-500">
              {component.onReadings.length > 0 && (
                <div className="flex gap-2">
                  <dt className="font-semibold text-slate-400">On</dt>
                  <dd>{component.onReadings.join("、")}</dd>
                </div>
              )}
              {component.kunReadings.length > 0 && (
                <div className="flex gap-2">
                  <dt className="font-semibold text-slate-400">Kun</dt>
                  <dd>{component.kunReadings.join("、")}</dd>
                </div>
              )}
            </dl>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Examples({ entry }: { entry: DictionaryV2Entry }) {
  if (entry.examples.length === 0) return null;

  return (
    <Section title="Examples">
      <ul className="space-y-3">
        {entry.examples.map((example) => (
          <li key={example.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-lg text-slate-900">{example.japanese}</p>
            {example.translation && (
              <p className="mt-1 text-sm text-slate-600">{example.translation}</p>
            )}
            {/* CC BY 2.0 FR requires per-sentence attribution. */}
            <p className="mt-2 text-[11px] text-slate-400">{example.attribution}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function RelatedContent({ entry }: { entry: DictionaryV2Entry }) {
  if (entry.related.length === 0) return null;

  return (
    <Section title="Related">
      <ul className="grid gap-2 sm:grid-cols-2">
        {entry.related.map((item) => (
          <li key={item.id}>
            <Link
              href={`/dictionary/${item.id}`}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-rose-200 hover:bg-rose-50"
            >
              <span className="text-xl font-bold text-slate-900">{item.headword}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-rose-500">
                  {item.primaryReading}
                </span>
                <span className="block truncate text-xs text-slate-600">{item.firstGloss}</span>
              </span>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {item.relation === "shared-kanji" ? "kanji" : "reading"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export default function DictionaryDetailClient({ entryId }: { entryId: number }) {
  const [entry, setEntry] = useState<DictionaryV2Entry | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "not-found">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`/api/v2/dictionary/entries/${entryId}`);
        if (cancelled) return;

        if (response.status === 404) {
          setState("not-found");
          return;
        }

        const body = (await response.json()) as DictionaryV2Entry | DictionaryV2ApiError;
        if (!response.ok) {
          const parsed = body as Partial<DictionaryV2ApiError>;
          throw new Error(parsed.error?.message ?? "Unable to load this entry.");
        }
        if (cancelled) return;

        setEntry(body as DictionaryV2Entry);
        setState("ready");
      } catch (error) {
        if (cancelled) return;
        setMessage(error instanceof Error ? error.message : "Unable to load this entry.");
        setState("error");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  if (state === "loading") {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16 text-center text-slate-500">
        Loading entry…
      </main>
    );
  }

  if (state === "not-found") {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Entry not found</h1>
        <p className="mt-2 text-slate-500">
          This dictionary entry does not exist in the current corpus.
        </p>
        <Link
          href="/dictionary"
          className="mt-6 inline-block rounded-xl bg-rose-500 px-4 py-2 font-semibold text-white transition hover:bg-rose-600"
        >
          Back to search
        </Link>
      </main>
    );
  }

  if (state === "error" || !entry) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Something went wrong</h1>
        <p className="mt-2 text-slate-500">{message}</p>
        <Link
          href="/dictionary"
          className="mt-6 inline-block rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Back to search
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Link
        href="/dictionary"
        className="text-sm font-semibold text-rose-500 transition hover:text-rose-600"
      >
        ← Dictionary
      </Link>

      <article className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-950 sm:text-5xl">
              <Furigana entry={entry} />
            </h1>
            <p data-testid="entry-reading" className="mt-2 text-lg font-medium text-rose-500">
              {entry.primaryReading}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <AudioControl entry={entry} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {entry.isCommon && (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
              Common word
            </span>
          )}
          {entry.jlptLevels.map((level) => (
            <span
              key={level}
              className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-700"
            >
              {level}
            </span>
          ))}
          {entry.frequencyRank !== null && (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
              Frequency #{entry.frequencyRank}
            </span>
          )}
        </div>

        {entry.jlptLevels.length > 0 && (
          <p className="mt-2 text-[11px] text-slate-400">
            JLPT levels are source-curated study guides, not an official exam syllabus.
          </p>
        )}

        <Section title="Meanings">
          <ol className="space-y-3">
            {entry.senses.map((sense, index) => (
              <li key={`${sense.glosses.join("-")}-${index}`} className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-rose-50 text-xs font-bold text-rose-600">
                  {index + 1}
                </span>
                <div>
                  <p className="font-semibold text-slate-800">{sense.glosses.join("; ")}</p>
                  {sense.partsOfSpeech.length > 0 && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {sense.partsOfSpeech.join(" · ")}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="Readings">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Kanji</p>
              <p className="mt-1 text-slate-800">
                {entry.kanji.length > 0 ? entry.kanji.map((form) => form.text).join(" · ") : "—"}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Kana</p>
              <p className="mt-1 text-slate-800">
                {entry.readings.map((form) => form.text).join(" · ")}
              </p>
            </div>
          </div>
        </Section>

        <KanjiBreakdown entry={entry} />
        <Conjugations entry={entry} />
        <Examples entry={entry} />
        <RelatedContent entry={entry} />

        {entry.provenance && (
          <aside className="mt-7 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
            {entry.provenance.isFixture && (
              <p className="mb-2 font-bold text-amber-700">
                Development fixture data — not a production corpus record.
              </p>
            )}
            <p>
              Source: <strong>{entry.provenance.source}</strong> ·{" "}
              {entry.provenance.attribution}
            </p>
            <p className="mt-1">
              License: {entry.provenance.license} · Source record:{" "}
              {entry.provenance.sourceId}
            </p>
          </aside>
        )}
      </article>
    </main>
  );
}
