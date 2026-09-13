import type { Metadata } from "next";
import Link from "next/link";
import RadicalDetailClient from "./RadicalDetailClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Radical — Nihongo Bridge",
};

/** Database-free UI route; data comes from /api/v2/radicals/:number. */
export default async function RadicalDetailPage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number: raw } = await params;
  const parsed = /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : Number.NaN;

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 214) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Invalid radical</h1>
        <p className="mt-2 text-slate-500">Radicals are numbered 1–214.</p>
        <Link
          href="/radicals"
          className="mt-6 inline-block rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white transition hover:bg-emerald-700"
        >
          Back to radicals
        </Link>
      </main>
    );
  }

  return <RadicalDetailClient number={parsed} />;
}
