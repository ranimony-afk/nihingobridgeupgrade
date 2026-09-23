"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-react";
import { CMS_STATUS_FILTERS } from "@/lib/cms-admin/actions";
import type { CmsStatus } from "@/lib/cms-admin/types";
import type { ActorCapabilities, AdminCmsItem } from "@/lib/cms-admin/types";
import { CMS_DICTIONARY_API, cmsRequest } from "@/lib/cms-admin/api";
import type { ApiFailure } from "@/lib/cms-admin/api";
import {
  EMPTY_DICTIONARY_FORM,
  JLPT_LEVEL_OPTIONS,
  buildStagedPayload,
  validateDictionaryForm,
} from "@/lib/cms-admin/payload";
import type { DictionaryFormState } from "@/lib/cms-admin/payload";
import { StatusBadge } from "./StatusBadge";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-red-500 focus:bg-white focus:outline-none";
const labelClass = "block text-xs font-bold text-slate-700 mb-1";

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

export function DictionaryList({
  capabilities,
}: {
  capabilities: ActorCapabilities;
}) {
  const router = useRouter();
  const [items, setItems] = useState<AdminCmsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [status, setStatus] = useState<CmsStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const fetchItems = useCallback(
    async (nextStatus: CmsStatus | "all", nextQuery: string) => {
      setLoading(true);
      setFailure(null);
      const params = new URLSearchParams();
      if (nextStatus !== "all") params.set("status", nextStatus);
      if (nextQuery.trim()) params.set("q", nextQuery.trim());
      params.set("limit", "50");
      const result = await cmsRequest<{ items: AdminCmsItem[] }>(
        `${CMS_DICTIONARY_API}?${params.toString()}`
      );
      if (result.ok) {
        setItems(result.data.items ?? []);
      } else {
        setItems([]);
        setFailure(result.failure);
      }
      setLoading(false);
    },
    []
  );

  useEffect(() => {
    fetchItems(status, query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const canCreate = capabilities.permissions.includes("cms.create");

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
            Dictionary Content
          </h1>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800 shadow-md transition-colors"
          >
            <Plus className="h-4 w-4" /> New Draft
          </button>
        )}
      </div>

      {/* Filter + search toolbar (search runs through the API) */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-slate-100">
          <span className="text-xs font-bold text-slate-700 mr-2">
            Status:
          </span>
          {CMS_STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                status === s
                  ? "bg-red-600 text-white shadow-xs"
                  : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
              }`}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchItems(status, query);
          }}
          className="relative"
        >
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search titles (e.g. 水, mizu, water)..."
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

      {/* Failure banner */}
      {failure && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{failure.message}</span>
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-red-600" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-12 text-center text-slate-500">
          <BookOpen className="mx-auto h-12 w-12 text-slate-300 mb-2" />
          <h3 className="text-base font-bold text-slate-800">
            No dictionary items
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            {failure
              ? "The list could not be loaded."
              : "Try adjusting the status filter or search, or create a draft."}
          </p>
        </div>
      ) : (
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3 font-bold">Word</th>
                  <th className="px-4 py-3 font-bold">Entity ID</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold">Version</th>
                  <th className="px-4 py-3 font-bold">Updated</th>
                  <th className="px-4 py-3 font-bold">Author</th>
                  <th className="px-4 py-3 font-bold">Reviewer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/dictionary/${encodeURIComponent(item.id)}`}
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
                    <td className="px-4 py-3 font-mono text-slate-600 truncate max-w-[160px]">
                      {item.authorId}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600 truncate max-w-[160px]">
                      {item.reviewerId ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreate && (
        <NewDraftModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => router.push(`/admin/dictionary/${encodeURIComponent(id)}`)}
        />
      )}
    </div>
  );
}

function NewDraftModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [form, setForm] = useState<DictionaryFormState>(EMPTY_DICTIONARY_FORM);
  const [sourceRef, setSourceRef] = useState("first-party:editorial:v1");
  const [provenanceType, setProvenanceType] = useState("editorial_curated");
  const [entityId, setEntityId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<DictionaryFormState>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fieldErrors = validateDictionaryForm(form, {
      isCreate: true,
      sourceRef,
      provenanceType,
    });
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;
    setSaving(true);
    setServerError(null);
    const result = await cmsRequest<AdminCmsItem>(CMS_DICTIONARY_API, {
      method: "POST",
      body: {
        title: form.title.trim(),
        stagedPayload: buildStagedPayload(form),
        sourceRef: sourceRef.trim(),
        provenanceType,
        entityId: entityId.trim() === "" ? null : entityId.trim(),
        editorialNotes:
          form.editorialNotes.trim() === "" ? null : form.editorialNotes.trim(),
        changeSummary:
          form.changeSummary.trim() === "" ? undefined : form.changeSummary.trim(),
      },
    });
    setSaving(false);
    if (result.ok) {
      onCreated(result.data.id);
    } else {
      setServerError(result.failure.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 md:p-8 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">New Dictionary Draft</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {serverError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-800">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className={labelClass}>Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => set({ title: e.target.value })}
                placeholder="e.g. water"
                className={`${inputClass} font-japanese text-sm`}
              />
              {errors.title && <FieldError message={errors.title} />}
            </div>
            <div>
              <label className={labelClass}>Headword *</label>
              <input
                type="text"
                value={form.headword}
                onChange={(e) => set({ headword: e.target.value })}
                placeholder="水"
                className={`${inputClass} font-japanese text-sm`}
              />
              {errors.headword && <FieldError message={errors.headword} />}
            </div>
            <div>
              <label className={labelClass}>Reading *</label>
              <input
                type="text"
                value={form.reading}
                onChange={(e) => set({ reading: e.target.value })}
                placeholder="みず"
                className={`${inputClass} font-japanese text-sm`}
              />
              {errors.reading && <FieldError message={errors.reading} />}
            </div>
            <div>
              <label className={labelClass}>Romaji</label>
              <input
                type="text"
                value={form.romaji}
                onChange={(e) => set({ romaji: e.target.value })}
                placeholder="mizu"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>JLPT Level</label>
              <select
                value={form.jlptLevel}
                onChange={(e) => set({ jlptLevel: e.target.value })}
                className={`${inputClass} font-semibold`}
              >
                {JLPT_LEVEL_OPTIONS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl === "" ? "Unspecified" : lvl}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Senses (one per line: gloss; gloss // note) *</label>
              <textarea
                rows={3}
                value={form.sensesText}
                onChange={(e) => set({ sensesText: e.target.value })}
                placeholder={"water // noun\ncold water; drinking water"}
                className={`${inputClass} font-japanese`}
              />
              {errors.sensesText && <FieldError message={errors.sensesText} />}
            </div>
            <div>
              <label className={labelClass}>Parts of speech (comma-separated)</label>
              <input
                type="text"
                value={form.partsOfSpeech}
                onChange={(e) => set({ partsOfSpeech: e.target.value })}
                placeholder="noun"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Tags (comma-separated)</label>
              <input
                type="text"
                value={form.tags}
                onChange={(e) => set({ tags: e.target.value })}
                placeholder="daily-life"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Canonical entity ID (optional)</label>
              <input
                type="text"
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                placeholder="dictionary_entries.id or blank"
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className={labelClass}>Provenance *</label>
              <select
                value={provenanceType}
                onChange={(e) => setProvenanceType(e.target.value)}
                className={`${inputClass} font-semibold`}
              >
                <option value="editorial_curated">editorial_curated</option>
                <option value="canonical_override">canonical_override</option>
                <option value="community_verified">community_verified</option>
              </select>
              {errors.provenanceType && <FieldError message={errors.provenanceType} />}
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Source reference *</label>
              <input
                type="text"
                value={sourceRef}
                onChange={(e) => setSourceRef(e.target.value)}
                className={`${inputClass} font-mono`}
              />
              {errors.sourceRef && <FieldError message={errors.sourceRef} />}
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Editorial notes</label>
              <textarea
                rows={2}
                value={form.editorialNotes}
                onChange={(e) => set({ editorialNotes: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-red-600 px-5 py-2 text-xs font-bold text-white shadow-md shadow-red-500/20 disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create Draft"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function FieldError({ message }: { message: string }) {
  return <p className="mt-1 text-[11px] font-semibold text-red-600">{message}</p>;
}
