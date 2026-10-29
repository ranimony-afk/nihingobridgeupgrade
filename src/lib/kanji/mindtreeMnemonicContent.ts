import { KANJI } from "@/data/kanji";
import { M4_AI_MNEMONIC_CANDIDATES } from "@/data/kanji-mindtree/mnemonic-candidates";
import { getKanjidic2MindTreeFacts } from "@/lib/kanji/kanjidic2MindtreeFacts";
import { CMS_STATUSES, type CmsStatus } from "@/services/cms/types";
import { canTransition } from "@/services/cms/stateMachine";

export const MINDTREE_MNEMONIC_SCHEMA = "nihongobridge-kanji-mnemonic@2" as const;
export type MindTreeMnemonicOrigin = "first_party" | "editorial" | "ai_candidate";
export type MindTreeMnemonicAvailability = "published" | "release-authorization-missing" | "draft" | "review-pending" | "approved-unpublished" | "archived-unpublished" | "missing";

/**
 * Editorial record contract. Reviewer/publication fields are deliberately
 * optional: their absence is evidence that no such event is recorded.
 */
export interface MindTreeMnemonicRecord {
  schemaVersion: typeof MINDTREE_MNEMONIC_SCHEMA;
  id: string;
  character: string;
  version: number;
  keyword: string;
  componentCues: string[];
  story: string;
  readingHook: string | null;
  origin: MindTreeMnemonicOrigin;
  editorialStatus: CmsStatus;
  provenanceRef: string;
  sourceReferences: string[];
  interpretation: "memory-aid-not-etymology";
  reviewerId?: string;
  reviewedAt?: string;
  publishedAt?: string;
}

const AI_REVISED_LEGACY_CHARACTERS = new Set(["男", "箸"]);
const firstPartyRecords: MindTreeMnemonicRecord[] = KANJI
  .filter((item) => item.mnemonic && !AI_REVISED_LEGACY_CHARACTERS.has(item.character))
  .map((item) => ({
    schemaVersion: MINDTREE_MNEMONIC_SCHEMA,
    id: `first-party-${(item.character.codePointAt(0) ?? 0).toString(16)}`,
    character: item.character,
    version: 1,
    keyword: item.meaning,
    componentCues: [],
    story: item.mnemonic as string,
    readingHook: null,
    origin: "first_party",
    editorialStatus: "draft",
    provenanceRef: "first-party:kanji-mindtree:v1",
    sourceReferences: ["first-party:kanji-mindtree:v1"],
    interpretation: "memory-aid-not-etymology",
  }));

/** Snapshot-only data: first-party drafts plus a separately named AI overlay. */
export const MINDTREE_MNEMONIC_RECORDS: readonly MindTreeMnemonicRecord[] = [
  ...firstPartyRecords,
  ...M4_AI_MNEMONIC_CANDIDATES,
];

const supportedCharacters = new Set(getKanjidic2MindTreeFacts().records.map((item) => item.character));
const recordByCharacter = new Map<string, MindTreeMnemonicRecord>();
for (const record of MINDTREE_MNEMONIC_RECORDS) {
  if (!recordByCharacter.has(record.character) || record.origin === "ai_candidate") {
    recordByCharacter.set(record.character, record);
  }
}

export function getMnemonicRecord(character: string): MindTreeMnemonicRecord | null {
  return recordByCharacter.get(character) ?? null;
}

export function getPublishedMnemonic(character: string): MindTreeMnemonicRecord | null {
  const record = getMnemonicRecord(character);
  if (!record || record.editorialStatus !== "published" || record.origin === "ai_candidate") return null;
  // M6 found no authenticated approval or release-authorization evidence in the
  // static M1–M5 record model. A mutable CMS-like status is not sufficient to
  // disclose a story. Re-enable only alongside a separate trusted release gate.
  return null;
}

export function getMnemonicAvailabilityForRecord(record: MindTreeMnemonicRecord | null): MindTreeMnemonicAvailability {
  if (!record) return "missing";
  if (record.editorialStatus === "published" && record.origin !== "ai_candidate") return "release-authorization-missing";
  if (record.editorialStatus === "review") return "review-pending";
  if (record.editorialStatus === "approved" || record.editorialStatus === "scheduled") return "approved-unpublished";
  if (record.editorialStatus === "archived") return "archived-unpublished";
  return "draft";
}

export function getMnemonicAvailability(character: string): MindTreeMnemonicAvailability {
  return getMnemonicAvailabilityForRecord(getMnemonicRecord(character));
}

export function validateMnemonicRecords(
  records: readonly MindTreeMnemonicRecord[],
  characters: ReadonlySet<string> = supportedCharacters,
  visualAnnotations?: ReadonlyMap<string, ReadonlySet<string>>,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const ids = new Set<string>();
  const publishedByCharacter = new Set<string>();
  for (const record of records) {
    const prefix = record.character || record.id || "<unknown>";
    if (record.schemaVersion !== MINDTREE_MNEMONIC_SCHEMA) issues.push(`${prefix}: unsupported mnemonic schema`);
    if (!record.id.trim() || ids.has(record.id)) issues.push(`${prefix}: missing or duplicate content id`);
    ids.add(record.id);
    if (Array.from(record.character).length !== 1 || !characters.has(record.character)) issues.push(`${prefix}: unsupported character identity`);
    if (!Number.isInteger(record.version) || record.version < 1) issues.push(`${prefix}: invalid version`);
    if (!record.keyword.trim() || record.keyword.length > 120) issues.push(`${prefix}: invalid keyword`);
    if (!record.story.trim() || record.story.length > 600) issues.push(`${prefix}: story must contain 1–600 characters`);
    if (!Array.isArray(record.componentCues) || record.componentCues.length > 10 || record.componentCues.some((cue) => !cue.trim() || cue.length > 40)) issues.push(`${prefix}: invalid component cues`);
    else if (visualAnnotations && record.componentCues.some((cue) => !visualAnnotations.get(record.character)?.has(cue))) issues.push(`${prefix}: component cue is not an exact KanjiVG source annotation`);
    if (record.readingHook !== null && record.readingHook.length > 180) issues.push(`${prefix}: reading hook is too long`);
    if (!record.provenanceRef.trim()) issues.push(`${prefix}: missing origin provenance`);
    if (!Array.isArray(record.sourceReferences) || record.sourceReferences.length === 0 || record.sourceReferences.length > 10 || record.sourceReferences.some((ref) => !ref.trim() || ref.length > 240)) issues.push(`${prefix}: invalid source references`);
    if (!record.interpretation || record.interpretation !== "memory-aid-not-etymology") issues.push(`${prefix}: missing memory-aid interpretation`);
    if (!CMS_STATUSES.includes(record.editorialStatus)) issues.push(`${prefix}: unknown editorial status`);
    if (!["first_party", "editorial", "ai_candidate"].includes(record.origin)) issues.push(`${prefix}: unknown origin`);
    if (record.origin === "ai_candidate" && ["approved", "scheduled", "published"].includes(record.editorialStatus)) issues.push(`${prefix}: AI candidate cannot be approved or published`);
    if (["approved", "scheduled", "published"].includes(record.editorialStatus)) {
      if (!record.reviewerId?.trim()) issues.push(`${prefix}: approval requires a recorded reviewer identity`);
      if (!record.reviewedAt || !Number.isFinite(Date.parse(record.reviewedAt))) issues.push(`${prefix}: approval requires a valid recorded review date`);
    }
    if (record.editorialStatus === "published") {
      if (!record.publishedAt || !Number.isFinite(Date.parse(record.publishedAt))) issues.push(`${prefix}: publication requires a recorded publication date`);
      if (publishedByCharacter.has(record.character)) issues.push(`${prefix}: multiple published records for one character`);
      publishedByCharacter.add(record.character);
    }
  }
  return { valid: issues.length === 0, issues };
}

export function transitionMnemonicRecord(
  record: MindTreeMnemonicRecord,
  nextStatus: CmsStatus,
  evidence: { reviewerId?: string; reviewedAt?: string; publishedAt?: string } = {},
): MindTreeMnemonicRecord {
  if (!canTransition(record.editorialStatus, nextStatus)) throw new Error(`Invalid editorial transition: ${record.editorialStatus} → ${nextStatus}`);
  if (nextStatus === "review") {
    const contentValidation = validateMnemonicRecords([record]);
    if (!contentValidation.valid) throw new Error(`Record is not ready for editorial review: ${contentValidation.issues.join("; ")}`);
  }
  if (record.origin === "ai_candidate" && ["approved", "scheduled", "published"].includes(nextStatus)) {
    throw new Error("AI-assisted candidate content must remain unpublished; create a fully re-authored editorial record instead.");
  }
  const next: MindTreeMnemonicRecord = {
    ...record,
    editorialStatus: nextStatus,
    ...(evidence.reviewerId !== undefined ? { reviewerId: evidence.reviewerId.trim() } : {}),
    ...(evidence.reviewedAt !== undefined ? { reviewedAt: evidence.reviewedAt } : {}),
    ...(evidence.publishedAt !== undefined ? { publishedAt: evidence.publishedAt } : {}),
  };
  if (["approved", "scheduled", "published"].includes(nextStatus)) {
    if (!next.reviewerId?.trim() || !next.reviewedAt || !Number.isFinite(Date.parse(next.reviewedAt))) {
      throw new Error("A real reviewer identity and valid review date are required before approval.");
    }
  }
  if (nextStatus === "published" && (!next.publishedAt || !Number.isFinite(Date.parse(next.publishedAt)))) {
    throw new Error("A recorded publication date is required before publication.");
  }
  return next;
}

export function createEditorialRewrite(
  candidate: MindTreeMnemonicRecord,
  id: string,
): MindTreeMnemonicRecord {
  if (candidate.origin !== "ai_candidate") throw new Error("Only an AI candidate can start an independent rewrite.");
  return {
    schemaVersion: MINDTREE_MNEMONIC_SCHEMA,
    id,
    character: candidate.character,
    version: 1,
    keyword: "",
    componentCues: [],
    story: "",
    readingHook: null,
    origin: "editorial",
    editorialStatus: "draft",
    provenanceRef: "first-party:kanji-mindtree:editorial-v1",
    sourceReferences: ["https://github.com/KanjiVG/kanjivg/tree/r20240807/kanji", "upstream:kanjidic2:2023-08"],
    interpretation: "memory-aid-not-etymology",
  };
}

function stableRecord(record: MindTreeMnemonicRecord): MindTreeMnemonicRecord {
  return {
    schemaVersion: record.schemaVersion,
    id: record.id,
    character: record.character,
    version: record.version,
    keyword: record.keyword,
    componentCues: [...record.componentCues],
    story: record.story,
    readingHook: record.readingHook,
    origin: record.origin,
    editorialStatus: record.editorialStatus,
    provenanceRef: record.provenanceRef,
    sourceReferences: [...record.sourceReferences],
    interpretation: record.interpretation,
    ...(record.reviewerId ? { reviewerId: record.reviewerId } : {}),
    ...(record.reviewedAt ? { reviewedAt: record.reviewedAt } : {}),
    ...(record.publishedAt ? { publishedAt: record.publishedAt } : {}),
  };
}

export function exportMnemonicRecords(records: readonly MindTreeMnemonicRecord[]): string {
  const ordered = [...records]
    .sort((left, right) => (left.character.codePointAt(0) ?? 0) - (right.character.codePointAt(0) ?? 0) || left.id.localeCompare(right.id))
    .map(stableRecord);
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

export function statusCounts(records: readonly MindTreeMnemonicRecord[]): Record<CmsStatus, number> {
  return Object.fromEntries(CMS_STATUSES.map((status) => [status, records.filter((record) => record.editorialStatus === status).length])) as Record<CmsStatus, number>;
}
