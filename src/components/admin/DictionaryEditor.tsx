"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import {
  CMS_ACTION_META,
  visibleActions,
} from "@/lib/cms-admin/actions";
import type { CmsActionId } from "@/lib/cms-admin/actions";
import type { ActorCapabilities, AdminCmsItem } from "@/lib/cms-admin/types";
import { CMS_DICTIONARY_API, cmsRequest } from "@/lib/cms-admin/api";
import type { ApiFailure } from "@/lib/cms-admin/api";
import {
  JLPT_LEVEL_OPTIONS,
  buildStagedPayload,
  extractKanji,
  formFromItem,
  validateDictionaryForm,
} from "@/lib/cms-admin/payload";
import type { DictionaryFormState } from "@/lib/cms-admin/payload";
import { StatusBadge } from "./StatusBadge";
import { FieldError } from "./DictionaryList";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-red-500 focus:bg-white focus:outline-none";
const labelClass = "block text-xs font-bold text-slate-700 mb-1";
const readOnlyClass =
  "w-full rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-500";

const toneClass: Record<string, string> = {
  primary:
    "rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-red-500/20 hover:bg-red-700 disabled:opacity-50",
  dark: "rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-slate-800 disabled:opacity-50",
  danger:
    "rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50",
  neutral:
    "rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
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

type ModalState =
  | { kind: "reason"; action: "requestChanges" | "override" }
  | { kind: "schedule" }
  | { kind: "rollback" }
  | null;

export function DictionaryEditor({
  id,
  capabilities,
}: {
  id: string;
  capabilities: ActorCapabilities;
}) {
  const [item, setItem] = useState<AdminCmsItem | null>(null);
  const [form, setForm] = useState<DictionaryFormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<CmsActionId | "load" | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [reason, setReason] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [targetVersion, setTargetVersion] = useState("");
  const [modalError, setModalError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy("load");
    setFailure(null);
    const result = await cmsRequest<AdminCmsItem>(
      `${CMS_DICTIONARY_API}/${encodeURIComponent(id)}`
    );
    if (result.ok) {
      setItem(result.data);
      setForm(formFromItem(result.data));
    } else {
      setFailure(result.failure);
    }
    setBusy(null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    // Mount/id-change data load only; no cascading render (see loading gate).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const set = (patch: Partial<DictionaryFormState>) =>
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));

  /** Rebase the form on freshly loaded item state after a mutation. */
  const applyFreshItem = (fresh: AdminCmsItem, message: string) => {
    setItem(fresh);
    setForm((prev) =>
      prev ? { ...formFromItem(fresh), changeSummary: "" } : prev
    );
    setFailure(null);
    setErrors({});
    setNotice(message);
  };

  const handleSave = async () => {
    if (!item || !form) return;
    const fieldErrors = validateDictionaryForm(form, { isCreate: false });
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;
    setBusy("save");
    setNotice(null);
    const result = await cmsRequest<AdminCmsItem>(
      `${CMS_DICTIONARY_API}/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        body: {
          expectedVersion: item.currentVersion,
          title: form.title.trim(),
          stagedPayload: buildStagedPayload(form),
          editorialNotes:
            form.editorialNotes.trim() === "" ? null : form.editorialNotes.trim(),
          changeSummary:
            form.changeSummary.trim() === "" ? undefined : form.changeSummary.trim(),
        },
      }
    );
    setBusy(null);
    if (result.ok) {
      applyFreshItem(result.data, `Draft saved as v${result.data.currentVersion}.`);
    } else {
      setFailure(result.failure);
    }
  };

  const runAction = async (
    action: CmsActionId,
    extra: Record<string, unknown> = {}
  ) => {
    if (!item) return;
    if (action === "save") {
      await handleSave();
      return;
    }
    const meta = CMS_ACTION_META[action];
    setBusy(action);
    setNotice(null);
    const result = await cmsRequest<AdminCmsItem>(
      `${CMS_DICTIONARY_API}/${encodeURIComponent(id)}${meta.pathSuffix}`,
      {
        method: meta.method,
        body: { expectedVersion: item.currentVersion, ...extra },
      }
    );
    setBusy(null);
    if (result.ok) {
      setModal(null);
      setReason("");
      setScheduledAt("");
      setTargetVersion("");
      setModalError(null);
      applyFreshItem(result.data, `${meta.label} completed.`);
    } else {
      if (modal) {
        setModalError(result.failure.message);
        if (result.failure.kind === "conflict") {
          setFailure(result.failure);
          setModal(null);
        }
      } else {
        setFailure(result.failure);
      }
    }
  };

  const openModalFor = (action: CmsActionId) => {
    setModalError(null);
    if (action === "requestChanges" || action === "override") {
      setModal({ kind: "reason", action });
    } else if (action === "schedule") {
      setModal({ kind: "schedule" });
    } else if (action === "rollback") {
      setModal({ kind: "rollback" });
    } else {
      runAction(action);
    }
  };

  const submitModal = () => {
    if (!modal) return;
    if (modal.kind === "reason") {
      if (reason.trim() === "") {
        setModalError("A reason is required.");
        return;
      }
      runAction(modal.action, { reason: reason.trim() });
    } else if (modal.kind === "schedule") {
      if (scheduledAt === "") {
        setModalError("A scheduled time is required.");
        return;
      }
      const date = new Date(scheduledAt);
      if (Number.isNaN(date.getTime())) {
        setModalError("Enter a valid date and time.");
        return;
      }
      runAction("schedule", { scheduledAt: date.toISOString() });
    } else {
      const target = Number(targetVersion);
      if (!Number.isInteger(target) || target < 1) {
        setModalError("Enter a positive whole version number.");
        return;
      }
      runAction("rollback", { targetVersion: target });
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-red-600" />
      </div>
    );
  }

  if (!item || !form) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-12 text-center text-slate-500">
        <BookOpen className="mx-auto h-12 w-12 text-slate-300 mb-2" />
        <h3 className="text-base font-bold text-slate-800">
          {failure?.kind === "notFound" ? "Item not found" : "Could not load this item"}
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          {failure?.message ?? "Unexpected error."}
        </p>
        <Link
          href="/admin/dictionary"
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" /> Back to list
        </Link>
      </div>
    );
  }

  const actions = visibleActions({
    permissions: capabilities.permissions,
    isAdmin: capabilities.isAdmin,
    status: item.status,
    isAuthor: item.authorId === capabilities.actorId,
  });
  const editable = item.status === "draft" && actions.includes("save");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/dictionary"
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-red-600"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Dictionary Content
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="font-japanese text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
              {item.title}
            </h1>
            <StatusBadge status={item.status} />
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-700 border border-slate-200">
              v{item.currentVersion}
            </span>
          </div>
        </div>
      </div>

      {/* Failure / notice banners */}
      {failure && (
        <div
          className={`rounded-2xl border p-4 text-sm font-medium flex items-start gap-2 ${
            failure.kind === "conflict"
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : failure.kind === "unauthorized"
                ? "border-slate-300 bg-slate-100 text-slate-800"
                : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p>{failure.message}</p>
            {failure.kind === "conflict" && (
              <button
                type="button"
                onClick={load}
                disabled={busy !== null}
                className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Reload latest version
              </button>
            )}
          </div>
        </div>
      )}
      {notice && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Editorial form */}
        <div className="lg:col-span-2 rounded-3xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
            Editorial Content
          </h2>
          <fieldset disabled={!editable} className="space-y-4 disabled:opacity-90">
            <div>
              <label className={labelClass}>Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => set({ title: e.target.value })}
                className={`${inputClass} font-japanese text-sm disabled:bg-slate-100`}
              />
              {errors.title && <FieldError message={errors.title} />}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Headword *</label>
                <input
                  type="text"
                  value={form.headword}
                  onChange={(e) => set({ headword: e.target.value })}
                  className={`${inputClass} font-japanese text-sm disabled:bg-slate-100`}
                />
                {errors.headword && <FieldError message={errors.headword} />}
              </div>
              <div>
                <label className={labelClass}>Reading *</label>
                <input
                  type="text"
                  value={form.reading}
                  onChange={(e) => set({ reading: e.target.value })}
                  className={`${inputClass} font-japanese text-sm disabled:bg-slate-100`}
                />
                {errors.reading && <FieldError message={errors.reading} />}
              </div>
              <div>
                <label className={labelClass}>Romaji</label>
                <input
                  type="text"
                  value={form.romaji}
                  onChange={(e) => set({ romaji: e.target.value })}
                  className={`${inputClass} disabled:bg-slate-100`}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>JLPT Level</label>
                <select
                  value={form.jlptLevel}
                  onChange={(e) => set({ jlptLevel: e.target.value })}
                  className={`${inputClass} font-semibold disabled:bg-slate-100`}
                >
                  {JLPT_LEVEL_OPTIONS.map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {lvl === "" ? "Unspecified" : lvl}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Parts of speech</label>
                <input
                  type="text"
                  value={form.partsOfSpeech}
                  onChange={(e) => set({ partsOfSpeech: e.target.value })}
                  placeholder="noun"
                  className={`${inputClass} disabled:bg-slate-100`}
                />
              </div>
              <div>
                <label className={labelClass}>Tags</label>
                <input
                  type="text"
                  value={form.tags}
                  onChange={(e) => set({ tags: e.target.value })}
                  placeholder="daily-life"
                  className={`${inputClass} disabled:bg-slate-100`}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Senses (one per line: gloss; gloss // note) *</label>
              <textarea
                rows={4}
                value={form.sensesText}
                onChange={(e) => set({ sensesText: e.target.value })}
                className={`${inputClass} font-japanese disabled:bg-slate-100`}
              />
              {errors.sensesText && <FieldError message={errors.sensesText} />}
            </div>
            <div className="flex items-center gap-2">
              <input
                id="cms-is-common"
                type="checkbox"
                checked={form.isCommon}
                onChange={(e) => set({ isCommon: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 accent-red-600"
              />
              <label htmlFor="cms-is-common" className="text-xs font-bold text-slate-700">
                Common word
              </label>
            </div>
            <div>
              <label className={labelClass}>Editorial notes</label>
              <textarea
                rows={2}
                value={form.editorialNotes}
                onChange={(e) => set({ editorialNotes: e.target.value })}
                className={`${inputClass} disabled:bg-slate-100`}
              />
            </div>
            <div>
              <label className={labelClass}>Change summary (for this save)</label>
              <input
                type="text"
                value={form.changeSummary}
                onChange={(e) => set({ changeSummary: e.target.value })}
                placeholder="What changed in this revision?"
                className={`${inputClass} disabled:bg-slate-100`}
              />
            </div>
          </fieldset>

          {/* Workflow actions (UX visibility; the API re-authorizes) */}
          {actions.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
              {actions.map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => (action === "save" ? handleSave() : openModalFor(action))}
                  disabled={busy !== null}
                  className={toneClass[CMS_ACTION_META[action].tone]}
                >
                  {busy === action ? "Working..." : CMS_ACTION_META[action].label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Read-only record metadata */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm space-y-4 h-fit">
          <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
            Record
          </h2>
          <dl className="space-y-3 text-xs">
            <MetaRow label="CMS item ID" value={item.id} mono />
            <MetaRow label="Content type" value={item.contentType} mono />
            <div>
              <dt className={labelClass}>Canonical reference</dt>
              {item.entityId ? (
                <Link
                  href={`/dictionary/${encodeURIComponent(item.entityId)}`}
                  className="text-xs font-semibold text-red-600 hover:underline font-mono break-all"
                >
                  {item.entityId}
                </Link>
              ) : (
                <dd className="text-xs text-slate-500">CMS-originated (no canonical entity)</dd>
              )}
            </div>
            <MetaRow label="Provenance" value={item.provenanceType} mono />
            <MetaRow label="Source ref" value={item.sourceRef} mono />
            {item.originalSourceRef && (
              <MetaRow label="Original source" value={item.originalSourceRef} mono />
            )}
            <MetaRow label="Author" value={item.authorId} mono />
            <MetaRow label="Reviewer" value={item.reviewerId ?? "—"} mono />
            <MetaRow label="Version" value={`v${item.currentVersion}`} />
            <MetaRow
              label="Kanji in headword"
              value={extractKanji(form.headword).join(" ") || "—"}
            />
            <MetaRow label="Created" value={formatDate(item.createdAt)} />
            <MetaRow label="Updated" value={formatDate(item.updatedAt)} />
            <MetaRow label="Scheduled" value={formatDate(item.scheduledAt)} />
            <MetaRow label="Published" value={formatDate(item.publishedAt)} />
          </dl>
        </div>
      </div>

      {/* Action modal (reason / schedule / rollback) */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {modal.kind === "reason"
                  ? CMS_ACTION_META[modal.action].label
                  : modal.kind === "schedule"
                    ? "Schedule Publication"
                    : "Rollback to Version"}
              </h3>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {modalError && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-800">
                {modalError}
              </div>
            )}
            {modal.kind === "reason" && (
              <div>
                <label className={labelClass}>Reason *</label>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={
                    modal.action === "override"
                      ? "Why is the emergency override justified?"
                      : "What must change before approval?"
                  }
                  className={inputClass}
                />
              </div>
            )}
            {modal.kind === "schedule" && (
              <div>
                <label className={labelClass}>Publish at (must be in the future) *</label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className={inputClass}
                />
              </div>
            )}
            {modal.kind === "rollback" && (
              <div>
                <label className={labelClass}>
                  Target version (current is v{item.currentVersion}) *
                </label>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, item.currentVersion - 1)}
                  value={targetVersion}
                  onChange={(e) => setTargetVersion(e.target.value)}
                  placeholder={`1 – ${Math.max(1, item.currentVersion - 1)}`}
                  className={inputClass}
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  The snapshot is copied into a new version; history is preserved.
                </p>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitModal}
                disabled={busy !== null}
                className="rounded-xl bg-red-600 px-5 py-2 text-xs font-bold text-white shadow-md shadow-red-500/20 disabled:opacity-50"
              >
                {busy !== null && busy !== "load" ? "Working..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetaRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className={labelClass}>{label}</dt>
      <dd className={mono ? readOnlyClass : "text-xs font-semibold text-slate-700 break-all"}>
        {value}
      </dd>
    </div>
  );
}
