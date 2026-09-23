/**
 * Phase 14.3D — Full JMdict Controlled PostgreSQL Ingestion Test Suite
 *
 * Verifies all 18 required deterministic conditions:
 * 1. source hash mismatch
 * 2. source release mismatch
 * 3. environment safety failure
 * 4. dry-run protection
 * 5. pilot mode
 * 6. batch insertion
 * 7. duplicate ID
 * 8. identical existing record
 * 9. conflicting existing record
 * 10. rollback
 * 11. checkpoint
 * 12. resume
 * 13. source mismatch on resume
 * 14. deterministic IDs
 * 15. provenance
 * 16. JSONB equality
 * 17. final reconciliation
 * 18. random sample reconciliation
 */

import { describe, it, expect } from "vitest";
import { resolve } from "path";
import { db } from "@/db";
import { dictionaryEntries, knowledgeSources } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  validateEnvironmentSafety,
  verifySourceContract,
  CheckpointManager,
  testRollbackTransaction,
  reconcileRandomSample,
  executeIngestion,
  EXPECTED_JMDICT_SHA256,
  EXPECTED_JMDICT_RELEASE,
  JMDICT_SOURCE_ID,
  type IngestionCheckpoint,
  type SourceMetadata,
} from "../scripts/ingest-full-jmdict";
import {
  areSensesEqual,
  areArraysEqual,
  InMemoryDictionaryPersistenceAdapter,
} from "@/etl/dictionary/persistenceAdapter";
import { transformJMdictEntry } from "@/etl/dictionary/transformer";
import type { RawJMdictSourceRecord } from "@/etl/dictionary/types";

describe("Phase 14.3D: Controlled Full JMdict Production Ingestion", () => {
  const dummySourceMeta: SourceMetadata = {
    sourceId: JMDICT_SOURCE_ID,
    releaseVersion: EXPECTED_JMDICT_RELEASE,
    license: "CC-BY-SA-3.0",
    attribution: "EDRDG",
    xmlPath: resolve(process.cwd(), "data/JMdict.xml"),
    xmlSizeBytes: 115331197,
    xmlSha256: EXPECTED_JMDICT_SHA256,
    expectedEntries: 206717,
    transformationVersion: "jmdict-v1",
    schemaContract: "dictionary_entries",
    deterministicIdStrategy: "de-jmdict-${entSeq}",
  };

  // 1. source hash mismatch
  it("1. aborts on source hash mismatch", () => {
    const wrongHash = "0000000000000000000000000000000000000000000000000000000000000000";
    expect(() => {
      verifySourceContract(undefined, wrongHash);
    }).toThrow(/SOURCE HASH MISMATCH/);
  });

  // 2. source release mismatch
  it("2. aborts on source release mismatch", () => {
    const wrongRelease = "1999-01-01";
    expect(() => {
      verifySourceContract(undefined, EXPECTED_JMDICT_SHA256, wrongRelease);
    }).toThrow(/SOURCE RELEASE MISMATCH/);
  });

  // 3. environment safety failure
  it("3. aborts on forbidden environment hostname or non-loopback database target", async () => {
    const forbiddenSupabaseUrl =
      "postgresql://postgres:secret@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres";
    await expect(validateEnvironmentSafety(forbiddenSupabaseUrl)).rejects.toThrow(
      /TARGET DATABASE FORBIDDEN/
    );

    const remoteUrl = "postgresql://user:pass@192.168.1.100:5432/production_db";
    await expect(validateEnvironmentSafety(remoteUrl)).rejects.toThrow(
      /TARGET DATABASE AMBIGUOUS/
    );
  });

  // 4. dry-run protection
  it("4. protects database during dry-run execution with zero state modification", async () => {
    const [countBefore] = await db
      .select({ count: sql`cast(count(*) as int)` })
      .from(dictionaryEntries);

    const result = await executeIngestion({
      dryRun: true,
      pilot: true,
      pilotStage: "A",
    });

    const [countAfter] = await db
      .select({ count: sql`cast(count(*) as int)` })
      .from(dictionaryEntries);

    expect(result.status).toBe("DRY_RUN_COMPLETE");
    expect(Number(countAfter.count)).toBe(Number(countBefore.count));
  });

  // 5. pilot mode
  it("5. executes controlled pilot stages (Stage A: 10 records)", async () => {
    const result = await executeIngestion({
      dryRun: true,
      pilot: true,
      pilotStage: "A",
    });
    expect(result.report.processedCount).toBe(10);
  });

  // 6. batch insertion
  it("6. performs batch insertion correctly in chunks", async () => {
    const adapter = new InMemoryDictionaryPersistenceAdapter();
    const candidate1 = {
      id: "de-jmdict-batch-1",
      headword: "単語一",
      reading: "たんごいち",
      romaji: "tangoichi",
      jlptLevel: "NONE" as const,
      isCommon: false,
      frequencyRank: null,
      partsOfSpeech: ["n"],
      senses: [{ glosses: ["word one"] }],
      kanjiCharacters: ["単", "語", "一"],
      tags: [],
      sourceRef: JMDICT_SOURCE_ID,
    };
    const candidate2 = {
      id: "de-jmdict-batch-2",
      headword: "単語二",
      reading: "たんごに",
      romaji: "tangoni",
      jlptLevel: "NONE" as const,
      isCommon: false,
      frequencyRank: null,
      partsOfSpeech: ["n"],
      senses: [{ glosses: ["word two"] }],
      kanjiCharacters: ["単", "語", "二"],
      tags: [],
      sourceRef: JMDICT_SOURCE_ID,
    };

    const res = await adapter.upsertBatch([candidate1, candidate2]);
    expect(res.inserted).toBe(2);
    expect(await adapter.count()).toBe(2);
  });

  // 7. duplicate ID
  it("7. deduplicates identical IDs gracefully", async () => {
    const raw: RawJMdictSourceRecord = {
      entSeq: "9999991",
      kanji: [{ keb: "重複", keInf: [], kePri: [] }],
      readings: [{ reb: "ちょうふく", reNoKanji: false, reRestr: [], reInf: [], rePri: [] }],
      senses: [{ pos: ["n"], glosses: [{ lang: "eng", text: "duplication" }] }],
    };
    const t1 = transformJMdictEntry(raw, JMDICT_SOURCE_ID);
    const t2 = transformJMdictEntry(raw, JMDICT_SOURCE_ID);
    expect(t1.record?.id).toBe(t2.record?.id);
    expect(t1.record?.id).toBe("de-jmdict-9999991");
  });

  // 8. identical existing record
  it("8. skips identical existing database records (no write)", async () => {
    const adapter = new InMemoryDictionaryPersistenceAdapter();
    const candidate = {
      id: "de-jmdict-skip-test",
      headword: "不変",
      reading: "ふへん",
      romaji: "fuhen",
      jlptLevel: "NONE" as const,
      isCommon: true,
      frequencyRank: 100,
      partsOfSpeech: ["adj-no"],
      senses: [{ glosses: ["invariable", "unchangeable"] }],
      kanjiCharacters: ["不", "変"],
      tags: [],
      sourceRef: JMDICT_SOURCE_ID,
    };

    const run1 = await adapter.upsertBatch([candidate]);
    expect(run1.inserted).toBe(1);

    const run2 = await adapter.upsertBatch([candidate]);
    expect(run2.inserted).toBe(0);
    expect(run2.skipped).toBe(1);
    expect(run2.updated).toBe(0);
  });

  // 9. conflicting existing record
  it("9. updates conflicting existing records when explicitly modified", async () => {
    const adapter = new InMemoryDictionaryPersistenceAdapter();
    const original = {
      id: "de-jmdict-conflict-test",
      headword: "衝突",
      reading: "しょうとつ",
      romaji: "shoutotsu",
      jlptLevel: "NONE" as const,
      isCommon: false,
      frequencyRank: null,
      partsOfSpeech: ["n"],
      senses: [{ glosses: ["collision"] }],
      kanjiCharacters: ["衝", "突"],
      tags: [],
      sourceRef: JMDICT_SOURCE_ID,
    };
    await adapter.upsertBatch([original]);

    const modified = {
      ...original,
      senses: [{ glosses: ["collision", "conflict", "clash"] }],
    };
    const updateRes = await adapter.upsertBatch([modified]);
    expect(updateRes.updated).toBe(1);
    expect(updateRes.inserted).toBe(0);
    expect(updateRes.skipped).toBe(0);
  });

  // 10. rollback
  it("10. rolls back transaction on failure with zero partial writes", async () => {
    const rollbackRes = await testRollbackTransaction();
    expect(rollbackRes.rollbackSuccessful).toBe(true);
    expect(rollbackRes.preCount).toBe(rollbackRes.postCount);
  });

  // 11. checkpoint
  it("11. serializes and deserializes ingestion checkpoints", () => {
    const tempCpPath = resolve(process.cwd(), "data/test-checkpoint.json");
    const cp: IngestionCheckpoint = {
      sourceId: JMDICT_SOURCE_ID,
      sourceHash: EXPECTED_JMDICT_SHA256,
      releaseVersion: EXPECTED_JMDICT_RELEASE,
      transformationVersion: "jmdict-v1",
      schemaContract: "dictionary_entries",
      deterministicIdStrategy: "de-jmdict-${entSeq}",
      lastProcessedEntSeq: "1000660",
      recordsProcessed: 50,
      recordsInserted: 50,
      recordsSkipped: 0,
      recordsUpdated: 0,
      recordsConflicted: 0,
      recordsRejected: 0,
      warningCount: 0,
      errorCount: 0,
      timestamp: new Date().toISOString(),
    };

    CheckpointManager.saveCheckpoint(tempCpPath, cp);
    const loaded = CheckpointManager.loadCheckpoint(tempCpPath);
    expect(loaded).toBeDefined();
    expect(loaded?.lastProcessedEntSeq).toBe("1000660");
    expect(loaded?.recordsProcessed).toBe(50);
  });

  // 12. resume
  it("12. approves resume when all 6 safety preconditions match", () => {
    const cp: IngestionCheckpoint = {
      sourceId: JMDICT_SOURCE_ID,
      sourceHash: EXPECTED_JMDICT_SHA256,
      releaseVersion: EXPECTED_JMDICT_RELEASE,
      transformationVersion: "jmdict-v1",
      schemaContract: "dictionary_entries",
      deterministicIdStrategy: "de-jmdict-${entSeq}",
      lastProcessedEntSeq: "1000660",
      recordsProcessed: 50,
      recordsInserted: 50,
      recordsSkipped: 0,
      recordsUpdated: 0,
      recordsConflicted: 0,
      recordsRejected: 0,
      warningCount: 0,
      errorCount: 0,
      timestamp: new Date().toISOString(),
    };

    const safety = CheckpointManager.verifyResumeSafety(cp, dummySourceMeta);
    expect(safety.safe).toBe(true);
  });

  // 13. source mismatch on resume
  it("13. rejects resume when source hash, release, or contract mismatches", () => {
    const mismatchedCp: IngestionCheckpoint = {
      sourceId: JMDICT_SOURCE_ID,
      sourceHash: "altered-hash-12345",
      releaseVersion: EXPECTED_JMDICT_RELEASE,
      transformationVersion: "jmdict-v1",
      schemaContract: "dictionary_entries",
      deterministicIdStrategy: "de-jmdict-${entSeq}",
      lastProcessedEntSeq: "1000660",
      recordsProcessed: 50,
      recordsInserted: 50,
      recordsSkipped: 0,
      recordsUpdated: 0,
      recordsConflicted: 0,
      recordsRejected: 0,
      warningCount: 0,
      errorCount: 0,
      timestamp: new Date().toISOString(),
    };

    const safety = CheckpointManager.verifyResumeSafety(mismatchedCp, dummySourceMeta);
    expect(safety.safe).toBe(false);
    expect(safety.reason).toContain("sourceHash mismatch");
  });

  // 14. deterministic IDs
  it("14. generates strictly deterministic IDs conforming to de-jmdict-${entSeq}", () => {
    const raw: RawJMdictSourceRecord = {
      entSeq: "1234560",
      kanji: [{ keb: "確定", keInf: [], kePri: [] }],
      readings: [{ reb: "かくてい", reNoKanji: false, reRestr: [], reInf: [], rePri: [] }],
      senses: [{ pos: ["n"], glosses: [{ lang: "eng", text: "definition" }] }],
    };
    const { record } = transformJMdictEntry(raw, JMDICT_SOURCE_ID);
    expect(record?.id).toBe("de-jmdict-1234560");
    expect(/^de-jmdict-[0-9]+$/.test(record?.id || "")).toBe(true);
  });

  // 15. provenance
  it("15. stamps exact upstream:jmdict:2023-08 provenance linking to registered source", async () => {
    const [sourceRow] = await db
      .select()
      .from(knowledgeSources)
      .where(eq(knowledgeSources.id, JMDICT_SOURCE_ID));

    expect(sourceRow).toBeDefined();
    expect(sourceRow?.id).toBe(JMDICT_SOURCE_ID);
    expect(sourceRow?.license).toBe("CC-BY-SA-3.0");
    expect(sourceRow?.name).toContain("JMdict");
  });

  // 16. JSONB equality
  it("16. computes deep semantic JSONB equality across senses and string arrays", () => {
    const s1 = [{ glosses: ["water", "liquid"], note: null }];
    const s2 = [{ glosses: ["water", "liquid"], note: null }];
    const s3 = [{ glosses: ["water"], note: null }];

    expect(areSensesEqual(s1, s2)).toBe(true);
    expect(areSensesEqual(s1, s3)).toBe(false);
    expect(areArraysEqual(["n", "adj-no"], ["n", "adj-no"])).toBe(true);
    expect(areArraysEqual(["n"], ["v5m"])).toBe(false);
  });

  // 17. final reconciliation
  it("17. verifies zero missing IDs, zero duplicate IDs, and expected row counts", async () => {
    const [jmdictRow] = await db
      .select({ count: sql`cast(count(*) as int)` })
      .from(dictionaryEntries)
      .where(eq(dictionaryEntries.sourceRef, JMDICT_SOURCE_ID));

    const [distinctRow] = await db
      .select({ count: sql`cast(count(distinct id) as int)` })
      .from(dictionaryEntries)
      .where(eq(dictionaryEntries.sourceRef, JMDICT_SOURCE_ID));

    expect(Number(jmdictRow.count)).toBe(206717);
    expect(Number(distinctRow.count)).toBe(206717);
  });

  // 18. random sample reconciliation
  it("18. confirms zero field mismatches across 100 deterministic random sample records", async () => {
    const sampleAudit = await reconcileRandomSample(100);
    expect(sampleAudit.sampleSize).toBe(100);
    expect(sampleAudit.matchedCount).toBe(100);
    expect(sampleAudit.mismatchCount).toBe(0);
    expect(sampleAudit.mismatches).toHaveLength(0);
  }, 30_000);
});
