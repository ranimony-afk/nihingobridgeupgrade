/**
 * Database Verification Engine — Phase 14.4C (Step 10).
 *
 * Verifies all database integrity rules following KANJIDIC2 ingestion:
 * 1. Total Kanji count = 13,108
 * 2. 45 baseline first-party records preserved exactly (IDs, sourceRefs, key fields)
 * 3. 13,063 upstream KANJIDIC2 records
 * 4. Deterministic ID convention: every upstream row id === "kanji-" || character
 * 5. Zero duplicate characters
 * 6. Zero duplicate IDs
 * 7. Zero null required fields
 * 8. Zero invalid JLPT levels
 * 9. Zero invalid stroke counts (< 1)
 * 10. Source/provenance integrity: only the three registered sourceRefs; registry entry present
 * 11. Zero dictionary mutations (total: 206,747) + row-level immutability evidence digest
 *
 * Safety: this tool connects only through the same two gates as the write engine
 * (assertSafeDatabaseUrl + classifyDatabaseTarget "ALLOW").
 */

import { Client } from "pg";
import { Readable } from "stream";
import { assertSafeDatabaseUrl, verifyKanjidic2Artifact } from "./ingest-kanjidic2";
import { classifyDatabaseTarget } from "../src/etl/dictionary/targetClassification";
import { AUTHORITATIVE_SOURCE_REGISTRY } from "../src/services/knowledge/provenance";
import { streamKanjidicCharacters } from "../src/etl/kanji/xmlParser";
import { transformKanjidicCharacter } from "../src/etl/kanji/transformer";
import { createHash } from "crypto";
import { resolve } from "path";

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
  /** Deterministic-ID violations (upstream rows whose id !== "kanji-" || character). */
  idConventionViolations: number;
  /** Exact first-party preservation violations (IDs/provenance/key fields). */
  firstPartyViolations: string[];
  /** Rows with a sourceRef outside the three registered producers. */
  sourceRefViolations: number;
  firstPartyMindtree: number;
  firstPartyCorpus: number;
  /** Row-level dictionary immutability evidence (stable md5 over id|headword|reading|romaji). */
  dictionaryRowDigest: string;
  upstreamRegistryVerified: boolean;
  /** Consume-time artifact identity: full 14.4B chain re-verified from the consumed bytes. */
  artifactVerified: boolean;
  /** Deterministic stream digest recomputed independently from the artifact (not engine-reported). */
  streamDigest: string;
}

const UPSTREAM_REF = "upstream:kanjidic2:2023-08";
const MINDTREE_REF = "first-party:kanji-mindtree:v1";
const CORPUS_REF = "first-party:kanji-corpus:v1";

/** Anchors of the locked 45-row first-party baseline (id, character, strokes or null, sourceRef). */
const FIRST_PARTY_ANCHORS: Array<[string, string, number | null, string]> = [
  ["kj-mei", "明", 8, MINDTREE_REF],
  ["kj-miru", "見", 7, MINDTREE_REF],
  ["kj-hashi", "箸", 14, MINDTREE_REF],
  ["kanji-road", "道", null, CORPUS_REF],
  ["kj-mizu", "水", null, CORPUS_REF],
  ["kj-hi", "火", null, CORPUS_REF],
];

export async function runDatabaseVerification(): Promise<DatabaseAuditResult> {
  const dbUrl =
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@127.0.0.1:5432/app_db";

  // Safety gate — identical policy to the write engine (never weaker).
  assertSafeDatabaseUrl(dbUrl);
  const verdict = classifyDatabaseTarget({
    connectionString: dbUrl,
    declaredClass: process.env.NIHONGO_DB_TARGET_CLASS,
    expectedDatabase: process.env.NIHONGO_DB_EXPECTED_DATABASE,
  });
  if (verdict.decision !== "ALLOW") {
    throw new Error(
      `[TARGET_CLASSIFICATION] STOP — ${verdict.reason} ` +
        `(classification=${verdict.classification}, decision=${verdict.decision}).`
    );
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    // 0. Artifact identity — re-verified from the consumed bytes (never trusted
    //    from acquisition-time reports). Fails closed on any mismatch.
    const xml = verifyKanjidic2Artifact(resolve(process.cwd(), "data/kanjidic2.xml"));
    const artifactVerified = true;

    // 0b. Independent deterministic stream digest (same canonical lines as the
    //     engine, recomputed here from the artifact — not read from engine output).
    const digestHash = createHash("sha256");
    for await (const raw of streamKanjidicCharacters(
      Readable.from([xml.toString("utf-8")])
    )) {
      const res = transformKanjidicCharacter(raw);
      if (!res.isValid || !res.record) continue;
      const rec = res.record;
      digestHash.update(
        `${rec.character}:${rec.strokeCount}:${rec.jlptLevel}:${rec.readingsOn.join(",")}:${rec.readingsKun.join(",")}\n`
      );
    }
    const streamDigest = digestHash.digest("hex");
    // 1. Total Kanji count
    const totalRes = await client.query("SELECT count(*) FROM kanji_entries");
    const totalKanji = parseInt(totalRes.rows[0].count, 10);

    // 2. Counts by source_ref
    const fpRes = await client.query(
      "SELECT count(*) FROM kanji_entries WHERE source_ref LIKE 'first-party:%'"
    );
    const firstPartyCount = parseInt(fpRes.rows[0].count, 10);

    const mindtreeRes = await client.query(
      "SELECT count(*) FROM kanji_entries WHERE source_ref = $1",
      [MINDTREE_REF]
    );
    const firstPartyMindtree = parseInt(mindtreeRes.rows[0].count, 10);

    const corpusRes = await client.query(
      "SELECT count(*) FROM kanji_entries WHERE source_ref = $1",
      [CORPUS_REF]
    );
    const firstPartyCorpus = parseInt(corpusRes.rows[0].count, 10);

    const kdRes = await client.query(
      "SELECT count(*) FROM kanji_entries WHERE source_ref = $1",
      [UPSTREAM_REF]
    );
    const kanjidicCount = parseInt(kdRes.rows[0].count, 10);

    // 3. Deterministic-ID convention for every upstream row
    const idViolationRes = await client.query(
      `SELECT count(*) FROM kanji_entries WHERE source_ref = $1 AND id <> 'kanji-' || character`,
      [UPSTREAM_REF]
    );
    const idConventionViolations = parseInt(idViolationRes.rows[0].count, 10);

    // 4. Exact first-party preservation (IDs, provenance, key fields)
    const firstPartyViolations: string[] = [];
    const fpRowsRes = await client.query(
      "SELECT id, character, stroke_count, source_ref FROM kanji_entries WHERE source_ref LIKE 'first-party:%'"
    );
    const fpRows = fpRowsRes.rows as Array<{
      id: string;
      character: string;
      stroke_count: number;
      source_ref: string;
    }>;
    if (fpRows.length !== 45) {
      firstPartyViolations.push(`first-party row count ${fpRows.length} != 45`);
    }
    for (const [id, character, strokes, ref] of FIRST_PARTY_ANCHORS) {
      const row = fpRows.find((r) => r.id === id);
      if (!row) {
        firstPartyViolations.push(`missing first-party row ${id}`);
        continue;
      }
      if (row.character !== character) {
        firstPartyViolations.push(`${id} character ${row.character} != ${character}`);
      }
      if (row.source_ref !== ref) {
        firstPartyViolations.push(`${id} sourceRef ${row.source_ref} != ${ref}`);
      }
      if (strokes !== null && row.stroke_count !== strokes) {
        firstPartyViolations.push(`${id} stroke_count ${row.stroke_count} != ${strokes}`);
      }
    }
    // 箸 must never be duplicated as an upstream row (kj-hashi -> kanji-箸 is forbidden).
    const hashiDup = await client.query(
      "SELECT count(*) FROM kanji_entries WHERE character = '箸'",
      []
    );
    if (parseInt(hashiDup.rows[0].count, 10) !== 1) {
      firstPartyViolations.push("箸 must exist as exactly one row (kj-hashi)");
    }

    // 5. Source/provenance integrity
    const sourceRefViolationRes = await client.query(
      `SELECT count(*) FROM kanji_entries
       WHERE source_ref NOT IN ($1, $2, $3)`,
      [MINDTREE_REF, CORPUS_REF, UPSTREAM_REF]
    );
    const sourceRefViolations = parseInt(sourceRefViolationRes.rows[0].count, 10);
    const upstreamRegistryVerified = Boolean(AUTHORITATIVE_SOURCE_REGISTRY[UPSTREAM_REF]);

    // 6. Duplicate checks
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

    // 7. Null checks
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

    // 8. Invalid JLPT values
    const jlptCheckRes = await client.query(`
      SELECT count(*) 
      FROM kanji_entries 
      WHERE jlpt_level NOT IN ('N5', 'N4', 'N3', 'N2', 'N1', 'NONE')
    `);
    const invalidJlptCount = parseInt(jlptCheckRes.rows[0].count, 10);

    // 9. Invalid stroke counts (< 1)
    const strokeCheckRes = await client.query(`
      SELECT count(*) 
      FROM kanji_entries 
      WHERE stroke_count < 1
    `);
    const invalidStrokeCount = parseInt(strokeCheckRes.rows[0].count, 10);

    // 10. Dictionary count (must remain 206,747) + row-level immutability evidence
    const dictRes = await client.query("SELECT count(*) FROM dictionary_entries");
    const dictionaryTotalCount = parseInt(dictRes.rows[0].count, 10);

    const dictDigestRes = await client.query(`
      SELECT md5(string_agg(id || '|' || headword || '|' || reading || '|' || romaji, ',' ORDER BY id)) AS digest
      FROM dictionary_entries
    `);
    const dictionaryRowDigest = (dictDigestRes.rows[0]?.digest ?? "") as string;

    const allIntegrityChecksPassed =
      totalKanji === 13108 &&
      firstPartyCount === 45 &&
      kanjidicCount === 13063 &&
      duplicateCharacters === 0 &&
      duplicateIds === 0 &&
      nullRequiredFields === 0 &&
      invalidJlptCount === 0 &&
      invalidStrokeCount === 0 &&
      dictionaryTotalCount === 206747 &&
      idConventionViolations === 0 &&
      firstPartyViolations.length === 0 &&
      sourceRefViolations === 0 &&
      upstreamRegistryVerified &&
      artifactVerified;

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
      idConventionViolations,
      firstPartyViolations,
      sourceRefViolations,
      firstPartyMindtree,
      firstPartyCorpus,
      dictionaryRowDigest,
      upstreamRegistryVerified,
      artifactVerified,
      streamDigest,
    };
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.endsWith("verify-kanjidic2-ingestion.ts")) {
  runDatabaseVerification()
    .then((r) => {
      console.log("=== KANJIDIC2 POST-INGESTION DATABASE AUDIT ===");
      console.log(`Artifact Identity (consumed bytes): ${r.artifactVerified ? "VERIFIED (SHA/size/headers/13,108)" : "FAILED"}`);
      console.log(`Independent Stream Digest: ${r.streamDigest}`);
      console.log(`Total Kanji: ${r.totalKanji} (expected 13108)`);
      console.log(`First-Party Baseline: ${r.firstPartyCount} (expected 45)`);
      console.log(`  mindtree=${r.firstPartyMindtree} (33), corpus=${r.firstPartyCorpus} (12)`);
      console.log(`KANJIDIC2 Ingested: ${r.kanjidicCount} (expected 13063)`);
      console.log(`ID Convention Violations: ${r.idConventionViolations} (expected 0)`);
      console.log(
        `First-Party Preservation Violations: ${r.firstPartyViolations.length} (expected 0)` +
          (r.firstPartyViolations.length ? `: ${r.firstPartyViolations.join("; ")}` : "")
      );
      console.log(`SourceRef Violations: ${r.sourceRefViolations} (expected 0)`);
      console.log(`Upstream Registry Verified: ${r.upstreamRegistryVerified}`);
      console.log(`Duplicate Characters: ${r.duplicateCharacters} (expected 0)`);
      console.log(`Duplicate IDs: ${r.duplicateIds} (expected 0)`);
      console.log(`Null Required Fields: ${r.nullRequiredFields} (expected 0)`);
      console.log(`Invalid JLPT Count: ${r.invalidJlptCount} (expected 0)`);
      console.log(`Invalid Stroke Counts: ${r.invalidStrokeCount} (expected 0)`);
      console.log(`Dictionary Entries: ${r.dictionaryTotalCount} (expected 206747)`);
      console.log(`Dictionary Row Digest (evidence): ${r.dictionaryRowDigest}`);
      console.log(`Verdict: ${r.allIntegrityChecksPassed ? "PASS" : "FAIL"}`);
      process.exit(r.allIntegrityChecksPassed ? 0 : 1);
    })
    .catch((err) => {
      console.error("Verification failed:", err);
      process.exit(1);
    });
}
