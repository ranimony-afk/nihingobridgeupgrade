import Link from "next/link";
import { db } from "@/db";
import { customDeckCards } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { ensureSeed } from "@/lib/seed";
import { BrandHeader } from "@/shared/components/BrandHeader";
import { getBrand } from "@/lib/brands";
import { ReviewClient } from "./ReviewClient";

export const dynamic = "force-dynamic";

export default async function SpacedReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ deckId?: string }>;
}) {
  await ensureSeed();
  const { deckId } = await searchParams;
  const cfg = getBrand("nihongo")!;

  const cards = deckId
    ? await db.select().from(customDeckCards).where(eq(customDeckCards.deckId, Number(deckId))).orderBy(asc(customDeckCards.position))
    : await db.select().from(customDeckCards).orderBy(asc(customDeckCards.position)).limit(15);

  return (
    <main
      className="min-h-screen px-6 py-12"
      style={{ background: cfg.theme.surface, color: cfg.theme.text }}
    >
      <div className="mx-auto max-w-4xl space-y-8">
        <BrandHeader brand={cfg} />
        <div className="flex items-center justify-between">
          <div>
            <Link href="/decks" className="text-xs font-semibold opacity-60 hover:opacity-100">
              ← Back to decks
            </Link>
            <h1 className="mt-1 text-2xl font-bold" style={{ color: cfg.theme.primary }}>
              Daily Spaced Repetition (SM-2) Review 🧠
            </h1>
          </div>
        </div>

        <ReviewClient cards={cards} />
      </div>
    </main>
  );
}
