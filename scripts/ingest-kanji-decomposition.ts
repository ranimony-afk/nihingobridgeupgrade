/**
 * Phase 14.4F — Controlled Kanji Structural Decomposition & Component Foundation.
 *
 * Deterministic, read-only derivation of kanji structural decomposition evidence
 * from the pinned KanjiVG corpus (upstream:kanjivg:2024-08, r20240807) into
 * file-based derived state (schema decision A — NO schema migration, NO database
 * writes, NO modification of first-party or 14.4C/D/E canonical state).
 *
 * Relationship classes are kept DISTINCT (never collapsed):
 *   A. Radical classification   — existing primary_radical_id (referenced only)
 *                                 + kvg:radical marks (general/tradit/nelson)
 *   B. Graphical component      — kvg:element groups (root self-group excluded)
 *   C. Component containment    — SVG group-tree parent/child (NOT an IDS tree)
 *   D. Composition role         — "phonetic" only with explicit kvg:phon evidence,
 *                                 otherwise "structural" (never fabricated)
 *   E. Position / rendered form / order — kvg:position (mapped + raw),
 *                                 renderedAs (literal shape), orderIndex
 *   F. Variant identity         — variant-named glyph files (never folded)
 *
 * IDS is NOT a source and is NOT introduced: CDP-/IDS-looking strings that occur
 * as upstream kvg:element values are stored as opaque evidence literals only.
 *
 * Provenance for every derived record: upstream:kanjivg:2024-08 (registered).
 * Forbidden historical identities may never appear as canonical provenance.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { Client } from "pg";

import { parseKanjiVgSvg } from "../src/etl/kanji/kanjiVgParser";
import { KANJIVG_SOURCE_REF, KANJIVG_VERSION } from "../src/etl/kanji/kanjiVgTransformer";
import { KANJIVG_PINNED } from "./provision-kanjivg-ci";

// ---------------------------------------------------------------------------
// Contract constants
// ---------------------------------------------------------------------------

export const DECOMPOSITION_CONTRACT = {
  phase: "14.4F",
  nodeClasses: ["KANJI", "COMPONENT"] as const,
  relationshipClasses: {
    radicalClassification: "existing kanji_entries.primary_radical_id (referenced, never written)",
    graphicalComponent: "KANJI --KVG_COMPONENT--> COMPONENT (kvg:element occurrence)",
    containment: "COMPONENT --KVG_CONTAINS--> COMPONENT | GLYPH_ROOT (SVG group tree)",
    variantIdentity: "KVG_VARIANT_GLYPH (variant-named files, never folded)",
  } as const,
  entrySourceRef: KANJIVG_SOURCE_REF, // "upstream:kanjivg:2024-08"
  sourceVersion: KANJIVG_VERSION, // "r20240807"
} as const;

export const FORBIDDEN_PROVENANCE_IDENTITIES = [
  "kanjivg:0.99",
  "upstream:kanjivg:0.99",
  "kanjivg:2024-04",
  "upstream:kanjivg:2024-04",
  "kanjidic2:2024-03",
  "upstream:kanjidic2:2024-03",
] as const;

/**
 * Position mapping: raw KanjiVG kvg:position → canonical composition position
 * categories supported by the existing contract (kanji_composition.position
 * usage: left | right | top | bottom | middle | enclosure | anywhere; curated
 * rows also use bottom-left / bottom-right). Raw evidence is always preserved.
 *
 * Observed corpus values (16): the 15 declared below plus the single anomalous
 * value `倠` (081ba-Kaisho.svg g3 echoes its own element). That anomaly is
 * variant-file-only evidence: it is never mapped (position = null, positionRaw
 * preserved) and never fabricated into a category.
 */
export const POSITION_MAP: Record<string, string> = {
  left: "left",
  right: "right",
  top: "top",
  bottom: "bottom",
  middle: "middle",
  tare: "enclosure",
  tarec: "enclosure",
  kamae: "enclosure",
  kamaec: "enclosure",
  nyo: "enclosure",
  nyoc: "enclosure",
  // Upstream position labels written with IDS-operator glyphs (evidence only —
  // mapped to the enclosure POSITION category; no IDS semantics claimed).
  "\u2FF5A": "enclosure", // ⿵A
  "\u2FF5B": "enclosure", // ⿵B
  "\u2FF61": "enclosure", // ⿶1
  "\u2FF62": "enclosure", // ⿶2
};

export const CONTRACT_POSITIONS = [
  "left",
  "right",
  "top",
  "bottom",
  "middle",
  "enclosure",
  "anywhere",
  "bottom-left",
  "bottom-right",
] as const;

export const CONTRACT_ROLES = ["semantic", "phonetic", "positional", "structural"] as const;

// ---------------------------------------------------------------------------
// Canonical serialization (shared convention with 14.4D/14.4E)
// ---------------------------------------------------------------------------

export function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) out[key] = sortDeep(src[key]);
    return out;
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

// ---------------------------------------------------------------------------
// Derived record shapes (canonical composition model + provenance + evidence)
// ---------------------------------------------------------------------------

export interface ComponentRecord {
  /** Canonical identity family: comp-${kanjiId}-${elementId}-${orderIndex} */
  id: string;
  /**
   * Glyph identity this component belongs to: `kanji-${character}` for canonical
   * kanji, `src:${hex}` for source-only KanjiVG glyphs (kana/latin/CDP/…) which
   * are classified and never attached to kanji_entries.
   */
  kanjiId: string;
  glyphClass: "kanji" | "source-only";
  character: string;
  /** Component identity: kanji_radicals.id when matched, else kvg-el:${literal}. */
  elementId: string;
  /** Raw kvg:element literal as it appears in the source (opaque evidence). */
  elementLiteral: string;
  /** Shape as it actually appears inside the kanji (canonical rendered_as). */
  renderedAs: string;
  /** "phonetic" (with kvg:phon evidence) | "structural" — never fabricated. */
  role: string;
  /** kvg:phon value when present (evidence; may hold alternatives like 厶/弗). */
  phonetic: string | null;
  /** Mapped contract position category (null when unmapped). */
  position: string | null;
  /** Raw kvg:position evidence. */
  positionRaw: string | null;
  orderIndex: number;
  /** kvg:part */
  part: number | null;
  /** kvg:number */
  number: number | null;
  /** kvg:radical mark (general|tradit|nelson) — radical classification evidence, NOT role. */
  radicalType: string | null;
  /** kvg:original when kvg:variant="true" — variant ≠ normalized identity. */
  variantOf: string | null;
  variantMarked: boolean;
  tradForm: boolean;
  radicalForm: boolean;
  partial: boolean;
  /** 1-based stroke orders inside this component (containment evidence). */
  strokeOrders: number[];
  /** orderIndex of nearest ancestor component; -1 = direct child of glyph root. */
  parentIndex: number;
  depth: number;
  provenance: string;
  evidence: { file: string; groupId: string; strokeIds: string[] };
}

export interface ContainmentRecord {
  /** Canonical identity family: cont-${kanjiId}-${parentIndex}-${childIndex} */
  id: string;
  /** Same glyph identity namespace as ComponentRecord.kanjiId. */
  kanjiId: string;
  glyphClass: "kanji" | "source-only";
  character: string;
  parentIndex: number;
  childIndex: number;
  parentLiteral: string;
  childLiteral: string;
  provenance: string;
  evidence: { file: string; parentGroupId: string; childGroupId: string };
}

export interface VariantRecord {
  /** kvg-var-${primaryHex}-${variantType} */
  id: string;
  /** Literal codepoint of the variant glyph file's primary hex (never folded). */
  character: string;
  unicode: string;
  primaryHex: string;
  variantType: string;
  /** Rendered element of the variant root group (evidence). */
  renderedElement: string | null;
  /** Whether the variant's primary glyph maps to a canonical kanji row. */
  attachedToCanonical: boolean;
  isCompatibilityIdeograph: boolean;
  provenance: string;
  evidence: { file: string; rootGroupId: string | null };
}

export interface DecompositionMetrics {
  standardFiles: number;
  variantFiles: number;
  totalFiles: number;
  elementGroupsTotal: number;
  rootGroups: number;
  componentRows: number;
  canonicalComponentRows: number;
  sourceOnlyComponentRows: number;
  sourceOnlyElementGroups: number;
  containmentRows: number;
  variantRows: number;
  variantTypeRows: number;
  radicalMarkedComponents: number;
  phoneticComponents: number;
  variantMarkedComponents: number;
  kanjiWithComponents: number;
  kanjiWithComponentRows: number;
  kanjiWithoutComponents: number;
  sourceOnlyCharacters: number;
  canonicalOnlyWithoutGlyph: number;
  attachedVariantFiles: number;
  unattachedVariantFiles: number;
  compatibilityVariantFiles: number;
  multiCharElementLiterals: number;
  invalidEdges: number;
  duplicates: number;
  provenanceViolations: number;
  malformedGlyphs: number;
  identityMismatches: number;
}

export interface DecompositionState {
  contract: typeof DECOMPOSITION_CONTRACT;
  metrics: DecompositionMetrics;
  classification: {
    sourceOnlyCharacters: string[];
    canonicalOnlyWithoutGlyphCount: number;
    elementIdentityUnresolved: string[];
  };
  sourceIdentity: {
    repository: string;
    tag: string;
    commit: string;
    sourceRef: string;
    archiveSha256: string;
    indexSha256: string;
    corpusSvgFiles: number;
  };
  componentsDigest: string;
  containmentDigest: string;
  variantsDigest: string;
  idsDigest: string;
  provenanceDigest: string;
  graphDigest: string;
  /** Distinct variant-style suffix types (Gate-0: 88) with per-type file counts. */
  variantTypes: Array<{ type: string; files: number }>;
}

export interface DerivedDecomposition {
  state: Omit<DecompositionState, "graphDigest">;
  components: ComponentRecord[];
  containment: ContainmentRecord[];
  variants: VariantRecord[];
}

// ---------------------------------------------------------------------------
// Deterministic identities
// ---------------------------------------------------------------------------

export function deriveComponentId(
  kanjiId: string,
  elementId: string,
  orderIndex: number
): string {
  return `comp-${kanjiId}-${elementId}-${orderIndex}`;
}

export function deriveContainmentId(
  kanjiId: string,
  parentIndex: number,
  childIndex: number
): string {
  return `cont-${kanjiId}-${parentIndex}-${childIndex}`;
}

export function deriveVariantId(primaryHex: string, variantType: string): string {
  return `kvg-var-${primaryHex}-${variantType || "std"}`;
}

// ---------------------------------------------------------------------------
// Fail-closed validation (§10 rejection matrix)
// ---------------------------------------------------------------------------

export function validateComponentRecord(rec: ComponentRecord): void {
  if (
    !rec.id ||
    !rec.kanjiId ||
    !rec.character ||
    !rec.elementId ||
    !rec.elementLiteral ||
    !rec.renderedAs
  ) {
    throw new Error(`[DECOMP_IDENTITY] STOP — MALFORMED COMPONENT RECORD: ${rec.id}`);
  }
  if (
    rec.id !== deriveComponentId(rec.kanjiId, rec.elementId, rec.orderIndex)
  ) {
    throw new Error(
      `[DECOMP_IDENTITY] STOP — MALFORMED COMPONENT IDENTITY: ${rec.id} != comp-${rec.kanjiId}-${rec.elementId}-${rec.orderIndex}`
    );
  }
  if (rec.glyphClass !== "kanji" && rec.glyphClass !== "source-only") {
    throw new Error(`[DECOMP_IDENTITY] STOP — INVALID GLYPH CLASS: ${rec.glyphClass}`);
  }
  if (rec.glyphClass === "kanji" && rec.kanjiId.startsWith("src:")) {
    throw new Error(`[DECOMP_IDENTITY] STOP — KANJI ROW WITH SOURCE-ONLY IDENTITY: ${rec.id}`);
  }
  if (rec.glyphClass === "source-only" && !rec.kanjiId.startsWith("src:")) {
    throw new Error(`[DECOMP_IDENTITY] STOP — SOURCE-ONLY ROW ATTACHED TO KANJI IDENTITY: ${rec.id}`);
  }
  if (!(CONTRACT_ROLES as readonly string[]).includes(rec.role)) {
    throw new Error(`[DECOMP_SEMANTICS] STOP — INVALID ROLE: ${rec.role}`);
  }
  if (rec.position !== null && !(CONTRACT_POSITIONS as readonly string[]).includes(rec.position)) {
    throw new Error(`[DECOMP_SEMANTICS] STOP — INVALID POSITION: ${rec.position}`);
  }
  if (rec.role === "phonetic" && !rec.phonetic) {
    throw new Error(`[DECOMP_SEMANTICS] STOP — PHONETIC ROLE WITHOUT EVIDENCE: ${rec.id}`);
  }
  if (rec.provenance !== DECOMPOSITION_CONTRACT.entrySourceRef) {
    throw new Error(`[DECOMP_PROVENANCE] STOP — WRONG SOURCE IDENTITY: ${rec.provenance}`);
  }
  for (const bad of FORBIDDEN_PROVENANCE_IDENTITIES) {
    if ((rec.provenance as string) === (bad as string)) {
      throw new Error(`[DECOMP_PROVENANCE] STOP — FORBIDDEN SOURCE REFERENCE: ${bad}`);
    }
  }
  if (!Array.isArray(rec.strokeOrders) || rec.strokeOrders.some((n) => !Number.isInteger(n) || n < 1)) {
    throw new Error(`[DECOMP_IDENTITY] STOP — INVALID STROKE MEMBERSHIP: ${rec.id}`);
  }
  if (rec.parentIndex < -1 || rec.parentIndex >= rec.orderIndex) {
    throw new Error(`[DECOMP_IDENTITY] STOP — INVALID CONTAINMENT PARENT: ${rec.id}`);
  }
}

export function validateContainmentRecord(rec: ContainmentRecord): void {
  if (
    rec.id !== deriveContainmentId(rec.kanjiId, rec.parentIndex, rec.childIndex) ||
    !rec.kanjiId ||
    rec.childIndex < 0 ||
    rec.parentIndex < -1 ||
    rec.parentIndex >= rec.childIndex
  ) {
    throw new Error(`[DECOMP_IDENTITY] STOP — MALFORMED CONTAINMENT: ${rec.id}`);
  }
  if (rec.provenance !== DECOMPOSITION_CONTRACT.entrySourceRef) {
    throw new Error(`[DECOMP_PROVENANCE] STOP — WRONG SOURCE IDENTITY: ${rec.provenance}`);
  }
}

export function validateVariantRecord(rec: VariantRecord): void {
  if (
    rec.id !== deriveVariantId(rec.primaryHex, rec.variantType) ||
    !rec.character ||
    !rec.unicode
  ) {
    throw new Error(`[DECOMP_IDENTITY] STOP — MALFORMED VARIANT: ${rec.id}`);
  }
  if (rec.provenance !== DECOMPOSITION_CONTRACT.entrySourceRef) {
    throw new Error(`[DECOMP_PROVENANCE] STOP — WRONG SOURCE IDENTITY: ${rec.provenance}`);
  }
}

export function validateDerivedSets(
  components: ComponentRecord[],
  containment: ContainmentRecord[],
  variants: VariantRecord[]
): void {
  const ids = new Set<string>();
  for (const rec of components) {
    validateComponentRecord(rec);
    if (ids.has(rec.id)) {
      throw new Error(`[DECOMP_IDENTITY] STOP — DUPLICATE DETERMINISTIC EDGE: ${rec.id}`);
    }
    ids.add(rec.id);
  }
  for (const rec of containment) {
    validateContainmentRecord(rec);
    if (ids.has(rec.id)) {
      throw new Error(`[DECOMP_IDENTITY] STOP — DUPLICATE DETERMINISTIC EDGE: ${rec.id}`);
    }
    ids.add(rec.id);
  }
  for (const rec of variants) {
    validateVariantRecord(rec);
    if (ids.has(rec.id)) {
      throw new Error(`[DECOMP_IDENTITY] STOP — DUPLICATE DETERMINISTIC EDGE: ${rec.id}`);
    }
    ids.add(rec.id);
  }
}

// ---------------------------------------------------------------------------
// Canonical DB baseline (zero writes — digests must be byte-identical)
// ---------------------------------------------------------------------------

export interface CanonicalBaseline {
  kanjiCount: number;
  kanjiDigest: string;
  dictionaryCount: number;
  dictionaryDigest: string;
  radicalCount: string | number;
  compositionCount: string | number;
}

export async function collectCanonicalBaseline(): Promise<CanonicalBaseline> {
  const client = new Client({
    connectionString:
      process.env.DATABASE_URL ||
      "postgresql://nihongo:nihongo@127.0.0.1:5432/app_db",
  });
  await client.connect();
  try {
    const kanji = (
      await client.query(
        `SELECT count(*)::int AS n, md5(string_agg(id || '|' || character || '|' || stroke_count || '|' || source_ref, ',' ORDER BY id)) AS d FROM kanji_entries`
      )
    ).rows[0];
    const dict = (
      await client.query(
        `SELECT count(*)::int AS n, md5(string_agg(id || '|' || headword || '|' || reading || '|' || romaji, ',' ORDER BY id)) AS d FROM dictionary_entries`
      )
    ).rows[0];
    const radicals = (
      await client.query(`SELECT count(*)::int AS n FROM kanji_radicals`)
    ).rows[0];
    const composition = (
      await client.query(`SELECT count(*)::int AS n FROM kanji_composition`)
    ).rows[0];
    return {
      kanjiCount: kanji.n,
      kanjiDigest: kanji.d,
      dictionaryCount: dict.n,
      dictionaryDigest: dict.d,
      radicalCount: radicals.n,
      compositionCount: composition.n,
    };
  } finally {
    await client.end();
  }
}

export function verifyCanonicalBaseline(b: CanonicalBaseline): void {
  if (b.kanjiCount !== 13108) {
    throw new Error(`[DECOMP_BASELINE] STOP — KANJI COUNT ${b.kanjiCount} != 13108`);
  }
  if (b.dictionaryCount !== 206747) {
    throw new Error(
      `[DECOMP_BASELINE] STOP — DICTIONARY COUNT ${b.dictionaryCount} != 206747`
    );
  }
  if (b.kanjiDigest !== "4e2b27a3249661c87241fd3637160ae7") {
    throw new Error(`[DECOMP_BASELINE] STOP — KANJI DIGEST MISMATCH`);
  }
  if (b.dictionaryDigest !== "42907c1d35e1151d64dd57cdef1eddab") {
    throw new Error(`[DECOMP_BASELINE] STOP — DICTIONARY DIGEST MISMATCH`);
  }
}

// ---------------------------------------------------------------------------
// Source identity (reuses 14.4D pinned identity — never re-pins)
// ---------------------------------------------------------------------------

export function verifySourceIdentity(dataDir: string): {
  archiveSha256: string;
  indexSha256: string;
  corpusSvgFiles: number;
} {
  const archivePath = resolve(dataDir, KANJIVG_PINNED.archive.filename);
  const indexPath = resolve(dataDir, KANJIVG_PINNED.index.filename);
  const corpusDir = resolve(dataDir, "kanjivg");
  if (!existsSync(archivePath) || !existsSync(indexPath) || !existsSync(corpusDir)) {
    throw new Error(`[DECOMP_SOURCE] STOP — KANJIVG SOURCE MISSING (run provision-kanjivg-ci)`);
  }
  const archiveSha = sha256Hex(readFileSync(archivePath));
  if (
    archiveSha !== KANJIVG_PINNED.archive.sha256 ||
    readFileSync(archivePath).length !== KANJIVG_PINNED.archive.compressedSize
  ) {
    throw new Error(`[DECOMP_SOURCE] STOP — ARCHIVE IDENTITY MISMATCH`);
  }
  const indexBytes = readFileSync(indexPath);
  const indexSha = sha256Hex(indexBytes);
  if (indexSha !== KANJIVG_PINNED.index.sha256 || indexBytes.length !== KANJIVG_PINNED.index.size) {
    throw new Error(`[DECOMP_SOURCE] STOP — INDEX IDENTITY MISMATCH`);
  }
  const svgFiles = readdirSync(corpusDir).filter((f) => f.endsWith(".svg"));
  if (svgFiles.length !== KANJIVG_PINNED.corpus.svgFiles) {
    throw new Error(`[DECOMP_SOURCE] STOP — CORPUS COUNT ${svgFiles.length} != ${KANJIVG_PINNED.corpus.svgFiles}`);
  }
  return { archiveSha256: archiveSha, indexSha256: indexSha, corpusSvgFiles: svgFiles.length };
}

// ---------------------------------------------------------------------------
// Per-glyph evidence extraction (pure, deterministic)
// ---------------------------------------------------------------------------

interface RawGroup {
  groupId: string | null;
  attrs: Record<string, string>;
  elementGroupIndex: number | null; // index into elementGroups when kvg:element present
  strokeOrders: number[];
  strokeIds: string[];
}

export interface GlyphEvidence {
  character: string;
  rootElement: string | null;
  groups: Array<{
    groupId: string | null;
    element: string;
    positionRaw: string | null;
    radicalType: string | null;
    part: number | null;
    number: number | null;
    phonetic: string | null;
    variantMarked: boolean;
    variantOf: string | null;
    tradForm: boolean;
    radicalForm: boolean;
    partial: boolean;
    strokeOrders: number[];
    strokeIds: string[];
    parentElementIndex: number | null; // null = parent is glyph root; -1 impossible
    isRoot: boolean;
    depth: number;
  }>;
  strokeCount: number;
}

function parseAttrs(attrText: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w:]+)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrText)) !== null) out[m[1]] = m[2];
  return out;
}

/**
 * Deterministic group-tree evidence walk over a KanjiVG SVG. Uses the security-
 * validated SVG content from the 14.4D parser; extracts nesting, stroke
 * membership and the kvg:phon/variant/original/form attributes the base parser
 * does not surface. No IDS semantics are inferred: group nesting is treated as
 * the upstream group-containment evidence it is.
 */
export function extractGlyphEvidence(svgContent: string, character: string): GlyphEvidence {
  const groups: GlyphEvidence["groups"] = [];
  const stack: RawGroup[] = [];
  let strokeCount = 0;
  let rootElement: string | null = null;

  const tokenRe = /<g\b([^>]*)>|<\/g>|<path\b([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(svgContent)) !== null) {
    if (m[0] === "</g>") {
      stack.pop();
      continue;
    }
    if (m[2] !== undefined) {
      // <path ...>
      const attrs = parseAttrs(m[2]);
      const idMatch = attrs.id?.match(/-s(\d+)$/);
      const order = idMatch ? parseInt(idMatch[1], 10) : ++strokeCount;
      strokeCount = Math.max(strokeCount, order);
      const deepest = [...stack].reverse().find((g) => g.elementGroupIndex !== null);
      if (deepest) {
        deepest.strokeOrders.push(order);
        if (attrs.id) deepest.strokeIds.push(attrs.id);
      }
      continue;
    }
    // <g ...>
    const attrs = parseAttrs(m[1]);
    const node: RawGroup = {
      groupId: attrs.id ?? null,
      attrs,
      elementGroupIndex: null,
      strokeOrders: [],
      strokeIds: [],
    };
    if (attrs["kvg:element"] !== undefined) {
      const isRoot = groups.length === 0;
      const parentEl = [...stack].reverse().find((g) => g.elementGroupIndex !== null);
      groups.push({
        groupId: node.groupId,
        element: attrs["kvg:element"],
        positionRaw: attrs["kvg:position"] ?? null,
        radicalType: attrs["kvg:radical"] ?? null,
        part: attrs["kvg:part"] ? parseInt(attrs["kvg:part"], 10) : null,
        number: attrs["kvg:number"] ? parseInt(attrs["kvg:number"], 10) : null,
        phonetic: attrs["kvg:phon"] ?? null,
        variantMarked: attrs["kvg:variant"] === "true",
        variantOf: attrs["kvg:original"] ?? null,
        tradForm: attrs["kvg:tradForm"] !== undefined,
        radicalForm: attrs["kvg:radicalForm"] !== undefined,
        partial: attrs["kvg:partial"] !== undefined,
        strokeOrders: node.strokeOrders,
        strokeIds: node.strokeIds,
        parentElementIndex: isRoot ? null : parentEl ? parentEl.elementGroupIndex : null,
        isRoot,
        depth: 0,
      });
      node.elementGroupIndex = groups.length - 1;
      if (isRoot) {
        rootElement = attrs["kvg:element"];
        if (rootElement !== character) {
          throw new Error(
            `[DECOMP_IDENTITY] STOP — GLYPH IDENTITY MISMATCH: root ${rootElement} != ${character}`
          );
        }
      }
    }
    stack.push(node);
  }

  // depth calculation (root = 0)
  for (let i = 0; i < groups.length; i++) {
    let d = 0;
    let p = groups[i].parentElementIndex;
    while (p !== null) {
      d++;
      p = groups[p].parentElementIndex;
    }
    groups[i].depth = d;
  }

  // Fail closed: a standard KanjiVG glyph without any element-group identity is
  // malformed — nothing may be derived and nothing may be fabricated from it.
  if (rootElement === null || groups.length === 0) {
    throw new Error(
      `[DECOMP_IDENTITY] STOP — MALFORMED/UNSAFE SVG: NO GROUP IDENTITY FOR ${character}`
    );
  }

  return { character, rootElement, groups, strokeCount };
}

// ---------------------------------------------------------------------------
// Pure derivation (§: read-only, no database writes)
// ---------------------------------------------------------------------------

export interface DeriveOptions {
  dataDir?: string;
  claimedSourceRef?: string;
}

export async function deriveKanjiDecomposition(
  options?: DeriveOptions
): Promise<DerivedDecomposition> {
  // Provenance claim gate (§10: wrong source identity → reject before mutation)
  const claimed = options?.claimedSourceRef ?? DECOMPOSITION_CONTRACT.entrySourceRef;
  if (claimed !== DECOMPOSITION_CONTRACT.entrySourceRef) {
    throw new Error(
      `[DECOMP_PROVENANCE] STOP — WRONG SOURCE IDENTITY CLAIM: ${claimed} != ${DECOMPOSITION_CONTRACT.entrySourceRef}`
    );
  }

  const dataDir = options?.dataDir ?? resolve(process.cwd(), "data");
  const sourceIdentity = verifySourceIdentity(dataDir);

  // Canonical DB load (read-only)
  const client = new Client({
    connectionString:
      process.env.DATABASE_URL ||
      "postgresql://nihongo:nihongo@127.0.0.1:5432/app_db",
  });
  let kanjiRows: Array<{ id: string; character: string; source_ref: string }>;
  let radicalRows: Array<{
    id: string;
    character: string;
    alt_forms: string[] | null;
  }>;
  try {
    await client.connect();
    kanjiRows = (
      await client.query(
        `SELECT id, character, source_ref FROM kanji_entries ORDER BY character`
      )
    ).rows as typeof kanjiRows;
    radicalRows = (
      await client.query(
        `SELECT id, character, alt_forms FROM kanji_radicals`
      )
    ).rows as typeof radicalRows;
  } finally {
    await client.end();
  }

  const kanjiByChar = new Map(kanjiRows.map((r) => [r.character, r]));
  const radicalByChar = new Map<string, string>();
  const radicalByAlt = new Map<string, string>();
  for (const r of radicalRows) {
    if (!radicalByChar.has(r.character)) radicalByChar.set(r.character, r.id);
    for (const alt of r.alt_forms ?? []) {
      if (!radicalByAlt.has(alt)) radicalByAlt.set(alt, r.id);
    }
  }

  const corpusDir = resolve(dataDir, "kanjivg");
  const allFiles = readdirSync(corpusDir).filter((f) => f.endsWith(".svg"));
  const standardFiles = allFiles.filter((f) => /^[0-9a-f]{4,5}\.svg$/.test(f));
  const variantFiles = allFiles.filter((f) => !/^[0-9a-f]{4,5}\.svg$/.test(f));

  const components: ComponentRecord[] = [];
  const containment: ContainmentRecord[] = [];
  const variants: VariantRecord[] = [];
  const sourceOnly: string[] = [];
  const unresolvedElements = new Set<string>();
  const referencedKanji = new Set<string>();
  let elementGroupsTotal = 0;
  let rootGroups = 0;
  let sourceOnlyElementGroups = 0;
  let radicalMarked = 0;
  let phoneticCount = 0;
  let variantMarkedCount = 0;
  let multiCharLiterals = 0;
  let malformedGlyphs = 0;

  const resolveElementId = (identityLiteral: string): string => {
    const norm = identityLiteral.normalize("NFC");
    const direct = radicalByChar.get(norm);
    if (direct) return direct;
    const alt = radicalByAlt.get(norm);
    if (alt) return alt;
    unresolvedElements.add(identityLiteral);
    return `kvg-el:${norm}`;
  };

  for (const file of standardFiles) {
    const hex = file.replace(".svg", "");
    const character = String.fromCodePoint(parseInt(hex, 16));
    const svgRaw = readFileSync(resolve(corpusDir, file), "utf-8");

    // 14.4D parser: verified security semantics (malformed/unsafe SVG → reject)
    const parsed = parseKanjiVgSvg(svgRaw, file);
    if (!parsed.isSafe || parsed.securityDiagnostics.length > 0) {
      throw new Error(
        `[DECOMP_SOURCE] STOP — MALFORMED SVG REJECTED: ${file} (${parsed.securityDiagnostics.join("; ")})`
      );
    }

    const kanji = kanjiByChar.get(character);
    if (!kanji) {
      // Known class (Gate-0: 286 source-only characters) — classified, never
      // attached to kanji_entries. Their real structure is still derived below
      // under the `src:${hex}` glyph identity so nothing is silently omitted.
      sourceOnly.push(character);
    } else {
      referencedKanji.add(character);
    }
    const glyphIdentity = kanji ? kanji.id : `src:${hex}`;
    const glyphClass: "kanji" | "source-only" = kanji ? "kanji" : "source-only";

    const evidence = extractGlyphEvidence(svgRaw, character);
    elementGroupsTotal += evidence.groups.length;
    rootGroups += 1;
    if (!kanji) sourceOnlyElementGroups += evidence.groups.length;

    const compIndexByGroup = new Map<number, number>();
    const fileComponents: ComponentRecord[] = [];
    let orderIndex = 0;
    for (let gi = 0; gi < evidence.groups.length; gi++) {
      const g = evidence.groups[gi];
      if (g.isRoot) continue; // glyph self-identity is not a component

      const identityLiteral = g.variantMarked && g.variantOf ? g.variantOf : g.element;
      const elementId = resolveElementId(identityLiteral);
      if ([...g.element].length !== 1) multiCharLiterals++;

      const parentComponentIndex =
        g.parentElementIndex === null
          ? -1 // direct child of glyph root
          : (compIndexByGroup.get(g.parentElementIndex) ?? -1);

      const rec: ComponentRecord = {
        id: deriveComponentId(glyphIdentity, elementId, orderIndex),
        kanjiId: glyphIdentity,
        glyphClass,
        character,
        elementId,
        elementLiteral: g.element,
        renderedAs: g.element,
        role: g.phonetic ? "phonetic" : "structural",
        phonetic: g.phonetic,
        position: g.positionRaw ? POSITION_MAP[g.positionRaw] ?? null : null,
        positionRaw: g.positionRaw,
        orderIndex,
        part: g.part,
        number: g.number,
        radicalType: g.radicalType,
        variantOf: g.variantMarked ? g.variantOf : null,
        variantMarked: g.variantMarked,
        tradForm: g.tradForm,
        radicalForm: g.radicalForm,
        partial: g.partial,
        strokeOrders: [...new Set(g.strokeOrders)].sort((a, b) => a - b),
        parentIndex: parentComponentIndex,
        depth: g.depth,
        provenance: DECOMPOSITION_CONTRACT.entrySourceRef,
        evidence: {
          file: `kanjivg/${file}`,
          groupId: g.groupId ?? "",
          strokeIds: [...g.strokeIds],
        },
      };
      validateComponentRecord(rec);
      components.push(rec);
      fileComponents.push(rec);
      compIndexByGroup.set(gi, orderIndex);
      if (g.radicalType) radicalMarked++;
      if (g.phonetic) phoneticCount++;
      if (g.variantMarked) variantMarkedCount++;
      orderIndex++;
    }
    // containment edges (parent → child), root parent = -1
    for (const rec of fileComponents) {
      const childG = evidence.groups.find((g) => g.groupId === rec.evidence.groupId);
      const parentGroupId =
        rec.parentIndex === -1
          ? evidence.groups[0]?.groupId ?? ""
          : childG && childG.parentElementIndex !== null
            ? evidence.groups[childG.parentElementIndex]?.groupId ?? ""
            : "";
      const parentLiteral =
        rec.parentIndex === -1
          ? evidence.rootElement ?? character
          : fileComponents.find((c) => c.orderIndex === rec.parentIndex)?.elementLiteral ??
            evidence.groups[0]?.element ??
            character;
      const cont: ContainmentRecord = {
        id: deriveContainmentId(glyphIdentity, rec.parentIndex, rec.orderIndex),
        kanjiId: glyphIdentity,
        glyphClass,
        character,
        parentIndex: rec.parentIndex,
        childIndex: rec.orderIndex,
        parentLiteral,
        childLiteral: rec.elementLiteral,
        provenance: DECOMPOSITION_CONTRACT.entrySourceRef,
        evidence: {
          file: `kanjivg/${file}`,
          parentGroupId,
          childGroupId: rec.evidence.groupId,
        },
      };
      validateContainmentRecord(cont);
      containment.push(cont);
    }
  }

  for (const file of variantFiles) {
    const base = file.replace(/\.svg$/, "");
    const m = base.match(/^([0-9a-f]{4,5})-(.+)$/);
    if (!m) {
      throw new Error(`[DECOMP_SOURCE] STOP — MALFORMED VARIANT FILENAME: ${file}`);
    }
    const [, hex, variantType] = m;
    const character = String.fromCodePoint(parseInt(hex, 16));
    const svgRaw = readFileSync(resolve(corpusDir, file), "utf-8");
    const parsed = parseKanjiVgSvg(svgRaw, file);
    if (!parsed.isSafe || parsed.securityDiagnostics.length > 0) {
      throw new Error(`[DECOMP_SOURCE] STOP — MALFORMED SVG REJECTED: ${file}`);
    }
    const rootEl = svgRaw.match(/<g\b[^>]*kvg:element="([^"]*)"/)?.[1] ?? null;
    const rec: VariantRecord = {
      id: deriveVariantId(hex, variantType),
      character,
      unicode: `U+${hex.toUpperCase()}`,
      primaryHex: hex,
      variantType,
      renderedElement: rootEl,
      attachedToCanonical: kanjiByChar.has(character),
      isCompatibilityIdeograph: parseInt(hex, 16) >= 0xf900 && parseInt(hex, 16) <= 0xfaff,
      provenance: DECOMPOSITION_CONTRACT.entrySourceRef,
      evidence: {
        file: `kanjivg/${file}`,
        rootGroupId: svgRaw.match(/<g\b[^>]*\bid="(kvg:[^"]+)"/)?.[1] ?? null,
      },
    };
    validateVariantRecord(rec);
    variants.push(rec);
  }

  // Deterministic ordering
  components.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  containment.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  variants.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  validateDerivedSets(components, containment, variants);

  const zeroRefKanji = kanjiRows.filter((k) => !referencedKanji.has(k.character)).length;
  const canonicalComponentRows = components.filter((c) => c.glyphClass === "kanji").length;
  const sourceOnlyComponentRows = components.filter((c) => c.glyphClass === "source-only").length;
  const kanjiWithComponentRows = new Set(
    components.filter((c) => c.glyphClass === "kanji").map((c) => c.kanjiId)
  ).size;
  const variantTypeMap = new Map<string, number>();
  for (const v of variants) {
    variantTypeMap.set(v.variantType, (variantTypeMap.get(v.variantType) ?? 0) + 1);
  }
  const variantTypes = [...variantTypeMap.entries()]
    .map(([type, files]) => ({ type, files }))
    .sort((a, b) => (a.type < b.type ? -1 : 1));
  const metrics: DecompositionMetrics = {
    standardFiles: standardFiles.length,
    variantFiles: variantFiles.length,
    totalFiles: allFiles.length,
    elementGroupsTotal,
    rootGroups,
    componentRows: components.length,
    canonicalComponentRows,
    sourceOnlyComponentRows,
    sourceOnlyElementGroups,
    containmentRows: containment.length,
    variantRows: variants.length,
    variantTypeRows: variantTypes.length,
    radicalMarkedComponents: radicalMarked,
    phoneticComponents: phoneticCount,
    variantMarkedComponents: variantMarkedCount,
    kanjiWithComponents: referencedKanji.size,
    kanjiWithComponentRows,
    kanjiWithoutComponents: zeroRefKanji,
    sourceOnlyCharacters: sourceOnly.length,
    canonicalOnlyWithoutGlyph: zeroRefKanji,
    attachedVariantFiles: variants.filter((v) => v.attachedToCanonical).length,
    unattachedVariantFiles: variants.filter((v) => !v.attachedToCanonical).length,
    compatibilityVariantFiles: variants.filter((v) => v.isCompatibilityIdeograph).length,
    multiCharElementLiterals: multiCharLiterals,
    invalidEdges: 0,
    duplicates: 0,
    provenanceViolations: 0,
    malformedGlyphs,
    identityMismatches: 0,
  };

  const componentsDigest = sha256Hex(canonicalJson(components));
  const containmentDigest = sha256Hex(canonicalJson(containment));
  const variantsDigest = sha256Hex(canonicalJson(variants));
  const idsDigest = sha256Hex(
    [...components.map((c) => c.id), ...containment.map((c) => c.id), ...variants.map((v) => v.id)].join("\n")
  );
  const provenanceDigest = sha256Hex(
    [...components, ...containment, ...variants]
      .map((r) => `${r.id}|${r.provenance}`)
      .join("\n")
  );

  return {
    state: {
      contract: DECOMPOSITION_CONTRACT,
      metrics,
      classification: {
        sourceOnlyCharacters: sourceOnly.sort(),
        canonicalOnlyWithoutGlyphCount: zeroRefKanji,
        elementIdentityUnresolved: [...unresolvedElements].sort(),
      },
      sourceIdentity: {
        repository: KANJIVG_PINNED.repository,
        tag: KANJIVG_PINNED.tag,
        commit: KANJIVG_PINNED.commit,
        sourceRef: DECOMPOSITION_CONTRACT.entrySourceRef,
        archiveSha256: sourceIdentity.archiveSha256,
        indexSha256: sourceIdentity.indexSha256,
        corpusSvgFiles: sourceIdentity.corpusSvgFiles,
      },
      componentsDigest,
      containmentDigest,
      variantsDigest,
      idsDigest,
      provenanceDigest,
      variantTypes,
    },
    components,
    containment,
    variants,
  };
}

// ---------------------------------------------------------------------------
// Derived-state publish (staged → verified → atomic; rollback-safe)
// ---------------------------------------------------------------------------

export function computeGraphDigest(state: Record<string, unknown>): string {
  return sha256Hex(canonicalJson(state));
}

export function verifyExistingDecompositionState(stateDir: string): void {
  const statePath = resolve(stateDir, "state.json");
  const compPath = resolve(stateDir, "components.json");
  const contPath = resolve(stateDir, "containment.json");
  const varPath = resolve(stateDir, "variants.json");
  for (const p of [statePath, compPath, contPath, varPath]) {
    if (!existsSync(p)) {
      throw new Error(`[DECOMP_BASELINE] STOP — CORRUPTED DERIVED STATE: missing ${p}`);
    }
  }
  const state = JSON.parse(readFileSync(statePath, "utf-8")) as DecompositionState;
  const components = JSON.parse(readFileSync(compPath, "utf-8")) as ComponentRecord[];
  const containment = JSON.parse(readFileSync(contPath, "utf-8")) as ContainmentRecord[];
  const variants = JSON.parse(readFileSync(varPath, "utf-8")) as VariantRecord[];
  if (sha256Hex(canonicalJson(components)) !== state.componentsDigest) {
    throw new Error(`[DECOMP_BASELINE] STOP — CORRUPTED DERIVED STATE: components digest mismatch`);
  }
  if (sha256Hex(canonicalJson(containment)) !== state.containmentDigest) {
    throw new Error(`[DECOMP_BASELINE] STOP — CORRUPTED DERIVED STATE: containment digest mismatch`);
  }
  if (sha256Hex(canonicalJson(variants)) !== state.variantsDigest) {
    throw new Error(`[DECOMP_BASELINE] STOP — CORRUPTED DERIVED STATE: variants digest mismatch`);
  }
  const { graphDigest, ...body } = state;
  if (computeGraphDigest(body as Record<string, unknown>) !== graphDigest) {
    throw new Error(`[DECOMP_BASELINE] STOP — CORRUPTED DERIVED STATE: state digest mismatch`);
  }
}

export interface DecompositionRunResult {
  phase: 1 | 2;
  metrics: DecompositionMetrics;
  componentsDigest: string;
  containmentDigest: string;
  variantsDigest: string;
  idsDigest: string;
  provenanceDigest: string;
  graphDigest: string;
  dbImmutable: boolean;
  rollback: {
    forced: boolean;
    stagingCleaned: boolean;
    previousStatePreserved: boolean;
    previousGraphDigest: string | null;
  } | null;
}

export async function executeKanjiDecompositionRun(options: {
  phase: 1 | 2;
  forceFailAfterStagingWrite?: boolean;
  requireValidExistingState?: boolean;
  claimedSourceRef?: string;
  dataDir?: string;
  expectedBaseline?: CanonicalBaseline;
}): Promise<DecompositionRunResult> {
  // 1. Target safety (fail closed before any work)
  const cls = process.env.NIHONGO_DB_TARGET_CLASS;
  const expectedDb = process.env.NIHONGO_DB_EXPECTED_DATABASE;
  if (cls !== "disposable" || expectedDb !== "app_db") {
    throw new Error(
      `[DECOMP_TARGET] STOP — TARGET_CLASSIFICATION REFUSED (class=${cls ?? "unset"}, expectedDb=${expectedDb ?? "unset"}; only an explicitly disposable app_db target is authorized)`
    );
  }

  // 2. Baseline (fail closed on incompatible canonical state)
  const baseline = options.expectedBaseline ?? (await collectCanonicalBaseline());
  verifyCanonicalBaseline(baseline);

  const publish = resolve(process.cwd(), "data/kanji-decomposition");
  const staging = resolve(process.cwd(), "data/kanji-decomposition.staging");
  const prev = resolve(process.cwd(), "data/kanji-decomposition.prev");

  // 3. Existing-state validation (corrupted state → refuse before mutation)
  let previousGraphDigest: string | null = null;
  const hasExisting = existsSync(resolve(publish, "state.json"));
  if (options.requireValidExistingState) {
    verifyExistingDecompositionState(publish);
    previousGraphDigest = (
      JSON.parse(readFileSync(resolve(publish, "state.json"), "utf-8")) as DecompositionState
    ).graphDigest;
  } else if (hasExisting) {
    previousGraphDigest = (
      JSON.parse(readFileSync(resolve(publish, "state.json"), "utf-8")) as DecompositionState
    ).graphDigest;
  }

  // 4. Stale staging recovery
  rmSync(staging, { recursive: true, force: true });
  rmSync(prev, { recursive: true, force: true });

  // 5. Derive (read-only)
  const derived = await deriveKanjiDecomposition({
    dataDir: options.dataDir,
    claimedSourceRef: options.claimedSourceRef,
  });

  // 6. Reconcile against baseline (zero DB writes)
  const after = await collectCanonicalBaseline();
  const dbImmutable =
    after.kanjiDigest === baseline.kanjiDigest &&
    after.dictionaryDigest === baseline.dictionaryDigest &&
    after.kanjiCount === baseline.kanjiCount &&
    after.dictionaryCount === baseline.dictionaryCount &&
    String(after.radicalCount) === String(baseline.radicalCount) &&
    String(after.compositionCount) === String(baseline.compositionCount);
  if (!dbImmutable) {
    throw new Error(`[DECOMP_BASELINE] STOP — CANONICAL DB MUTATED DURING DERIVATION`);
  }

  const { graphDigest: _drop, ...body } = {
    ...derived.state,
    graphDigest: "",
  } as unknown as DecompositionState;
  const graphDigest = computeGraphDigest(body as unknown as Record<string, unknown>);

  // 7. Stage
  mkdirSync(staging, { recursive: true });
  writeFileSync(resolve(staging, "state.json"), JSON.stringify({ ...derived.state, graphDigest }, null, 2) + "\n");
  writeFileSync(resolve(staging, "components.json"), JSON.stringify(derived.components));
  writeFileSync(resolve(staging, "containment.json"), JSON.stringify(derived.containment));
  writeFileSync(resolve(staging, "variants.json"), JSON.stringify(derived.variants));
  writeFileSync(resolve(staging, "digest.txt"), graphDigest + "\n");

  // 8. Forced failure simulation (rollback evidence)
  if (options.forceFailAfterStagingWrite) {
    rmSync(staging, { recursive: true, force: true });
    let preserved = !existsSync(publish);
    if (hasExisting) {
      try {
        verifyExistingDecompositionState(publish);
        preserved = true;
      } catch {
        preserved = false;
      }
    }
    return {
      phase: options.phase,
      metrics: derived.state.metrics,
      componentsDigest: derived.state.componentsDigest,
      containmentDigest: derived.state.containmentDigest,
      variantsDigest: derived.state.variantsDigest,
      idsDigest: derived.state.idsDigest,
      provenanceDigest: derived.state.provenanceDigest,
      graphDigest,
      dbImmutable,
      rollback: {
        forced: true,
        stagingCleaned: !existsSync(staging),
        previousStatePreserved: preserved,
        previousGraphDigest,
      },
    };
  }

  // 9. Verify staged state, then atomic publish
  verifyExistingDecompositionState(staging);
  if (hasExisting) {
    renameSync(publish, prev);
  }
  renameSync(staging, publish);
  if (hasExisting) {
    rmSync(prev, { recursive: true, force: true });
  }
  verifyExistingDecompositionState(publish);

  return {
    phase: options.phase,
    metrics: derived.state.metrics,
    componentsDigest: derived.state.componentsDigest,
    containmentDigest: derived.state.containmentDigest,
    variantsDigest: derived.state.variantsDigest,
    idsDigest: derived.state.idsDigest,
    provenanceDigest: derived.state.provenanceDigest,
    graphDigest,
    dbImmutable,
    rollback: null,
  };
}

// ---------------------------------------------------------------------------
// Two-pass CLI
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const phaseArg = args.find((a) => a.startsWith("--phase="));
  const phase = phaseArg ? parseInt(phaseArg.split("=")[1], 10) as 1 | 2 : 1;
  const forceFail = args.includes("--force-fail-after-staging-write");
  const requireValid = args.includes("--require-valid-existing-state");
  const claimed = args.find((a) => a.startsWith("--claimed-source-ref="))?.split("=")[1];

  const result = await executeKanjiDecompositionRun({
    phase,
    forceFailAfterStagingWrite: forceFail,
    requireValidExistingState: requireValid,
    claimedSourceRef: claimed,
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && /ingest-kanji-decomposition(\.ts|\.js)$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
