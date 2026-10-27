"use client";

import Link from "next/link";

export default function DictionaryEntryError({ reset }: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main role="alert" aria-live="assertive" className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-bold text-slate-900">Couldn&apos;t load this dictionary entry</h1>
      <p className="mt-3 text-sm text-slate-600">
        The dictionary is temporarily unavailable. Check your connection and try again.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500">
          Retry
        </button>
        <Link href="/dictionary" className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500">
          Back to dictionary search
        </Link>
      </div>
    </main>
  );
}
