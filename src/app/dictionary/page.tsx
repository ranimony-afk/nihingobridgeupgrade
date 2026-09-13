import { Suspense } from "react";
import DictionaryClient from "./DictionaryClient";

export const metadata = {
  title: "Dictionary — Nihongo Bridge",
  description: "Search Japanese words by kanji, kana, romaji, English meaning or JLPT level.",
};

/**
 * Database-free UI route. All dictionary data is loaded by DictionaryClient
 * through the stable /api/v2/dictionary contract. useSearchParams requires a
 * Suspense boundary for static rendering.
 */
export default function DictionaryPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-3xl px-5 py-10">
          <p className="text-center text-slate-500">Loading dictionary…</p>
        </main>
      }
    >
      <DictionaryClient />
    </Suspense>
  );
}
