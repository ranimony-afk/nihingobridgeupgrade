/**
 * Phase 14.4D — Controlled KanjiVG Ingestion / Canonical Attachment Gates.
 *
 * Mandatory acceptance tests for the controlled execution:
 *
 *  1.  Run 1 attaches the independently derived classification exactly
 *  2.  zero canonical kanji mutation (13,108 / digests unchanged)
 *  3.  KANJIDIC2 stroke-count immutability (箸 = 14 even where KanjiVG differs)
 *  4.  first-party preservation (45 = 33 mindtree + 12 corpus; kj-hashi / kanji-road)
 *  5.  provenance: every asset upstream:kanjivg:2024-08; 2024-04 registered unused
 *  6.  deterministic identity (kvg:${hex}-s${n} / kanjivg:${character}) + convergence
 *  7.  forced mid-run rollback  → no partial asset state (§14)
 *  8.  from-baseline rollback    → previous valid state survives exactly (§15)
 *  9.  fail-closed refusal suite (targets / provenance / identity / source) (§16)
 *  10. Run 2 idempotency: 0 inserts / 0 updates / 0 duplicates / 0 drift (§17)
 *  11. independent verifier PASS (§18)
 *  12. final SQL/state audit (§22)
 *
 * The database is the explicitly disposable target only. The engine performs
 * ZERO database writes; the asset target is the existing file-based model.
 * Tests never weaken, skip, or rewrite existing suites.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { Client } from "pg";

import {
  executeKanjiVgIngestion,
  buildAttachmentRecord,
  collectDbEvidence,
  REGISTERED_UNUSED_KANJIVG_REF,
  type KanjiVgIngestionResult,
} from "../scripts/ingest-kanjivg";
import { verifyKanjiVgIngestion } from "../scripts/verify-kanjivg-ingestion";
import { parseKanjiVgSvg } from "../src/etl/kanji/kanjiVgParser";
import { getRegisteredSource } from "../src/services/knowledge/provenance/registry";

const PUBLISH_DIR = resolve(process.cwd(), "data/kanjivg-attachment");
const STAGING_DIR = resolve(process.cwd(), "data/kanjivg-attachment.staging");

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

/** Independently derived classification (test-side, not engine-side). */
async function derivedClassification(): Promise<{
  match: number;
  extra: number;
  missing: number;
  hashiStroke: number;
  distinctIds: number;
  kanjivgProvenanceRows: number;
}> {
  const index: Record<string, string[]> = JSON.parse(
    readFileSync(resolve(process.cwd(), "data/kanjivg-index.json"), "utf-8")
  );
  return withClient(async (c) => {
    const rows = (
      await c.query(`SELECT id, character, stroke_count FROM kanji_entries`)
    ).rows as Array<{ id: string; character: string; stroke_count: number }>;
    const chars = new Set(rows.map((r) => r.character));
    const keys = Object.keys(index);
    const match = keys.filter((k) => chars.has(k)).length;
    const extra = keys.filter((k) => !chars.has(k)).length;
    const missing = rows.filter((r) => !index[r.character]).length;
    const hashi = rows.find((r) => r.character === "箸")!;
    const distinct = (
      await c.query(`SELECT count(DISTINCT id)::int AS n FROM kanji_entries`)
    ).rows[0].n as number;
    const provRows = (
      await c.query(
        `SELECT count(*)::int AS n FROM kanji_entries WHERE source_ref LIKE '%kanjivg%' OR source_ref LIKE '%2024-08%'`
      )
    ).rows[0].n as number;
    return {
      match,
      extra,
      missing,
      hashiStroke: hashi.stroke_count,
      distinctIds: distinct,
      kanjivgProvenanceRows: provRows,
    };
  });
}

let dbBaseline: Awaited<ReturnType<typeof collectDbEvidence>> | null = null;
let run1: KanjiVgIngestionResult | null = null;
let run1StateBytes = "";

describe("Phase 14.4D: controlled KanjiVG ingestion / canonical attachment gates", () => {
  beforeAll(() => {
    // Start from a clean asset target so the §14 rollback proves "no partial
    // state" from an empty baseline.
    rmSync(PUBLISH_DIR, { recursive: true, force: true });
    rmSync(STAGING_DIR, { recursive: true, force: true });
    rmSync(resolve(process.cwd(), "data/kanjivg-attachment.prev"), {
      recursive: true,
      force: true,
    });
  });

  it("1. refusal suite: unsupported / production-classified / mismatched targets fail closed before any write", async () => {
    const saved = {
      cls: process.env.NIHONGO_DB_TARGET_CLASS,
      db: process.env.NIHONGO_DB_EXPECTED_DATABASE,
    };
    try {
      process.env.NIHONGO_DB_TARGET_CLASS = "staging";
      await expect(executeKanjiVgIngestion({ phase: 1 })).rejects.toThrow(
        /TARGET_CLASSIFICATION/
      );

      process.env.NIHONGO_DB_TARGET_CLASS = "production";
      await expect(executeKanjiVgIngestion({ phase: 1 })).rejects.toThrow(
        /TARGET_CLASSIFICATION/
      );

      process.env.NIHONGO_DB_TARGET_CLASS = "disposable";
      process.env.NIHONGO_DB_EXPECTED_DATABASE = "other_db";
      await expect(executeKanjiVgIngestion({ phase: 1 })).rejects.toThrow(
        /TARGET_CLASSIFICATION/
      );

      process.env.NIHONGO_DB_TARGET_CLASS = undefined;
      delete process.env.NIHONGO_DB_TARGET_CLASS;
      await expect(executeKanjiVgIngestion({ phase: 1 })).rejects.toThrow(
        /TARGET_CLASSIFICATION/
      );
    } finally {
      if (saved.cls === undefined) delete process.env.NIHONGO_DB_TARGET_CLASS;
      else process.env.NIHONGO_DB_TARGET_CLASS = saved.cls;
      if (saved.db === undefined) delete process.env.NIHONGO_DB_EXPECTED_DATABASE;
      else process.env.NIHONGO_DB_EXPECTED_DATABASE = saved.db;
    }
    // Refusals happened before any write: nothing published, no staging.
    expect(existsSync(PUBLISH_DIR)).toBe(false);
    expect(existsSync(STAGING_DIR)).toBe(false);
  });

  it("2. refusal suite: invalid source provenance and wrong version fail closed (2024-04 registered but unused)", async () => {
    await expect(
      executeKanjiVgIngestion({ phase: 1, claimedSourceRef: "first-party:kanji-corpus:v1" })
    ).rejects.toThrow(/INVALID SOURCE PROVENANCE/);

    await expect(
      executeKanjiVgIngestion({ phase: 1, claimedSourceRef: REGISTERED_UNUSED_KANJIVG_REF })
    ).rejects.toThrow(/INVALID SOURCE PROVENANCE/);

    await expect(
      executeKanjiVgIngestion({ phase: 1, claimedVersion: "2024-09" })
    ).rejects.toThrow(/INVALID SOURCE PROVENANCE/);

    await expect(
      executeKanjiVgIngestion({ phase: 1, claimedVersion: "2025-01" })
    ).rejects.toThrow(/INVALID SOURCE PROVENANCE/);

    expect(existsSync(PUBLISH_DIR)).toBe(false);
    expect(existsSync(STAGING_DIR)).toBe(false);
  });

  it("3. refusal suite: wrong archive / wrong SHA / wrong index fail closed in preflight", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "kvg-refusal-"));
    const badArchive = join(tmp, "bad.tar.gz");
    writeFileSync(badArchive, Buffer.alloc(6403118, 0x41)); // correct size, wrong SHA
    await expect(
      executeKanjiVgIngestion({ phase: 1, paths: { archivePath: badArchive } })
    ).rejects.toThrow(/SOURCE PREFLIGHT FAILED/);

    const badIndex = join(tmp, "bad-index.json");
    writeFileSync(badIndex, "{}");
    await expect(
      executeKanjiVgIngestion({ phase: 1, paths: { indexPath: badIndex } })
    ).rejects.toThrow(/SOURCE PREFLIGHT FAILED/);

    const missingArchive = join(tmp, "absent.tar.gz");
    await expect(
      executeKanjiVgIngestion({ phase: 1, paths: { archivePath: missingArchive } })
    ).rejects.toThrow(/SOURCE PREFLIGHT FAILED/);

    rmSync(tmp, { recursive: true, force: true });
    expect(existsSync(PUBLISH_DIR)).toBe(false);
    expect(existsSync(STAGING_DIR)).toBe(false);
  });

  it("4. refusal suite: malformed source identity and duplicate stroke identity fail closed", () => {
    // Malformed filename identity
    const malformed = parseKanjiVgSvg(
      `<svg viewBox="0 0 109 109"><g id="kvg:zzz"><path id="kvg:zzz-s1" d="M0 0 L1 1"/></g></svg>`,
      "zzz.svg"
    );
    expect(() => buildAttachmentRecord(malformed, null)).toThrow(/MALFORMED SOURCE/);

    // Duplicate stroke identity
    const dupStrokes = parseKanjiVgSvg(
      `<svg viewBox="0 0 109 109"><g id="kvg:04e00"><path id="kvg:04e00-s1" d="M0 0 L1 1"/><path id="kvg:04e00-s1" d="M2 2 L3 3"/></g></svg>`,
      "04e00.svg"
    );
    expect(() => buildAttachmentRecord(dupStrokes, null)).toThrow(
      /DUPLICATE STROKE IDENTITY/
    );

    // Malformed stroke identity (non-conforming stroke id)
    const badStrokeId = parseKanjiVgSvg(
      `<svg viewBox="0 0 109 109"><g id="kvg:04e00"><path id="stroke-one" d="M0 0 L1 1"/></g></svg>`,
      "04e00.svg"
    );
    expect(() => buildAttachmentRecord(badStrokeId, null)).toThrow(
      /MALFORMED STROKE IDENTITY/
    );

    expect(existsSync(PUBLISH_DIR)).toBe(false);
  });

  it("5. forced mid-run rollback: failure after staged writes began leaves no partial asset state (§14)", async () => {
    const result = await executeKanjiVgIngestion({
      phase: 1,
      forceFailAfterStagingWrite: true,
    });
    expect(result.rollback).not.toBeNull();
    expect(result.rollback!.forced).toBe(true);
    expect(result.rollback!.stagingCleaned).toBe(true);
    expect(result.rollback!.previousStatePreserved).toBe(true);
    // No partial published asset state from an empty baseline.
    expect(existsSync(PUBLISH_DIR)).toBe(false);
    expect(existsSync(STAGING_DIR)).toBe(false);
    // 14.4C baseline intact.
    const db = await collectDbEvidence();
    expect(db.kanjiCount).toBe(13108);
    expect(db.dictionaryCount).toBe(206747);
    expect(db.mindtreeCount).toBe(33);
    expect(db.corpusCount).toBe(12);
    expect(db.hashiStroke).toBe(14);
  });

  it("6. Run 1: controlled ingestion attaches the independently derived classification (§13)", async () => {
    dbBaseline = await collectDbEvidence();
    const derived = await derivedClassification();

    run1 = await executeKanjiVgIngestion({ phase: 1 });
    expect(run1!.dbImmutable).toBe(true);
    expect(run1!.counts.dbKanji).toBe(13108);
    expect(run1!.counts.attached).toBe(derived.match);
    expect(run1!.counts.kanjivgExtra).toBe(derived.extra);
    expect(run1!.counts.kanjivgMissing).toBe(derived.missing);
    // classification closure: attached + missing == 13,108; attached + extra == 6,699
    expect(run1!.counts.attached + run1!.counts.kanjivgMissing).toBe(13108);
    expect(run1!.counts.attached + run1!.counts.kanjivgExtra).toBe(6699);
    expect(run1!.counts.indexedPrimaryKeys).toBe(6699);
    expect(run1!.counts.variantAssets).toBe(4959);
    expect(run1!.counts.strokeMatch + run1!.counts.strokeDiscrepancy).toBe(
      run1!.counts.attached
    );
    expect(run1!.stateDigest).toMatch(/^[0-9a-f]{64}$/);

    run1StateBytes = readFileSync(resolve(PUBLISH_DIR, "state.json"), "utf-8");
    expect(run1StateBytes.length).toBeGreaterThan(0);

    // No KANJIDIC2 stroke-count changes / no first-party deletions / no
    // provenance violations at the database level.
    const after = await collectDbEvidence();
    expect(after.kanjiDigest).toBe(dbBaseline!.kanjiDigest);
    expect(after.dictionaryDigest).toBe(dbBaseline!.dictionaryDigest);
    expect(after.kanjiCount).toBe(13108);
    expect(after.upstreamCount).toBe(13063);
    expect(after.mindtreeCount).toBe(33);
    expect(after.corpusCount).toBe(12);
  });

  it("7. stroke-count immutability: 箸 stays 14 — KanjiVG recorded as evidence only (§10)", async () => {
    const state = JSON.parse(readFileSync(resolve(PUBLISH_DIR, "state.json"), "utf-8"));

    // KANJIDIC2 remains authoritative.
    const db = await collectDbEvidence();
    expect(db.hashiStroke).toBe(14);
    expect(db.hashiId).toBe("kj-hashi");
    expect(db.hashiSourceRef).toBe("first-party:kanji-mindtree:v1");

    // The established discrepancy corpus includes 箸 (KanjiVG reports 15).
    const hashiAsset = state.assets["kanjivg:箸"];
    expect(hashiAsset).toBeDefined();
    expect(hashiAsset.canonicalKanjiId).toBe("kj-hashi");
    expect(hashiAsset.kanjidicStrokeCount).toBe(14);
    expect(hashiAsset.strokeCount).toBe(15);
    expect(hashiAsset.strokeStatus).toBe("STROKE_COUNT_DISCREPANCY");
    const inDiscrepancies = state.discrepancies.some(
      (d: { character: string; kanjidicStrokeCount: number; kanjivgStrokeCount: number }) =>
        d.character === "箸" &&
        d.kanjidicStrokeCount === 14 &&
        d.kanjivgStrokeCount === 15
    );
    expect(inDiscrepancies).toBe(true);
    expect(state.counts.strokeDiscrepancy).toBe(state.discrepancies.length);
    // The known reconciliation discrepancy set is preserved as evidence.
    expect(state.counts.strokeDiscrepancy).toBeGreaterThanOrEqual(84);
  });

  it("8. first-party preservation and provenance (§11): all assets upstream:kanjivg:2024-08", async () => {
    const state = JSON.parse(readFileSync(resolve(PUBLISH_DIR, "state.json"), "utf-8"));
    const records = Object.values(state.assets) as Array<{
      sourceRef: string;
      version: string;
      assetId: string;
    }>;
    expect(records.length).toBe(6699);
    for (const r of records) {
      expect(r.sourceRef).toBe("upstream:kanjivg:2024-08");
      expect(r.version).toBe("r20240807");
    }

    // Registry: 2024-04 registered but unused; never provenance of any asset.
    const legacy = getRegisteredSource(REGISTERED_UNUSED_KANJIVG_REF);
    expect(legacy).not.toBeNull();
    const usedRefs = new Set(records.map((r) => r.sourceRef));
    expect(usedRefs.has(REGISTERED_UNUSED_KANJIVG_REF)).toBe(false);
    expect(usedRefs.has("first-party:kanji-corpus:v1")).toBe(false);

    // First-party kanji rows intact.
    const db = await collectDbEvidence();
    expect(db.mindtreeCount).toBe(33);
    expect(db.corpusCount).toBe(12);
    expect(db.roadId).toBe("kanji-road");
    expect(db.roadSourceRef).toBe("first-party:kanji-corpus:v1");
  });

  it("9. deterministic identity: kvg:${hex}-s${n} / kanjivg:${character}, convergence (§12)", async () => {
    const state = JSON.parse(readFileSync(resolve(PUBLISH_DIR, "state.json"), "utf-8"));

    // No timestamp / UUID / mutable identity fields in the state document.
    const serialized = JSON.stringify(state);
    expect(serialized).not.toMatch(/generatedAt|timestamp|"uuid"|Date\.now/i);

    const entries = Object.entries(state.assets) as Array<[string, {
      character: string;
      codepoint: string;
      strokeIds: string[];
    }]>;
    for (const [assetId, rec] of entries) {
      expect(assetId).toBe(`kanjivg:${rec.character}`);
      expect(rec.strokeIds.length).toBeGreaterThan(0);
      rec.strokeIds.forEach((id, i) => {
        expect(id).toBe(`kvg:${rec.codepoint}-s${i + 1}`);
      });
    }
    // Repeated execution converges (asserted again in Run 2).
  });

  it("10. from-baseline rollback: existing valid state survives a forced failure exactly (§15)", async () => {
    const beforeBytes = readFileSync(resolve(PUBLISH_DIR, "state.json"), "utf-8");
    const result = await executeKanjiVgIngestion({
      phase: 1,
      forceFailAfterStagingWrite: true,
    });
    expect(result.rollback).not.toBeNull();
    expect(result.rollback!.previousStatePreserved).toBe(true);
    expect(result.rollback!.previousStateDigest).toBe(
      createHash("sha256").update(beforeBytes, "utf-8").digest("hex")
    );
    // Previous valid state survives byte-for-byte.
    const afterBytes = readFileSync(resolve(PUBLISH_DIR, "state.json"), "utf-8");
    expect(afterBytes).toBe(beforeBytes);
    expect(existsSync(STAGING_DIR)).toBe(false);

    // Canonical baseline still intact.
    const db = await collectDbEvidence();
    expect(db.kanjiCount).toBe(13108);
    expect(db.dictionaryCount).toBe(206747);
  });

  it("11. Run 2 idempotency: 0 inserts / 0 updates / 0 duplicates / 0 drift, identical digest (§17)", async () => {
    const run2 = await executeKanjiVgIngestion({ phase: 2 });
    expect(run2.stateDigest).toBe(run1!.stateDigest);
    expect(run2.dbImmutable).toBe(true);
    expect(run2.counts).toEqual(run1!.counts);

    const run2Bytes = readFileSync(resolve(PUBLISH_DIR, "state.json"), "utf-8");
    expect(run2Bytes).toBe(run1StateBytes); // 0 drift — byte-identical state

    const db = await collectDbEvidence();
    expect(db.kanjiDigest).toBe(dbBaseline!.kanjiDigest);
    expect(db.dictionaryDigest).toBe(dbBaseline!.dictionaryDigest);
  });

  it("12. independent verifier recomputes the final state and PASSes (§18)", async () => {
    const verdict = await verifyKanjiVgIngestion();
    const failed = verdict.checks.filter((c) => !c.ok);
    expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
    expect(verdict.verdict).toBe("PASS");
  });

  it("13. final SQL/state audit: exact attached assets, zero mutations (§22)", async () => {
    const derived = await derivedClassification();
    const state = JSON.parse(readFileSync(resolve(PUBLISH_DIR, "state.json"), "utf-8"));

    // Exact number of attached assets from the independently derived classification.
    expect(state.counts.attached).toBe(derived.match);
    expect(state.counts.kanjivgExtra).toBe(derived.extra);
    expect(state.counts.kanjivgMissing).toBe(derived.missing);

    // 0 KANJIDIC2 stroke-count mutations / 0 first-party identity mutations.
    expect(derived.hashiStroke).toBe(14);
    expect(derived.distinctIds).toBe(13108);
    // 0 rows created for KANJIVG_EXTRA (no kanjivg provenance in kanji_entries).
    expect(derived.kanjivgProvenanceRows).toBe(0);
    const db = await collectDbEvidence();
    expect(db.kanjiCount).toBe(13108);
    expect(db.dictionaryCount).toBe(206747);
    expect(db.kanjiDigest).toBe(dbBaseline!.kanjiDigest);
    expect(db.dictionaryDigest).toBe(dbBaseline!.dictionaryDigest);
  });
});
