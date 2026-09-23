"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { CMS_ACTION_META } from "@/lib/cms-admin/actions";
import type { CmsActionId } from "@/lib/cms-admin/actions";
import {
  CMS_DICTIONARY_API,
  CMS_TRANSLATIONS_API,
  cmsRequest,
} from "@/lib/cms-admin/api";
import type { ApiFailure } from "@/lib/cms-admin/api";
import type {
  ActorCapabilities,
  AdminCmsItem,
} from "@/lib/cms-admin/types";
import {
  resolveActionTarget,
  reviewDetailActions,
  shouldTryOtherSlice,
} from "@/lib/cms-review/detail";
import type { KnownReviewSlice } from "@/lib/cms-review/detail";
import { parseTranslationProposal } from "@/lib/cms-review/translation";
import type {
  ReviewAuditEvent,
  ReviewVersion,
} from "@/lib/cms-review/types";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { AuditTimeline } from "./AuditTimeline";
import { VersionDiff } from "./VersionDiff";
import {
  DictionaryReviewPreview,
  GenericReviewPreview,
  TranslationReviewPreview,
} from "./previews";

const labelClass = "block text-xs font-bold text-slate-700 mb-1";
const inputClass =
  "w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-red-500 focus:bg-white focus:outline-none";
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

const SUCCESS_MESSAGE: Record<CmsActionId, string> = {
  save: "Draft saved.",
  submit: "Submitted for review.",
  requestChanges: "Changes requested.",
  approve: "Content approved.",
  override: "Content approved.",
  schedule: "Content scheduled.",
  publish: "Content published.",
  verify: "Translation verified.",
  archive: "Content archived.",
  rollback: "Rollback completed.",
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
  | { kind: "verify" }
  | null;

export function ReviewDetail({
  id,
  capabilities,
}: {
  id: string;
  capabilities: ActorCapabilities;
}) {
  const [item, setItem] = useState<AdminCmsItem | null>(null);
  const [slice, setSlice] = useState<KnownReviewSlice | null>(null);
  const [versions, setVersions] = useState<ReviewVersion[]>([]);
  const [audit, setAudit] = useState<ReviewAuditEvent[]>([]);
  const [beforeV, setBeforeV] = useState<number | null>(null);
  const [afterV, setAfterV] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<CmsActionId | "load" | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [reason, setReason] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [targetVersion, setTargetVersion] = useState("");
  const [modalError, setModalError] = useState<string | null>(null);

  const busyRef = useRef(false);

  useEffect(() => {
    busyRef.current = busy !== null;
  }, [busy]);

  const applyVersions = (list: ReviewVersion[]) => {
    const ordered = [...list].sort(
      (a, b) => b.versionNumber - a.versionNumber
    );
    setVersions(ordered);
    setAfterV(ordered[0]?.versionNumber ?? null);
    setBeforeV(ordered[1]?.versionNumber ?? null);
  };

  const load = useCallback(async () => {
    setBusy("load");
    setFailure(null);
    setHistoryError(null);
    setAuditError(null);
    // Slice probing: dictionary first, then translations. Only a 404 may
    // fall through — 401/403/409/500 surface immediately.
    const dictionaryResult = await cmsRequest<AdminCmsItem>(
      `${CMS_DICTIONARY_API}/${encodeURIComponent(id)}`
    );
    let owned: AdminCmsItem | null = null;
    let ownedSlice: KnownReviewSlice | null = null;
    if (dictionaryResult.ok) {
      owned = dictionaryResult.data;
      ownedSlice = "dictionary";
    } else if (shouldTryOtherSlice(dictionaryResult.failure.kind)) {
      const translationResult = await cmsRequest<AdminCmsItem>(
        `${CMS_TRANSLATIONS_API}/${encodeURIComponent(id)}`
      );
      if (translationResult.ok) {
        owned = translationResult.data;
        ownedSlice = "translation";
      } else {
        setFailure(translationResult.failure);
      }
    } else {
      setFailure(dictionaryResult.failure);
    }
    if (!owned || !ownedSlice) {
      setBusy(null);
      setLoading(false);
      return;
    }
    setItem(owned);
    setSlice(ownedSlice);
    const base =
      ownedSlice === "dictionary" ? CMS_DICTIONARY_API : CMS_TRANSLATIONS_API;
    const [versionsResult, auditResult] = await Promise.all([
      cmsRequest<{ versions: ReviewVersion[] }>(
        `${base}/${encodeURIComponent(id)}/versions`
      ),
      cmsRequest<{ audit: ReviewAuditEvent[] }>(
        `${base}/${encodeURIComponent(id)}/audit`
      ),
    ]);
    if (versionsResult.ok) {
      applyVersions(versionsResult.data.versions ?? []);
    } else {
      setVersions([]);
      setHistoryError(versionsResult.failure.message);
    }
    if (auditResult.ok) {
      setAudit(auditResult.data.audit ?? []);
    } else {
      setAudit([]);
      setAuditError(auditResult.failure.message);
    }
    setBusy(null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    // Mount/id-change data load only; no cascading render (see loading gate).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    // Review detail goes stale fast (shared queues): refetch on refocus
    // when idle. No polling, no realtime.
    const onFocus = () => {
      if (!busyRef.current) load();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const refreshAfterAction = async (fresh: AdminCmsItem, message: string) => {
    setItem(fresh);
    setSlice(fresh.contentType === "translation" ? "translation" : "dictionary");
    setFailure(null);
    setNotice(message);
    const base =
      fresh.contentType === "translation"
        ? CMS_TRANSLATIONS_API
        : CMS_DICTIONARY_API;
    const [versionsResult, auditResult] = await Promise.all([
      cmsRequest<{ versions: ReviewVersion[] }>(
        `${base}/${encodeURIComponent(id)}/versions`
      ),
      cmsRequest<{ audit: ReviewAuditEvent[] }>(
        `${base}/${encodeURIComponent(id)}/audit`
      ),
    ]);
    if (versionsResult.ok) {
      setHistoryError(null);
      applyVersions(versionsResult.data.versions ?? []);
    } else {
      setHistoryError(versionsResult.failure.message);
    }
    if (auditResult.ok) {
      setAuditError(null);
      setAudit(auditResult.data.audit ?? []);
    } else {
      setAuditError(auditResult.failure.message);
    }
  };

  const runAction = async (
    action: CmsActionId,
    extra: Record<string, unknown> = {}
  ) => {
    if (!item) return;
    const target = resolveActionTarget(action, item.contentType, id);
    if (!target) {
      setFailure({
        kind: "validation",
        status: 0,
        code: "ACTION_UNAVAILABLE",
        message: "This action is not available for this item.",
      });
      return;
    }
    setBusy(action);
    setNotice(null);
    const result = await cmsRequest<AdminCmsItem>(target.url, {
      method: target.method,
      body: { expectedVersion: item.currentVersion, ...extra },
    });
    setBusy(null);
    if (result.ok) {
      setModal(null);
      setReason("");
      setScheduledAt("");
      setTargetVersion("");
      setModalError(null);
      await refreshAfterAction(result.data, SUCCESS_MESSAGE[action]);
    } else if (modal) {
      setModalError(result.failure.message);
      if (result.failure.kind === "conflict") {
        setFailure(result.failure);
        setModal(null);
      }
    } else {
      setFailure(result.failure);
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
    } else if (action === "verify") {
      setModal({ kind: "verify" });
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
    } else if (modal.kind === "rollback") {
      const target = Number(targetVersion);
      if (!Number.isInteger(target) || target < 1) {
        setModalError("Enter a positive whole version number.");
        return;
      }
      runAction("rollback", { targetVersion: target });
    } else {
      runAction("verify", {});
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-red-600" />
      </div>
    );
  }

  if (!item || !slice) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-12 text-center text-slate-500">
        <BookOpen className="mx-auto h-12 w-12 text-slate-300 mb-2" />
        <h3 className="text-base font-bold text-slate-800">
          {failure?.kind === "notFound" ? "Content not found" : "Could not load this item"}
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          {failure?.message ?? "Unexpected error."}
        </p>
        <Link
          href="/admin/review"
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Review
        </Link>
      </div>
    );
  }

  const actions = reviewDetailActions({
    permissions: capabilities.permissions,
    isAdmin: capabilities.isAdmin,
    status: item.status,
    isAuthor: item.authorId === capabilities.actorId,
    contentType: item.contentType,
  }).filter(
    (action) => resolveActionTarget(action, item.contentType, id) !== null
  );

  const beforeVersion = versions.find((v) => v.versionNumber === beforeV) ?? null;
  const afterVersion = versions.find((v) => v.versionNumber === afterV) ?? null;
  const verifyProposal =
    modal?.kind === "verify" ? parseTranslationProposal(item.stagedPayload) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/review"
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-red-600"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Review
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="font-japanese text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
              {item.title}
            </h1>
            <StatusBadge status={item.status} />
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-700 border border-slate-200">
              v{item.currentVersion}
            </span>
            <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-bold text-sky-800 border border-sky-200">
              {item.contentType}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Updated {formatDate(item.updatedAt)}
            {item.entityId ? ` · Entity ${item.entityId}` : ""}
          </p>
        </div>
        {item.contentType === "dictionary" && (
          <Link
            href={`/admin/dictionary/${encodeURIComponent(id)}`}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            Open Dictionary Editor
          </Link>
        )}
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
        <div className="lg:col-span-2 space-y-6">
          {/* Content preview */}
          <section className="rounded-3xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm">
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider mb-4">
              Content Preview
            </h2>
            {item.contentType === "dictionary" ? (
              <DictionaryReviewPreview item={item} />
            ) : item.contentType === "translation" ? (
              <TranslationReviewPreview item={item} />
            ) : (
              <GenericReviewPreview item={item} />
            )}
          </section>

          {/* Action bar (decision surface; the API re-authorizes) */}
          {actions.length > 0 && (
            <section
              aria-label="Review actions"
              className="rounded-3xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm"
            >
              <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider mb-3">
                Actions
              </h2>
              <div className="flex flex-wrap gap-2">
                {actions.map((action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => openModalFor(action)}
                    disabled={busy !== null}
                    className={toneClass[CMS_ACTION_META[action].tone]}
                  >
                    {busy === action ? "Working..." : CMS_ACTION_META[action].label}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Version history + comparison */}
          <section className="rounded-3xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
              Version History
            </h2>
            {historyError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-800">
                Version history failed to load: {historyError}
              </div>
            ) : versions.length === 0 ? (
              <p className="text-sm text-slate-500">No versions recorded.</p>
            ) : (
              <>
                <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-100">
                  {versions.map((version) => (
                    <li
                      key={version.id}
                      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 text-xs"
                    >
                      <span className="font-extrabold text-slate-900">
                        v{version.versionNumber}
                      </span>
                      <span className="font-semibold text-slate-600">
                        {version.statusAtSnapshot}
                      </span>
                      <span className="text-slate-500">
                        {formatDate(version.createdAt)}
                      </span>
                      <span className="font-mono text-slate-500">
                        {version.createdById}
                      </span>
                      {version.changeSummary && (
                        <span className="w-full text-slate-600 italic">
                          {version.changeSummary}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {versions.length < 2 || beforeVersion === null || afterVersion === null ? (
                  <p className="text-sm text-slate-500">
                    No previous version available.
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass} htmlFor="review-diff-before">
                          Compare from
                        </label>
                        <select
                          id="review-diff-before"
                          value={beforeV ?? ""}
                          onChange={(e) => setBeforeV(Number(e.target.value))}
                          className={`${inputClass} font-semibold`}
                        >
                          {versions.map((version) => (
                            <option
                              key={version.id}
                              value={version.versionNumber}
                            >
                              v{version.versionNumber} — {version.statusAtSnapshot}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass} htmlFor="review-diff-after">
                          Compare to
                        </label>
                        <select
                          id="review-diff-after"
                          value={afterV ?? ""}
                          onChange={(e) => setAfterV(Number(e.target.value))}
                          className={`${inputClass} font-semibold`}
                        >
                          {versions.map((version) => (
                            <option
                              key={version.id}
                              value={version.versionNumber}
                            >
                              v{version.versionNumber} — {version.statusAtSnapshot}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <VersionDiff
                      beforeLabel={`v${beforeVersion.versionNumber}`}
                      afterLabel={`v${afterVersion.versionNumber}`}
                      before={beforeVersion.snapshotPayload}
                      after={afterVersion.snapshotPayload}
                    />
                  </>
                )}
              </>
            )}
          </section>

          {/* Audit timeline */}
          <section className="rounded-3xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm">
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider mb-4">
              Audit Timeline
            </h2>
            {auditError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-800">
                Audit trail failed to load: {auditError}
              </div>
            ) : (
              <AuditTimeline events={audit} />
            )}
          </section>
        </div>

        {/* Metadata */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm space-y-4 h-fit">
          <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
            Metadata
          </h2>
          <dl className="space-y-3 text-xs">
            <MetaRow label="Content type" value={item.contentType} mono />
            <MetaRow label="Entity ID" value={item.entityId ?? "Not available"} mono />
            <MetaRow label="Current version" value={`v${item.currentVersion}`} />
            <MetaRow label="Status" value={item.status} />
            <MetaRow label="Author" value={item.authorId} mono />
            <MetaRow
              label="Reviewer"
              value={item.reviewerId ?? "Not assigned"}
              mono={item.reviewerId !== null}
            />
            <MetaRow label="Provenance" value={item.provenanceType} mono />
            <MetaRow label="Source reference" value={item.sourceRef} mono />
            {item.originalSourceRef && (
              <MetaRow label="Original source" value={item.originalSourceRef} mono />
            )}
            <MetaRow label="Created" value={formatDate(item.createdAt)} />
            <MetaRow label="Updated" value={formatDate(item.updatedAt)} />
            <MetaRow label="Scheduled" value={formatDate(item.scheduledAt)} />
            <MetaRow label="Published" value={formatDate(item.publishedAt)} />
            <div>
              <dt className={labelClass}>Editorial notes</dt>
              <dd className="text-xs text-slate-700 whitespace-pre-wrap">
                {item.editorialNotes ?? "—"}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Action modal (reason / schedule / rollback / verify) */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {modal.kind === "reason"
                  ? CMS_ACTION_META[modal.action].label
                  : modal.kind === "schedule"
                    ? "Schedule Publication"
                    : modal.kind === "rollback"
                      ? "Rollback to Version"
                      : "Verify Translation"}
              </h3>
              <button
                type="button"
                aria-label="Close dialog"
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
                <label className={labelClass} htmlFor="review-modal-reason">
                  Reason *
                </label>
                <textarea
                  id="review-modal-reason"
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
                <label className={labelClass} htmlFor="review-modal-schedule">
                  Publish at (must be in the future) *
                </label>
                <input
                  id="review-modal-schedule"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className={inputClass}
                />
              </div>
            )}
            {modal.kind === "rollback" && (
              <div>
                <label className={labelClass} htmlFor="review-modal-rollback">
                  Target version (current is v{item.currentVersion}) *
                </label>
                <input
                  id="review-modal-rollback"
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
            {modal.kind === "verify" && (
              <div className="space-y-3">
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3">
                  <p className="text-xs font-bold text-blue-900">
                    Translation being verified
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 whitespace-pre-wrap">
                    {verifyProposal?.translatedText ?? "—"}
                  </p>
                  {verifyProposal && (
                    <p className="mt-1 text-[11px] font-mono text-slate-600">
                      {verifyProposal.entityType} · {verifyProposal.language}
                      {item.entityId ? ` · ${item.entityId}` : ""}
                    </p>
                  )}
                </div>
                <p className="text-xs font-semibold text-slate-700">
                  This will promote the approved translation into
                  entity_translations.
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
      <dd
        className={
          mono
            ? readOnlyClass
            : "text-xs font-semibold text-slate-700 break-all"
        }
      >
        {value}
      </dd>
    </div>
  );
}
