"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type {
  RadicalApiError,
  RadicalDetail,
  RadicalKanjiItem,
} from "@/types/radical-v2";

function KanjiGrid({
  items,
  testId,
}: {
  items: RadicalKanjiItem[];
  testId: string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No kanji in the current corpus.
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6" data-testid={testId}>
      {items.map((item) => (
        <li key={item.literal}>
          <Link
            href={`/kanji/${encodeURIComponent(item.literal)}`}
            className="flex flex-col items-center rounded-xl border border-slate-200 bg-white p-3 text-center transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow"
          >
            <span className="text-3xl font-bold text-slate-900">{item.literal}</span>
            <span className="mt-1 truncate text-[11px] text-slate-500">
              {item.meanings[0] ?? "—"}
            </span>
            {item.strokeCount !== null && (
              <span className="text-[10px] text-slate-400">{item.strokeCount} str</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function RadicalDetailClient({ number }: { number: number }) {
  const [radical, setRadical] = useState<RadicalDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "not-found">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    (async () => {
      try {
        const response = await fetch(`/api/v2/radicals/${number}`);
        if (cancelled) return;
        if (response.status === 404) {
          setState("not-found");
          return;
        }
        const body = (await response.json()) as RadicalDetail | RadicalApiError;
        if (!response.ok) {
          const parsed = body as Partial<RadicalApiError>;
          throw new Error(parsed.error?.message ?? "Unable to load this radical.");
        }
        if (cancelled) return;
        setRadical(body as RadicalDetail);
        setState("ready");
      } catch (error) {
        if (cancelled) return;
        setMessage(error instanceof Error ? error.message : "Unable to load this radical.");
        setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [number]);

  if (state === "loading") {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16 text-center text-slate-500">
        Loading radical…
      </main>
    );
  }

  if (state !== "ready" || !radical) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900">
          {state === "not-found" ? "Radical not found" : "Something went wrong"}
        </h1>
        <p className="mt-2 text-slate-500">
          {state === "not-found" ? "Radicals are numbered 1–214." : message}
        </p>
        <Link
          href="/radicals"
          className="mt-6 inline-block rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white transition hover:bg-emerald-700"
        >
          Back to radicals
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Link
        href="/radicals"
        className="text-sm font-semibold text-emerald-600 transition hover:text-emerald-700"
      >
        ← All radicals
      </Link>

      <article className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-start gap-5">
          <span className="text-7xl font-extrabold leading-none text-slate-950">
            {radical.character}
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">
              Radical {radical.number} — {radical.meaning}
            </h1>
            {radical.reading && (
              <p className="mt-1 text-sm text-emerald-600">{radical.reading}</p>
            )}
            <p className="mt-2 text-sm text-slate-500">
              {radical.strokeCount} stroke{radical.strokeCount === 1 ? "" : "s"}
            </p>
            {radical.variants.length > 0 && (
              <p className="mt-2 text-sm text-slate-600">
                Written as{" "}
                <span className="font-bold text-slate-900">
                  {radical.variants.join(" ")}
                </span>{" "}
                in combined positions.
              </p>
            )}
          </div>
        </div>

        <section className="mt-8">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Kanji classified under this radical
          </h2>
          <p className="mb-3 mt-1 text-xs text-slate-400">
            Each kanji has exactly one classifying radical, used for dictionary
            ordering.
          </p>
          <KanjiGrid items={radical.kanjiByRadical} testId="kanji-by-radical" />
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Kanji containing this as a component
          </h2>
          <p className="mb-3 mt-1 text-xs text-slate-400">
            A kanji can contain many components; this is the reverse
            decomposition lookup.
          </p>
          <KanjiGrid items={radical.kanjiByComponent} testId="kanji-by-component" />
          {radical.kanjiByComponent.length > 0 && (
            <Link
              href={`/kanji?components=${encodeURIComponent(radical.character)}`}
              className="mt-3 inline-block text-xs font-semibold text-emerald-600 hover:text-emerald-700"
            >
              Combine with other components in the kanji explorer →
            </Link>
          )}
        </section>

        {radical.provenance && (
          <aside className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
            <p>
              Source: <strong>{radical.provenance.source}</strong>
            </p>
            <p className="mt-1">{radical.provenance.license}</p>
          </aside>
        )}
      </article>
    </main>
  );
}
