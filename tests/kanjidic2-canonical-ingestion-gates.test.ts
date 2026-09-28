/**
 * Phase 14.4C — Canonical Ingestion Remediation Gate Tests (ADDITIVE).
 *
 * Covers every newly enforced requirement (B1–B6):
 *  1. artifact identity mismatch      → zero writes
 *  2. wrong artifact/release          → zero writes
 *  3. 0 first-party baseline          → fail closed
 *  4. 33-row baseline                 → fail closed
 *  5. complete 45-row baseline        → permitted to proceed (13,063 → 13,108)
 *  6. incorrect first-party classification (wrong 34/11 split) → fail closed
 *  7. duplicate source character      → fail closed (before first write)
 *  8. unclassified / production DB target → fail closed
 *  9. forced mid-run failure          → complete rollback (0 canonical rows)
 * 10. 箸 preservation                 → kj-hashi / 14 / first-party:kanji-mindtree:v1
 * 11. 道 preservation                 → kanji-road / first-party:kanji-corpus:v1
 * 12. dictionary immutability         → exactly 206,747, row digest unchanged
 * 13. deterministic canonical IDs     → id === "kanji-" || character for all upstream rows
 * 14. idempotent second run           → 0 inserts / 0 updates / 0 drift / identical digest
 * 15. from-baseline reset             → forced failure leaves prior state intact
 *
 * ADDITIVE ONLY — tests/kanjidic2-canonical-ingestion.test.ts (the 20-test
 * canonical contract) is never modified. All execution targets the explicitly
 * disposable database only (NIHONGO_DB_TARGET_CLASS=disposable,
 * NIHONGO_DB_EXPECTED_DATABASE=app_db, loopback-only DSN).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { Client } from "pg";
import {
  executeKanjidicIngestion,
  planKanjidicIngestion,
} from "../scripts/ingest-kanjidic2";
import { parseKanjidicCharacterXml } from "../src/etl/kanji/xmlParser";
import type { RawKanjidicCharacter } from "../src/etl/kanji/types";
import { KnowledgeService } from "../src/services/knowledge/knowledgeService";
import { runKanjiETLPipeline } from "../src/etl/kanji/pipeline";

const UPSTREAM_REF = "upstream:kanjidic2:2023-08";
const MINDTREE_REF = "first-party:kanji-mindtree:v1";
const CORPUS_REF = "first-party:kanji-corpus:v1";

function dbUrl(): string {
  return (
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@127.0.0.1:5432/app_db"
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

interface Counts {
  total: number;
  upstream: number;
  firstParty: number;
}

async function counts(): Promise<Counts> {
  return withClient(async (c) => {
    const total = parseInt((await c.query("SELECT count(*) FROM kanji_entries")).rows[0].count, 10);
    const upstream = parseInt(
      (await c.query("SELECT count(*) FROM kanji_entries WHERE source_ref = $1", [UPSTREAM_REF]))
        .rows[0].count,
      10
    );
    return { total, upstream, firstParty: total - upstream };
  });
}

async function dictionaryEvidence(): Promise<{ count: number; digest: string }> {
  return withClient(async (c) => {
    const count = parseInt(
      (await c.query("SELECT count(*) FROM dictionary_entries")).rows[0].count,
      10
    );
    const digest = (
      await c.query(
        `SELECT md5(string_agg(id || '|' || headword || '|' || reading || '|' || romaji, ',' ORDER BY id)) AS d FROM dictionary_entries`
      )
    ).rows[0].d as string;
    return { count, digest };
  });
}

async function resetKanji(): Promise<void> {
  await withClient(async (c) => {
    await c.query("DELETE FROM kanji_entries");
    // KnowledgeService.ensureSeeded() is lazily idempotent on the kana guard
    // (kana_entries count > 0 ⇒ early return). Clearing it lets the production
    // seeder re-run in full so the 33-row mindtree state is reproducible from
    // any prior state. No fixtures are fabricated: both seeders remain the
    // production paths (ensureSeeded + runKanjiETLPipeline).
    await c.query("DELETE FROM kana_entries");
  });
}

async function seedMindtreeOnly(): Promise<void> {
  await KnowledgeService.ensureSeeded(); // 33 rows: first-party:kanji-mindtree:v1
}

async function seedFullBaseline(): Promise<void> {
  await KnowledgeService.ensureSeeded(); // 33 mindtree
  await runKanjiETLPipeline(); // + 12 pilot corpus = 45
}

let tmpDir: string;
let savedTargetClass: string | undefined;
let savedExpectedDb: string | undefined;
let run1Digest = "";

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "kanjidic2-gates-"));
  savedTargetClass = process.env.NIHONGO_DB_TARGET_CLASS;
  savedExpectedDb = process.env.NIHONGO_DB_EXPECTED_DATABASE;
  process.env.NIHONGO_DB_TARGET_CLASS = "disposable";
  process.env.NIHONGO_DB_EXPECTED_DATABASE = "app_db";
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  if (savedTargetClass === undefined) delete process.env.NIHONGO_DB_TARGET_CLASS;
  else process.env.NIHONGO_DB_TARGET_CLASS = savedTargetClass;
  if (savedExpectedDb === undefined) delete process.env.NIHONGO_DB_EXPECTED_DATABASE;
  else process.env.NIHONGO_DB_EXPECTED_DATABASE = savedExpectedDb;
});

describe("Phase 14.4C: canonical ingestion remediation gates (additive)", () => {
  it("1. artifact identity mismatch (corrupted bytes) refuses before any write", async () => {
    const before = await counts();
    const real = readFileSync(resolve(process.cwd(), "data/kanjidic2.xml"));
    const flipped = Buffer.from(real);
    flipped[flipped.length - 1] ^= 0xff; // correct size, wrong SHA-256
    const shaPath = join(tmpDir, "kanjidic2-flipped.xml");
    writeFileSync(shaPath, flipped);
    await expect(executeKanjidicIngestion(1, { artifactPath: shaPath })).rejects.toThrow(
      /SOURCE SHA MISMATCH/
    );
    expect(await counts()).toEqual(before);
  });

  it("2. wrong artifact/release refuses before any write", async () => {
    const before = await counts();
    const wrongPath = join(tmpDir, "kanjidic2-wrong.xml");
    writeFileSync(
      wrongPath,
      '<?xml version="1.0"?><kanjidic2><character><literal>明</literal></character></kanjidic2>'
    );
    await expect(executeKanjidicIngestion(1, { artifactPath: wrongPath })).rejects.toThrow(
      /SOURCE SIZE MISMATCH/
    );
    expect(await counts()).toEqual(before);
  });

  it("3. empty first-party baseline (0 rows) is refused before first write", async () => {
    await resetKanji();
    await expect(executeKanjidicIngestion(1)).rejects.toThrow(
      /FIRST-PARTY BASELINE PRECONDITION FAILED/
    );
    expect(await counts()).toEqual({ total: 0, upstream: 0, firstParty: 0 });
  });

  it("4. incomplete first-party baseline (33 rows) is refused before first write", async () => {
    await resetKanji();
    await seedMindtreeOnly();
    expect(await counts()).toEqual({ total: 33, upstream: 0, firstParty: 33 });
    await expect(executeKanjidicIngestion(1)).rejects.toThrow(
      /FIRST-PARTY BASELINE PRECONDITION FAILED/
    );
    expect(await counts()).toEqual({ total: 33, upstream: 0, firstParty: 33 });
  });

  it("6. incorrect first-party classification (wrong 34/11 split) is refused", async () => {
    await resetKanji();
    await seedFullBaseline();
    // Corrupt one corpus row's provenance so the split becomes 34/11 — the rows
    // themselves are real production rows; only the classification is wrong.
    await withClient((c) =>
      c.query("UPDATE kanji_entries SET source_ref = $1 WHERE id = 'kanji-road'", [MINDTREE_REF])
    );
    await expect(executeKanjidicIngestion(1)).rejects.toThrow(
      /FIRST-PARTY BASELINE PRECONDITION FAILED/
    );
    expect((await counts()).upstream).toBe(0);
    await resetKanji();
  });

  it("7. duplicate source character is refused in classification (before first write)", async () => {
    const mk = (literal: string): RawKanjidicCharacter =>
      parseKanjidicCharacterXml(
        `<character><literal>${literal}</literal><stroke_count>8</stroke_count></character>`
      );
    // Duplicate refusal is enforced in the engine's classification step
    // (planKanjidicIngestion), which completes before the transaction opens.
    await expect(
      planKanjidicIngestion([mk("明"), mk("明")] as RawKanjidicCharacter[], new Map(), new Map(), UPSTREAM_REF)
    ).rejects.toThrow(/DUPLICATE SOURCE RECORD/);
  });

  it("8. unclassified and production-classified targets are refused", async () => {
    const saved = process.env.NIHONGO_DB_TARGET_CLASS;
    delete process.env.NIHONGO_DB_TARGET_CLASS;
    try {
      await expect(executeKanjidicIngestion(1)).rejects.toThrow(/TARGET_CLASSIFICATION/);
    } finally {
      process.env.NIHONGO_DB_TARGET_CLASS = saved;
    }
    process.env.NIHONGO_DB_TARGET_CLASS = "production";
    try {
      await expect(executeKanjidicIngestion(1)).rejects.toThrow(/TARGET_CLASSIFICATION/);
    } finally {
      process.env.NIHONGO_DB_TARGET_CLASS = saved;
    }
  });

  it("9. forced mid-run failure rolls back completely (0 canonical rows)", async () => {
    await resetKanji();
    await seedFullBaseline();
    expect(await counts()).toEqual({ total: 45, upstream: 0, firstParty: 45 });
    await expect(
      executeKanjidicIngestion(1, {
        onBeforeBatch: (batchIndex) => {
          if (batchIndex >= 1) throw new Error("forced mid-run failure");
        },
      })
    ).rejects.toThrow(/forced mid-run failure/);
    // Run-level transactional guarantee: nothing remains committed.
    expect(await counts()).toEqual({ total: 45, upstream: 0, firstParty: 45 });
  }, 180_000);

  it("5./10./11. complete baseline proceeds: 13,063 inserted / 13,108 total; 箸 and 道 preserved", async () => {
    await resetKanji();
    await seedFullBaseline();

    const dictBefore = await dictionaryEvidence();
    expect(dictBefore.count).toBe(206747);

    const run1 = await executeKanjidicIngestion(1);
    run1Digest = run1.digest;

    expect(run1.insertedCount).toBe(13063);
    expect(run1.keepExistingCount).toBe(44);
    expect(run1.conflictCount).toBe(1);
    expect(run1.skipCount).toBe(0);
    expect(run1.unexpectedUpdatesCount).toBe(0);
    expect(run1.duplicatesCount).toBe(0);
    expect(run1.driftCount).toBe(0);
    expect(run1.totalKanjiInDb).toBe(13108);
    expect(run1.totalRecordsProcessed).toBe(13108);
    expect(run1.conflicts[0]).toMatchObject({
      character: "箸",
      existingId: "kj-hashi",
      existingValue: 14,
      kanjidicValue: 15,
      decision: "KEEP_EXISTING",
    });

    const state = await withClient(async (c) => {
      const hashi = (
        await c.query("SELECT id, stroke_count, source_ref FROM kanji_entries WHERE character = '箸'")
      ).rows;
      const road = (await c.query("SELECT id, source_ref FROM kanji_entries WHERE character = '道'"))
        .rows;
      return { hashi, road };
    });
    // 10. 箸 — exactly one row, first-party identity intact, never kanji-箸.
    expect(state.hashi).toEqual([
      { id: "kj-hashi", stroke_count: 14, source_ref: MINDTREE_REF },
    ]);
    // 11. 道 — pilot row preserved, never kanji-道.
    expect(state.road).toEqual([{ id: "kanji-road", source_ref: CORPUS_REF }]);

    const dictAfter = await dictionaryEvidence();
    expect(dictAfter).toEqual(dictBefore); // 12. dictionary untouched by the run
  }, 300_000);

  it("13. canonical IDs are deterministic (id === 'kanji-' || character for all upstream rows)", async () => {
    const violations = await withClient(
      async (c) =>
        (
          await c.query(
            "SELECT count(*) FROM kanji_entries WHERE source_ref = $1 AND id <> 'kanji-' || character",
            [UPSTREAM_REF]
          )
        ).rows[0].count
    );
    expect(parseInt(violations, 10)).toBe(0);
  });

  it("12./14. dictionary remains exactly 206,747 and second run is idempotent with identical digest", async () => {
    const dictBefore = await dictionaryEvidence();
    expect(dictBefore.count).toBe(206747);

    const run2 = await executeKanjidicIngestion(2);
    expect(run2.insertedCount).toBe(0);
    expect(run2.unexpectedUpdatesCount).toBe(0);
    expect(run2.duplicatesCount).toBe(0);
    expect(run2.driftCount).toBe(0);
    expect(run2.totalKanjiInDb).toBe(13108);
    expect(run2.digest).toBe(run1Digest);

    const dictAfter = await dictionaryEvidence();
    expect(dictAfter).toEqual(dictBefore);
  }, 300_000);

  it("15. from-baseline reset rolls back completely on failure (prior state intact)", async () => {
    // State from the previous tests: 13,108 rows ingested. Force a failure inside
    // the reset+re-ingest transaction; the DELETE must roll back with the inserts.
    expect(await counts()).toEqual({ total: 13108, upstream: 13063, firstParty: 45 });
    await expect(
      executeKanjidicIngestion(1, {
        fromBaseline: true,
        onBeforeBatch: (batchIndex) => {
          if (batchIndex >= 1) throw new Error("forced reset failure");
        },
      })
    ).rejects.toThrow(/forced reset failure/);
    expect(await counts()).toEqual({ total: 13108, upstream: 13063, firstParty: 45 });
  }, 300_000);
});
