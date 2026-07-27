import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { customDecks, customDeckCards } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { ensureSeed } from "@/lib/seed";
import { BrandHeader } from "@/shared/components/BrandHeader";
import { getBrand } from "@/lib/brands";

export const dynamic = "force-dynamic";

export default async function SingleDeckPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await ensureSeed();
  const { id } = await params;
  const deckId = Number(id);
  if (!Number.isFinite(deckId)) notFound();

  const cfg = getBrand("nihongo")!;
  const deckRows = await db.select().from(customDecks).where(eq(customDecks.id, deckId)).limit(1);
  if (deckRows.length === 0) notFound();
  const deck = deckRows[0];

  const cards = await db
    .select()
    .from(customDeckCards)
    .where(eq(customDeckCards.deckId, deckId))
    .orderBy(asc(customDeckCards.position));

  return (
    <main
      className="min-h-screen px-6 py-12"
      style={{ background: cfg.theme.surface, color: cfg.theme.text }}
    >
      <div className="mx-auto max-w-4xl space-y-8">
        <BrandHeader brand={cfg} />

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/decks" className="text-xs font-semibold opacity-60 hover:opacity-100">
              ← Back to all decks
            </Link>
            <h1 className="mt-2 text-3xl font-bold" style={{ color: cfg.theme.primary }}>
              {deck.title}
            </h1>
            <p className="mt-1 text-sm opacity-80">{deck.description}</p>
          </div>

          {/* Quick study mode launch buttons */}
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <Link
              href={`/study/flashcards?deckId=${deck.id}`}
              className="rounded-xl px-4 py-2 text-white transition hover:opacity-90"
              style={{ background: cfg.theme.accent }}
            >
              🎴 Flashcards
            </Link>
            <Link
              href={`/study/write?deckId=${deck.id}`}
              className="rounded-xl bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
            >
              ✍️ Write
            </Link>
            <Link
              href={`/study/match?deckId=${deck.id}`}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-500"
            >
              🧩 Match
            </Link>
          </div>
        </div>

        {/* Deck metadata pill row */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 text-xs font-medium shadow-sm border border-black/5">
          <span className="rounded-full bg-rose-100 px-3 py-1 font-bold text-rose-800 uppercase">
            Level: {deck.jlptLevel}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
            Total Cards: {cards.length}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
            Share Code: <code className="font-mono text-rose-600">{deck.shareCode}</code>
          </span>
        </div>

        {/* Card List in this deck */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold" style={{ color: cfg.theme.primary }}>
            Cards in this Deck ({cards.length})
          </h2>

          <div className="divide-y divide-black/5 rounded-2xl bg-white shadow-sm border border-black/5 overflow-hidden">
            {cards.map((card, idx) => (
              <div key={card.id} className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 text-sm items-center">
                <div>
                  <span className="text-[10px] opacity-40 font-mono mr-2">#{idx + 1}</span>
                  <span className="text-xl font-bold text-slate-950">{card.front}</span>
                  {card.furigana && <p className="text-xs text-rose-600">{card.furigana}</p>}
                </div>
                <div className="sm:col-span-2 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{card.back}</p>
                    {card.notes && <p className="text-xs opacity-60 italic">{card.notes}</p>}
                  </div>
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">
                    {card.accuracy}% acc
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
