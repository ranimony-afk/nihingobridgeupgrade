/**
 * Dictionary publication resolver — Phase 13.5F.
 *
 * Pure, provider-independent overlay logic: merge canonical dictionary
 * rows with published CMS overrides. Rules:
 *
 * - 0 published overrides → canonical.
 * - 1 published override  → merged CMS representation (CMS wins per
 *   field where present; canonical fills gaps; identity/row shape stay
 *   canonical so learner DTOs are unchanged).
 * - >1 published overrides → canonical fallback + diagnostic. Never an
 *   arbitrary pick (no ORDER BY/LIMIT 1 semantics).
 * - Unparseable payload or missing headword → canonical fallback +
 *   diagnostic. The learner never sees malformed editorial content.
 * - Overrides for unknown entity ids → ignored (orphan diagnostic).
 *
 * CMS-originated items (entityId null) never reach this resolver: the
 * store filters them, and making CMS-only entities searchable is an
 * explicitly deferred search-index concern.
 */
import { parseStagedPayload } from "@/lib/cms-admin/payload";
import type {
  CanonicalDictionaryRow,
  PublicationDiagnostic,
  PublicationStore,
  PublishedDictionaryOverride,
  ResolutionSource,
  ResolvedDictionaryEntry,
} from "./types";

export function selectPublishedOverride(
  overrides: readonly PublishedDictionaryOverride[],
  entityId: string
): { status: "none" } | { status: "single"; override: PublishedDictionaryOverride } | { status: "duplicate"; count: number } {
  const matches = overrides.filter((o) => o.entityId === entityId);
  if (matches.length === 0) return { status: "none" };
  if (matches.length === 1) {
    return { status: "single", override: matches[0] as PublishedDictionaryOverride };
  }
  return { status: "duplicate", count: matches.length };
}

function asRecord(payload: unknown): Record<string, unknown> {
  return typeof payload === "object" && payload !== null && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

function nonEmpty(value: string): string | null {
  return value.trim() === "" ? null : value;
}

/**
 * Merge one override onto its canonical row. Returns the canonical row
 * untouched (source "canonical") whenever the override is unusable.
 */
export function mergeDictionaryOverride(
  canonical: CanonicalDictionaryRow,
  override: PublishedDictionaryOverride
): { entry: CanonicalDictionaryRow; source: ResolutionSource; diagnostic: PublicationDiagnostic | null } {
  const malformed = {
    entry: canonical,
    source: "canonical" as const,
    diagnostic: {
      kind: "malformed-published-payload",
      entityId: canonical.id,
    } as PublicationDiagnostic,
  };
  if (override.entityId !== canonical.id) return malformed;
  const record = asRecord(override.stagedPayload);
  if (Object.keys(record).length === 0 && typeof override.stagedPayload !== "object") {
    return malformed;
  }
  const parsed = parseStagedPayload(override.stagedPayload);
  // Headword is the display identity of a dictionary representation: an
  // override without one carries no usable editorial content.
  if (parsed.headword.trim() === "") return malformed;

  const hasKey = (key: string): boolean =>
    Object.prototype.hasOwnProperty.call(record, key);

  const entry: CanonicalDictionaryRow = {
    ...canonical,
    headword: nonEmpty(parsed.headword) ?? canonical.headword,
    reading: nonEmpty(parsed.reading) ?? canonical.reading,
    romaji: nonEmpty(parsed.romaji) ?? canonical.romaji,
    jlptLevel: nonEmpty(parsed.jlptLevel) ?? canonical.jlptLevel,
    isCommon:
      typeof record.isCommon === "boolean" ? record.isCommon : canonical.isCommon,
    partsOfSpeech: hasKey("partsOfSpeech")
      ? parsed.partsOfSpeech
      : canonical.partsOfSpeech,
    senses: parsed.senses.length > 0 ? parsed.senses : canonical.senses,
    kanjiCharacters: hasKey("kanjiCharacters")
      ? parsedKanjiCharacters(record, parsed.headword)
      : canonical.kanjiCharacters,
    tags: hasKey("tags") ? parsed.tags : canonical.tags,
    // Public-safe provenance: the CMS source ref replaces the canonical
    // one on overridden rows (both are already public fields).
    sourceRef: override.sourceRef,
  };
  return { entry, source: "cms", diagnostic: null };
}

function parsedKanjiCharacters(
  record: Record<string, unknown>,
  headword: string
): string[] {
  const raw = record.kanjiCharacters;
  if (Array.isArray(raw)) {
    return raw.filter((v): v is string => typeof v === "string");
  }
  // Payloads without an explicit list fall back to extraction so the
  // merged row keeps working kanji linkage.
  const found = headword.match(/\p{Script=Han}/gu) ?? [];
  return [...new Set(found)];
}

/**
 * Batch-merge canonical rows with published overrides. Order of the
 * input rows is preserved; unknown-entity overrides are ignored with
 * an orphan diagnostic each.
 */
export function resolveDictionaryEntries(
  canonicalRows: readonly CanonicalDictionaryRow[],
  overrides: readonly PublishedDictionaryOverride[]
): { resolved: ResolvedDictionaryEntry[]; diagnostics: PublicationDiagnostic[] } {
  const knownIds = new Set(canonicalRows.map((row) => row.id));
  const diagnostics: PublicationDiagnostic[] = [];
  const seenOrphans = new Set<string>();
  for (const override of overrides) {
    if (!knownIds.has(override.entityId) && !seenOrphans.has(override.entityId)) {
      seenOrphans.add(override.entityId);
      diagnostics.push({
        kind: "orphan-published-override",
        entityId: override.entityId,
      });
    }
  }
  const resolved = canonicalRows.map((canonical) => {
    const selection = selectPublishedOverride(overrides, canonical.id);
    if (selection.status === "none") {
      return { entry: canonical, source: "canonical" as const };
    }
    if (selection.status === "duplicate") {
      diagnostics.push({
        kind: "duplicate-published-override",
        entityId: canonical.id,
        count: selection.count,
      });
      return { entry: canonical, source: "canonical" as const };
    }
    const merged = mergeDictionaryOverride(canonical, selection.override);
    if (merged.diagnostic) diagnostics.push(merged.diagnostic);
    return { entry: merged.entry, source: merged.source };
  });
  return { resolved, diagnostics };
}

/** Fetch overrides for the given ids (empty in → empty out, no query). */
export async function fetchPublishedOverrides(
  store: PublicationStore,
  entityIds: readonly string[]
): Promise<PublishedDictionaryOverride[]> {
  if (entityIds.length === 0) return [];
  return store.findPublishedDictionaryOverrides(entityIds);
}

/**
 * Resolve learner-visible rows: fetch + merge. Throws when the store
 * fails — callers apply the canonical-fallback failure contract.
 */
export async function resolveLearnerEntries(
  store: PublicationStore,
  canonicalRows: readonly CanonicalDictionaryRow[]
): Promise<{ entries: CanonicalDictionaryRow[]; sources: Map<string, ResolutionSource>; diagnostics: PublicationDiagnostic[] }> {
  if (canonicalRows.length === 0) {
    return { entries: [], sources: new Map(), diagnostics: [] };
  }
  const overrides = await fetchPublishedOverrides(
    store,
    canonicalRows.map((row) => row.id)
  );
  const { resolved, diagnostics } = resolveDictionaryEntries(canonicalRows, overrides);
  const sources = new Map<string, ResolutionSource>();
  for (const item of resolved) sources.set(item.entry.id, item.source);
  return { entries: resolved.map((item) => item.entry), sources, diagnostics };
}
