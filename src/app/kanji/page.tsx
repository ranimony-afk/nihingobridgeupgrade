import { Suspense } from "react";
import type { Metadata } from "next";
import KanjiExplorerClient from "./KanjiExplorerClient";

// Must stay force-dynamic: the explorer keeps its filters and pagination in the
// URL via router.replace(), and under force-static the App Router resolves that
// call successfully without updating the address bar (verified by testing).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kanji Explorer — Nihongo Bridge",
  description:
    "Search and filter kanji by meaning, reading, stroke count, grade, radical, JLPT level and component.",
};

/**
 * Database-free UI route. The explorer calls /api/v2/kanji/search only.
 *
 * useSearchParams requires a Suspense boundary when the page is statically
 * rendered, so the interactive explorer is wrapped here.
 */
export default function KanjiExplorerPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-5xl px-5 py-16 text-center text-slate-500">
          Loading kanji explorer…
        </main>
      }
    >
      <KanjiExplorerClient />
    </Suspense>
  );
}
