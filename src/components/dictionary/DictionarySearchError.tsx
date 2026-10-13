import { AlertTriangle, RefreshCw } from "lucide-react";

interface DictionarySearchErrorProps {
  onRetry: () => void;
}

/** Safe learner-facing failure state; diagnostic details remain internal. */
export function DictionarySearchError({ onRetry }: DictionarySearchErrorProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-labelledby="dictionary-search-error-title"
      className="rounded-2xl border border-amber-200 bg-amber-50 p-10 text-center shadow-sm"
    >
      <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-600" aria-hidden="true" />
      <h3 id="dictionary-search-error-title" className="text-lg font-bold text-slate-900">
        Dictionary search is temporarily unavailable
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
        We couldn&apos;t load these results. Check your connection and try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Retry
      </button>
    </div>
  );
}
