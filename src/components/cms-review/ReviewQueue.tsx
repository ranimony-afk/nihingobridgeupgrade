"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ClipboardCheck,
  Loader2,
  Search,
} from "lucide-react";
import { cmsRequest } from "@/lib/cms-admin/api";
import type { ApiFailure } from "@/lib/cms-admin/api";
import type {
  ActorCapabilities,
  AdminCmsItem,
} from "@/lib/cms-admin/types";
import {
  buildQueueListUrl,
  mergeQueueResults,
  slicesForFilter,
} from "@/lib/cms-review/queue";
import type { ReviewSlice } from "@/lib/cms-review/queue";
import type {
  ReviewQueueItem,
  ReviewQueueTab,
  ReviewTypeFilter,
} from "@/lib/cms-review/types";
import { StatusBadge } from "@/components/admin/StatusBadge";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-red-500 focus:bg-white focus:outline-none";

const TAB_COPY: Record<ReviewQueueTab, { title: string; blurb: string }> = {
  review: {
    title: "Needs Review",
    blurb: "Content waiting for reviewer decision.",
  },
  approved: {
    title: "Approved",
    blurb:
      "Content approved and awaiting final disposition — schedule or publish for dictionary, verify for translations.",
  },
};

const TYPE_FILTERS: readonly ReviewTypeFilter[] = ["all", "dictionary", "translation"];

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function typeBadgeClass(contentType: string): string {
  if (contentType === "translation") {
    return "bg-violet-100 text-violet-800 border border-violet-200";
  }
  if (contentType === "dictionary") {
    return "bg-sky-100 text-sky-800 border border-sky-200";
  }
  return "bg-slate-100 text-slate-700 border border-slate-200";
}

export function ReviewQueue({
  capabilities,
}: {
  capabilities: ActorCapabilities;
}) {
  const [tab, setTab] = useState<ReviewQueueTab>("review");
  const [typeFilter, setTypeFilter] = useState<ReviewTypeFilter>("all");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [partial, setPartial] = useState<{
    slice: ReviewSlice;
    message: string;
  } | null>(null);

  const fetchQueue = useCallback(
    async (
      nextTab: ReviewQueueTab,
      nextFilter: ReviewTypeFilter,
      nextQuery: string
    ) => {
      setLoading(true);
      setFailure(null);
      setPartial(null);
      const slices = slicesForFilter(nextFilter);
      const results = await Promise.all(
        slices.map(async (slice) => ({
          slice,
          result: await cmsRequest<{ items: AdminCmsItem[] }>(
            buildQueueListUrl(slice, nextTab, nextQuery)
          ),
        }))
      );
      const succeeded = results.filter((r) => r.result.ok);
      const failed = results.filter((r) => !r.result.ok);
      if (succeeded.length === 0) {
        const first = failed[0]?.result;
        setItems([]);
        setFailure(
          first && !first.ok
            ? first.failure
            : {
                kind: "server",
                status: 0,
                code: "UNKNOWN",
                message: "Unexpected server error. Please try again.",
              }
        );
      } else {
        const bySlice = (slice: ReviewSlice): AdminCmsItem[] => {
          const hit = succeeded.find((r) => r.slice === slice);
          if (!hit || !hit.result.ok) return [];
          return hit.result.data.items ?? [];
        };
        setItems(mergeQueueResults(bySlice("dictionary"), bySlice("translation")));
        if (failed.length > 0) {
          const hit = failed[0];
          const problem =
            hit && !hit.result.ok ? hit.result.failure.message : "Unavailable.";
          setPartial({
            slice: failed[0]?.slice ?? "dictionary",
            message: problem,
          });
        }
      }
      setLoading(false);
    },
    []
  );

  useEffect(() => {
    fetchQueue(tab, typeFilter, query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, typeFilter]);

  const resetFilters = () => {
    setQuery("");
    setTypeFilter("all");
    fetchQueue(tab, "all", "");
  };

  const emptyTitle =
    query.trim() !== "" || typeFilter !== "all"
      ? "No matching content found."
      : tab === "review"
        ? "No content needs review."
        : "No approved content is waiting for disposition.";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">
              CMS Admin
            </span>
            <span className="text-xs font-semibold text-slate-500">
              Signed in as {capabilities.role}
            </span>
          </div>
          <h1 className="mt-1 text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
            Review Workspace
          </h1>
        </div>
      </div>

      {/* Status tabs */}
      <div
        role="group"
        aria-label="Review queue status"
        className="grid grid-cols-1 sm:grid-cols-2 gap-3"
      >
        {(Object.keys(TAB_COPY) as ReviewQueueTab[]).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-3xl border p-5 text-left shadow-sm transition-all ${
              tab === key
                ? "border-red-600 bg-white ring-2 ring-red-600/20"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <span className="text-sm font-extrabold text-slate-900">
              {TAB_COPY[key].title}
            </span>
            <span className="mt-1 block text-xs text-slate-500">
              {TAB_COPY[key].blurb}
            </span>
          </button>
        ))}
      </div>

      {/* Type filter + search toolbar */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-700 mr-2">
            Content type:
          </span>
          {TYPE_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              aria-pressed={typeFilter === filter}
              onClick={() => setTypeFilter(filter)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                typeFilter === filter
                  ? "bg-red-600 text-white shadow-xs"
                  : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
              }`}
            >
              {filter === "all"
                ? "All"
                : filter.charAt(0).toUpperCase() + filter.slice(1)}
            </button>
          ))}
          {(query.trim() !== "" || typeFilter !== "all") && (
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-xl px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-red-600 hover:underline"
            >
              Reset filters
            </button>
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchQueue(tab, typeFilter, query);
          }}
          className="relative"
        >
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            aria-label="Search review queue by title"
            placeholder="Search titles (e.g. 水, Tamil gloss)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`${inputClass} pl-10 pr-24`}
          />
          <button
            type="submit"
            className="absolute right-2 top-1 rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
          >
            Search
          </button>
        </form>
      </div>

      {/* Failure / partial banners */}
      {failure && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{failure.message}</span>
        </div>
      )}
      {partial && !failure && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>
            The {partial.slice} list is unavailable ({partial.message}).
            Showing partial results — the queue is incomplete.
          </span>
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-red-600" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-12 text-center text-slate-500">
          <ClipboardCheck className="mx-auto h-12 w-12 text-slate-300 mb-2" />
          <h3 className="text-base font-bold text-slate-800">{emptyTitle}</h3>
          <p className="text-xs text-slate-400 mt-1">
            {failure
              ? "The queue could not be loaded."
              : "Try a different tab, type filter, or search."}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop / tablet table */}
          <div className="hidden md:block rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3 font-bold">Type</th>
                    <th className="px-4 py-3 font-bold">Title</th>
                    <th className="px-4 py-3 font-bold">Entity</th>
                    <th className="px-4 py-3 font-bold">Status</th>
                    <th className="px-4 py-3 font-bold">Version</th>
                    <th className="px-4 py-3 font-bold">Updated</th>
                    <th className="px-4 py-3 font-bold">
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${typeBadgeClass(item.contentType)}`}
                        >
                          {item.contentType}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/review/${encodeURIComponent(item.id)}`}
                          className="font-japanese text-sm font-bold text-slate-900 hover:text-red-600"
                        >
                          {item.title}
                        </Link>
                        <div className="text-[11px] text-slate-400 font-mono truncate max-w-[220px]">
                          {item.id}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600">
                        {item.entityId ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-700">
                        v{item.currentVersion}
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {formatDate(item.updatedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/review/${encodeURIComponent(item.id)}`}
                          aria-label={`Open review for ${item.title}`}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                        >
                          Open Review
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {items.map((item) => (
              <article
                key={item.id}
                className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${typeBadgeClass(item.contentType)}`}
                  >
                    {item.contentType}
                  </span>
                  <StatusBadge status={item.status} />
                  <span className="text-[11px] font-bold text-slate-500">
                    v{item.currentVersion}
                  </span>
                </div>
                <Link
                  href={`/admin/review/${encodeURIComponent(item.id)}`}
                  className="mt-2 block font-japanese text-base font-bold text-slate-900"
                >
                  {item.title}
                </Link>
                <p className="mt-1 text-[11px] text-slate-500">
                  Updated {formatDate(item.updatedAt)}
                </p>
                <Link
                  href={`/admin/review/${encodeURIComponent(item.id)}`}
                  aria-label={`Open review for ${item.title}`}
                  className="mt-3 block rounded-xl bg-slate-900 px-4 py-2.5 text-center text-xs font-bold text-white"
                >
                  Open Review
                </Link>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
