/**
 * Controlled Kanji ↔ JMdict Graph Derivation / Execution Engine — Phase 14.4E.
 *
 * §3 CANONICAL RELATIONSHIP CONTRACT
 *   Node classes:  KANJI (literal Unicode codepoint identity, canonical row id)
 *                  JMDICT_ENTRY (de-jmdict-${ent_seq})
 *   Edge:          KANJI --JMDICT_HAS_ENTRY--> JMDICT_ENTRY
 *   Semantics:     character containment — entry e contains kanji k iff k is
 *                  in dictionary_entries.kanji_characters of e AND k exists in
 *                  kanji_entries.character. Literal Unicode codepoint matching
 *                  is authoritative; NFC is verified, variants are NEVER folded.
 *
 * §5 DETERMINISTIC IDENTITY
 *   Edge ID: kanji:${NFC(character)}:dict:${entryId}
 *   (position-less member of the historical kanji:${ch}:dict:${id}:pos:${n}
 *   family — the historical generator was inspected and retained for the
 *   service's position-scoped edges; containment identity has no position.)
 *
 * §4 PROVENANCE
 *   Entry side:  upstream:jmdict:2023-08 (constant, registry-pinned)
 *   Kanji side:  the canonical kanji row's own source_ref
 *                (upstream:kanjidic2:2023-08 | first-party:kanji-mindtree:v1 |
 *                 first-party:kanji-corpus:v1)
 *   Obsolete identities (kanjidic2:2024-03, kanjivg:0.99, upstream:kanjivg:2024-04)
 *   are forbidden as USED provenance and rejected fail-closed.
 *
 * §7 EXECUTION ARCHITECTURE
 *   File-based derived state (schema decision A — NO migration, NO graph
 *   tables): staged fail-closed publish to data/kanji-jmdict-graph/, atomic
 *   swap with restore-on-failure, forced-mid-run rollback, from-baseline
 *   rollback. The engine performs ZERO database writes (SELECT only) and ZERO
 *   production access (assertIngestionTarget reused, never bypassed).
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

import { assertIngestionTarget } from "./ingest-kanjidic2";

// ---------------------------------------------------------------------------
// Contract constants (§3/§4)
// ---------------------------------------------------------------------------

export const GRAPH_CONTRACT = {
  nodeClasses: ["KANJI", "JMDICT_ENTRY"] as const,
  edgeLabel: "JMDICT_HAS_ENTRY",
  edgeIdAlgorithm: "kanji:${NFC(character)}:dict:${entryId}",
  entrySourceRef: "upstream:jmdict:2023-08" as const,
  allowedKanjiSourceRefs: [
    "upstream:kanjidic2:2023-08",
    "first-party:kanji-mindtree:v1",
    "first-party:kanji-corpus:v1",
  ] as const,
  entryIdPattern: /^de-jmdict-[1-9][0-9]*$/,
} as const;

/** Forbidden as USED provenance anywhere in canonical graph output (§4/§8.9). */
export const FORBIDDEN_SOURCE_IDENTITIES = [
  "kanjidic2:2024-03",
  "upstream:kanjidic2:2024-03",
  "kanjivg:0.99",
  "upstream:kanjivg:0.99",
  "upstream:kanjivg:2024-04",
  "first-party:kanji-corpus:v1", // forbidden on the ENTRY side only; see validateGraphEdge
];

/** §8.10 — incompatible canonical baseline must be refused before any write. */
export const EXPECTED_CANONICAL_BASELINE = {
  kanjiCount: 13108,
  kanjiUpstream: 13063,
  kanjiMindtree: 33,
  kanjiCorpus: 12,
  kanjiDigest: "4e2b27a3249661c87241fd3637160ae7",
  dictionaryCount: 206747,
  dictionaryUpstream: 206717,
  dictionaryFirstParty: 30,
  dictionaryDigest: "42907c1d35e1151d64dd57cdef1eddab",
} as const;

/** Gate-0 measured baselines — reconciled, never hardcoded into derivation. */
export const GATE0_METRIC_BASELINE = {
  kanjiBearingEntries: 165467,
  kanaOnlyEntries: 41250,
  /** Gate-0 "distinct referenced characters": ALL distinct NFC kanji chars in entries (= matched 5880 + jmdict-only 16). */
  distinctReferencedCharacters: 5896,
  zeroReferenceKanji: 7228,
  multiKanjiEntries: 152581,
  multiKeleEntries: 30936,
  okuriganaSurfaces: 51707,
  jmdictOnlyCharacters: 16,
} as const;

// ---------------------------------------------------------------------------
// Canonical serialization (shared convention with 14.4D)
// ---------------------------------------------------------------------------

function sortDeep(value: unknown): unknown {
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
// §5 deterministic identity + §8 validation (fail closed)
// ---------------------------------------------------------------------------

const KANJI_CODEPOINT =
  /^[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]$/;

/**
 * Deterministic edge identity (§5): NFC-normalized kanji codepoint identity
 * (combining marks stripped to the base kanji — pinned by
 * `tests/kanji-lexical-graph.test.ts` for the historical edge-ID family).
 */
export function deriveGraphEdgeId(character: string, entryId: string): string {
  const kanjiIdentity = Array.from(character.normalize("NFC"))
    .filter((ch) => KANJI_CODEPOINT.test(ch))
    .join("");
  return `kanji:${kanjiIdentity}:dict:${entryId}`;
}

export interface GraphEdgeRecord {
  edgeId: string;
  character: string;
  kanjiId: string;
  kanjiSourceRef: string;
  entryId: string;
}

/**
 * Validates one derived relationship. Every rule fails closed (§8.6–8.9):
 * malformed relationship, duplicate deterministic edge (checked at set level),
 * invalid Unicode/codepoint, forged/obsolete source reference.
 */
export function validateGraphEdge(edge: GraphEdgeRecord): void {
  const chars = Array.from(edge.character);
  if (chars.length !== 1 || !KANJI_CODEPOINT.test(edge.character)) {
    throw new Error(
      `[GRAPH_IDENTITY] STOP — INVALID UNICODE/CODEPOINT: ${JSON.stringify(edge.character)}`
    );
  }
  if (edge.character.normalize("NFC") !== edge.character) {
    throw new Error(
      `[GRAPH_IDENTITY] STOP — NON-NFC CHARACTER IDENTITY: ${JSON.stringify(edge.character)}`
    );
  }
  if (!GRAPH_CONTRACT.entryIdPattern.test(edge.entryId)) {
    throw new Error(
      `[GRAPH_IDENTITY] STOP — MALFORMED RELATIONSHIP: bad entryId ${JSON.stringify(edge.entryId)}`
    );
  }
  if (!edge.kanjiId || edge.kanjiId.length === 0) {
    throw new Error(`[GRAPH_IDENTITY] STOP — MALFORMED RELATIONSHIP: empty kanjiId`);
  }
  const expected = deriveGraphEdgeId(edge.character, edge.entryId);
  if (edge.edgeId !== expected) {
    throw new Error(
      `[GRAPH_IDENTITY] STOP — MALFORMED RELATIONSHIP: edgeId ${edge.edgeId} != ${expected}`
    );
  }
  // §8.9 forged source reference / §4 provenance contract
  for (const forbidden of FORBIDDEN_SOURCE_IDENTITIES) {
    if (edge.kanjiSourceRef === forbidden && forbidden !== "first-party:kanji-corpus:v1") {
      throw new Error(
        `[GRAPH_PROVENANCE] STOP — FORBIDDEN SOURCE REFERENCE: ${forbidden}`
      );
    }
    if (forbidden === "first-party:kanji-corpus:v1") {
      // legitimate ONLY as kanji-side provenance of the 12 first-party rows;
      // never as entry-side (entry side is the constant upstream ref).
    }
  }
  if (
    !(GRAPH_CONTRACT.allowedKanjiSourceRefs as readonly string[]).includes(
      edge.kanjiSourceRef
    )
  ) {
    throw new Error(
      `[GRAPH_PROVENANCE] STOP — FORGED SOURCE REFERENCE: ${edge.kanjiSourceRef}`
    );
  }
}

export function validateDerivedEdgeSet(edges: GraphEdgeRecord[]): void {
  const seen = new Set<string>();
  for (const e of edges) {
    validateGraphEdge(e);
    if (seen.has(e.edgeId)) {
      throw new Error(
        `[GRAPH_IDENTITY] STOP — DUPLICATE DETERMINISTIC EDGE: ${e.edgeId}`
      );
    }
    seen.add(e.edgeId);
  }
}

// ---------------------------------------------------------------------------
// Database access (READ-ONLY) + baseline verification
// ---------------------------------------------------------------------------

function dbUrl(): string {
  return (
    process.env.DATABASE_URL ||
    "postgresql://nihongo:nihongo@127.0.0.1:5432/app_db"
  );
}

async function withClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: dbUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export interface CanonicalBaselineEvidence {
  kanjiCount: number;
  kanjiUpstream: number;
  kanjiMindtree: number;
  kanjiCorpus: number;
  kanjiDigest: string;
  dictionaryCount: number;
  dictionaryUpstream: number;
  dictionaryFirstParty: number;
  dictionaryDigest: string;
}

export async function collectCanonicalBaseline(): Promise<CanonicalBaselineEvidence> {
  return withClient(async (c) => {
    const kanji = (
      await c.query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE source_ref = 'upstream:kanjidic2:2023-08')::int AS upstream,
                count(*) FILTER (WHERE source_ref = 'first-party:kanji-mindtree:v1')::int AS mindtree,
                count(*) FILTER (WHERE source_ref = 'first-party:kanji-corpus:v1')::int AS corpus,
                md5(string_agg(id || '|' || character || '|' || stroke_count || '|' || source_ref, ',' ORDER BY id)) AS d
         FROM kanji_entries`
      )
    ).rows[0];
    const dict = (
      await c.query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE source_ref = 'upstream:jmdict:2023-08')::int AS upstream,
                count(*) FILTER (WHERE source_ref LIKE 'first-party:%')::int AS fp,
                md5(string_agg(id || '|' || headword || '|' || reading || '|' || romaji, ',' ORDER BY id)) AS d
         FROM dictionary_entries`
      )
    ).rows[0];
    return {
      kanjiCount: kanji.total,
      kanjiUpstream: kanji.upstream,
      kanjiMindtree: kanji.mindtree,
      kanjiCorpus: kanji.corpus,
      kanjiDigest: kanji.d,
      dictionaryCount: dict.total,
      dictionaryUpstream: dict.upstream,
      dictionaryFirstParty: dict.fp,
      dictionaryDigest: dict.d,
    };
  });
}

/** §8.10 — refuse an incompatible canonical baseline before any write. */
export function verifyCanonicalBaseline(
  evidence: CanonicalBaselineEvidence,
  expected: CanonicalBaselineEvidence = EXPECTED_CANONICAL_BASELINE
): void {
  for (const key of Object.keys(expected) as Array<keyof CanonicalBaselineEvidence>) {
    if (evidence[key] !== expected[key]) {
      throw new Error(
        `[GRAPH_BASELINE] STOP — INCOMPATIBLE CANONICAL BASELINE: ${key} = ${evidence[key]}, expected ${expected[key]}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// §6 read-only derivation (pure — no writes of any kind)
// ---------------------------------------------------------------------------

export interface GraphMetrics {
  totalJmdictEntries: number;
  kanjiBearingEntries: number;
  kanaOnlyEntries: number;
  /** All distinct NFC kanji characters referenced by JMdict entries (Gate-0 semantic). */
  distinctEntryKanjiCharacters: number;
  /** Distinct referenced kanji that exist in `kanji_entries` (receive nodes). */
  distinctReferencedKanji: number;
  /** Kanji-bearing entries with zero matched kanji nodes. */
  kanjiBearingEntriesWithoutMatch: number;
  candidateEdges: number;
  acceptedEdges: number;
  /** Candidate pairs whose character has no `kanji_entries` node (JMdict-only, non-forged). */
  unmatchedCandidateEdges: number;
  rejectedEdges: number;
  duplicates: number;
  invalidEdges: number;
  provenanceViolations: number;
  multiKanjiEntries: number;
  zeroReferenceKanji: number;
  jmdictOnlyCharacters: number;
  nodeKanji: number;
  nodeEntries: number;
  // read-only evidence from the pinned JMdict.xml + headword surfaces:
  multiKeleEntries: number;
  kebTotal: number;
  rebTotal: number;
  okuriganaSurfaces: number;
}

export interface DerivedGraph {
  contract: typeof GRAPH_CONTRACT;
  metrics: GraphMetrics;
  classification: {
    jmdictOnlyCharacters: string[]; // sorted
    zeroReferenceKanji: string[]; // sorted canonical characters
  };
  edges: GraphEdgeRecord[]; // sorted by edgeId
  edgesDigest: string;
  idsDigest: string;
  provenanceDigest: string;
}

/** Process-level memo of XML evidence (pinned file; avoids repeated giant DOM parses). */
const xmlEvidenceCache = new Map<
  string,
  { totalEntries: number; multiKeleEntries: number; kebTotal: number; rebTotal: number }
>();

/** Read-only evidence counters over the pinned JMdict.xml (§13). */
export function collectXmlEvidence(xmlPath: string): {
  totalEntries: number;
  multiKeleEntries: number;
  kebTotal: number;
  rebTotal: number;
} {
  const cached = xmlEvidenceCache.get(xmlPath);
  if (cached) return { ...cached };
  const xml = readFileSync(xmlPath, "utf-8");
  const entryRe = /<entry[\s\S]*?<\/entry>/g;
  let m: RegExpExecArray | null;
  let totalEntries = 0;
  let multiKeleEntries = 0;
  let kebTotal = 0;
  let rebTotal = 0;
  while ((m = entryRe.exec(xml)) !== null) {
    totalEntries++;
    const kebs = m[0].match(/<keb>/g)?.length ?? 0;
    const rebs = m[0].match(/<reb>/g)?.length ?? 0;
    kebTotal += kebs;
    rebTotal += rebs;
    if (kebs > 1) multiKeleEntries++;
  }
  const evidence = { totalEntries, multiKeleEntries, kebTotal, rebTotal };
  xmlEvidenceCache.set(xmlPath, evidence);
  return { ...evidence };
}

/**
 * Pure read-only derivation of the canonical graph from current canonical
 * data only (§3): kanji_entries ⋈ dictionary_entries.kanji_characters.
 */
export async function deriveKanjiJmdictGraph(options?: {
  xmlPath?: string;
}): Promise<DerivedGraph> {
  const rows = await withClient(async (c) => {
    const kanjiRows = (
      await c.query(
        `SELECT id, character, source_ref FROM kanji_entries ORDER BY character`
      )
    ).rows as Array<{ id: string; character: string; source_ref: string }>;
    const dictRows = (
      await c.query(
        `SELECT id, headword, kanji_characters FROM dictionary_entries
         WHERE source_ref = 'upstream:jmdict:2023-08' ORDER BY id`
      )
    ).rows as Array<{
      id: string;
      headword: string;
      kanji_characters: string[];
    }>;
    return { kanjiRows, dictRows };
  });

  const kanjiByChar = new Map<
    string,
    { id: string; source_ref: string }
  >();
  for (const r of rows.kanjiRows) {
    if (kanjiByChar.has(r.character)) {
      throw new Error(
        `[GRAPH_IDENTITY] STOP — DUPLICATE CANONICAL CHARACTER: ${r.character}`
      );
    }
    kanjiByChar.set(r.character, { id: r.id, source_ref: r.source_ref });
  }

  const edges: GraphEdgeRecord[] = [];
  const edgeIds = new Set<string>();
  const referencedChars = new Set<string>();
  const referencedEntries = new Set<string>();
  const jmdictOnly = new Set<string>();
  let kanjiBearingEntries = 0;
  let kanaOnlyEntries = 0;
  let multiKanjiEntries = 0;
  let candidateEdges = 0;
  let invalidEdges = 0;
  let duplicates = 0;
  let okuriganaSurfaces = 0;
  let kanjiBearingEntriesWithoutMatch = 0;

  for (const row of rows.dictRows) {
    const chars = row.kanji_characters ?? [];
    if (chars.length === 0) {
      kanaOnlyEntries++;
    } else {
      kanjiBearingEntries++;
      if (chars.length > 1) multiKanjiEntries++;
    }
    // okurigana surface evidence (kanji + kana in the written form)
    if (
      /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(row.headword) &&
      /[\u3040-\u30FF]/.test(row.headword)
    ) {
      okuriganaSurfaces++;
    }

    const seenForEntry = new Set<string>();
    for (const raw of chars) {
      const character = raw.normalize("NFC");
      if (Array.from(raw).length !== 1 || character !== raw) {
        invalidEdges++;
        continue;
      }
      if (seenForEntry.has(character)) {
        duplicates++;
        continue;
      }
      seenForEntry.add(character);
      candidateEdges++;

      const kanji = kanjiByChar.get(character);
      if (!kanji) {
        jmdictOnly.add(character);
        continue;
      }
      const edgeId = deriveGraphEdgeId(character, row.id);
      if (edgeIds.has(edgeId)) {
        duplicates++;
        continue;
      }
      edgeIds.add(edgeId);
      referencedChars.add(character);
      referencedEntries.add(row.id);
      edges.push({
        edgeId,
        character,
        kanjiId: kanji.id,
        kanjiSourceRef: kanji.source_ref,
        entryId: row.id,
      });
    }
    if (chars.length > 0 && !referencedEntries.has(row.id)) {
      kanjiBearingEntriesWithoutMatch++;
    }
  }

  // Fail closed on any invalid/duplicate condition in the real derivation.
  if (invalidEdges > 0) {
    throw new Error(
      `[GRAPH_IDENTITY] STOP — INVALID UNICODE/CODEPOINT in canonical data: ${invalidEdges}`
    );
  }
  if (duplicates > 0) {
    throw new Error(
      `[GRAPH_IDENTITY] STOP — DUPLICATE DETERMINISTIC EDGE in canonical derivation: ${duplicates}`
    );
  }

  edges.sort((a, b) => (a.edgeId < b.edgeId ? -1 : a.edgeId > b.edgeId ? 1 : 0));
  validateDerivedEdgeSet(edges);

  const zeroReferenceKanji = rows.kanjiRows
    .filter((r) => !referencedChars.has(r.character))
    .map((r) => r.character)
    .sort();

  const xmlEvidence = collectXmlEvidence(
    options?.xmlPath ?? resolve(process.cwd(), "data/JMdict.xml")
  );

  const metrics: GraphMetrics = {
    totalJmdictEntries: rows.dictRows.length,
    kanjiBearingEntries,
    kanaOnlyEntries,
    distinctEntryKanjiCharacters: referencedChars.size + jmdictOnly.size,
    distinctReferencedKanji: referencedChars.size,
    candidateEdges,
    acceptedEdges: edges.length,
    unmatchedCandidateEdges: candidateEdges - edges.length,
    rejectedEdges: 0,
    duplicates,
    invalidEdges,
    provenanceViolations: 0,
    multiKanjiEntries,
    zeroReferenceKanji: zeroReferenceKanji.length,
    jmdictOnlyCharacters: jmdictOnly.size,
    nodeKanji: referencedChars.size,
    nodeEntries: referencedEntries.size,
    kanjiBearingEntriesWithoutMatch,
    multiKeleEntries: xmlEvidence.multiKeleEntries,
    kebTotal: xmlEvidence.kebTotal,
    rebTotal: xmlEvidence.rebTotal,
    okuriganaSurfaces,
  };

  const edgesDigest = sha256Hex(canonicalJson(edges));
  const idsDigest = sha256Hex(edges.map((e) => e.edgeId).join("\n"));
  const provenanceDigest = sha256Hex(
    edges
      .map((e) => `${e.edgeId}|${e.kanjiSourceRef}|${GRAPH_CONTRACT.entrySourceRef}`)
      .join("\n")
  );

  return {
    contract: GRAPH_CONTRACT,
    metrics,
    classification: {
      jmdictOnlyCharacters: [...jmdictOnly].sort(),
      zeroReferenceKanji,
    },
    edges,
    edgesDigest,
    idsDigest,
    provenanceDigest,
  };
}

// ---------------------------------------------------------------------------
// Staged publish (atomic swap, restore-on-failure)
// ---------------------------------------------------------------------------

const PUBLISH_DIR = "data/kanji-jmdict-graph";
const STAGING_DIR = "data/kanji-jmdict-graph.staging";
const BACKUP_DIR = "data/kanji-jmdict-graph.prev";

function p(name: string): string {
  return resolve(process.cwd(), name);
}

export interface GraphState {
  contract: typeof GRAPH_CONTRACT;
  metrics: GraphMetrics;
  classification: DerivedGraph["classification"];
  edgesDigest: string;
  idsDigest: string;
  provenanceDigest: string;
  graphDigest: string;
}

export function computeGraphDigest(state: Omit<GraphState, "graphDigest">): string {
  return sha256Hex(canonicalJson(state));
}

/** §8.11 — verify an existing published state's self-consistency. */
export function verifyExistingGraphState(stateDir: string): void {
  const statePath = resolve(stateDir, "state.json");
  const edgesPath = resolve(stateDir, "edges.json");
  if (!existsSync(statePath) || !existsSync(edgesPath)) {
    throw new Error(
      `[GRAPH_BASELINE] STOP — CORRUPTED DERIVED STATE: missing state.json/edges.json in ${stateDir}`
    );
  }
  const state = JSON.parse(readFileSync(statePath, "utf-8")) as GraphState;
  const edges = JSON.parse(readFileSync(edgesPath, "utf-8")) as GraphEdgeRecord[];
  const recomputedEdgesDigest = sha256Hex(canonicalJson(edges));
  if (recomputedEdgesDigest !== state.edgesDigest) {
    throw new Error(
      `[GRAPH_BASELINE] STOP — CORRUPTED DERIVED STATE: edges digest mismatch`
    );
  }
  const { graphDigest, ...body } = state;
  if (computeGraphDigest(body) !== graphDigest) {
    throw new Error(
      `[GRAPH_BASELINE] STOP — CORRUPTED DERIVED STATE: state digest mismatch`
    );
  }
}

// ---------------------------------------------------------------------------
// Main engine
// ---------------------------------------------------------------------------

export interface ExecuteGraphOptions {
  phase: 1 | 2;
  /** §10 — force a failure AFTER staged derived-state writes began. */
  forceFailAfterStagingWrite?: boolean;
  /** §8.4/8.5 — provenance claims validated before any write. */
  claimedEntrySourceRef?: string;
  /** §8.10 — alternative baseline expectation (tests exercise refusal). */
  expectedBaseline?: CanonicalBaselineEvidence;
  /** §8.11 — refuse when an existing published state fails self-consistency. */
  requireValidExistingState?: boolean;
  xmlPath?: string;
}

export interface KanjiJmdictGraphRunResult {
  phase: 1 | 2;
  metrics: GraphMetrics;
  graphDigest: string;
  edgesDigest: string;
  idsDigest: string;
  provenanceDigest: string;
  statePath: string;
  edgesPath: string;
  stateBytes: number;
  edgesBytes: number;
  dbBefore: CanonicalBaselineEvidence;
  dbAfter: CanonicalBaselineEvidence;
  dbImmutable: boolean;
  rollback: null | {
    forced: true;
    stagingCleaned: true;
    previousStatePreserved: true;
    previousGraphDigest: string | null;
  };
}

export async function executeKanjiJmdictGraphRun(
  options: ExecuteGraphOptions
): Promise<KanjiJmdictGraphRunResult> {
  // §7 — fail-closed disposable-target assertion BEFORE any write.
  assertIngestionTarget(dbUrl());

  // §4/§8.4/§8.5 — provenance claims validated before any write.
  const claimed = options.claimedEntrySourceRef ?? GRAPH_CONTRACT.entrySourceRef;
  if (claimed !== GRAPH_CONTRACT.entrySourceRef) {
    throw new Error(
      `[GRAPH_PROVENANCE] STOP — WRONG JMDICT SOURCE IDENTITY: ${claimed} != ${GRAPH_CONTRACT.entrySourceRef}`
    );
  }
  if (FORBIDDEN_SOURCE_IDENTITIES.includes(claimed)) {
    throw new Error(
      `[GRAPH_PROVENANCE] STOP — FORBIDDEN SOURCE REFERENCE: ${claimed}`
    );
  }

  // §8.11 — existing derived state must be self-consistent before replacement.
  if (options.requireValidExistingState && existsSync(p(PUBLISH_DIR))) {
    verifyExistingGraphState(p(PUBLISH_DIR));
  }

  // §8.10 — canonical baseline compatibility BEFORE derivation writes.
  const dbBefore = await collectCanonicalBaseline();
  verifyCanonicalBaseline(dbBefore, options.expectedBaseline ?? EXPECTED_CANONICAL_BASELINE);

  // §6 — read-only derivation (pure; validates every edge fail-closed).
  const derived = await deriveKanjiJmdictGraph({ xmlPath: options.xmlPath });

  const stateBody: Omit<GraphState, "graphDigest"> = {
    contract: derived.contract,
    metrics: derived.metrics,
    classification: derived.classification,
    edgesDigest: derived.edgesDigest,
    idsDigest: derived.idsDigest,
    provenanceDigest: derived.provenanceDigest,
  };
  const graphDigest = computeGraphDigest(stateBody);
  const state: GraphState = { ...stateBody, graphDigest };

  // ---- staged publish (the only writes this engine performs) ----
  const staging = p(STAGING_DIR);
  const publish = p(PUBLISH_DIR);
  const backup = p(BACKUP_DIR);
  const previousState = existsSync(resolve(publish, "state.json"))
    ? JSON.parse(readFileSync(resolve(publish, "state.json"), "utf-8")) as GraphState
    : null;

  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });

  try {
    writeFileSync(
      resolve(staging, "state.json"),
      JSON.stringify(state, null, 2) + "\n"
    );
    writeFileSync(
      resolve(staging, "edges.json"),
      JSON.stringify(derived.edges) + "\n"
    );
    writeFileSync(resolve(staging, "digest.txt"), graphDigest + "\n");

    if (options.forceFailAfterStagingWrite) {
      throw new Error(
        "[GRAPH_INGESTION] FORCED MID-RUN FAILURE — after staged derived writes began"
      );
    }

    rmSync(backup, { recursive: true, force: true });
    if (existsSync(publish)) renameSync(publish, backup);
    try {
      renameSync(staging, publish);
    } catch (error) {
      if (existsSync(backup)) renameSync(backup, publish);
      throw error;
    }
    rmSync(backup, { recursive: true, force: true });
    rmSync(staging, { recursive: true, force: true });
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    const after = existsSync(resolve(publish, "state.json"))
      ? (JSON.parse(readFileSync(resolve(publish, "state.json"), "utf-8")) as GraphState)
      : null;
    const preserved =
      (after === null && previousState === null) ||
      (after !== null &&
        previousState !== null &&
        after.graphDigest === previousState.graphDigest);
    if (!preserved) {
      throw new Error(
        `[GRAPH_INGESTION] STOP — ROLLBACK INCOMPLETE: previous graph state not preserved`
      );
    }
    if (options.forceFailAfterStagingWrite !== true) throw error;
    const dbAfter = await collectCanonicalBaseline();
    return {
      phase: options.phase,
      metrics: derived.metrics,
      graphDigest,
      edgesDigest: derived.edgesDigest,
      idsDigest: derived.idsDigest,
      provenanceDigest: derived.provenanceDigest,
      statePath: resolve(publish, "state.json"),
      edgesPath: resolve(publish, "edges.json"),
      stateBytes: 0,
      edgesBytes: 0,
      dbBefore,
      dbAfter,
      dbImmutable:
        dbBefore.kanjiDigest === dbAfter.kanjiDigest &&
        dbBefore.dictionaryDigest === dbAfter.dictionaryDigest,
      rollback: {
        forced: true,
        stagingCleaned: true,
        previousStatePreserved: true,
        previousGraphDigest: previousState?.graphDigest ?? null,
      },
    };
  }

  const dbAfter = await collectCanonicalBaseline();
  return {
    phase: options.phase,
    metrics: derived.metrics,
    graphDigest,
    edgesDigest: derived.edgesDigest,
    idsDigest: derived.idsDigest,
    provenanceDigest: derived.provenanceDigest,
    statePath: resolve(publish, "state.json"),
    edgesPath: resolve(publish, "edges.json"),
    stateBytes: readFileSync(resolve(publish, "state.json")).length,
    edgesBytes: readFileSync(resolve(publish, "edges.json")).length,
    dbBefore,
    dbAfter,
    dbImmutable:
      dbBefore.kanjiDigest === dbAfter.kanjiDigest &&
      dbBefore.dictionaryDigest === dbAfter.dictionaryDigest &&
      dbBefore.kanjiCount === dbAfter.kanjiCount &&
      dbBefore.dictionaryCount === dbAfter.dictionaryCount,
    rollback: null,
  };
}

// ---------------------------------------------------------------------------
// CLI — guarded two-pass execution (Run 1 + Run 2 idempotency)
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const run1 = await executeKanjiJmdictGraphRun({ phase: 1 });
  const run2 = await executeKanjiJmdictGraphRun({
    phase: 2,
    requireValidExistingState: true,
  });
  console.log(
    JSON.stringify(
      {
        run1: {
          graphDigest: run1.graphDigest,
          metrics: run1.metrics,
          dbImmutable: run1.dbImmutable,
        },
        run2: {
          graphDigest: run2.graphDigest,
          identical: run2.graphDigest === run1.graphDigest,
        },
        verdict:
          run2.graphDigest === run1.graphDigest && run1.dbImmutable && run2.dbImmutable
            ? "KANJI_JMDICT_GRAPH_COMPLETE — not production authorization"
            : "STOP — IDEMPOTENCY OR IMMUTABILITY FAILURE",
      },
      null,
      2
    )
  );
}

if (process.argv[1] && /ingest-kanji-jmdict-graph(\.ts|\.js)$/.test(process.argv[1])) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
