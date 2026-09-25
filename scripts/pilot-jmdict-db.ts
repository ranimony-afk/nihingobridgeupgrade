/**
 * Phase 14.3C — Controlled JMdict PostgreSQL Database Pilot Runner
 *
 * Exercises the production ETL path and Drizzle persistence adapter against
 * a verified disposable PostgreSQL instance with zero production DB contact.
 */

import "dotenv/config";
import fs from "fs";
import { Client } from "pg";
import { db } from "@/db";
import {
  dictionaryEntries,
  knowledgeSources,
  cmsContentItems,
  cmsContentVersions,
  cmsAuditLog,
  entityTranslations,
} from "@/db/schema";
import { eq, sql, inArray } from "drizzle-orm";
import { streamJMdictEntries } from "@/etl/dictionary/xmlParser";
import { transformJMdictEntry } from "@/etl/dictionary/transformer";
import { DictionaryPipeline } from "@/etl/dictionary/pipeline";
import {
  createETLProvenanceContext,
  getRegisteredSource,
} from "@/services/knowledge/provenance";
import {
  DrizzleDictionaryPersistenceAdapter,
  areSensesEqual,
  areArraysEqual,
} from "@/etl/dictionary/persistenceAdapter";
import { DictionaryService } from "@/services/dictionary/dictionaryService";
import type {
  RawJMdictSourceRecord,
  CanonicalDictionaryEntry,
} from "@/etl/dictionary/types";

export interface PilotVerificationResults {
  safetyProbe: {
    host: string;
    port: string;
    isLoopback: boolean;
    isProductionForbidden: boolean;
    databaseName: string;
    currentUser: string;
    currentSchema: string;
    postgresVersion: string;
    classification: string;
  };
  provenance: {
    registeredId: string;
    version: string;
    license: string;
  };
  datasetMetrics: {
    totalRecords: number;
    kanjiKanaCount: number;
    kanaOnlyCount: number;
    multiReadingsCount: number;
    readingRestrictionsCount: number;
    multiSensesCount: number;
    uniquePosCodesCount: number;
    longVowelsCount: number;
    classicalPosEntriesCount: number;
  };
  run1Persistence: {
    inserted: number;
    updated: number;
    skipped: number;
    durationMs: number;
  };
  reconciliation: {
    matchedRecords: number;
    missingRecords: number;
    unexpectedRecords: number;
    fieldMismatches: number;
  };
  idempotencyRun2: {
    inserted: number;
    updated: number;
    skipped: number;
    rowCountRun1: number;
    rowCountRun2: number;
    isIdempotent: boolean;
  };
  conflictUpdateTest: {
    updatedCount: number;
    verifiedUpdatedValue: boolean;
    revertedCount: number;
    verifiedRevertedValue: boolean;
  };
  transactionRollbackTest: {
    rollbackSuccessful: boolean;
    preRollbackCount: number;
    postRollbackCount: number;
    zeroPartialWrites: boolean;
  };
  constraintsTest: {
    duplicatePkBlocked: boolean;
    notNullConstraintEnforced: boolean;
  };
  readBackTest: {
    directIdLookup: boolean;
    japaneseSearch: boolean;
    readingSearch: boolean;
    romajiSearch: boolean;
    englishSearch: boolean;
    provenanceLinked: boolean;
  };
  isolationTest: {
    cmsItemsCount: number;
    cmsVersionsCount: number;
    cmsAuditLogCount: number;
    translationsCount: number;
    cmsIsolated: boolean;
    translationsIsolated: boolean;
  };
}

export async function runControlledPilot(): Promise<PilotVerificationResults> {
  console.log("=== PHASE 14.3C: CONTROLLED JMDICT DATABASE PILOT ===");

  // ----------------------------------------------------
  // STEP 2: Database Safety Probe
  // ----------------------------------------------------
  console.log("\n[STEP 2] Database Safety Probe...");
  const connStr = process.env.DATABASE_URL;
  if (!connStr) {
    throw new Error("DATABASE_URL is required for database pilot.");
  }

  const url = new URL(connStr);
  const host = url.hostname;
  const port = url.port || "5432";
  const isLoopback = host === "127.0.0.1" || host === "localhost" || host === "::1";
  const isProductionForbidden =
    host.includes("pooler.supabase.com") ||
    host.includes("aws-0-ap-northeast-1") ||
    host.includes("supabase.co") ||
    host.includes("neon.tech") ||
    host.includes("vercel-storage.com");

  if (isProductionForbidden) {
    throw new Error(
      `FATAL SAFETY VIOLATION: Database host "${host}" matches forbidden production hostnames. Immediate hard stop!`
    );
  }

  if (!isLoopback) {
    throw new Error(
      `FATAL SAFETY VIOLATION: Target host "${host}" is not a verified local disposable loopback host.`
    );
  }

  const probeClient = new Client({ connectionString: connStr });
  await probeClient.connect();
  const vRes = await probeClient.query("SELECT version();");
  const uRes = await probeClient.query(
    "SELECT current_user, current_database(), current_schema();"
  );
  await probeClient.end();

  const safetyProbe = {
    host,
    port,
    isLoopback,
    isProductionForbidden: false,
    databaseName: uRes.rows[0].current_database,
    currentUser: uRes.rows[0].current_user,
    currentSchema: uRes.rows[0].current_schema,
    postgresVersion: vRes.rows[0].version,
    classification: "disposable-local-loopback",
  };
  console.log("Safety probe verified:", safetyProbe);

  // ----------------------------------------------------
  // STEP 3 & 4: Migrations & Provenance Registration
  // ----------------------------------------------------
  console.log("\n[STEP 3 & 4] Ensuring JMdict Provenance upstream:jmdict:2023-08...");
  const PROV_KEY = "upstream:jmdict:2023-08";
  const provDef = getRegisteredSource(PROV_KEY);
  if (!provDef) {
    throw new Error(`Provenance key ${PROV_KEY} not registered in registry.`);
  }

  // Check if source already exists in DB
  const [existingProv] = await db
    .select()
    .from(knowledgeSources)
    .where(eq(knowledgeSources.id, PROV_KEY))
    .limit(1);

  if (!existingProv) {
    await db.insert(knowledgeSources).values({
      id: provDef.id,
      name: provDef.name,
      version: provDef.version,
      license: provDef.license,
      url: provDef.uri,
      description: provDef.description,
      domain: provDef.domain,
      recordCount: 100,
    });
    console.log(`Registered provenance row: ${PROV_KEY}`);
  } else {
    console.log(`Provenance row already present: ${PROV_KEY}`);
  }

  const provenanceResult = {
    registeredId: provDef.id,
    version: provDef.version,
    license: provDef.license,
  };

  // Record baseline counts for CMS and translation tables
  const [cmsItemsPre] = await db.select({ count: sql<number>`cast(count(*) as int)` }).from(cmsContentItems);
  const [cmsVersionsPre] = await db.select({ count: sql<number>`cast(count(*) as int)` }).from(cmsContentVersions);
  const [cmsAuditPre] = await db.select({ count: sql<number>`cast(count(*) as int)` }).from(cmsAuditLog);
  const [transPre] = await db.select({ count: sql<number>`cast(count(*) as int)` }).from(entityTranslations);

  // ----------------------------------------------------
  // STEP 5: Select Deterministic ~100-Record Pilot Dataset
  // ----------------------------------------------------
  console.log("\n[STEP 5] Selecting Deterministic ~100-Record Pilot Dataset...");
  const stream = fs.createReadStream("data/JMdict.xml", { encoding: "utf8" });
  const targetClassicalSeqs = new Set([
    "1151290", // 悪し (classical adj-s)
    "1229330", // 求む (classical v4m)
    "1270350", // 御座る (classical v4r)
    "1310730", // 死ぬ (classical v-unspec / v5n)
    "1314200", // 事珍し (classical adj-shiku)
  ]);

  const first95: RawJMdictSourceRecord[] = [];
  const classicalRecords: RawJMdictSourceRecord[] = [];

  for await (const raw of streamJMdictEntries(stream)) {
    if (first95.length < 95) {
      first95.push(raw);
    }
    if (targetClassicalSeqs.has(raw.entSeq)) {
      classicalRecords.push(raw);
    }
    if (first95.length >= 95 && classicalRecords.length >= 5) {
      break;
    }
  }

  const rawPilotRecords: RawJMdictSourceRecord[] = [...first95, ...classicalRecords];
  if (rawPilotRecords.length !== 100) {
    throw new Error(`Expected exactly 100 pilot records, got ${rawPilotRecords.length}`);
  }

  // Analyze dataset diversity
  let kanjiKanaCount = 0;
  let kanaOnlyCount = 0;
  let multiReadingsCount = 0;
  let readingRestrictionsCount = 0;
  let multiSensesCount = 0;
  const posSet = new Set<string>();
  let longVowelsCount = 0;
  let classicalPosEntriesCount = 0;

  for (const raw of rawPilotRecords) {
    const t = transformJMdictEntry(raw, PROV_KEY);
    if (!t.record) continue;
    const rec = t.record;
    if (raw.kanji.length > 0) kanjiKanaCount++;
    if (raw.kanji.length === 0) kanaOnlyCount++;
    if (raw.readings.length > 1) multiReadingsCount++;
    if (raw.readings.some((r) => r.reRestr && r.reRestr.length > 0)) readingRestrictionsCount++;
    if (raw.senses.length > 1) multiSensesCount++;
    for (const s of raw.senses) {
      for (const p of s.pos) posSet.add(p);
    }
    if (/[āīūēōâîûêô]/.test(rec.romaji) || /ー/.test(rec.reading)) longVowelsCount++;
    if (t.diagnostics.some((d) => d.code === "UNKNOWN_POS_CODE")) classicalPosEntriesCount++;
  }

  const datasetMetrics = {
    totalRecords: rawPilotRecords.length,
    kanjiKanaCount,
    kanaOnlyCount,
    multiReadingsCount,
    readingRestrictionsCount,
    multiSensesCount,
    uniquePosCodesCount: posSet.size,
    longVowelsCount,
    classicalPosEntriesCount,
  };
  console.log("Dataset metrics:", datasetMetrics);

  // ----------------------------------------------------
  // STEP 6: Execute Real Production ETL Pipeline & Run 1
  // ----------------------------------------------------
  console.log("\n[STEP 6] Executing Production ETL Pipeline (Run 1)...");
  const expectedCandidateIds = rawPilotRecords.map((r) => `de-jmdict-${r.entSeq}`);

  // Clean any previous test rows for these IDs to ensure clean baseline
  await db.delete(dictionaryEntries).where(inArray(dictionaryEntries.id, expectedCandidateIds));

  const startTimeRun1 = Date.now();
  const reportRun1 = await DictionaryPipeline.run({
    sourceId: PROV_KEY,
    sourceRecords: rawPilotRecords,
    batchSize: 50,
    dryRun: false,
  });
  const durationMsRun1 = Date.now() - startTimeRun1;

  console.log("Persistence Run 1 result:", {
    inserted: reportRun1.inserted,
    updated: reportRun1.updated,
    skipped: reportRun1.skipped,
    valid: reportRun1.valid,
    durationMs: durationMsRun1,
  });

  // Reconciliation: Verify all 100 entries in the database match exactly
  console.log("\n[STEP 6.1] Reconciling Database Records...");
  const dbRows = await db
    .select()
    .from(dictionaryEntries)
    .where(inArray(dictionaryEntries.id, expectedCandidateIds));

  const dbRowMap = new Map(dbRows.map((r) => [r.id, r]));
  let missingRecords = 0;
  let fieldMismatches = 0;

  // Build expected transformed records to compare against database
  const provContext = createETLProvenanceContext(PROV_KEY);
  for (const raw of rawPilotRecords) {
    const { record: transformed } = transformJMdictEntry(raw, PROV_KEY);
    if (!transformed) continue;
    const stamped = provContext.stampRecord<CanonicalDictionaryEntry>(transformed);
    const dbRow = dbRowMap.get(stamped.id);
    if (!dbRow) {
      missingRecords++;
      continue;
    }
    const mismatch =
      dbRow.headword !== stamped.headword ||
      dbRow.reading !== stamped.reading ||
      dbRow.romaji !== stamped.romaji ||
      dbRow.jlptLevel !== stamped.jlptLevel ||
      dbRow.isCommon !== stamped.isCommon ||
      dbRow.sourceRef !== stamped.sourceRef ||
      !areArraysEqual(dbRow.partsOfSpeech as string[], stamped.partsOfSpeech) ||
      !areSensesEqual(dbRow.senses as any, stamped.senses) ||
      !areArraysEqual(dbRow.kanjiCharacters as string[], stamped.kanjiCharacters) ||
      !areArraysEqual(dbRow.tags as string[], stamped.tags);

    if (mismatch) {
      fieldMismatches++;
    }
  }

  const reconciliation = {
    matchedRecords: dbRows.length - fieldMismatches,
    missingRecords,
    unexpectedRecords: dbRows.length > rawPilotRecords.length ? dbRows.length - rawPilotRecords.length : 0,
    fieldMismatches,
  };
  console.log("Reconciliation result:", reconciliation);

  // ----------------------------------------------------
  // STEP 7: Verify Two-Run Idempotency (Run 2)
  // ----------------------------------------------------
  console.log("\n[STEP 7] Executing Idempotency Run 2 (Re-running Exact Batch)...");
  const [countAfterRun1] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(dictionaryEntries)
    .where(inArray(dictionaryEntries.id, expectedCandidateIds));

  const reportRun2 = await DictionaryPipeline.run({
    sourceId: PROV_KEY,
    sourceRecords: rawPilotRecords,
    batchSize: 50,
    dryRun: false,
  });

  const [countAfterRun2] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(dictionaryEntries)
    .where(inArray(dictionaryEntries.id, expectedCandidateIds));

  console.log("Persistence Run 2 result:", {
    inserted: reportRun2.inserted,
    updated: reportRun2.updated,
    skipped: reportRun2.skipped,
    valid: reportRun2.valid,
  });

  const idempotencyRun2 = {
    inserted: reportRun2.inserted,
    updated: reportRun2.updated,
    skipped: reportRun2.skipped,
    rowCountRun1: countAfterRun1.count,
    rowCountRun2: countAfterRun2.count,
    isIdempotent:
      reportRun2.inserted === 0 &&
      reportRun2.updated === 0 &&
      reportRun2.skipped === rawPilotRecords.length &&
      countAfterRun1.count === countAfterRun2.count,
  };
  console.log("Idempotency result:", idempotencyRun2);

  // ----------------------------------------------------
  // STEP 8: Conflict / Update Test
  // ----------------------------------------------------
  console.log("\n[STEP 8] Executing Conflict / Update Test...");
  const adapter = new DrizzleDictionaryPersistenceAdapter();
  const firstRaw = rawPilotRecords[0];
  const { record: originalTransformed } = transformJMdictEntry(firstRaw, PROV_KEY);
  if (!originalTransformed) throw new Error("Could not transform first raw record");
  const originalStamped: CanonicalDictionaryEntry = provContext.stampRecord<CanonicalDictionaryEntry>(originalTransformed);

  const mutated: CanonicalDictionaryEntry = {
    ...originalStamped,
    tags: [...originalStamped.tags, "pilot:conflict-test-tag"],
  };
  const updateResult = await adapter.upsertBatch([mutated], { conflictPolicy: "update" });

  const [mutatedRow] = await db
    .select()
    .from(dictionaryEntries)
    .where(eq(dictionaryEntries.id, mutated.id));

  const verifiedUpdated = (mutatedRow?.tags as string[])?.includes("pilot:conflict-test-tag");

  // Revert mutation
  const revertResult = await adapter.upsertBatch([originalStamped], { conflictPolicy: "update" });
  const [revertedRow] = await db
    .select()
    .from(dictionaryEntries)
    .where(eq(dictionaryEntries.id, originalStamped.id));

  const verifiedReverted = !(revertedRow?.tags as string[])?.includes("pilot:conflict-test-tag");

  const conflictUpdateTest = {
    updatedCount: updateResult.updated,
    verifiedUpdatedValue: Boolean(verifiedUpdated),
    revertedCount: revertResult.updated,
    verifiedRevertedValue: Boolean(verifiedReverted),
  };
  console.log("Conflict / update test result:", conflictUpdateTest);

  // ----------------------------------------------------
  // STEP 9: Transaction / Rollback Test
  // ----------------------------------------------------
  console.log("\n[STEP 9] Executing Transaction / Rollback Test...");
  const [preRollbackCountRow] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(dictionaryEntries)
    .where(inArray(dictionaryEntries.id, expectedCandidateIds));

  let rollbackSuccessful = false;
  try {
    await db.transaction(async (tx) => {
      // 1. Valid insertion of a scratch row
      await tx.insert(dictionaryEntries).values({
        id: "de-jmdict-scratch-rollback-test",
        headword: "ロールバック",
        reading: "ロールバック",
        romaji: "ro-rubakku",
        jlptLevel: "NONE",
        isCommon: false,
        sourceRef: PROV_KEY,
        partsOfSpeech: ["noun"],
        senses: [{ glosses: ["rollback test"] }],
        kanjiCharacters: [],
        tags: ["test"],
      });

      // 2. Intentional violation: insert row with duplicate primary key to trigger error
      await tx.insert(dictionaryEntries).values({
        id: "de-jmdict-scratch-rollback-test",
        headword: "ロールバック2",
        reading: "ロールバック2",
        romaji: "ro-rubakku2",
        jlptLevel: "NONE",
        isCommon: false,
        sourceRef: PROV_KEY,
        partsOfSpeech: ["noun"],
        senses: [{ glosses: ["should fail"] }],
        kanjiCharacters: [],
        tags: ["test"],
      });
    });
  } catch (err) {
    rollbackSuccessful = true;
  }

  const [postRollbackCountRow] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(dictionaryEntries)
    .where(inArray(dictionaryEntries.id, expectedCandidateIds));

  const [scratchCheck] = await db
    .select()
    .from(dictionaryEntries)
    .where(eq(dictionaryEntries.id, "de-jmdict-scratch-rollback-test"));

  const transactionRollbackTest = {
    rollbackSuccessful,
    preRollbackCount: preRollbackCountRow.count,
    postRollbackCount: postRollbackCountRow.count,
    zeroPartialWrites: !scratchCheck,
  };
  console.log("Transaction / rollback test result:", transactionRollbackTest);

  // ----------------------------------------------------
  // STEP 10: Existing Constraints Verifications
  // ----------------------------------------------------
  console.log("\n[STEP 10] Testing Existing Constraints...");
  let duplicatePkBlocked = false;
  try {
    await db.insert(dictionaryEntries).values(originalStamped);
  } catch (err) {
    duplicatePkBlocked = true;
  }

  let notNullConstraintEnforced = false;
  try {
    // Attempt inserting null into headword
    await db.execute(sql`INSERT INTO "dictionary_entries" ("id", "headword", "reading", "romaji", "jlpt_level", "source_ref") VALUES ('de-test-null', NULL, 'test', 'test', 'NONE', 'test');`);
  } catch (err) {
    notNullConstraintEnforced = true;
  }

  const constraintsTest = {
    duplicatePkBlocked,
    notNullConstraintEnforced,
  };
  console.log("Constraints test result:", constraintsTest);

  // ----------------------------------------------------
  // STEP 11: Application Read-Back Verifications (DictionaryService)
  // ----------------------------------------------------
  console.log("\n[STEP 11] Verifying Application Read-Back via DictionaryService...");
  // Look up one of our pilot entries (e.g. entSeq 1000660: 如何にも, or entSeq 1000000: ヽ)
  const targetSample = rawPilotRecords.find((r) => r.entSeq === "1000660") || rawPilotRecords[0];
  const sampleTrans = transformJMdictEntry(targetSample, PROV_KEY).record;
  if (!sampleTrans) throw new Error("Could not transform target sample");
  const sampleEntry: CanonicalDictionaryEntry = provContext.stampRecord<CanonicalDictionaryEntry>(sampleTrans);

  const detail = await DictionaryService.getEntryDetail(sampleEntry.id);
  const directIdLookup = Boolean(detail && detail.entry.id === sampleEntry.id);
  const provenanceLinked = Boolean(detail?.source && detail.source.id === PROV_KEY);

  // Search by Japanese headword
  const searchJp = await DictionaryService.searchEntries({ query: sampleEntry.headword });
  const japaneseSearch = searchJp.entries.some((e) => e.id === sampleEntry.id);

  // Search by reading
  const searchReading = await DictionaryService.searchEntries({ query: sampleEntry.reading });
  const readingSearch = searchReading.entries.some((e) => e.id === sampleEntry.id);

  // Search by romaji
  const searchRomaji = await DictionaryService.searchEntries({ query: sampleEntry.romaji });
  const romajiSearch = searchRomaji.entries.some((e) => e.id === sampleEntry.id);

  // Search by English gloss
  const sampleGloss = sampleEntry.senses[0]?.glosses[0] || "water";
  const searchEng = await DictionaryService.searchEntries({ query: sampleGloss });
  const englishSearch = searchEng.entries.some((e) => e.id === sampleEntry.id);

  const readBackTest = {
    directIdLookup,
    japaneseSearch,
    readingSearch,
    romajiSearch,
    englishSearch,
    provenanceLinked,
  };
  console.log("Read-back test result:", readBackTest);

  // ----------------------------------------------------
  // STEP 12: Isolation Verifications (CMS & Translations)
  // ----------------------------------------------------
  console.log("\n[STEP 12] Verifying Isolation (CMS & Multilingual Translations)...");
  const [cmsItemsPost] = await db.select({ count: sql<number>`cast(count(*) as int)` }).from(cmsContentItems);
  const [cmsVersionsPost] = await db.select({ count: sql<number>`cast(count(*) as int)` }).from(cmsContentVersions);
  const [cmsAuditPost] = await db.select({ count: sql<number>`cast(count(*) as int)` }).from(cmsAuditLog);
  const [transPost] = await db.select({ count: sql<number>`cast(count(*) as int)` }).from(entityTranslations);

  const isolationTest = {
    cmsItemsCount: cmsItemsPost.count,
    cmsVersionsCount: cmsVersionsPost.count,
    cmsAuditLogCount: cmsAuditPost.count,
    translationsCount: transPost.count,
    cmsIsolated:
      cmsItemsPre.count === cmsItemsPost.count &&
      cmsVersionsPre.count === cmsVersionsPost.count &&
      cmsAuditPre.count === cmsAuditPost.count,
    translationsIsolated: transPre.count === transPost.count,
  };
  console.log("Isolation test result:", isolationTest);

  return {
    safetyProbe,
    provenance: provenanceResult,
    datasetMetrics,
    run1Persistence: {
      inserted: reportRun1.inserted,
      updated: reportRun1.updated,
      skipped: reportRun1.skipped,
      durationMs: durationMsRun1,
    },
    reconciliation,
    idempotencyRun2,
    conflictUpdateTest,
    transactionRollbackTest,
    constraintsTest,
    readBackTest,
    isolationTest,
  };
}

if (process.argv[1] && process.argv[1].endsWith("pilot-jmdict-db.ts")) {
  runControlledPilot()
    .then((res) => {
      console.log("\n=== PILOT VERIFICATION COMPLETED SUCCESSFULLY ===");
      console.log(JSON.stringify(res, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error("\nFATAL PILOT ERROR:", err);
      process.exit(1);
    });
}
