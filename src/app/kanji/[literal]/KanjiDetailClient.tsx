"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PronunciationButton from "@/components/PronunciationButton";
import type { KanjiApiError, KanjiDetail } from "@/types/kanji-v2";

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

function Chip({
  href,
  children,
  tone = "slate",
}: {
  href?: string;
  children: React.ReactNode;
  tone?: "slate" | "indigo" | "sky";
}) {
  const className = `inline-flex items-center rounded-lg px-2.5 py-1 text-sm font-medium transition ${
    tone === "indigo"
      ? "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
      : tone === "sky"
        ? "bg-sky-50 text-sky-700 hover:bg-sky-100"
        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
  }`;
  return href ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <span className={className}>{children}</span>
  );
}

function ReadingRow({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div className="flex gap-3 border-b border-slate-100 py-2 last:border-0">
      <span className="w-24 shrink-0 text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <span className="flex flex-wrap gap-1.5 text-sm text-slate-800">
        {values.map((value) => (
          <span key={value} className="rounded bg-slate-50 px-2 py-0.5">
            {value}
          </span>
        ))}
      </span>
    </div>
  );
}

export default function KanjiDetailClient({ literal }: { literal: string }) {
  const [kanji, setKanji] = useState<KanjiDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "not-found">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setMessage("");

    (async () => {
      try {
        const response = await fetch(
          `/api/v2/kanji/${encodeURIComponent(literal)}`,
        );
        if (cancelled) return;

        if (response.status === 404) {
          setState("not-found");
          return;
        }

        const body = (await response.json()) as KanjiDetail | KanjiApiError;
        if (!response.ok) {
          const parsed = body as Partial<KanjiApiError>;
          throw new Error(parsed.error?.message ?? "Unable to load this kanji.");
        }
        if (cancelled) return;

        setKanji(body as KanjiDetail);
        setState("ready");
      } catch (error) {
        if (cancelled) return;
        setMessage(error instanceof Error ? error.message : "Unable to load this kanji.");
        setState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [literal]);

  if (state === "loading") {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16 text-center text-slate-500">
        Loading kanji…
      </main>
    );
  }

  if (state === "not-found" || state === "error" || !kanji) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900">
          {state === "not-found" ? "Kanji not found" : "Something went wrong"}
        </h1>
        <p className="mt-2 text-slate-500">
          {state === "not-found"
            ? "This character is not in the current corpus."
            : message}
        </p>
        <Link
          href="/kanji"
          className="mt-6 inline-block rounded-xl bg-rose-500 px-4 py-2 font-semibold text-white transition hover:bg-rose-600"
        >
          Back to explorer
        </Link>
      </main>
    );
  }

  const classical = kanji.radicals.find((r) => r.system === "kangxi-classical");
  const nelson = kanji.radicals.find((r) => r.system === "nelson_c");

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Link
        href="/kanji"
        className="text-sm font-semibold text-indigo-500 transition hover:text-indigo-600"
      >
        ← Kanji explorer
      </Link>

      <article className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-6xl font-extrabold leading-none tracking-tight text-slate-950 sm:text-7xl">
              {kanji.literal}
            </h1>
            <p className="mt-3 text-lg text-slate-600">
              {kanji.meanings.join(", ") || "—"}
            </p>
          </div>
          <PronunciationButton
            text={kanji.literal}
            ariaLabel={`Play audio for ${kanji.literal}`}
            size="lg"
          />
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Strokes" value={kanji.strokeCount ?? "?"} />
          <Stat label="Grade" value={kanji.grade ?? "—"} />
          <Stat label="Frequency" value={kanji.frequencyRank ? `#${kanji.frequencyRank}` : "—"} />
          <Stat label="Codepoint" value={kanji.codepointUcs.toUpperCase()} />
        </dl>

        {kanji.strokeMiscounts.length > 0 && (
          <p className="mt-2 text-xs text-slate-400">
            Alternate stroke counts recorded by the source:{" "}
            {kanji.strokeMiscounts.join(", ")}
          </p>
        )}

        <Section title="Readings">
          <div className="rounded-xl bg-slate-50 p-4">
            <ReadingRow label="On" values={kanji.onReadings} />
            <ReadingRow label="Kun" values={kanji.kunReadings} />
            {kanji.otherReadings.map((reading) => (
              <ReadingRow
                key={`${reading.type}-${reading.value}`}
                label={reading.type}
                values={[reading.value]}
              />
            ))}
            <ReadingRow label="Nanori" values={kanji.nanori} />
          </div>
        </Section>

        <Section title="Radicals & components">
          <div className="flex flex-wrap gap-2">
            {classical && (
              <Chip href={`/kanji?radical=${classical.number}`} tone="indigo">
                Radical {classical.number} (classical)
              </Chip>
            )}
            {nelson && nelson.number !== classical?.number && (
              <Chip tone="indigo">Radical {nelson.number} (Nelson)</Chip>
            )}
            {kanji.grade !== null && (
              <Chip href={`/kanji?grade=${kanji.grade}`}>Grade {kanji.grade}</Chip>
            )}
            {kanji.strokeCount !== null && (
              <Chip href={`/kanji?strokes=${kanji.strokeCount}`}>
                {kanji.strokeCount} strokes
              </Chip>
            )}
          </div>

          {kanji.components.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Composed of
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {kanji.components.map((component) => (
                  <Link
                    key={component}
                    href={`/kanji/${encodeURIComponent(component)}`}
                    className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-xl font-bold text-slate-800 transition hover:border-indigo-300 hover:bg-indigo-50"
                    aria-label={`View kanji ${component}`}
                  >
                    {component}
                  </Link>
                ))}
              </div>
              <Link
                href={`/kanji?component=${encodeURIComponent(kanji.literal)}`}
                className="mt-3 inline-block text-xs font-semibold text-indigo-500 hover:text-indigo-600"
              >
                Find kanji built from {kanji.literal} →
              </Link>
            </div>
          ) : (
            <p className="mt-4 text-xs text-slate-400">
              No component decomposition available for this character in the
              current corpus.
            </p>
          )}
        </Section>

        <Section title="JLPT">
          <div className="flex flex-wrap items-center gap-2">
            {kanji.jlptLevels.length > 0 ? (
              kanji.jlptLevels.map((level) => (
                <Chip key={level} href={`/kanji?jlpt=${level}`} tone="sky">
                  {level}
                </Chip>
              ))
            ) : (
              <span className="text-sm text-slate-500">
                No modern N1–N5 level assigned in the current corpus.
              </span>
            )}
          </div>
          {kanji.jlptLegacy !== null && (
            <p className="mt-2 text-xs text-slate-400">
              Source legacy JLPT scale: {kanji.jlptLegacy}. This is KANJIDIC2&apos;s
              older 4-level scale and is <strong>not</strong> equivalent to a
              modern N1–N5 level.
            </p>
          )}
        </Section>

        {kanji.variants.length > 0 && (
          <Section title="Variants">
            <div className="flex flex-wrap gap-2">
              {kanji.variants.map((variant) => (
                <Chip key={`${variant.type}-${variant.value}`}>
                  {variant.type}: {variant.value}
                </Chip>
              ))}
            </div>
          </Section>
        )}

        <Section title="Words using this kanji">
          {kanji.vocabulary.length > 0 ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {kanji.vocabulary.map((word) => (
                <li key={word.id}>
                  <Link
                    href={`/dictionary/${word.id}`}
                    className="flex items-baseline gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-rose-200 hover:bg-rose-50"
                  >
                    <span className="text-lg font-bold text-slate-900">{word.headword}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium text-rose-500">
                        {word.primaryReading}
                      </span>
                      <span className="block truncate text-xs text-slate-600">
                        {word.firstGloss}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">
              No dictionary words containing this kanji in the current corpus.
            </p>
          )}
        </Section>

        {kanji.provenance && (
          <aside className="mt-7 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
            {kanji.provenance.isFixture && (
              <p className="mb-2 font-bold text-amber-700">
                Development fixture data — not a production corpus record.
              </p>
            )}
            <p>
              Source: <strong>{kanji.provenance.source}</strong> ·{" "}
              {kanji.provenance.attribution}
            </p>
            <p className="mt-1">
              License: {kanji.provenance.license}
              {kanji.provenance.checksumVerified ? " · checksum verified" : ""}
            </p>
          </aside>
        )}
      </article>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 text-center">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 text-lg font-bold text-slate-900">{value}</dd>
    </div>
  );
}
