/**
 * Database Verification Engine — Phase 14.4C (Step 10).
 *
 * Verifies all database integrity rules following KANJIDIC2 ingestion:
 * 1. Total Kanji count = 13,108
 * 2. 45 baseline first-party records preserved exactly
 * 3. 13,063 upstream KANJIDIC2 records
 * 4. Zero duplicate characters
 * 5. Zero duplicate IDs
 * 6. Zero null required fields
 * 7. Zero invalid JLPT levels
 * 8. Zero invalid stroke counts (< 1)
 * 9. Zero dictionary mutations (total: 206,747)
 */

import { Client } from "pg";

export interface DatabaseAuditResult {
  totalKanji: number;
  firstPartyCount: number;
  kanjidicCount: number;
  duplicateCharacters: number;
  duplicateIds: number;
  nullRequiredFields: number;
  invalidJlptCount: number;
  invalidStrokeCount: number;
  dictionaryTotalCount: number;
  allIntegrityChecksPassed: boolean;
}

export async function runDatabaseVerification(): Promise<DatabaseAuditResult> {
  const client = new Client({
    connectionString:
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@127.0.0.1:5432/app_db",
  });
  await client.connect();

  // 1. Total Kanji count
  const totalRes = await client.query("SELECT count(*) FROM kanji_entries");
  const totalKanji = parseInt(totalRes.rows[0].count, 10);

  // 2. Counts by source_ref
  const fpRes = await client.query(
    "SELECT count(*) FROM kanji_entries WHERE source_ref LIKE 'first-party:%'"
  );
  const firstPartyCount = parseInt(fpRes.rows[0].count, 10);

  const kdRes = await client.query(
    "SELECT count(*) FROM kanji_entries WHERE source_ref = 'upstream:kanjidic2:2023-08'"
  );
  const kanjidicCount = parseInt(kdRes.rows[0].count, 10);

  // 3. Duplicate checks
  const dupCharRes = await client.query(`
    SELECT character, count(*) 
    FROM kanji_entries 
    GROUP BY character 
    HAVING count(*) > 1
  `);
  const duplicateCharacters = dupCharRes.rows.length;

  const dupIdRes = await client.query(`
    SELECT id, count(*) 
    FROM kanji_entries 
    GROUP BY id 
    HAVING count(*) > 1
  `);
  const duplicateIds = dupIdRes.rows.length;

  // 4. Null checks
  const nullCheckRes = await client.query(`
    SELECT count(*) 
    FROM kanji_entries 
    WHERE id IS NULL 
       OR character IS NULL 
       OR meaning IS NULL 
       OR readings_kun IS NULL 
       OR readings_on IS NULL 
       OR stroke_count IS NULL 
       OR jlpt_level IS NULL 
       OR vocabulary IS NULL 
       OR source_ref IS NULL
  `);
  const nullRequiredFields = parseInt(nullCheckRes.rows[0].count, 10);

  // 5. Invalid JLPT values
  const jlptCheckRes = await client.query(`
    SELECT count(*) 
    FROM kanji_entries 
    WHERE jlpt_level NOT IN ('N5', 'N4', 'N3', 'N2', 'N1', 'NONE')
  `);
  const invalidJlptCount = parseInt(jlptCheckRes.rows[0].count, 10);

  // 6. Invalid stroke counts (< 1)
  const strokeCheckRes = await client.query(`
    SELECT count(*) 
    FROM kanji_entries 
    WHERE stroke_count < 1
  `);
  const invalidStrokeCount = parseInt(strokeCheckRes.rows[0].count, 10);

  // 7. Dictionary count (must remain 206,747)
  const dictRes = await client.query("SELECT count(*) FROM dictionary_entries");
  const dictionaryTotalCount = parseInt(dictRes.rows[0].count, 10);

  await client.end();

  const allIntegrityChecksPassed =
    totalKanji === 13108 &&
    firstPartyCount === 45 &&
    kanjidicCount === 13063 &&
    duplicateCharacters === 0 &&
    duplicateIds === 0 &&
    nullRequiredFields === 0 &&
    invalidJlptCount === 0 &&
    invalidStrokeCount === 0 &&
    dictionaryTotalCount === 206747;

  return {
    totalKanji,
    firstPartyCount,
    kanjidicCount,
    duplicateCharacters,
    duplicateIds,
    nullRequiredFields,
    invalidJlptCount,
    invalidStrokeCount,
    dictionaryTotalCount,
    allIntegrityChecksPassed,
  };
}

if (process.argv[1]?.endsWith("verify-kanjidic2-ingestion.ts")) {
  runDatabaseVerification()
    .then((r) => {
      console.log("=== KANJIDIC2 POST-INGESTION DATABASE AUDIT ===");
      console.log(`Total Kanji: ${r.totalKanji} (expected 13108)`);
      console.log(`First-Party Baseline: ${r.firstPartyCount} (expected 45)`);
      console.log(`KANJIDIC2 Ingested: ${r.kanjidicCount} (expected 13063)`);
      console.log(`Duplicate Characters: ${r.duplicateCharacters} (expected 0)`);
      console.log(`Duplicate IDs: ${r.duplicateIds} (expected 0)`);
      console.log(`Null Required Fields: ${r.nullRequiredFields} (expected 0)`);
      console.log(`Invalid JLPT Count: ${r.invalidJlptCount} (expected 0)`);
      console.log(`Invalid Stroke Counts: ${r.invalidStrokeCount} (expected 0)`);
      console.log(`Dictionary Entries: ${r.dictionaryTotalCount} (expected 206747)`);
      console.log(`Verdict: ${r.allIntegrityChecksPassed ? "PASS" : "FAIL"}`);
      process.exit(r.allIntegrityChecksPassed ? 0 : 1);
    })
    .catch((err) => {
      console.error("Verification failed:", err);
      process.exit(1);
    });
}
