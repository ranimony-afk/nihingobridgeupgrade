"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ratingLabels, type Rating } from "@/lib/srs";
import type { StudyCard } from "@/lib/queries";

type Props = {
  deckId: number;
  deckTitle: string;
  deckEmoji: string;
  slug: string;
  cards: StudyCard[];
};

type ReviewItem = {
  cardId: number;
  rating: Rating;
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
};

export default function StudySession({
  deckId,
  deckTitle,
  deckEmoji,
  slug,
  cards,
}: Props) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const total = cards.length;
  const current = cards[index];
  const correct = useMemo(
    () => reviews.filter((r) => r.rating !== "again").length,
    [reviews],
  );

  if (total === 0) {
    return (
      <EmptyState deckTitle={deckTitle} />
    );
  }

  async function submit(all: ReviewItem[]) {
    setSaving(true);
    try {
      await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckId, reviews: all }),
      });
    } catch {
      // best-effort; still show summary
    } finally {
      setSaving(false);
      setDone(true);
      router.refresh();
    }
  }

  function rate(rating: Rating) {
    if (!current) return;
    const item: ReviewItem = {
      cardId: current.id,
      rating,
      repetitions: current.repetitions,
      intervalDays: current.intervalDays,
      easeFactor: current.easeFactor,
    };
    const nextReviews = [...reviews, item];
    setReviews(nextReviews);

    if (index + 1 >= total) {
      void submit(nextReviews);
    } else {
      setIndex(index + 1);
      setRevealed(false);
    }
  }

  if (done) {
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    return (
      <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="text-5xl">🎉</div>
        <h2 className="mt-4 text-2xl font-bold">Session complete!</h2>
        <p className="mt-1 text-slate-500">
          You reviewed {total} card{total === 1 ? "" : "s"} in {deckTitle}.
        </p>
        <div className="mt-6 grid grid-cols-3 gap-3 text-center">
          <Metric label="Reviewed" value={total} />
          <Metric label="Correct" value={correct} />
          <Metric label="Accuracy" value={`${accuracy}%`} />
        </div>
        <div className="mt-8 flex flex-col gap-2">
          <button
            onClick={() => router.refresh()}
            className="rounded-xl bg-rose-500 px-4 py-2.5 font-semibold text-white transition hover:bg-rose-600"
          >
            Study more
          </button>
          <Link
            href="/"
            className="rounded-xl border border-slate-200 px-4 py-2.5 font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Back to decks
          </Link>
        </div>
      </div>
    );
  }

  const progressPct = Math.round((index / total) * 100);

  return (
    <div className="mx-auto max-w-xl">
      {/* header */}
      <div className="mb-4 flex items-center justify-between">
        <Link href="/" className="text-sm font-medium text-slate-500 hover:text-slate-800">
          ← Decks
        </Link>
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <span>{deckEmoji}</span>
          <span>{deckTitle}</span>
        </div>
        <span className="text-sm font-medium text-slate-500">
          {index + 1} / {total}
        </span>
      </div>

      <div className="mb-6 h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-400 transition-all"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* card */}
      <button
        type="button"
        onClick={() => setRevealed(true)}
        className="flex min-h-[18rem] w-full flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm transition hover:shadow-md"
      >
        <div className="text-6xl font-bold leading-none sm:text-7xl">
          {current.front}
        </div>

        {!revealed ? (
          <p className="mt-8 text-sm font-medium text-slate-400">
            Tap to reveal answer
          </p>
        ) : (
          <div className="mt-6 w-full border-t border-dashed border-slate-200 pt-6">
            {current.reading && (
              <p className="text-lg font-medium text-rose-500">{current.reading}</p>
            )}
            <p className="mt-1 text-2xl font-bold text-slate-900">{current.back}</p>
            {current.example && (
              <div className="mt-4 rounded-xl bg-slate-50 p-3 text-left">
                <p className="text-base text-slate-800">{current.example}</p>
                {current.exampleTranslation && (
                  <p className="mt-1 text-sm text-slate-500">
                    {current.exampleTranslation}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </button>

      {/* controls */}
      <div className="mt-6">
        {!revealed ? (
          <button
            onClick={() => setRevealed(true)}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-800"
          >
            Show answer
          </button>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {(Object.keys(ratingLabels) as Rating[]).map((r) => (
              <button
                key={r}
                disabled={saving}
                onClick={() => rate(r)}
                className={`flex flex-col items-center rounded-xl px-2 py-3 font-semibold text-white transition disabled:opacity-60 ${ratingLabels[r].color}`}
              >
                <span>{ratingLabels[r].label}</span>
                <span className="mt-0.5 text-[10px] font-normal opacity-90">
                  {ratingLabels[r].hint}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-slate-400">
        Deck: {slug} · Rate honestly — the scheduler adapts to you.
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="text-xl font-bold text-slate-900">{value}</div>
      <div className="text-xs font-medium text-slate-500">{label}</div>
    </div>
  );
}

function EmptyState({ deckTitle }: { deckTitle: string }) {
  return (
    <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <div className="text-5xl">✅</div>
      <h2 className="mt-4 text-2xl font-bold">Nothing due right now</h2>
      <p className="mt-1 text-slate-500">
        You&apos;ve reviewed everything in {deckTitle}. Come back later!
      </p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-xl bg-rose-500 px-4 py-2.5 font-semibold text-white transition hover:bg-rose-600"
      >
        Back to decks
      </Link>
    </div>
  );
}
