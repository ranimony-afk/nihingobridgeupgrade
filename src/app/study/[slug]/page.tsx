import { notFound } from "next/navigation";
import { getDeckBySlug, getDueCards } from "@/lib/queries";
import StudySession from "./StudySession";

export const dynamic = "force-dynamic";

export default async function StudyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const deck = await getDeckBySlug(slug);
  if (!deck) notFound();

  const cards = await getDueCards(deck.id, 20);

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <StudySession
        deckId={deck.id}
        deckTitle={deck.title}
        deckEmoji={deck.emoji}
        slug={deck.slug}
        cards={cards}
      />
    </main>
  );
}
