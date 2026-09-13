"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { RadicalApiError, RadicalIndexResponse } from "@/types/radical-v2";

export default function RadicalIndexClient() {
  const [index, setIndex] = useState<RadicalIndexResponse | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [onlyUsed, setOnlyUsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/v2/radicals");
        const body = (await response.json()) as RadicalIndexResponse | RadicalApiError;
        if (cancelled) return;
        if (!response.ok) {
          const parsed = body as Partial<RadicalApiError>;
          throw new Error(parsed.error?.message ?? "Unable to load radicals.");
        }
        setIndex(body as RadicalIndexResponse);
        setState("ready");
      } catch (error) {
        if (cancelled) return;
        setMessage(error instanceof Error ? error.message : "Unable to load radicals.");
        setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") {
    return (
      <main className="mx-auto max-w-5xl px-5 py-16 text-center text-slate-500">
        Loading radicals…
      </main>
    );
  }

  if (state === "error" || !index) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Something went wrong</h1>
        <p className="mt-2 text-slate-500">{message}</p>
      </main>
    );
  }

  const groups = onlyUsed
    ? index.groups
        .map((group) => ({
          ...group,
          radicals: group.radicals.filter(
            (radical) => radical.kanjiCount > 0 || radical.componentCount > 0,
          ),
        }))
        .filter((group) => group.radicals.length > 0)
    : index.groups;

  const usedCount = index.groups
    .flatMap((group) => group.radicals)
    .filter((radical) => radical.kanjiCount > 0 || radical.componentCount > 0).length;

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <section className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-7 text-white shadow-xl sm:p-9">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-300">
          Radicals
        </p>
        <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">
          The {index.total} building blocks.
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-300 sm:text-base">
          Every kanji is classified under one of the 214 Kangxi radicals. Browse
          them by stroke count, or jump straight to the kanji that use them.
        </p>
      </section>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
          <input
            type="checkbox"
            checked={onlyUsed}
            onChange={(event) => setOnlyUsed(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Only radicals present in this corpus ({usedCount})
        </label>
        <Link
          href="/kanji"
          className="text-sm font-semibold text-emerald-600 hover:text-emerald-700"
        >
          Multi-radical kanji search →
        </Link>
      </div>

      {groups.map((group) => (
        <section key={group.strokeCount} className="mt-7">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            {group.strokeCount} stroke{group.strokeCount === 1 ? "" : "s"}
            <span className="ml-2 font-normal text-slate-400">
              ({group.radicals.length})
            </span>
          </h2>
          <ul
            className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8"
            data-testid={`radical-group-${group.strokeCount}`}
          >
            {group.radicals.map((radical) => {
              const used = radical.kanjiCount > 0 || radical.componentCount > 0;
              return (
                <li key={radical.number}>
                  <Link
                    href={`/radicals/${radical.number}`}
                    className={`flex flex-col items-center rounded-xl border p-2.5 text-center transition ${
                      used
                        ? "border-emerald-200 bg-white hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow"
                        : "border-slate-200 bg-slate-50 hover:border-slate-300"
                    }`}
                  >
                    <span className="text-2xl font-bold text-slate-900">
                      {radical.character}
                    </span>
                    <span className="mt-0.5 truncate text-[10px] text-slate-500">
                      {radical.meaning}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-400">
                      #{radical.number}
                      {used ? ` · ${radical.kanjiCount + radical.componentCount}` : ""}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <p className="mt-8 text-xs text-slate-400">
        The Kangxi radical system is public domain (康熙字典, 1716). English
        descriptors are curated for this project, not imported from a
        third-party database.
      </p>
    </main>
  );
}
