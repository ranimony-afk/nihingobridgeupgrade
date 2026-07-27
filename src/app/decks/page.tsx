import Link from "next/link";
import { db } from "@/db";
import { customDecks } from "@/db/schema";
import { desc } from "drizzle-orm";
import { ensureSeed } from "@/lib/seed";
import { BrandHeader } from "@/shared/components/BrandHeader";
import { getBrand } from "@/lib/brands";

export const dynamic = "force-dynamic";

export default async function DecksPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string }>;
}) {
  await ensureSeed();
  const { level = "all" } = await searchParams;
  const cfg = getBrand("nihongo")!;

  const allDecks = await db.select().from(customDecks).orderBy(desc(customDecks.createdAt));
  const filtered = level === "all" ? allDecks : allDecks.filter((d) => d.jlptLevel === level);

  return (
    <main
      className="min-h-screen px-6 py-10"
      style={{ background: cfg.theme.surface, color: cfg.theme.text }}
    >
      <div className="mx-auto max-w-5xl space-y-8">
        <BrandHeader brand={cfg} />

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: cfg.theme.primary }}>
              Quizlet-Style Flashcard Platform 🎴
            </h1>
            <p className="mt-1 text-sm opacity-80">
              Flip, write, match, type, listen, and review custom decks with adaptive SM-2 Spaced Repetition.
            </p>
          </div>
        </div>

        {/* 1. Auto-Generate Deck Buttons Section */}
        <div className="rounded-3xl bg-white p-6 shadow-sm border border-black/5 space-y-3">
          <p className="text-xs uppercase font-bold tracking-wider text-rose-700">⚡ Auto-Generate Custom Decks</p>
          <div className="grid gap-3 sm:grid-cols-5 text-xs font-bold">
            <Link
              href="/study/flashcards"
              className="rounded-2xl bg-rose-50 hover:bg-rose-100 p-3 text-center text-rose-900 border border-rose-200/60 transition"
            >
              📖 From Vocabulary
            </Link>
            <Link
              href="/kanji"
              className="rounded-2xl bg-amber-50 hover:bg-amber-100 p-3 text-center text-amber-900 border border-amber-200/60 transition"
            >
              🈸 From Kanji
            </Link>
            <Link
              href="/study/write"
              className="rounded-2xl bg-indigo-50 hover:bg-indigo-100 p-3 text-center text-indigo-900 border border-indigo-200/60 transition"
            >
              ✍️ From Grammar
            </Link>
            <Link
              href="/dictionary"
              className="rounded-2xl bg-emerald-50 hover:bg-emerald-100 p-3 text-center text-emerald-900 border border-emerald-200/60 transition"
            >
              🏷️ From Saved Lists
            </Link>
            <Link
              href="/jlpt/mock-exam"
              className="rounded-2xl bg-purple-50 hover:bg-purple-100 p-3 text-center text-purple-900 border border-purple-200/60 transition"
            >
              ❌ From Practice Errors
            </Link>
          </div>
        </div>

        {/* 2. JLPT Level Filter Pills */}
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          {["all", "N5", "N4", "N3", "N2", "N1"].map((lvl) => (
            <Link
              key={lvl}
              href={`/decks?level=${lvl}`}
              className={`rounded-lg px-3 py-1.5 transition ${
                level === lvl ? "bg-slate-900 text-white" : "bg-white/80 hover:bg-white text-slate-700 shadow-2xs"
              }`}
            >
              {lvl === "all" ? "All Levels" : `JLPT ${lvl}`}
            </Link>
          ))}
        </div>

        {/* 3. Decks Grid with All 7 Study Modes */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((deck) => (
            <div
              key={deck.id}
              className="flex flex-col justify-between rounded-3xl bg-white p-6 shadow-sm border border-black/5 space-y-4 transition hover:shadow-md"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="rounded-full bg-rose-100 px-2.5 py-0.5 font-bold text-rose-800 uppercase text-[10px]">
                    {deck.jlptLevel}
                  </span>
                  <span className="text-xs font-medium opacity-60">
                    {deck.cardCount} cards
                  </span>
                </div>
                <Link href={`/decks/${deck.id}`} className="text-lg font-bold text-slate-950 hover:text-rose-700 transition block">
                  {deck.title}
                </Link>
                {deck.description && (
                  <p className="text-xs opacity-75 line-clamp-2 leading-relaxed">{deck.description}</p>
                )}
              </div>

              {/* 7 Study Modes Launch Buttons */}
              <div className="border-t border-black/5 pt-3 space-y-2 text-xs">
                <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Launch Study Mode</p>
                <div className="grid grid-cols-3 gap-1.5 font-bold text-[10px] text-center">
                  <Link href={`/study/flashcards?deckId=${deck.id}`} className="rounded-lg bg-rose-50 hover:bg-rose-100 p-1.5 text-rose-800">
                    🎴 Flip
                  </Link>
                  <Link href={`/study/write?deckId=${deck.id}`} className="rounded-lg bg-slate-100 hover:bg-slate-200 p-1.5 text-slate-800">
                    ✍️ Write
                  </Link>
                  <Link href={`/study/match?deckId=${deck.id}`} className="rounded-lg bg-emerald-50 hover:bg-emerald-100 p-1.5 text-emerald-800">
                    🧩 Match
                  </Link>
                  <Link href={`/study/multiple-choice?deckId=${deck.id}`} className="rounded-lg bg-amber-50 hover:bg-amber-100 p-1.5 text-amber-800">
                    📝 Choice
                  </Link>
                  <Link href={`/study/typing?deckId=${deck.id}`} className="rounded-lg bg-indigo-50 hover:bg-indigo-100 p-1.5 text-indigo-800">
                    ⌨️ Typing
                  </Link>
                  <Link href={`/study/listening?deckId=${deck.id}`} className="rounded-lg bg-purple-50 hover:bg-purple-100 p-1.5 text-purple-800">
                    🎧 Audio
                  </Link>
                </div>
                <Link
                  href={`/study/review?deckId=${deck.id}`}
                  className="block w-full text-center rounded-xl bg-slate-900 text-white font-bold py-2 text-xs hover:bg-slate-800 transition"
                >
                  🧠 Spaced Repetition Review (SM-2) →
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
