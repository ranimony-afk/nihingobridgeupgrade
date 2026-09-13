import type { Metadata } from "next";
import Link from "next/link";
import { resolveKanjiSegment } from "@/lib/japanese";
import KanjiDetailClient from "./KanjiDetailClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Kanji detail — Nihongo Bridge",
};

/**
 * Database-free UI route. Kanji data is loaded by KanjiDetailClient through the
 * stable /api/v2/kanji/:literal contract.
 *
 * Route segments arrive URL-encoded, so the literal is resolved defensively and
 * an invalid segment is rejected without ever calling the API.
 */
export default async function KanjiDetailPage({
  params,
}: {
  params: Promise<{ literal: string }>;
}) {
  const { literal: rawLiteral } = await params;
  const literal = resolveKanjiSegment(rawLiteral);

  if (literal === null) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Invalid kanji</h1>
        <p className="mt-2 text-slate-500">
          A kanji detail page needs exactly one CJK ideograph.
        </p>
        <Link
          href="/kanji"
          className="mt-6 inline-block rounded-xl bg-rose-500 px-4 py-2 font-semibold text-white transition hover:bg-rose-600"
        >
          Back to explorer
        </Link>
      </main>
    );
  }

  return <KanjiDetailClient literal={literal} />;
}
