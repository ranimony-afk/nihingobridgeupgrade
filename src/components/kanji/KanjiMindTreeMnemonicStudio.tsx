"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CMS_STATUSES, type CmsStatus } from "@/services/cms/types";
import {
  createEditorialRewrite,
  exportMnemonicRecords,
  statusCounts,
  validateMnemonicRecords,
  type MindTreeMnemonicRecord,
} from "@/lib/kanji/mindtreeMnemonicContent";
import type { MindTreeEditorialContext, MindTreeEditorialVisualPreview } from "@/lib/kanji/kanjiMindtreeCatalog";
import { assessMnemonicQuality, type MnemonicQualityFinding } from "@/lib/kanji/mindtreeMnemonicQuality";
import { buildMnemonicExportPackage, verifyMnemonicExportPackage, type MnemonicExportValidationRow, type MindTreeMnemonicExportKind } from "@/lib/kanji/mindtreeMnemonicExport";
import { cancelLocalMnemonicRevision, compareMnemonicRevisions, sameMnemonicRevision, saveLocalMnemonicRevision } from "@/lib/kanji/mindtreeMnemonicRevisions";
import { canRecordLocalReviewDecision, canonicalJson, createLocalReviewEvidence, digestMnemonicRevision, mnemonicRevisionPayload, type MindTreeEditorialReviewEvidence, type MindTreeReviewOutcome } from "@/lib/kanji/mindtreeEditorialEvidence";
import { MINDTREE_M6_PILOT_CASES } from "@/lib/kanji/mindtreeEditorialPilot";
import { evaluateMindTreeReadiness, type MindTreeReadinessResult } from "@/lib/kanji/mindtreeReleaseReadiness";

type StudioFilter = "all" | CmsStatus | "missing";

function originLabel(origin: MindTreeMnemonicRecord["origin"]) {
  return origin === "ai_candidate" ? "AI candidate · unpublished" : origin === "first_party" ? "First-party seed · draft" : "Editorial rewrite";
}

const REVIEW_CHECKLIST = [
  "The memory cue is clear for its intended learner.",
  "Every factual claim has evidence separate from the mnemonic association.",
  "Visual component references match literal KanjiVG annotations.",
  "Reading hooks match supported KANJIDIC2 On/Kun readings.",
] as const;

export function KanjiMindTreeMnemonicStudio({
  contexts,
  initialRecords,
  vocabularyCoverage,
}: {
  contexts: MindTreeEditorialContext[];
  initialRecords: MindTreeMnemonicRecord[];
  vocabularyCoverage: number;
}) {
  const [records, setRecords] = useState(initialRecords);
  const [savedRecords, setSavedRecords] = useState(initialRecords);
  const [revisionHistory, setRevisionHistory] = useState<Record<string, MindTreeMnemonicRecord[]>>(() => Object.fromEntries(initialRecords.map((record) => [record.id, [record]])));
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [savedReviewNotes, setSavedReviewNotes] = useState<Record<string, string>>({});
  const [reviewChecklist, setReviewChecklist] = useState<Record<string, boolean[]>>({});
  const [reviewEvidence, setReviewEvidence] = useState<MindTreeEditorialReviewEvidence[]>([]);
  const [reviewerAttribution, setReviewerAttribution] = useState("");
  const [reviewOutcome, setReviewOutcome] = useState<MindTreeReviewOutcome | "">("");
  const [acknowledgedReviewDigest, setAcknowledgedReviewDigest] = useState("");
  const [reviewInProgress, setReviewInProgress] = useState(false);
  const [reviewIssueReferences, setReviewIssueReferences] = useState("");
  const [reviewProvenanceConcerns, setReviewProvenanceConcerns] = useState("");
  const [currentContentDigest, setCurrentContentDigest] = useState("");
  const [readinessResults, setReadinessResults] = useState<MindTreeReadinessResult[]>([]);
  const [preview, setPreview] = useState<MindTreeEditorialVisualPreview | null>(null);
  const [previewError, setPreviewError] = useState<{ character: string; message: string } | null>(null);
  const [activeOccurrenceId, setActiveOccurrenceId] = useState<string | null>(null);
  const [exportError, setExportError] = useState("");
  const [selectedCharacter, setSelectedCharacter] = useState(initialRecords[0]?.character ?? contexts[0]?.character ?? "");
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(initialRecords[0]?.id ?? null);
  const [filter, setFilter] = useState<StudioFilter>("all");
  const [query, setQuery] = useState("");
  const [workflowMessage, setWorkflowMessage] = useState("");
  const workflowStatusRef = useRef<HTMLParagraphElement>(null);
  const focusWorkflowStatusOnNextMessage = useRef(false);
  const [completedActionSequence, setCompletedActionSequence] = useState(0);
  useEffect(() => {
    if (focusWorkflowStatusOnNextMessage.current && workflowMessage) {
      workflowStatusRef.current?.focus();
      focusWorkflowStatusOnNextMessage.current = false;
    }
  }, [workflowMessage, completedActionSequence]);
  function announceCompletedAction(message: string) {
    focusWorkflowStatusOnNextMessage.current = true;
    setWorkflowMessage(message);
    setCompletedActionSequence((current) => current + 1);
  }
  useEffect(() => {
    if (!selectedCharacter) return;
    const controller = new AbortController();
    fetch(`/mindtree/studio/preview/${encodeURIComponent(selectedCharacter)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error(`Visual evidence preview unavailable (${response.status}).`);
      return response.json() as Promise<MindTreeEditorialVisualPreview>;
    }).then((value) => {
      setPreview(value);
      setActiveOccurrenceId(value.annotations[0]?.occurrenceId ?? null);
    }).catch((error: unknown) => {
      if (error instanceof Error && error.name !== "AbortError") setPreviewError({ character: selectedCharacter, message: error.message });
    });
    return () => controller.abort();
  }, [selectedCharacter]);
  const counts = statusCounts(records);
  const contextByCharacter = useMemo(() => new Map(contexts.map((item) => [item.character, item])), [contexts]);
  const selectedRecord = records.find((record) => record.id === selectedRecordId) ?? null;
  const selectedContext = contextByCharacter.get(selectedRecord?.character ?? selectedCharacter) ?? null;
  const selectedCharacterRecords = records.filter((record) => record.character === selectedCharacter);
  useEffect(() => {
    let active = true;
    setCurrentContentDigest("");
    if (!selectedRecord) return () => { active = false; };
    void digestMnemonicRevision(selectedRecord).then((digest) => { if (active) setCurrentContentDigest(digest); });
    return () => { active = false; };
  }, [selectedRecord]);
  const savedSelectedRecord = selectedRecord ? savedRecords.find((record) => record.id === selectedRecord.id) ?? null : null;
  const selectedRevisionHistory = selectedRecord ? revisionHistory[selectedRecord.id] ?? [] : [];
  const revisionDiff = selectedRecord ? compareMnemonicRevisions(savedSelectedRecord, selectedRecord) : [];
  const isRecordDirty = selectedRecord ? !sameMnemonicRevision(savedSelectedRecord, selectedRecord) : false;
  const isDirty = selectedRecord ? isRecordDirty
    || (reviewNotes[selectedRecord.id] ?? "") !== (savedReviewNotes[selectedRecord.id] ?? "") : false;
  const previewLoading = Boolean(selectedCharacter && preview?.character !== selectedCharacter && previewError?.character !== selectedCharacter);
  const selectedQualityContext = selectedContext ? {
    character: selectedContext.character,
    meaning: selectedContext.meaning,
    dictionaryMeanings: selectedContext.dictionaryMeanings,
    readingsOn: selectedContext.readingsOn,
    readingsKun: selectedContext.readingsKun,
    annotationLabels: selectedContext.annotations.map((annotation) => annotation.label),
    hasVisualSource: Boolean(selectedContext.visualSourceSha256),
    vocabularyCount: selectedContext.firstPartyVocabularyCount,
  } : null;
  const selectedAssessment = selectedQualityContext ? assessMnemonicQuality(selectedRecord, selectedQualityContext) : null;
  const publishedCharacters = new Set(records.filter((record) => record.editorialStatus === "published" && record.origin !== "ai_candidate").map((record) => record.character));
  const representedCharacters = new Set(records.map((record) => record.character));
  const reviewPendingCharacters = new Set(records.filter((record) => record.editorialStatus !== "published" && record.editorialStatus !== "archived").map((record) => record.character));
  const missingCharacters = contexts.filter((context) => !representedCharacters.has(context.character));
  const completeness = {
    visual: contexts.filter((context) => Boolean(context.visualSourceSha256)).length,
    dictionary: contexts.filter((context) => Boolean(context.meaning && context.dictionaryMeanings.length)).length,
    firstPartyExamples: vocabularyCoverage,
    records: representedCharacters.size,
    reviewPending: [...reviewPendingCharacters].filter((character) => !publishedCharacters.has(character)).length,
    published: publishedCharacters.size,
    missing: missingCharacters.length,
  };

  const queueRows: Array<{ context: MindTreeEditorialContext; record: MindTreeMnemonicRecord | null }> = [];
  for (const context of contexts) {
    const matching = records.filter((record) => record.character === context.character);
    if (!matching.length) queueRows.push({ context, record: null });
    else for (const record of matching) queueRows.push({ context, record });
  }
  const listItems = queueRows.filter(({ context, record }) => {
    const needle = query.trim().toLocaleLowerCase();
    const matchesQuery = !needle || [context.character, context.meaning, ...(record ? [record.keyword, record.story] : [])].join(" ").toLocaleLowerCase().includes(needle);
    const matchesFilter = filter === "all" || (filter === "missing" ? record === null : record?.editorialStatus === filter);
    return matchesQuery && matchesFilter;
  });
  const supportedCharacterSet = useMemo(() => new Set(contexts.map((item) => item.character)), [contexts]);
  const visualAnnotationMap = useMemo(() => new Map(contexts.map((item) => [item.character, new Set(item.annotations.map((annotation) => annotation.label))])), [contexts]);
  const selectedValidation = selectedRecord ? validateMnemonicRecords([selectedRecord], supportedCharacterSet, visualAnnotationMap) : { valid: false, issues: ["No editorial record selected."] };
  const exportValidation = validateMnemonicRecords(records, supportedCharacterSet, visualAnnotationMap);
  const qualityRows: MnemonicExportValidationRow[] = records.flatMap((record) => {
    const context = contextByCharacter.get(record.character);
    if (!context) return [];
    const assessment = assessMnemonicQuality(record, {
      character: context.character,
      meaning: context.meaning,
      dictionaryMeanings: context.dictionaryMeanings,
      readingsOn: context.readingsOn,
      readingsKun: context.readingsKun,
      annotationLabels: context.annotations.map((annotation) => annotation.label),
      hasVisualSource: Boolean(context.visualSourceSha256),
      vocabularyCount: context.firstPartyVocabularyCount,
    });
    const schema = validateMnemonicRecords([record], supportedCharacterSet, visualAnnotationMap);
    return [{ recordId: record.id, character: record.character, schemaValid: schema.valid, schemaIssues: schema.issues, findings: assessment.findings }];
  });
  useEffect(() => {
    let active = true;
    void Promise.all(MINDTREE_M6_PILOT_CASES.map(async (pilotCase) => {
      const context = contextByCharacter.get(pilotCase.character);
      if (!context) return null;
      const record = pilotCase.recordId ? records.find((item) => item.id === pilotCase.recordId) ?? null : null;
      return evaluateMindTreeReadiness({
        record,
        character: pilotCase.character,
        context: {
          character: context.character,
          meaning: context.meaning,
          dictionaryMeanings: context.dictionaryMeanings,
          readingsOn: context.readingsOn,
          readingsKun: context.readingsKun,
          annotationLabels: context.annotations.map((annotation) => annotation.label),
          hasVisualSource: Boolean(context.visualSourceSha256),
          vocabularyCount: context.firstPartyVocabularyCount,
        },
        reviewEvidence: reviewEvidence.filter((item) => item.recordId === (record?.id ?? "")),
        supportedCharacters: supportedCharacterSet,
        visualAnnotations: visualAnnotationMap,
      });
    })).then((results) => { if (active) setReadinessResults(results.filter((result): result is MindTreeReadinessResult => result !== null)); });
    return () => { active = false; };
  }, [contextByCharacter, records, reviewEvidence, supportedCharacterSet, visualAnnotationMap]);
  const selectedReadiness = readinessResults.find((item) => item.character === selectedCharacter && item.recordId === (selectedRecord?.id ?? null)) ?? null;
  const selectedReviewEvidence = selectedRecord ? reviewEvidence.filter((item) => item.recordId === selectedRecord.id) : [];
  const canonicalRevisionJson = selectedRecord ? canonicalJson(mnemonicRevisionPayload(selectedRecord)) : "";
  const canSubmitReview = canRecordLocalReviewDecision({
    outcome: reviewOutcome,
    reviewerAttribution,
    currentContentDigest,
    acknowledgedContentDigest: acknowledgedReviewDigest,
    revisionSaved: !isRecordDirty && savedSelectedRecord !== null,
    isSubmitting: reviewInProgress,
  });
  const selectedRecordIsInPilot = selectedRecord ? MINDTREE_M6_PILOT_CASES.some((item) => item.recordId === selectedRecord.id) : false;

  function selectItem(character: string, record: MindTreeMnemonicRecord | null) {
    setSelectedCharacter(character);
    setSelectedRecordId(record?.id ?? null);
    setReviewerAttribution("");
    setReviewOutcome("");
    setAcknowledgedReviewDigest("");
    setReviewIssueReferences("");
    setReviewProvenanceConcerns("");
    if (record) {
      setReviewNotes((current) => ({ ...current, [record.id]: current[record.id] ?? savedReviewNotes[record.id] ?? "" }));
      setReviewChecklist((current) => ({ ...current, [record.id]: current[record.id] ?? REVIEW_CHECKLIST.map(() => false) }));
    }
    setWorkflowMessage("");
    setExportError("");
  }

  function updateRecord(patch: Partial<MindTreeMnemonicRecord>) {
    if (!selectedRecord) return;
    setRecords((current) => current.map((record) => {
      if (record.id !== selectedRecord.id) return record;
      const changed = { ...record, ...patch };
      if (record.editorialStatus !== "draft") {
        changed.editorialStatus = "draft";
        delete changed.reviewerId;
        delete changed.reviewedAt;
        delete changed.publishedAt;
      }
      return changed;
    }));
    setWorkflowMessage("Unsaved content edit is local. Any review event remains attached to its old content digest and becomes stale; approval/publication are not available here.");
  }

  async function recordReviewDecision() {
    if (!selectedRecord || !canRecordLocalReviewDecision({
      outcome: reviewOutcome,
      reviewerAttribution,
      currentContentDigest,
      acknowledgedContentDigest: acknowledgedReviewDigest,
      revisionSaved: !isRecordDirty && savedSelectedRecord !== null,
      isSubmitting: reviewInProgress,
    })) {
      setWorkflowMessage("Save or cancel content edits first. Then inspect the exact displayed revision, acknowledge its digest, enter local attribution, and explicitly choose an outcome.");
      return;
    }
    setReviewInProgress(true);
    try {
      const evidence = await createLocalReviewEvidence(selectedRecord, {
        outcome: reviewOutcome as MindTreeReviewOutcome,
        reviewerAttribution,
        notes: reviewNotes[selectedRecord.id] ?? "",
        issueReferences: reviewIssueReferences.split("\n"),
        provenanceConcerns: reviewProvenanceConcerns.split("\n"),
      });
      setReviewEvidence((current) => [...current, evidence]);
      announceCompletedAction(`Recorded ${evidence.outcome.replaceAll("_", " ")} for ${evidence.recordId}, v${evidence.reviewedRevision.version}, SHA-256 ${evidence.reviewedRevision.contentDigest.slice(0, 16)}. Local attribution is unauthenticated; no timestamp, approval, or release authorization was recorded.`);
      setReviewOutcome("");
      setReviewerAttribution("");
      setAcknowledgedReviewDigest("");
    } catch (error) {
      setWorkflowMessage(error instanceof Error ? error.message : "Review evidence could not be recorded.");
    } finally {
      setReviewInProgress(false);
    }
  }

  function startRewrite() {
    if (!selectedRecord || selectedRecord.origin !== "ai_candidate") return;
    const suffix = records.filter((record) => record.character === selectedRecord.character && record.origin === "editorial").length + 1;
    const rewrite = createEditorialRewrite(selectedRecord, `editorial-${(selectedRecord.character.codePointAt(0) ?? 0).toString(16)}-${suffix}`);
    setRecords((current) => [...current, rewrite]);
    selectItem(rewrite.character, rewrite);
    setWorkflowMessage("Blank editorial record created. Re-author the cue independently; candidate text and components were not copied.");
  }

  function saveLocalRevision() {
    if (!selectedRecord) return;
    const saved = isRecordDirty ? saveLocalMnemonicRevision(selectedRecord, savedSelectedRecord) : selectedRecord;
    if (isRecordDirty) {
      setRecords((current) => current.map((record) => record.id === saved.id ? saved : record));
      setRevisionHistory((current) => {
        const previous = current[saved.id] ?? (savedSelectedRecord ? [savedSelectedRecord] : []);
        return { ...current, [saved.id]: [...previous, saved] };
      });
    }
    setSavedRecords((current) => [...current.filter((record) => record.id !== saved.id), saved]);
    setSavedReviewNotes((current) => ({ ...current, [saved.id]: reviewNotes[saved.id] ?? "" }));
    announceCompletedAction(isRecordDirty ? `Saved local revision v${saved.version}. The counter is browser-local, not a tamper-proof audit record.` : "Saved local review notes only. They are unauthenticated session data, not review evidence.");
  }

  function cancelLocalEdits() {
    if (!selectedRecord) return;
    setRecords((current) => cancelLocalMnemonicRevision(current, selectedRecord.id, savedSelectedRecord));
    setReviewNotes((current) => ({ ...current, [selectedRecord.id]: savedReviewNotes[selectedRecord.id] ?? "" }));
    if (!savedSelectedRecord) {
      setSelectedRecordId(null);
      setRevisionHistory((current) => {
        const next = { ...current };
        delete next[selectedRecord.id];
        return next;
      });
    }
    announceCompletedAction(savedSelectedRecord ? "Unsaved local edits cancelled; restored the last saved browser revision." : "Unsaved editorial draft removed from this browser session.");
  }

  async function downloadPackage(kind: MindTreeMnemonicExportKind) {
    setExportError("");
    try {
      if (kind === "approved_release_candidate") {
        throw new Error("Unavailable by design: local review outcomes cannot grant authenticated approval or release authorization.");
      }
      if (kind === "draft_working" && !exportValidation.valid) {
        throw new Error(`Working export blocked: ${exportValidation.issues.slice(0, 4).join("; ")}`);
      }
      if (kind === "proposed_human_review" && !selectedRecord) throw new Error("Select one record for the proposed review package.");
      const includedRecords = kind === "proposed_human_review" ? [selectedRecord!] : records;
      const includedIds = new Set(includedRecords.map((record) => record.id));
      const includedQualityRows = qualityRows.filter((row) => includedIds.has(row.recordId));
      const packageText = await buildMnemonicExportPackage({
        kind,
        records: includedRecords,
        supportedCharacters: supportedCharacterSet,
        visualAnnotations: visualAnnotationMap,
        validationResults: includedQualityRows,
        revisionHistory: [...includedIds].map((recordId) => ({ recordId, revisions: revisionHistory[recordId] ?? includedRecords.filter((record) => record.id === recordId) })),
        reviewEvidence: reviewEvidence.filter((item) => includedIds.has(item.recordId)),
        readinessResults: readinessResults.filter((item) => kind === "draft_working" ? (item.recordId === null || includedIds.has(item.recordId)) : item.character === selectedRecord!.character),
        ...(kind === "proposed_human_review" ? {
          reviewAnnotation: {
            note: reviewNotes[selectedRecord!.id] ?? "",
            identityVerified: false as const,
            checklist: REVIEW_CHECKLIST.map((question, index) => ({ question, checked: reviewChecklist[selectedRecord!.id]?.[index] ?? false })),
          },
        } : {}),
      });
      const verification = await verifyMnemonicExportPackage(packageText, { supportedCharacters: supportedCharacterSet, visualAnnotations: visualAnnotationMap });
      if (!verification.valid) throw new Error(`Generated package failed verification: ${verification.issues.join("; ")}`);
      const digest = (verification.package?.artifactDigest as { value?: string } | undefined)?.value ?? "unavailable";
      const blob = new Blob([packageText], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      const suffix = selectedRecord ? `-${(selectedRecord.character.codePointAt(0) ?? 0).toString(16)}` : "";
      anchor.download = kind === "proposed_human_review" ? `mindtree-proposed-review${suffix}-v2.json` : "mindtree-draft-working-v2.json";
      anchor.click();
      URL.revokeObjectURL(url);
      setWorkflowMessage(`${kind.replaceAll("_", " ")} package v2 verified · SHA-256 ${digest}. Status, approval, learner visibility, and release authorization remain unchanged.`);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Export failed.");
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-4 py-7 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <nav aria-label="Breadcrumb" className="mb-4 text-sm"><Link href="/mindtree" className="rounded underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600">MindTree catalog</Link><span className="mx-2" aria-hidden="true">/</span><span>Mnemonic studio</span></nav>
        <header className="rounded-3xl border border-amber-300 bg-amber-50 p-5 sm:p-7">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-amber-900">Development only · offline · ephemeral</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Mnemonic Content Studio</h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-700">This browser-local workspace does not authenticate reviewers, persist changes, call an API, approve content, authorize release, or publish to learners. A review decision is recorded only after an explicit human action and remains unverified local attribution; no trustworthy timestamp is available. AI candidates cannot be relabeled or made learner-visible—start a blank independent rewrite instead.</p>
          <p className="mt-2 text-xs leading-5 text-slate-700">Source annotations below are literal KanjiVG markup and dictionary facts are KANJIDIC2 data. Neither source verifies a mnemonic. Source references document context, not the origin of an invented story.</p>
        </header>

        <section aria-labelledby="completeness-title" className="mt-5 rounded-3xl border border-slate-200 bg-white p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="completeness-title" className="text-lg font-extrabold">Completeness dimensions</h2><p className="mt-1 text-xs leading-5 text-slate-600">Evidence, language content, editorial state, and learner publication are separate measures.</p></div><p className="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-900">{contexts.length} supported characters · fixed M3 slice</p></div>
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {[["Visual source", completeness.visual], ["Dictionary facts", completeness.dictionary], ["Study examples", completeness.firstPartyExamples], ["Mnemonic records", completeness.records], ["Review pending", completeness.reviewPending], ["Published", completeness.published], ["No record", completeness.missing]].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 text-2xl font-black">{value}<span className="ml-1 text-xs font-semibold text-slate-500">/ {contexts.length}</span></dd></div>)}
          </dl>
        </section>

        <section aria-labelledby="pilot-readiness-title" className="mt-5 rounded-3xl border border-amber-300 bg-amber-50/50 p-4 sm:p-6"><div><p className="text-xs font-extrabold uppercase tracking-wide text-amber-900">M6 · bounded pilot · local-only</p><h2 id="pilot-readiness-title" className="mt-1 text-lg font-extrabold">Release-readiness matrix</h2><p className="mt-1 max-w-4xl text-xs leading-5 text-slate-700">Readiness reasons are explicit and fail-closed. A local accepted outcome is not approval; this tool cannot grant release authorization. Automated checks cannot establish Japanese correctness.</p></div>
          <ul className="mt-4 grid list-none gap-3 p-0 lg:grid-cols-2">{MINDTREE_M6_PILOT_CASES.map((pilotCase) => { const item = readinessResults.find((result) => result.character === pilotCase.character && result.recordId === pilotCase.recordId) ?? null; return <li key={`${pilotCase.kind}-${pilotCase.character}`} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="text-sm font-extrabold"><span lang="ja" className="font-japanese text-lg">{pilotCase.character}</span> · {pilotCase.kind.replaceAll("_", " ")}</h3><span className="rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-extrabold uppercase">{item?.status.replaceAll("_", " ") ?? "computing"}</span></div><p className="mt-1 text-[10px] text-slate-600">{pilotCase.recordId ?? "No mnemonic record"} · {pilotCase.selectionRationale}</p>{item ? <><p className="mt-2 break-all font-mono text-[9px] text-slate-500">Content SHA-256: {item.currentContentDigest ?? "not available"}</p><ul className="mt-2 list-none space-y-1 p-0">{item.reasons.map((reason, index) => <li key={`${reason.code}-${index}`} className="rounded bg-slate-50 p-2 text-[10px]"><strong>{reason.severity.toUpperCase()} · {reason.code}</strong><span className="ml-1">{reason.detail}</span></li>)}</ul><p className="mt-2 text-[9px] font-bold">Approval: {item.approvalEvidence} · Release authorization: {item.releaseAuthorization}</p></> : <p className="mt-2 text-xs text-slate-500">Readiness evaluation pending.</p>}</li>; })}</ul>
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(300px,0.78fr)_minmax(0,1.5fr)]">
          <aside aria-label="Mnemonic content queue" className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5">
            <h2 className="text-lg font-extrabold">Content queue</h2>
            <label className="mt-3 block"><span className="sr-only">Search content queue</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search kanji, meaning, keyword" className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm focus:border-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-100" /></label>
            <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Filter editorial status">
              {(["all", ...CMS_STATUSES, "missing"] as StudioFilter[]).map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-9 rounded-lg px-2.5 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 ${filter === value ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>{value === "all" ? `All (${records.length})` : value === "missing" ? `Missing (${missingCharacters.length})` : `${value} (${counts[value]})`}</button>)}
            </div>
            <p className="mt-3 text-xs text-slate-500" aria-live="polite">Showing {listItems.length} of {contexts.length + Math.max(0, records.length - representedCharacters.size)} rows.</p>
            <ul className="mt-3 max-h-[70vh] list-none space-y-2 overflow-y-auto p-0">
              {listItems.map(({ context, record }) => <li key={record?.id ?? `missing-${context.character}`}><button type="button" aria-current={(record?.id ?? null) === selectedRecordId && context.character === selectedCharacter ? "true" : undefined} onClick={() => selectItem(context.character, record)} className={`flex min-h-14 w-full items-center gap-3 rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 ${context.character === selectedCharacter && (record?.id ?? null) === selectedRecordId ? "border-rose-400 bg-rose-50" : "border-slate-200 bg-white hover:border-slate-300"}`}><span className="font-japanese text-2xl" lang="ja">{context.character}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{context.meaning}</span><span className="block truncate text-[10px] text-slate-500">{record ? `${record.origin} · ${record.editorialStatus}` : "Missing mnemonic record"}</span></span><span className="text-[10px] font-bold uppercase text-slate-500">{record?.editorialStatus ?? "missing"}</span></button></li>)}
            </ul>
          </aside>

          <section aria-labelledby="record-title" className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            {selectedContext ? <>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.15em] text-indigo-700">Evidence context · not mnemonic validation</p><h2 id="record-title" className="mt-1 flex items-end gap-3"><span lang="ja" className="font-japanese text-4xl">{selectedContext.character}</span><span className="text-xl font-extrabold">{selectedContext.meaning}</span></h2><p className="mt-1 text-xs text-slate-500">{selectedContext.strokeCount} strokes · grade {selectedContext.gradeLevel ?? "not listed"} · KANJIDIC2 {selectedContext.dictionarySourceRef}</p></div>{selectedRecord ? <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold">{originLabel(selectedRecord.origin)} · {selectedRecord.editorialStatus}</span> : <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-900">Missing coverage</span>}</div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-sky-100 bg-sky-50 p-3"><h3 className="text-xs font-extrabold uppercase tracking-wide">Dictionary facts · KANJIDIC2</h3><p className="mt-2 text-xs"><strong>English:</strong> {selectedContext.dictionaryMeanings.join(" · ") || "none listed"}</p><p className="mt-1 text-xs"><strong>On:</strong> {selectedContext.readingsOn.join(" · ") || "none listed"} · <strong>Kun:</strong> {selectedContext.readingsKun.join(" · ") || "none listed"}</p></div>
                <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3"><h3 className="text-xs font-extrabold uppercase tracking-wide">Literal visual annotations · KanjiVG</h3>{selectedContext.annotations.length ? <ul className="mt-2 flex flex-wrap gap-1.5">{selectedContext.annotations.map((annotation, index) => <li key={`${annotation.label}-${annotation.position}-${index}`} className="rounded-md bg-white px-2 py-1 text-xs"><span lang="ja" className="font-japanese font-bold">{annotation.label}</span>{annotation.position ? ` · ${annotation.position}` : ""}{annotation.radicalMarker ? ` · kvg:radical=${annotation.radicalMarker}` : ""}{annotation.phoneticMarker ? ` · kvg:phon=${annotation.phoneticMarker}` : ""}</li>)}</ul> : <p className="mt-2 text-xs text-slate-600">No nested element labels in this record. No component is inferred.</p>}<p className="mt-2 break-all text-[10px] text-slate-500">{selectedContext.visualSourceFile} · SHA-256 {selectedContext.visualSourceSha256}</p></div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <section aria-labelledby="studio-visual-title" className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4">
                  <div className="flex items-start justify-between gap-3"><div><h3 id="studio-visual-title" className="text-sm font-extrabold">Source-backed glyph preview</h3><p className="mt-1 text-[11px] leading-5 text-slate-600">One selected SVG only · KanjiVG groups are visual markup, not semantic decomposition.</p></div>{previewLoading ? <span className="text-xs text-slate-500" aria-live="polite">Loading preview…</span> : null}</div>
                  {preview?.character === selectedCharacter ? <div className="mt-3 grid gap-3 sm:grid-cols-[120px_1fr] sm:items-start">
                    <figure className="rounded-xl bg-white p-2"><svg viewBox={preview.viewBox} role="img" aria-labelledby="studio-glyph-title" className="h-auto w-full"><title id="studio-glyph-title">{`Source stroke paths for ${preview.character}`}</title>{preview.paths.map((path) => { const active = activeOccurrenceId !== null && path.componentOccurrenceId === activeOccurrenceId; const other = activeOccurrenceId !== null && path.componentOccurrenceId !== null && !active; return <path key={path.sourcePathId} d={path.pathData} fill="none" stroke={active ? "#e11d48" : "#334155"} strokeWidth={active ? preview.sourceStrokeWidth + 0.8 : preview.sourceStrokeWidth} strokeLinecap="round" strokeLinejoin="round" opacity={other ? 0.3 : 1} vectorEffect="non-scaling-stroke" />; })}</svg><figcaption className="mt-1 text-center text-[9px] text-slate-500">Highlight by label</figcaption></figure>
                    <div><p className="break-all text-[10px] leading-4 text-slate-500">{preview.sourceRef} · {preview.sourceVersion} · {preview.license}<br />{preview.sourceFile} · SHA-256 {preview.sourceFileSha256}</p>{preview.annotations.length ? <ul className="mt-2 flex flex-wrap gap-1.5">{preview.annotations.map((annotation) => <li key={annotation.occurrenceId}><button type="button" aria-pressed={activeOccurrenceId === annotation.occurrenceId} onClick={() => setActiveOccurrenceId(activeOccurrenceId === annotation.occurrenceId ? null : annotation.occurrenceId)} className={`min-h-9 rounded-lg px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 ${activeOccurrenceId === annotation.occurrenceId ? "bg-rose-700 text-white" : "bg-white text-slate-800 ring-1 ring-indigo-200"}`}><span lang="ja" className="font-japanese font-bold">{annotation.label}</span>{annotation.position ? ` · ${annotation.position}` : ""}{annotation.radicalMarker ? ` · radical annotation ${annotation.radicalMarker}` : ""}{annotation.phoneticMarker ? ` · phonetic annotation ${annotation.phoneticMarker}` : ""}</button></li>)}</ul> : <p className="mt-2 text-xs text-slate-600">No nested source element annotations.</p>}</div>
                  </div> : previewError?.character === selectedCharacter ? <p className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-900" role="status">{previewError.message}</p> : previewLoading ? null : <p className="mt-3 text-xs text-slate-600">Select a supported character to load its one-glyph preview.</p>}
                </section>

                <section aria-labelledby="origin-layers-title" className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 id="origin-layers-title" className="text-sm font-extrabold">Content layers for {selectedCharacter}</h3>
                  <p className="mt-1 text-[11px] leading-5 text-slate-600">Records remain separate; selecting an AI candidate never overwrites first-party content. Learner-created content is not supported.</p>
                  <ul className="mt-3 list-none space-y-2 p-0">{(["first_party", "ai_candidate", "editorial"] as const).map((origin) => {
                    const layerRecords = selectedCharacterRecords.filter((record) => record.origin === origin);
                    return <li key={origin} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">{origin === "first_party" ? "First-party seed" : origin === "ai_candidate" ? "AI candidate overlay" : "Independent editorial"}</p>{layerRecords.length ? <ul className="mt-2 list-none space-y-1.5 p-0">{layerRecords.map((record) => <li key={record.id}><button type="button" onClick={() => selectItem(record.character, record)} aria-current={record.id === selectedRecordId ? "true" : undefined} className={`w-full rounded-lg p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700 ${record.id === selectedRecordId ? "bg-indigo-100" : "bg-white"}`}><span className="flex justify-between gap-2 text-[11px] font-bold"><span>{record.id} · v{record.version}</span><span>{record.editorialStatus}</span></span><span className="mt-1 block text-xs leading-5 text-slate-700">{record.story || "Blank editor-authored draft"}</span></button></li>)}</ul> : <p className="mt-2 text-xs text-slate-500">No {origin.replaceAll("_", " ")} record exists.</p>}</li>;
                  })}</ul>
                </section>
              </div>

              {selectedAssessment ? <section aria-labelledby="quality-findings-title" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id="quality-findings-title" className="text-sm font-extrabold">Deterministic review assistance</h3><p className="mt-1 text-[11px] leading-5 text-slate-600">Flags are prompts for human judgment—not factual verdicts, grading, or approval.</p></div><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold">{selectedAssessment.findings.length} findings · {selectedAssessment.findings.filter((finding) => finding.severity === "error").length} blocking schema/context errors</span></div>
                <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-lg bg-white p-2"><dt className="text-[9px] uppercase text-slate-500">Meaning recall</dt><dd className="text-xs font-bold">{selectedAssessment.completeness.meaningRecallEligible ? "eligible" : "not eligible"}</dd></div><div className="rounded-lg bg-white p-2"><dt className="text-[9px] uppercase text-slate-500">Component recall</dt><dd className="text-xs font-bold">{selectedAssessment.completeness.componentRecallEligible ? `${selectedAssessment.completeness.availableAnnotationCount} annotations` : "not eligible"}</dd></div><div className="rounded-lg bg-white p-2"><dt className="text-[9px] uppercase text-slate-500">Reading hook</dt><dd className="text-xs font-bold">{selectedAssessment.completeness.hasReadingHook ? "present" : "absent"} · {selectedAssessment.completeness.hasReadings ? "source readings available" : "no readings"}</dd></div><div className="rounded-lg bg-white p-2"><dt className="text-[9px] uppercase text-slate-500">Vocabulary</dt><dd className="text-xs font-bold">{selectedAssessment.completeness.vocabularyCount} examples</dd></div></dl>
                {selectedAssessment.findings.length ? <ul className="mt-3 list-none space-y-1.5 p-0">{selectedAssessment.findings.map((finding, index) => <li key={`${finding.code}-${finding.field}-${index}`} className="rounded-lg bg-white p-2 text-xs"><span className={`mr-2 inline-flex rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase ${finding.severity === "error" ? "bg-rose-100 text-rose-900" : finding.severity === "warning" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}>{finding.severity}</span><code className="font-bold">{finding.code}</code><p className="mt-1 text-slate-700">{finding.message}{finding.humanDecisionRequired ? " Human decision required." : ""}</p></li>)}</ul> : <p className="mt-3 text-xs text-emerald-800">No deterministic flags. This is not an approval.</p>}
                {selectedRecord ? <div className="mt-3 grid gap-3 lg:grid-cols-2"><fieldset className="rounded-xl border border-amber-200 bg-white p-3"><legend className="px-1 text-xs font-extrabold">Unresolved human-review questions · local checklist only</legend><ul className="list-none space-y-2 p-0">{REVIEW_CHECKLIST.map((question, index) => <li key={question}><label className="flex items-start gap-2 text-xs leading-5"><input type="checkbox" checked={reviewChecklist[selectedRecord.id]?.[index] ?? false} onChange={(event) => setReviewChecklist((current) => { const updated = [...(current[selectedRecord.id] ?? REVIEW_CHECKLIST.map(() => false))]; updated[index] = event.target.checked; return { ...current, [selectedRecord.id]: updated }; })} className="mt-1" />{question}</label></li>)}</ul><p className="mt-2 text-[10px] font-semibold text-amber-900">These checks are unverified local annotations; checking boxes does not record reviewer identity or approval.</p></fieldset><label className="block rounded-xl border border-amber-200 bg-white p-3 text-xs font-extrabold">Local review notes <span className="font-normal text-slate-500">(not authenticated or server-saved)</span><textarea value={reviewNotes[selectedRecord.id] ?? ""} onChange={(event) => setReviewNotes((current) => ({ ...current, [selectedRecord.id]: event.target.value }))} rows={5} maxLength={2000} className="mt-2 w-full rounded-lg border border-slate-300 p-3 text-xs font-normal focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-100" placeholder="Record an unresolved question, not a fabricated verdict." /></label></div> : null}
              </section> : null}

              {selectedRecord ? <>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  <label className="block text-xs font-bold">Memory keyword<input value={selectedRecord.keyword} onChange={(event) => updateRecord({ keyword: event.target.value })} maxLength={120} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal focus:border-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-100" /></label>
                  <label className="block text-xs font-bold">Optional reading hook<input value={selectedRecord.readingHook ?? ""} onChange={(event) => updateRecord({ readingHook: event.target.value || null })} maxLength={180} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal focus:border-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-100" /></label>
                </div>
                <label className="mt-3 block text-xs font-bold">Memory story <span className="font-normal text-slate-500">(cue only; never etymology)</span><textarea value={selectedRecord.story} onChange={(event) => updateRecord({ story: event.target.value })} rows={5} maxLength={600} className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm font-normal leading-6 focus:border-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-100" /></label>
                <label className="mt-3 block text-xs font-bold">Component cue references <span className="font-normal text-slate-500">(one literal KanjiVG label per line; keep semantic claims separate)</span><textarea value={selectedRecord.componentCues.join("\n")} onChange={(event) => updateRecord({ componentCues: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} rows={2} maxLength={400} className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm font-normal focus:border-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-100" /></label>
                <label className="mt-3 block text-xs font-bold">Source references <span className="font-normal text-slate-500">(one reference per line; context only)</span><textarea value={selectedRecord.sourceReferences.join("\n")} onChange={(event) => updateRecord({ sourceReferences: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} rows={2} maxLength={2400} className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-xs font-normal focus:border-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-100" /></label>
                <section aria-labelledby="revision-title" className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id="revision-title" className="text-sm font-extrabold">Local revision comparison</h3><p className="mt-1 text-[10px] leading-4 text-slate-500">Counter/history are browser-local, editable state—not tamper-proof audit records; no author/date is inferred.</p></div><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold">v{selectedRecord.version} · {selectedRecord.origin}</span></div>
                  {revisionDiff.length ? <ul className="mt-3 list-none space-y-2 p-0">{revisionDiff.map((change) => <li key={change.field} className="grid gap-2 rounded-lg bg-white p-3 text-xs sm:grid-cols-2"><div><p className="text-[9px] font-extrabold uppercase text-slate-500">Previous · {change.field}</p><pre className="mt-1 whitespace-pre-wrap break-words font-sans text-xs text-slate-600">{change.before || "(empty)"}</pre></div><div><p className="text-[9px] font-extrabold uppercase text-indigo-700">Working · {change.field}</p><pre className="mt-1 whitespace-pre-wrap break-words font-sans text-xs text-slate-900">{change.after || "(empty)"}</pre></div></li>)}</ul> : <p className="mt-3 text-xs text-slate-600">No unsaved content changes compared with the last local revision.</p>}
                  {(reviewNotes[selectedRecord.id] ?? "") !== (savedReviewNotes[selectedRecord.id] ?? "") ? <div className="mt-2 grid gap-2 rounded-lg bg-amber-50 p-3 text-xs sm:grid-cols-2"><div><p className="text-[9px] font-extrabold uppercase text-slate-500">Previous local note</p><pre className="mt-1 whitespace-pre-wrap break-words font-sans">{savedReviewNotes[selectedRecord.id] || "(empty)"}</pre></div><div><p className="text-[9px] font-extrabold uppercase text-amber-900">Working local note</p><pre className="mt-1 whitespace-pre-wrap break-words font-sans">{reviewNotes[selectedRecord.id] || "(empty)"}</pre></div></div> : null}
                  <details className="mt-3 rounded-lg bg-white p-3"><summary className="cursor-pointer text-xs font-bold">Saved content revisions ({selectedRevisionHistory.length})</summary><ol className="mt-2 list-decimal pl-5 text-xs text-slate-600">{selectedRevisionHistory.map((revision, index) => <li key={`${revision.id}-${revision.version}`}>v{revision.version} · {revision.origin} · {revision.editorialStatus}{index === selectedRevisionHistory.length - 1 ? " (latest saved)" : ""}</li>)}</ol></details>
                  <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={saveLocalRevision} disabled={!isDirty} className="min-h-10 rounded-lg bg-indigo-800 px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Save local revision</button><button type="button" onClick={cancelLocalEdits} disabled={!isDirty} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40">Cancel unsaved edits</button></div>
                </section>
                <section aria-labelledby="review-evidence-title" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id="review-evidence-title" className="text-sm font-extrabold">M6 review evidence · local and unverified</h3><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-700">A local attribution is not an authenticated identity or role. This browser has no trustworthy timestamp source, so review time is recorded as unavailable—not filled from the device clock. Review outcome is separate from approval, release authorization, and learner visibility.</p></div><span role="status" aria-live="polite" aria-atomic="true" className="rounded-full bg-white px-3 py-1 text-[10px] font-extrabold">{selectedReadiness?.status.replaceAll("_", " ") ?? "Computing readiness…"}</span></div>
                  <div className="mt-3 rounded-lg bg-white p-3"><p className="text-[10px] font-extrabold uppercase text-slate-500">Exact current revision</p><p className="mt-1 break-all font-mono text-[10px]">{selectedRecord.id} · {selectedRecord.character} · v{selectedRecord.version} · SHA-256 {currentContentDigest || "computing…"}</p><p className="mt-1 text-[10px] text-slate-700"><strong>Origin:</strong> {selectedRecord.origin} · <strong>Origin provenance:</strong> {selectedRecord.provenanceRef}</p><p className="mt-1 break-words text-[10px] text-slate-600"><strong>Context references (not proof of story origin):</strong> {selectedRecord.sourceReferences.join(" · ")}</p><p className="mt-1 text-[10px] text-slate-600">Approval evidence: not supported · Release authorization: not granted · Learner visibility: unchanged</p><details className="mt-2 rounded-md border border-slate-200 p-2"><summary className="cursor-pointer text-[10px] font-bold">Inspect canonical revision representation</summary><p className="mt-1 text-[9px] leading-4 text-slate-500">Sorted-key canonical JSON for the revision digest. Includes schema, record identity/version, mnemonic fields, origin, provenance, source references, and interpretation. Excludes lifecycle/reviewer metadata and volatile UI state.</p><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-2 font-mono text-[9px] leading-4">{canonicalRevisionJson}</pre></details></div>
                  {currentContentDigest && selectedReviewEvidence.some((item) => item.reviewedRevision.contentDigest !== currentContentDigest || item.reviewedRevision.version !== selectedRecord.version) ? <p className="mt-2 rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-900" role="alert">Stale review: one or more saved review statements bind to a different revision digest/version. They do not satisfy review for the current content.</p> : null}
                  <details className="mt-3 rounded-lg bg-white p-3"><summary className="cursor-pointer text-xs font-bold">Local review history ({selectedReviewEvidence.length})</summary>{selectedReviewEvidence.length ? <ol className="mt-2 list-decimal space-y-2 pl-5 text-xs text-slate-700">{selectedReviewEvidence.map((item) => <li key={item.evidenceDigest}><span className="font-bold">{item.outcome.replaceAll("_", " ")}</span> · local attribution “{item.reviewerAttribution}” · v{item.reviewedRevision.version} · SHA-256 {item.reviewedRevision.contentDigest.slice(0, 16)}… · {item.reviewedRevision.contentDigest === currentContentDigest && item.reviewedRevision.version === selectedRecord.version ? "matches current content" : "STALE for current content"}<p className="mt-1">Recorded timestamp: unavailable · evidence digest {item.evidenceDigest.slice(0, 16)}…</p>{item.notes ? <p className="mt-1">Note: {item.notes}</p> : null}</li>)}</ol> : <p className="mt-2 text-xs text-slate-600">No review evidence is recorded for this record in the current browser session.</p>}</details>
                  {selectedReadiness ? <details className="mt-3 rounded-lg bg-white p-3" open><summary className="cursor-pointer text-xs font-bold">Readiness reasons · {selectedReadiness.reasons.length}</summary><ul className="mt-2 list-none space-y-1.5 p-0">{selectedReadiness.reasons.map((item, index) => <li key={`${item.code}-${index}`} className="rounded border border-slate-100 p-2 text-[10px]"><strong>{item.severity.toUpperCase()} · {item.code}</strong><p className="mt-1 text-slate-700">{item.detail}</p></li>)}</ul><p className="mt-2 text-[10px] font-bold">Approval evidence: {selectedReadiness.approvalEvidence} · Release authorization: {selectedReadiness.releaseAuthorization}</p></details> : null}
                  {selectedRecordIsInPilot ? <div className="mt-3 rounded-lg border border-amber-200 bg-white p-3"><h4 className="text-xs font-extrabold">Record a human review decision for this exact revision</h4><p className="mt-1 text-[10px] leading-4 text-slate-600">This control records only a human-entered local statement. It does not authenticate the operator, verify Japanese claims, approve the record, or authorize release. Current pilot membership is limited to the named M6 cases below.</p>
                    <label className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5"><input type="checkbox" checked={Boolean(currentContentDigest) && acknowledgedReviewDigest === currentContentDigest} disabled={!currentContentDigest || reviewInProgress || isRecordDirty || savedSelectedRecord === null} onChange={(event) => setAcknowledgedReviewDigest(event.target.checked ? currentContentDigest : "")} className="mt-1 accent-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700" /><span>I personally inspected the exact record and canonical revision displayed above, including its content origin, provenance, source context, and quality findings. This is a local self-attestation only; it does not authenticate my identity or establish correctness.</span></label>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="block text-xs font-bold">Reviewer attribution · not verified<input value={reviewerAttribution} onChange={(event) => setReviewerAttribution(event.target.value)} maxLength={120} autoComplete="off" disabled={reviewInProgress} placeholder="Enter local attribution" aria-describedby="review-attribution-limit" className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 disabled:bg-slate-100" /><span id="review-attribution-limit" className="sr-only">Local text only. Identity and role are not authenticated.</span></label><label className="block text-xs font-bold">Review outcome<select value={reviewOutcome} onChange={(event) => setReviewOutcome(event.target.value as MindTreeReviewOutcome | "")} disabled={reviewInProgress} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 disabled:bg-slate-100"><option value="">Choose an outcome…</option><option value="accepted">Accepted · not approved</option><option value="changes_requested">Changes requested</option><option value="rejected">Rejected</option></select></label></div>
                    <label className="mt-3 block text-xs font-bold">Issue references <span className="font-normal text-slate-500">(one per line)</span><textarea value={reviewIssueReferences} onChange={(event) => setReviewIssueReferences(event.target.value)} disabled={reviewInProgress} maxLength={2000} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 disabled:bg-slate-100" placeholder="Optional issue IDs or local checklist references" /></label>
                    <label className="mt-3 block text-xs font-bold">Provenance concerns <span className="font-normal text-slate-500">(one per line)</span><textarea value={reviewProvenanceConcerns} onChange={(event) => setReviewProvenanceConcerns(event.target.value)} disabled={reviewInProgress} maxLength={2000} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 disabled:bg-slate-100" placeholder="Record unresolved origin, attribution, or license questions" /></label>
                    <p className="mt-2 text-[10px] text-slate-600">An outcome is a statement about this revision, not verification that a claim is true. Summarize material concerns in the review notes and/or provenance fields above.</p>
                    <button type="button" onClick={() => void recordReviewDecision()} disabled={!canSubmitReview} className="mt-3 min-h-11 rounded-lg bg-amber-900 px-4 text-xs font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 disabled:cursor-not-allowed disabled:opacity-40">{reviewInProgress ? "Recording…" : "Record local review decision"}</button>
                  </div> : <p className="mt-3 rounded-lg bg-white p-3 text-xs text-slate-700">This content is outside the bounded M6 review pilot. It may be inspected but the M6 review action is disabled.</p>}
                  {workflowMessage ? <p ref={workflowStatusRef} tabIndex={-1} role="status" aria-live="polite" aria-atomic="true" className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs font-semibold text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-700">{workflowMessage}</p> : null}
                </section>
                <details className="mt-4 rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-xs font-bold">Record integrity check</summary>{selectedValidation.valid ? <p className="mt-2 text-xs text-emerald-800">Current record passes schema/content validation.</p> : <ul className="mt-2 list-disc pl-5 text-xs text-rose-800">{selectedValidation.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}</details>
              </> : <div className="mt-5 rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-5"><h3 className="font-extrabold">No mnemonic record exists</h3><p className="mt-1 text-sm leading-6 text-slate-700">This character has visual and dictionary evidence but no mnemonic record. Create a draft only when a human author can use the evidence safely; no story is generated here.</p><button type="button" onClick={() => { const record: MindTreeMnemonicRecord = { schemaVersion: "nihongobridge-kanji-mnemonic@2", id: `editorial-${(selectedCharacter.codePointAt(0) ?? 0).toString(16)}-1`, character: selectedCharacter, version: 1, keyword: "", componentCues: [], story: "", readingHook: null, origin: "editorial", editorialStatus: "draft", provenanceRef: "first-party:kanji-mindtree:editorial-v1", sourceReferences: ["https://github.com/KanjiVG/kanjivg/tree/r20240807/kanji", "upstream:kanjidic2:2023-08"], interpretation: "memory-aid-not-etymology" }; setRecords((current) => [...current, record]); selectItem(record.character, record); }} className="mt-3 min-h-10 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white">Create blank editorial draft</button></div>}
            </> : <p className="rounded-xl bg-amber-50 p-5 text-sm">No source context is available.</p>}
          </section>
        </div>

        <section aria-labelledby="export-title" className="mt-5 rounded-3xl border border-slate-200 bg-white p-4 sm:p-6">
          <div><h2 id="export-title" className="text-lg font-extrabold">Controlled, digest-bearing package exports</h2><p className="mt-1 max-w-4xl text-xs leading-5 text-slate-600">Each package has stable ordering, source pins, schema version, validation/quality findings and a SHA-256 digest over canonical package JSON. Export is local artifact creation only: status and publication never change.</p></div>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-4"><h3 className="text-sm font-extrabold">1 · Working snapshot</h3><p className="mt-1 text-xs leading-5 text-slate-600">All current records and deterministic validation. A schema-invalid working set is blocked. Candidate origin remains explicit.</p><button type="button" onClick={() => void downloadPackage("draft_working")} disabled={!exportValidation.valid} className="mt-3 min-h-10 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Export working package</button></article>
            <article className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4"><h3 className="text-sm font-extrabold">2 · Proposed human review</h3><p className="mt-1 text-xs leading-5 text-slate-600">Selected record only, with local checklist/notes explicitly unverified. No identity, date, review, or approval is asserted.</p><button type="button" onClick={() => void downloadPackage("proposed_human_review")} disabled={!selectedRecord || !selectedValidation.valid} className="mt-3 min-h-10 rounded-lg bg-indigo-800 px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Export proposed-review package</button></article>
            <article className="rounded-xl border border-amber-200 bg-amber-50/60 p-4"><h3 className="text-sm font-extrabold">3 · Approved release-candidate</h3><p className="mt-1 text-xs leading-5 text-slate-600">M6 has no authenticated approval evidence or release-authorization mechanism. Legacy status/name/date fields cannot enable this export.</p><p className="mt-2 text-[10px] font-bold text-amber-950">Unavailable by design · no release action in this studio</p><button type="button" onClick={() => void downloadPackage("approved_release_candidate")} disabled className="mt-3 min-h-10 cursor-not-allowed rounded-lg bg-amber-900 px-3 text-xs font-bold text-white opacity-40">Unavailable in M6</button></article>
          </div>
          {exportError ? <p className="mt-3 rounded-lg bg-rose-50 p-3 text-xs font-semibold text-rose-900" role="alert">{exportError}</p> : null}
          {exportValidation.valid ? <p className="mt-3 text-xs text-emerald-800">All {records.length} current records pass schema validation. Human quality findings remain review prompts, not approval.</p> : <details className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3"><summary className="cursor-pointer text-xs font-bold text-rose-900">Working export blocked · {exportValidation.issues.length} validation issue(s)</summary><ul className="mt-2 list-disc pl-5 text-xs text-rose-900">{exportValidation.issues.slice(0, 20).map((issue) => <li key={issue}>{issue}</li>)}</ul></details>}
          <p className="mt-3 text-xs font-semibold text-slate-600">No localStorage, indexedDB, API, database, SRS endpoint, learner progress, or file write is used. Closing/reloading this page discards edits.</p>
        </section>
      </div>
    </main>
  );
}
