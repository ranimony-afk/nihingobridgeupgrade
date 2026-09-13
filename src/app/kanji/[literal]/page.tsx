import Link from "next/link";
import { notFound } from "next/navigation";

import { KanjiMindTree } from "@/components/kanji/kanji-mind-tree";
import { getKanjiDetail } from "@/services/knowledge/kanji";
import { buildMindTree } from "@/services/knowledge/mind-tree";
import { getVocabularyByKanjiLiteral } from "@/services/knowledge/vocabulary";

export const dynamic = "force-dynamic";

type RouteParams = Promise<{ literal: string }>;

export async function generateMetadata({ params }: { params: RouteParams }) {
  const { literal } = await params;
  const decoded = decodeURIComponent(literal);
  return {
    title: `${decoded} — Kanji Mind Tree | NihongoBridge`,
    description: `Radicals, components and vocabulary for the kanji ${decoded}.`,
  };
}

export default async function KanjiDetailPage({ params }: { params: RouteParams }) {
  const { literal } = await params;
  const decoded = decodeURIComponent(literal).trim();

  const detail = await getKanjiDetail(decoded);
  if (!detail) notFound();

  const [tree, vocabulary] = await Promise.all([
    buildMindTree(decoded, { depth: 2, vocabularyLimit: 12, derivativesLimit: 8 }),
    getVocabularyByKanjiLiteral(decoded, 24),
  ]);
  if (!tree) notFound();

  return (
    <div className="space-y-8">
      <nav className="text-xs text-slate-500">
        <Link href="/kanji" className="hover:text-slate-900">
          Kanji
        </Link>
        <span className="px-1">/</span>
        <span className="text-slate-700">{detail.literal}</span>
      </nav>

      <header className="grid gap-6 rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm lg:grid-cols-[200px_minmax(0,1fr)]">
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-slate-50 py-6">
          <span className="jp-glyph text-7xl text-slate-900">{detail.literal}</span>
          <span className="text-xs text-slate-500">
            {detail.strokeCount ? `${detail.strokeCount} strokes` : "—"}
          </span>
          {detail.jlptLevel ? (
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
              JLPT N{detail.jlptLevel}
            </span>
          ) : null}
        </div>

        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {detail.meanings.slice(0, 4).join(", ") || detail.literal}
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              {detail.codepoint ?? ""}
              {detail.frequency ? ` · frequency rank ${detail.frequency}` : ""}
              {detail.grade ? ` · grade ${detail.grade}` : ""}
              {detail.heisigIndex ? ` · Heisig ${detail.heisigIndex}` : ""}
              {detail.skipCode ? ` · SKIP ${detail.skipCode}` : ""}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <ReadingBlock label="On'yomi (音読み)" readings={detail.onReadings} tone="indigo" />
            <ReadingBlock label="Kun'yomi (訓読み)" readings={detail.kunReadings} tone="emerald" />
          </div>

          {detail.meanings.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5 text-xs">
              {detail.meanings.map((meaning) => (
                <li key={meaning} className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                  {meaning}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </header>

      <KanjiMindTree key={detail.literal} literal={detail.literal} initialTree={tree} />

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">Radicals</h2>
          <p className="mt-1 text-xs text-slate-500">
            Kangxi radical and additional decomposition groups (kanji_radicals).
          </p>
          {detail.radicals.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No radical records for this kanji.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {detail.radicals.map((radical) => (
                <li key={radical.id}>
                  <Link
                    href={`/kanji/radicals/${radical.id}`}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 px-3 py-2 transition hover:border-amber-500"
                  >
                    <span className="jp-glyph text-2xl text-slate-900">{radical.literal}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-700">
                        {(radical.meanings ?? []).slice(0, 3).join(", ") || "—"}
                      </span>
                      <span className="block text-[11px] text-slate-400">
                        {radical.isKangxi && radical.radicalNumber
                          ? `Kangxi #${radical.radicalNumber}`
                          : "decomposition group"}
                        {radical.strokeCount ? ` · ${radical.strokeCount} strokes` : ""}
                        {radical.isPrimary ? " · primary" : ""}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">Components</h2>
          <p className="mt-1 text-xs text-slate-500">
            Direct decomposition parts (kanji_components). Usage counts show how many kanji share
            the part.
          </p>
          {detail.components.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No decomposition available.</p>
          ) : (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {detail.components.map((component) => (
                <li
                  key={component.id}
                  className="rounded-2xl border border-slate-200 px-3 py-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="jp-glyph text-2xl text-slate-900">{component.literal}</span>
                    {component.kanjiId ? (
                      <Link
                        href={`/kanji/${encodeURIComponent(component.literal)}`}
                        className="text-[11px] font-medium text-emerald-700 hover:underline"
                      >
                        open kanji →
                      </Link>
                    ) : (
                      <span className="text-[11px] text-slate-400">radical variant</span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-700">
                    {component.meanings.slice(0, 2).join(", ") || "—"}
                  </p>
                  <p className="truncate text-[11px] text-slate-400">
                    {[...component.onReadings.slice(0, 2), ...component.kunReadings.slice(0, 1)].join(
                      " / ",
                    ) || "—"}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    used in {component.usageCount.toLocaleString("en-US")} kanji
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Vocabulary</h2>
          <p className="text-xs text-slate-500">
            {detail.vocabularyCount.toLocaleString("en-US")} JMdict entries use {detail.literal}
          </p>
        </div>
        {!vocabulary || vocabulary.entries.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No vocabulary linked to this kanji.</p>
        ) : (
          <ul className="mt-4 grid gap-2 md:grid-cols-2">
            {vocabulary.entries.map((entry) => (
              <li key={entry.id}>
                <Link
                  href={`/dictionary?q=${encodeURIComponent(entry.kanjiText)}`}
                  className="block rounded-2xl border border-slate-200 px-4 py-3 transition hover:border-rose-500"
                >
                  <span className="jp block text-lg text-slate-900">{entry.kanjiText}</span>
                  <span className="jp block text-xs text-slate-500">{entry.kanaText ?? "—"}</span>
                  <span className="mt-1 block truncate text-xs text-slate-600">
                    {entry.meanings.slice(0, 3).join("; ")}
                  </span>
                  {entry.partsOfSpeech.length > 0 ? (
                    <span className="mt-1 block text-[10px] uppercase tracking-wide text-slate-400">
                      {entry.partsOfSpeech.slice(0, 3).join(" · ")}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {detail.usedIn.length > 0 ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">
            Kanji built from {detail.literal}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Reverse index over kanji_components — kanji that use this glyph as a part.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {detail.usedIn.map((kanji) => (
              <Link
                key={kanji.id}
                href={`/kanji/${encodeURIComponent(kanji.literal)}`}
                title={kanji.meanings.slice(0, 3).join(", ")}
                className="jp-glyph rounded-2xl border border-slate-200 px-3 py-2 text-2xl text-slate-800 transition hover:border-indigo-500 hover:text-indigo-700"
              >
                {kanji.literal}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <footer className="rounded-3xl border border-slate-200 bg-white/70 p-5 text-[11px] text-slate-500">
        <span className="font-medium text-slate-600">Data provenance: </span>
        {tree.provenance.map((source) => (
          <span key={source.code} className="mr-2 inline-block">
            {source.name}
            {source.version ? ` (${source.version})` : ""} — {source.license}
          </span>
        ))}
      </footer>
    </div>
  );
}

function ReadingBlock({
  label,
  readings,
  tone,
}: {
  label: string;
  readings: string[];
  tone: "indigo" | "emerald";
}) {
  const chip =
    tone === "indigo" ? "bg-indigo-50 text-indigo-800" : "bg-emerald-50 text-emerald-800";
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="jp mt-1 flex flex-wrap gap-1.5">
        {readings.length === 0 ? (
          <span className="text-sm text-slate-400">—</span>
        ) : (
          readings.slice(0, 8).map((reading) => (
            <span key={reading} className={`rounded-lg px-2 py-0.5 text-sm ${chip}`}>
              {reading}
            </span>
          ))
        )}
      </p>
    </div>
  );
}
