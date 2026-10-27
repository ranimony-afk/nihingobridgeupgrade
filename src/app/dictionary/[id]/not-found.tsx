import Link from "next/link";

export default function DictionaryEntryNotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-bold text-slate-900">Dictionary entry not found</h1>
      <p className="mt-3 text-sm text-slate-600">
        This entry may have moved or is not available. Try another search.
      </p>
      <Link href="/dictionary" className="mt-6 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500">
        Back to dictionary search
      </Link>
    </main>
  );
}
