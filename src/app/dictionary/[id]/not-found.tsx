import Link from "next/link";

export default function DictionaryEntryNotFound() {
  return (
    <main className="mx-auto max-w-xl px-5 py-20 text-center" data-testid="dictionary-not-found">
      <p className="text-5xl">📖</p>
      <h1 className="mt-4 text-2xl font-bold text-slate-900">Entry not found</h1>
      <p className="mt-2 text-slate-500">
        That dictionary entry doesn&apos;t exist in this corpus.
      </p>
      <Link
        href="/dictionary"
        className="mt-6 inline-block rounded-xl bg-rose-500 px-5 py-2.5 font-semibold text-white transition hover:bg-rose-600"
      >
        Back to dictionary
      </Link>
    </main>
  );
}
