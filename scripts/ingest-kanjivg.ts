/**
 * Controlled KanjiVG Ingestion / Execution Engine — Phase 14.4D.
 *
 * Executes the controlled KanjiVG ingestion against the disposable database
 * and the existing file-based asset target (data/kanjivg/ + data/kanjivg-index.json).
 *
 * ARCHITECTURE (file-based asset model — no relational schema migration):
 *   KanjiVG → verified acquisition artifact → parsed representation
 *     → normalized visual asset (KanjiVisualAsset) → served asset layer
 *
 * The engine joins KanjiVG to canonical kanji by Unicode character identity,
 * produces a deterministic attachment state (data/kanjivg-attachment/state.json)
 * via staged fail-closed publish, and NEVER writes to the database:
 *
 *   - KANJIDIC2 remains authoritative for kanji_entries.stroke_count
 *   - first-party kanji rows are never touched
 *   - KanjiVG provenance is always `upstream:kanjivg:2024-08`
 *   - KANJIVG_EXTRA characters never create kanji_entries rows
 *   - KANJIVG_MISSING characters never synthesize KanjiVG data
 *   - variants are preserved as alternate assets (never NFKC-folded)
 *   - malformed identity / duplicate identity fail closed before any write
 *
 * Rollback semantics:
 *   - staged writes land in data/kanjivg-attachment.staging/ first;
 *   - a forced mid-run failure (forceFailAfterStagingWrite) discards the
 *     staging area completely and leaves any previous published state intact;
 *   - publish is an atomic directory swap with restore-on-failure.
 *
 * Deterministic identity (never timestamps / UUIDs / insertion order):
 *   stroke: kvg:${hex}-s${n}
 *   asset:  kanjivg:${character}
 */

import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

import { parseKanjiVgSvg, type KanjiVgParsedSvg } from "../src/etl/kanji/kanjiVgParser";
import {
  compareStrokeCounts,
  transformKanjiVgSvg,
  KANJIVG_SOURCE_REF,
  KANJIVG_VERSION,
  type StrokeCountComparison,
} from "../src/etl/kanji/kanjiVgTransformer";
// §3: the established fail-closed disposable-target mechanism is REUSED,
// never weakened or bypassed.
import { assertIngestionTarget } from "./ingest-kanjidic2";
import {
  parseTarEntries,
  verifyArchiveIdentity,
  verifyArchiveStructure,
  verifyIndexIdentity,
  verifyLicenseEvidence,
  verifySourceIdentity,
  KANJIVG_PINNED,
} from "./provision-kanjivg-ci";

// ---------------------------------------------------------------------------
// Contract identities (the re-pinned Phase 14.4D source identity — §0)
// ---------------------------------------------------------------------------

export const KANJIVG_INGEST_CONTRACT = {
  repository: "KanjiVG/kanjivg",
  tag: "r20240807",
  commit: "a4b51d966d832544c371d566f9c84174e4beff3b",
  sourceRef: "upstream:kanjivg:2024-08",
  version: "r20240807",
  archiveFilename: "kanjivg-r20240807.tar.gz",
  archiveSha256:
    "a0cbc5c950d5c68bf3b6b24468ebdb8a829e62f04a4f44e1c7e98bade2597dcd",
  archiveSize: 6403118,
  indexSha256:
    "43e9d0b71f7288e72bb6a74bdaa52498fe381a1045925789e62695fc863cf6d0",
  indexSize: 293747,
  indexPrimaryKeys: 6699,
  svgFiles: 11658,
  primaryCharacters: 6699,
  variants: 4959,
  license: "CC-BY-SA-3.0",
  attribution: "Ulrich Apel and the KanjiVG project (CC BY-SA 3.0)",
} as const;

/**
 * Registered-but-unused legacy KanjiVG provenance (§11): must never appear as
 * the provenance of any ingested asset.
 */
export const REGISTERED_UNUSED_KANJIVG_REF = "upstream:kanjivg:2024-04";

// ---------------------------------------------------------------------------
// State contract
// ---------------------------------------------------------------------------

export type AttachmentClassification =
  | "KANJIVG_MATCH"
  | "KANJIVG_EXTRA"
  | "KANJIVG_MISSING";

export interface VariantAssetRecord {
  file: string;
  variantType: string;
  strokeCount: number;
  strokeSequenceHash: string;
}

export interface AttachmentRecord {
  assetId: string; // kanjivg:${character}
  character: string;
  codepoint: string; // 5-hex
  canonicalKanjiId: string | null; // DB id when attached (e.g. kj-hashi); null for EXTRA
  classification: AttachmentClassification;
  sourceRef: string; // always upstream:kanjivg:2024-08
  version: string; // always r20240807
  primaryFile: string;
  variantAssets: VariantAssetRecord[]; // preserved, never NFKC-folded
  strokeCount: number;
  strokeIds: string[]; // kvg:${hex}-s${n}
  strokeSequenceHash: string;
  componentSignature: string;
  kanjidicStrokeCount: number | null; // evidence only — never written back
  strokeStatus: "STROKE_COUNT_MATCH" | "STROKE_COUNT_DISCREPANCY" | "NO_KANJIDIC_ROW";
}

export interface MissingRecord {
  character: string;
  canonicalKanjiId: string;
  classification: "KANJIVG_MISSING";
}

export interface KanjiVgIngestionState {
  contract: typeof KANJIVG_INGEST_CONTRACT;
  counts: {
    dbKanji: number;
    indexedPrimaryKeys: number;
    attached: number;
    kanjivgExtra: number;
    kanjivgMissing: number;
    variantAssets: number;
    strokesTotal: number;
    strokeMatch: number;
    strokeDiscrepancy: number;
  };
  classification: {
    matched: string[]; // characters, sorted
    extra: string[]; // characters, sorted
    missing: MissingRecord[]; // sorted by canonicalKanjiId
  };
  assets: Record<string, AttachmentRecord>; // keyed by assetId, insertion order sorted
  discrepancies: StrokeCountComparison[]; // sorted by canonicalKanjiId
  digest: string; // sha256 over canonical serialization of the body above
}

export interface DbStateEvidence {
  kanjiCount: number;
  upstreamCount: number;
  firstPartyCount: number;
  mindtreeCount: number;
  corpusCount: number;
  kanjiDigest: string;
  dictionaryCount: number;
  dictionaryDigest: string;
  hashiStroke: number;
  hashiId: string;
  hashiSourceRef: string;
  roadId: string;
  roadSourceRef: string;
}

export interface KanjiVgIngestionResult {
  phase: 1 | 2;
  sourceIdentity: {
    repository: string;
    tag: string;
    commit: string;
    archiveSha256: string;
    archiveSize: number;
    indexSha256: string;
    indexSize: number;
    primaryKeys: number;
    svgFiles: number;
    primary: number;
    variants: number;
    licenseOk: boolean;
  };
  counts: KanjiVgIngestionState["counts"];
  discrepancyCount: number;
  stateDigest: string;
  statePath: string;
  stateBytes: number;
  dbBefore: DbStateEvidence;
  dbAfter: DbStateEvidence;
  dbImmutable: boolean;
  rollback: null | {
    forced: true;
    stagingCleaned: true;
    previousStatePreserved: true;
    previousStateDigest: string | null;
  };
}

// ---------------------------------------------------------------------------
// Canonical serialization (deterministic identity — §12)
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

/** Canonical JSON: recursively key-sorted, no insignificant whitespace. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

export function stateBodyDigest(body: Omit<KanjiVgIngestionState, "digest">): string {
  return createHash("sha256").update(canonicalJson(body)).digest("hex");
}

// ---------------------------------------------------------------------------
// Identity validation (fail closed — §9)
// ---------------------------------------------------------------------------

const STROKE_ID_PATTERN = /^kvg:[0-9a-f]{4,5}-s[1-9][0-9]*$/;

/**
 * Builds and validates one attachment record. Refuses malformed identity and
 * duplicate stroke identity BEFORE anything is written (§9, §16).
 */
export function buildAttachmentRecord(
  parsed: KanjiVgParsedSvg,
  dbRow: { id: string; stroke_count: number } | null
): AttachmentRecord {
  if (!parsed.isSafe) {
    throw new Error(
      `[KANJIVG_IDENTITY] STOP — MALFORMED SOURCE (unsafe SVG) for ${parsed.codepoint}: ${parsed.securityDiagnostics.join("; ")}`
    );
  }
  if (!parsed.character || !/^[0-9a-f]{4,5}$/.test(parsed.codepoint)) {
    throw new Error(
      `[KANJIVG_IDENTITY] STOP — MALFORMED SOURCE identity: codepoint=${parsed.codepoint}`
    );
  }

  // Duplicate stroke identity → fail closed (§16).
  const seenStrokeIds = new Set<string>();
  for (const s of parsed.strokes) {
    if (!STROKE_ID_PATTERN.test(s.id)) {
      throw new Error(
        `[KANJIVG_IDENTITY] STOP — MALFORMED STROKE IDENTITY: ${s.id} in ${parsed.codepoint}`
      );
    }
    if (seenStrokeIds.has(s.id)) {
      throw new Error(
        `[KANJIVG_IDENTITY] STOP — DUPLICATE STROKE IDENTITY: ${s.id} in ${parsed.codepoint}`
      );
    }
    seenStrokeIds.add(s.id);
  }

  const transformed = transformKanjiVgSvg(parsed, dbRow ? dbRow.id : undefined);
  if (!transformed.isValid || !transformed.asset) {
    throw new Error(
      `[KANJIVG_IDENTITY] STOP — TRANSFORM REFUSED ${parsed.codepoint}: ${transformed.errors.join("; ")}`
    );
  }
  const asset = transformed.asset;

  const strokeSequenceHash = createHash("sha256")
    .update(asset.strokes.map((s) => `${s.id}|${s.path}`).join("\n"))
    .digest("hex");

  const componentSignature = createHash("sha256")
    .update(
      asset.components
        .map((c) => `${c.element}|${c.position ?? ""}|${c.radical ?? ""}`)
        .sort()
        .join("\n")
    )
    .digest("hex");

  const comparison = dbRow
    ? compareStrokeCounts(parsed.character, dbRow.id, dbRow.stroke_count, asset.strokeCount)
    : null;

  return {
    assetId: `kanjivg:${parsed.character}`,
    character: parsed.character,
    codepoint: parsed.codepoint,
    canonicalKanjiId: dbRow ? dbRow.id : null,
    classification: dbRow ? "KANJIVG_MATCH" : "KANJIVG_EXTRA",
    sourceRef: KANJIVG_SOURCE_REF,
    version: KANJIVG_VERSION,
    primaryFile: `${parsed.codepoint}.svg`,
    variantAssets: [],
    strokeCount: asset.strokeCount,
    strokeIds: asset.strokes.map((s) => s.id),
    strokeSequenceHash,
    componentSignature,
    kanjidicStrokeCount: dbRow ? dbRow.stroke_count : null,
    strokeStatus: comparison
      ? comparison.status
      : "NO_KANJIDIC_ROW",
  };
}

// ---------------------------------------------------------------------------
// Source preflight (§6) — every gate must PASS before any canonical write
// ---------------------------------------------------------------------------

export function runKanjiVgSourcePreflight(paths: {
  archivePath: string;
  indexPath: string;
  corpusDir: string;
  license: { copying: string; readme: string } | null;
  claimedSourceRef?: string;
  claimedVersion?: string;
}): {
  ok: boolean;
  failures: string[];
  sourceIdentity: KanjiVgIngestionResult["sourceIdentity"];
} {
  const failures: string[] = [];
  const p = KANJIVG_PINNED;

  // 15. sourceRef identity / version (also §11, §16)
  const src = verifySourceIdentity({
    repository: p.repository,
    tag: p.tag,
    commit: p.commit,
    version: paths.claimedVersion ?? KANJIVG_INGEST_CONTRACT.version,
    sourceRef: paths.claimedSourceRef ?? KANJIVG_INGEST_CONTRACT.sourceRef,
  });
  if (!src.ok) failures.push(...src.failures.map((f) => f.message));

  let archiveBytes: Buffer | null = null;
  try {
    archiveBytes = readFileSync(paths.archivePath);
  } catch {
    failures.push(`archive unreadable: ${paths.archivePath}`);
  }

  if (archiveBytes) {
    // 4./5. archive SHA + size
    const identity = verifyArchiveIdentity(archiveBytes);
    if (!identity.ok) failures.push(...identity.failures.map((f) => f.message));

    // 6./7./8./9./10. structure, counts, filenames, duplicates
    try {
      const entries = parseTarEntries(gunzipSync(archiveBytes));
      const structure = verifyArchiveStructure(entries);
      if (!structure.ok) failures.push(...structure.failures.map((f) => f.message));

      // 14. license evidence — read from the actual archive entries (the
      // published corpus dir contains SVGs only).
      const filesByName = new Map(
        entries.filter((e) => e.type === "file").map((e) => [e.name, e.content])
      );
      const rootDir = KANJIVG_PINNED.archive.rootDirectory;
      const licenseText = paths.license ?? {
        copying: filesByName.get(`${rootDir}/COPYING`)?.toString("utf-8") ?? "",
        readme: filesByName.get(`${rootDir}/README.md`)?.toString("utf-8") ?? "",
      };
      if (!licenseText.copying || !licenseText.readme) {
        failures.push("license: COPYING or README.md missing from archive");
      } else {
        const license = verifyLicenseEvidence(licenseText.copying, licenseText.readme);
        if (!license.ok) failures.push(...license.failures.map((f) => f.message));
      }
    } catch (error) {
      failures.push(
        `archive structure unreadable: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // 11./12./13. index SHA + size + key count (+ canonical regeneration)
  try {
    const indexBytes = readFileSync(paths.indexPath);
    const svgFiles = readdirSync(paths.corpusDir)
      .filter((f) => f.endsWith(".svg"))
      .sort();
    const indexCheck = verifyIndexIdentity(indexBytes, svgFiles);
    if (!indexCheck.ok) failures.push(...indexCheck.failures.map((f) => f.message));
  } catch (error) {
    failures.push(
      `index verification failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return {
    ok: failures.length === 0,
    failures,
    sourceIdentity: {
      repository: KANJIVG_INGEST_CONTRACT.repository,
      tag: KANJIVG_INGEST_CONTRACT.tag,
      commit: KANJIVG_INGEST_CONTRACT.commit,
      archiveSha256: KANJIVG_INGEST_CONTRACT.archiveSha256,
      archiveSize: KANJIVG_INGEST_CONTRACT.archiveSize,
      indexSha256: KANJIVG_INGEST_CONTRACT.indexSha256,
      indexSize: KANJIVG_INGEST_CONTRACT.indexSize,
      primaryKeys: KANJIVG_INGEST_CONTRACT.indexPrimaryKeys,
      svgFiles: KANJIVG_INGEST_CONTRACT.svgFiles,
      primary: KANJIVG_INGEST_CONTRACT.primaryCharacters,
      variants: KANJIVG_INGEST_CONTRACT.variants,
      licenseOk: true,
    },
  };
}

// ---------------------------------------------------------------------------
// Read-only database evidence (§4, §5, §22)
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

export async function collectDbEvidence(): Promise<DbStateEvidence> {
  return withClient(async (c) => {
    const kanji = (
      await c.query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE source_ref = 'upstream:kanjidic2:2023-08')::int AS upstream,
                count(*) FILTER (WHERE source_ref = 'first-party:kanji-mindtree:v1')::int AS mindtree,
                count(*) FILTER (WHERE source_ref = 'first-party:kanji-corpus:v1')::int AS corpus
         FROM kanji_entries`
      )
    ).rows[0];
    const kanjiDigest = (
      await c.query(
        `SELECT md5(string_agg(id || '|' || character || '|' || stroke_count || '|' || source_ref, ',' ORDER BY id)) AS d FROM kanji_entries`
      )
    ).rows[0].d as string;
    const dict = (
      await c.query(
        `SELECT count(*)::int AS total,
                md5(string_agg(id || '|' || headword || '|' || reading || '|' || romaji, ',' ORDER BY id)) AS d
         FROM dictionary_entries`
      )
    ).rows[0];
    const anchors = (
      await c.query(
        `SELECT id, character, stroke_count, source_ref FROM kanji_entries WHERE character IN ('箸','道') ORDER BY character`
      )
    ).rows as Array<{ id: string; character: string; stroke_count: number; source_ref: string }>;
    const hashi = anchors.find((r) => r.character === "箸")!;
    const road = anchors.find((r) => r.character === "道")!;
    return {
      kanjiCount: kanji.total,
      upstreamCount: kanji.upstream,
      firstPartyCount: kanji.mindtree + kanji.corpus,
      mindtreeCount: kanji.mindtree,
      corpusCount: kanji.corpus,
      kanjiDigest,
      dictionaryCount: dict.total,
      dictionaryDigest: dict.d,
      hashiStroke: hashi.stroke_count,
      hashiId: hashi.id,
      hashiSourceRef: hashi.source_ref,
      roadId: road.id,
      roadSourceRef: road.source_ref,
    };
  });
}

// ---------------------------------------------------------------------------
// Staged publish (atomic swap with restore-on-failure)
// ---------------------------------------------------------------------------

const PUBLISH_DIR = "data/kanjivg-attachment";
const STAGING_DIR = "data/kanjivg-attachment.staging";
const BACKUP_DIR = "data/kanjivg-attachment.prev";

function publishPath(name: string): string {
  return resolve(process.cwd(), name);
}

function snapshotPublishedState(): { exists: boolean; bytes: Buffer | null; digest: string | null } {
  const stateFile = resolve(publishPath(PUBLISH_DIR), "state.json");
  if (!existsSync(stateFile)) return { exists: false, bytes: null, digest: null };
  const bytes = readFileSync(stateFile);
  return {
    exists: true,
    bytes,
    digest: createHash("sha256").update(bytes).digest("hex"),
  };
}

// ---------------------------------------------------------------------------
// Main engine
// ---------------------------------------------------------------------------

export interface ExecuteOptions {
  phase: 1 | 2;
  /** Force a failure AFTER staged asset-state writes have begun (§14/§15). */
  forceFailAfterStagingWrite?: boolean;
  /** Provenance claims to validate — defaults to the canonical contract (§11/§16). */
  claimedSourceRef?: string;
  claimedVersion?: string;
  /** Source paths override (tests use synthetic corpora for refusals). */
  paths?: {
    archivePath?: string;
    indexPath?: string;
    corpusDir?: string;
    license?: { copying: string; readme: string };
  };
}

export async function executeKanjiVgIngestion(
  options: ExecuteOptions
): Promise<KanjiVgIngestionResult> {
  const paths = {
    archivePath:
      options.paths?.archivePath ??
      resolve(process.cwd(), "data/kanjivg-r20240807.tar.gz"),
    indexPath: options.paths?.indexPath ?? resolve(process.cwd(), "data/kanjivg-index.json"),
    corpusDir: options.paths?.corpusDir ?? resolve(process.cwd(), "data/kanjivg"),
    license: options.paths?.license ?? null,
  };

  // §3 — fail-closed disposable-target assertion BEFORE any write.
  assertIngestionTarget(dbUrl());

  // §11/§16 — provenance claims validated before any write.
  const provenance = verifySourceIdentity({
    version: options.claimedVersion ?? KANJIVG_INGEST_CONTRACT.version,
    sourceRef: options.claimedSourceRef ?? KANJIVG_INGEST_CONTRACT.sourceRef,
  });
  if (!provenance.ok) {
    throw new Error(
      `[SOURCE_VERIFIED] STOP — INVALID SOURCE PROVENANCE: ${provenance.failures.map((f) => f.message).join("; ")}`
    );
  }

  // §6 — full source preflight before any canonical write.
  const preflight = runKanjiVgSourcePreflight(paths);
  if (!preflight.ok) {
    throw new Error(
      `[SOURCE_VERIFIED] STOP — SOURCE PREFLIGHT FAILED: ${preflight.failures.join("; ")}`
    );
  }

  // Read-only canonical join (§4, §8, §9).
  const dbBefore = await collectDbEvidence();
  const dbRows = await withClient(async (c) => {
    const rows = (
      await c.query(
        `SELECT id, character, stroke_count FROM kanji_entries ORDER BY character`
      )
    ).rows as Array<{ id: string; character: string; stroke_count: number }>;
    return rows;
  });
  const dbCharMap = new Map<string, { id: string; stroke_count: number }>();
  const dbIdSet = new Set<string>();
  for (const r of dbRows) {
    if (dbCharMap.has(r.character)) {
      throw new Error(
        `[KANJIVG_IDENTITY] STOP — DUPLICATE CANONICAL CHARACTER: ${r.character}`
      );
    }
    dbCharMap.set(r.character, { id: r.id, stroke_count: r.stroke_count });
    dbIdSet.add(r.id);
  }

  // Load index + corpus. Duplicate character detection: two distinct
  // codepoint bases resolving to the same character → fail closed (§9/§16).
  const index: Record<string, string[]> = JSON.parse(
    readFileSync(paths.indexPath, "utf-8")
  );
  const keys = Object.keys(index).sort();

  const assets: Record<string, AttachmentRecord> = {};
  const matched: string[] = [];
  const extra: string[] = [];
  const discrepancies: StrokeCountComparison[] = [];
  let variantAssetsCount = 0;
  let strokesTotal = 0;

  const charToCodepoint = new Map<string, string>();

  for (const character of keys) {
    const files = [...index[character]].sort();
    const primaryFile = files.find((f) => !f.includes("-")) ?? files[0];
    const codepoint = primaryFile.replace(/\.svg$/i, "");
    if (!/^[0-9a-f]{4,5}$/.test(codepoint)) {
      throw new Error(
        `[KANJIVG_IDENTITY] STOP — MALFORMED SOURCE filename: ${primaryFile}`
      );
    }
    const prior = charToCodepoint.get(character);
    if (prior && prior !== codepoint) {
      throw new Error(
        `[KANJIVG_IDENTITY] STOP — DUPLICATE CHARACTER IDENTITY: ${character} from ${prior} and ${codepoint}`
      );
    }
    charToCodepoint.set(character, codepoint);

    const parsed = parseKanjiVgSvg(
      readFileSync(resolve(paths.corpusDir, primaryFile), "utf-8"),
      primaryFile
    );
    if (parsed.character !== character) {
      throw new Error(
        `[KANJIVG_IDENTITY] STOP — MALFORMED SOURCE: filename ${primaryFile} resolves to ${parsed.character}, index key ${character}`
      );
    }

    const dbRow = dbCharMap.get(character) ?? null;
    const record = buildAttachmentRecord(parsed, dbRow);
    strokesTotal += record.strokeCount;

    // Variant assets preserved as alternates (never NFKC-folded).
    for (const variantFile of files.filter((f) => f !== primaryFile)) {
      const vParsed = parseKanjiVgSvg(
        readFileSync(resolve(paths.corpusDir, variantFile), "utf-8"),
        variantFile
      );
      if (vParsed.character !== character) {
        throw new Error(
          `[KANJIVG_IDENTITY] STOP — MALFORMED SOURCE: variant ${variantFile} resolves to ${vParsed.character}, index key ${character}`
        );
      }
      const vTransformed = transformKanjiVgSvg(vParsed);
      if (!vTransformed.isValid || !vTransformed.asset) {
        throw new Error(
          `[KANJIVG_IDENTITY] STOP — MALFORMED SOURCE: variant ${variantFile} refused (${vTransformed.errors.join("; ")})`
        );
      }
      record.variantAssets.push({
        file: variantFile,
        variantType: vParsed.variantType ?? "unknown",
        strokeCount: vTransformed.asset.strokeCount,
        strokeSequenceHash: createHash("sha256")
          .update(vTransformed.asset.strokes.map((s) => `${s.id}|${s.path}`).join("\n"))
          .digest("hex"),
      });
    }
    record.variantAssets.sort((a, b) => (a.file < b.file ? -1 : 1));
    variantAssetsCount += record.variantAssets.length;

    if (assets[record.assetId]) {
      throw new Error(
        `[KANJIVG_IDENTITY] STOP — DUPLICATE ASSET IDENTITY: ${record.assetId}`
      );
    }
    assets[record.assetId] = record;

    if (record.classification === "KANJIVG_MATCH") {
      matched.push(character);
      if (record.strokeStatus === "STROKE_COUNT_DISCREPANCY") {
        discrepancies.push(
          compareStrokeCounts(
            character,
            record.canonicalKanjiId!,
            record.kanjidicStrokeCount!,
            record.strokeCount
          )
        );
      }
    } else {
      extra.push(character);
    }
  }

  // KANJIVG_MISSING: canonical rows without a KanjiVG primary (§9). Never
  // synthesized — recorded as omissions only.
  const missing: MissingRecord[] = [];
  for (const r of dbRows) {
    if (!charToCodepoint.has(r.character)) {
      missing.push({
        character: r.character,
        canonicalKanjiId: r.id,
        classification: "KANJIVG_MISSING",
      });
    }
  }
  missing.sort((a, b) => (a.canonicalKanjiId < b.canonicalKanjiId ? -1 : 1));
  discrepancies.sort((a, b) =>
    a.canonicalKanjiId < b.canonicalKanjiId ? -1 : 1
  );

  const body: Omit<KanjiVgIngestionState, "digest"> = {
    contract: KANJIVG_INGEST_CONTRACT,
    counts: {
      dbKanji: dbRows.length,
      indexedPrimaryKeys: keys.length,
      attached: matched.length,
      kanjivgExtra: extra.length,
      kanjivgMissing: missing.length,
      variantAssets: variantAssetsCount,
      strokesTotal,
      strokeMatch: discrepancies.length
        ? matched.length - discrepancies.length
        : matched.length,
      strokeDiscrepancy: discrepancies.length,
    },
    classification: {
      matched: [...matched].sort(),
      extra: [...extra].sort(),
      missing,
    },
    assets: Object.fromEntries(
      Object.keys(assets)
        .sort()
        .map((k) => [k, assets[k]])
    ),
    discrepancies,
  };
  const stateDigest = stateBodyDigest(body);
  const state: KanjiVgIngestionState = { ...body, digest: stateDigest };

  // ---- staged publish (the only writes this engine performs) ----
  const staging = publishPath(STAGING_DIR);
  const publish = publishPath(PUBLISH_DIR);
  const backup = publishPath(BACKUP_DIR);
  const previous = snapshotPublishedState();

  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });

  const rollback: KanjiVgIngestionResult["rollback"] = null;
  try {
    writeFileSync(
      resolve(staging, "state.json"),
      JSON.stringify(state, null, 2) + "\n"
    );
    writeFileSync(resolve(staging, "digest.txt"), stateDigest + "\n");

    if (options.forceFailAfterStagingWrite) {
      throw new Error(
        "[KANJIVG_INGESTION] FORCED MID-RUN FAILURE — after staged asset writes began"
      );
    }

    // Atomic swap: publish → backup, staging → publish, drop backup.
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
    // Complete rollback: staging discarded, previous published state intact.
    rmSync(staging, { recursive: true, force: true });
    const after = snapshotPublishedState();
    const preserved =
      after.exists === previous.exists &&
      (previous.digest === null || after.digest === previous.digest);
    if (!preserved) {
      throw new Error(
        `[KANJIVG_INGESTION] STOP — ROLLBACK INCOMPLETE: previous published state not preserved (${previous.digest} → ${after.digest})`
      );
    }
    const forced = options.forceFailAfterStagingWrite === true;
    if (!forced) throw error;
    const result: KanjiVgIngestionResult = {
      phase: options.phase,
      sourceIdentity: preflight.sourceIdentity,
      counts: body.counts,
      discrepancyCount: discrepancies.length,
      stateDigest,
      statePath: resolve(publish, "state.json"),
      stateBytes: 0,
      dbBefore,
      dbAfter: await collectDbEvidence(),
      dbImmutable: true,
      rollback: {
        forced: true,
        stagingCleaned: true,
        previousStatePreserved: true,
        previousStateDigest: previous.digest,
      },
    };
    result.dbImmutable =
      result.dbBefore.kanjiDigest === result.dbAfter.kanjiDigest &&
      result.dbBefore.dictionaryDigest === result.dbAfter.dictionaryDigest &&
      result.dbBefore.kanjiCount === result.dbAfter.kanjiCount &&
      result.dbBefore.dictionaryCount === result.dbAfter.dictionaryCount;
    return result;
  }

  const dbAfter = await collectDbEvidence();
  return {
    phase: options.phase,
    sourceIdentity: preflight.sourceIdentity,
    counts: body.counts,
    discrepancyCount: discrepancies.length,
    stateDigest,
    statePath: resolve(publish, "state.json"),
    stateBytes: readFileSync(resolve(publish, "state.json")).length,
    dbBefore,
    dbAfter,
    dbImmutable:
      dbBefore.kanjiDigest === dbAfter.kanjiDigest &&
      dbBefore.dictionaryDigest === dbAfter.dictionaryDigest &&
      dbBefore.kanjiCount === dbAfter.kanjiCount &&
      dbBefore.dictionaryCount === dbAfter.dictionaryCount,
    rollback,
  };
}

// ---------------------------------------------------------------------------
// CLI — guarded two-pass execution (Run 1 + Run 2 idempotency)
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const run1 = await executeKanjiVgIngestion({ phase: 1 });
  const run2 = await executeKanjiVgIngestion({ phase: 2 });
  console.log(
    JSON.stringify(
      {
        run1: {
          stateDigest: run1.stateDigest,
          counts: run1.counts,
          dbImmutable: run1.dbImmutable,
        },
        run2: {
          stateDigest: run2.stateDigest,
          identical: run2.stateDigest === run1.stateDigest,
        },
        verdict:
          run2.stateDigest === run1.stateDigest && run1.dbImmutable && run2.dbImmutable
            ? "KANJIVG_INGESTION_COMPLETE — not production authorization"
            : "STOP — IDEMPOTENCY OR IMMUTABILITY FAILURE",
      },
      null,
      2
    )
  );
}

if (process.argv[1] && /ingest-kanjivg(\.ts|\.js)$/.test(process.argv[1])) {
  main().then(() => process.exit(0)).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
