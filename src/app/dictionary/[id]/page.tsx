import { notFound } from "next/navigation";
import Link from "next/link";
import { DictionaryService } from "@/services/dictionary";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Sparkles,
  ExternalLink,
  Tag,
  Network,
  Share2,
} from "lucide-react";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DictionaryEntryPage({ params }: Props) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);
  const detail = await DictionaryService.getEntryDetail(decodedId);

  if (!detail) {
    notFound();
  }

  const { entry, source, kanji, sentences, relatedGrammar } = detail;
  const senses = Array.isArray(entry.senses) ? entry.senses : [];

  return (
    <div className="min-h-screen bg-slate-50/60 pb-20">
      {/* Top Nav Back */}
      <div className="bg-white border-b border-slate-200">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-4">
          <Link
            href="/dictionary"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-red-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dictionary Search
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 mt-8 space-y-8">
        {/* Main Entry Card */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-10">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 pb-6 border-b border-slate-100">
            <div>
              <div className="flex flex-wrap items-baseline gap-3">
                <h1 className="font-japanese text-4xl sm:text-6xl font-black text-slate-900 tracking-tight">
                  {entry.headword}
                </h1>
                <div className="flex flex-col">
                  <span className="font-japanese text-xl sm:text-2xl font-bold text-slate-600">
                    {entry.reading}
                  </span>
                  {entry.romaji && (
                    <span className="text-sm font-mono text-slate-400">
                      {entry.romaji}
                    </span>
                  )}
                </div>
              </div>

              {/* Parts of Speech & Tags */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {entry.partsOfSpeech.map((pos) => (
                  <span
                    key={pos}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold uppercase tracking-wider"
                  >
                    {pos}
                  </span>
                ))}
                {entry.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 rounded-lg bg-red-50 text-red-700 text-xs font-medium border border-red-100"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Badges */}
            <div className="flex sm:flex-col items-center sm:items-end gap-2 flex-shrink-0">
              <span className="px-3 py-1 rounded-xl text-sm font-black bg-slate-900 text-white shadow-sm">
                JLPT {entry.jlptLevel}
              </span>
              {entry.isCommon && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Common Word
                </span>
              )}
            </div>
          </div>

          {/* Senses / Definitions */}
          <div className="mt-8">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">
              Definitions & Meanings
            </h2>
            <div className="space-y-4">
              {senses.map((s, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-2xl bg-slate-50/70 border border-slate-100 flex items-start gap-4"
                >
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <div className="space-y-1">
                    <p className="text-base sm:text-lg font-semibold text-slate-900">
                      {s.glosses.join("; ")}
                    </p>
                    {s.note && (
                      <p className="text-sm text-slate-500 italic">
                        {s.note}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Provenance / Source Attribution */}
          <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <div>
              <span className="font-semibold text-slate-700">Source: </span>
              {source ? (
                <span>
                  {source.name} ({source.version}) — {source.license}
                </span>
              ) : (
                <span>{entry.sourceRef || "First-party lexical database"}</span>
              )}
            </div>
            {entry.frequencyRank && (
              <span className="font-mono text-slate-400">
                Frequency Rank: #{entry.frequencyRank}
              </span>
            )}
          </div>
        </div>

        {/* Kanji Breakdown Section */}
        {kanji.length > 0 && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Network className="w-5 h-5 text-red-600" />
                Kanji Components & Decomposition
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {kanji.map((k) => (
                <Link
                  key={k.id}
                  href={`/kanji/${encodeURIComponent(k.character)}`}
                  className="p-4 rounded-2xl border border-slate-200 hover:border-red-400 hover:shadow-sm transition-all group flex items-start gap-4"
                >
                  <span className="font-japanese text-4xl font-black text-slate-900 group-hover:text-red-600 transition-colors">
                    {k.character}
                  </span>
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm">{k.meaning}</h3>
                    <p className="text-xs text-slate-500 font-japanese mt-0.5">
                      {k.readingsKun?.slice(0, 2).join(", ")}
                    </p>
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                        {k.jlptLevel}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {k.strokeCount} strokes
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Example Sentences */}
        {sentences.length > 0 && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
            <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-red-600" />
              Example Sentences in Context
            </h2>
            <div className="divide-y divide-slate-100">
              {sentences.map((sentence) => (
                <div key={sentence.id} className="py-4 first:pt-0 last:pb-0">
                  <p className="font-japanese text-lg font-bold text-slate-900">
                    {sentence.japanese}
                  </p>
                  <p className="font-japanese text-xs text-slate-500 mt-0.5">
                    {sentence.reading}
                  </p>
                  <p className="text-sm font-medium text-slate-700 mt-1">
                    {sentence.english}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                      {sentence.jlptLevel}
                    </span>
                    {sentence.grammarId && (
                      <span className="text-[10px] font-mono text-slate-400">
                        Grammar: {sentence.grammarId}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Related Grammar Points */}
        {relatedGrammar.length > 0 && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
            <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              Related Grammar Points
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {relatedGrammar.map((gp) => (
                <div
                  key={gp.id}
                  className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-japanese font-bold text-slate-900 text-base">
                      {gp.title}
                    </h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700">
                      {gp.jlptLevel}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-slate-600 mt-1">
                    {gp.meaning}
                  </p>
                  <p className="text-xs font-mono text-slate-500 mt-1">
                    {gp.structure}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
