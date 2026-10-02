/**
 * Independent Kanji ↔ JMdict Graph Verifier — Phase 14.4E (§12).
 *
 * Independently recomputes — WITHOUT importing the ingestion engine — and
 * compares against the published derived graph (data/kanji-jmdict-graph/):
 *
 *   1. canonical source load (own SQL, own join)
 *   2. expected relationships (own containment derivation)
 *   3. deterministic IDs (own reimplementation of the §5 algorithm)
 *   4. expected digest (own canonical serialization)
 *   5. provenance inspection (own allowed/forbidden sets)
 *   6. counts (all §6/§13 metrics)
 *   7. expected-vs-actual comparison (edges + digests)
 *   8. forbidden/obsolete source-identity scan of the actual output
 *
 * Verdict PASS (exit 0) / FAIL (exit 1).
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { Client } from "pg";

// ---------------------------------------------------------------------------
// Independent constants (own copies — never imported from the engine)
// ---------------------------------------------------------------------------

const EXPECTED = {
  entrySourceRef: "upstream:jmdict:2023-08",
  allowedKanjiSourceRefs: [
    "upstream:kanjidic2:2023-08",
    "first-party:kanji-mindtree:v1",
    "first-party:kanji-corpus:v1",
  ],
  forbiddenIdentities: [
    "kanjidic2:2024-03",
    "upstream:kanjidic2:2024-03",
    "kanjivg:0.99",
    "upstream:kanjivg:0.99",
    "upstream:kanjivg:2024-04",
  ],
  kanjiCount: 13108,
  kanjiDigest: "4e2b27a3249661c87241fd3637160ae7",
  dictionaryCount: 206747,
  dictionaryUpstream: 206717,
  dictionaryDigest: "42907c1d35e1151d64dd57cdef1eddab",
  // Gate-0 measured baselines (reconciled independently below)
  kanjiBearingEntries: 165467,
  kanaOnlyEntries: 41250,
  distinctReferencedCharacters: 5896,
  zeroReferenceKanji: 7228,
  multiKanjiEntries: 152581,
  jmdictOnlyCharacters: 16,
} as const;

// ---------------------------------------------------------------------------
// Independent canonical serialization + ID algorithm (§5 spec)
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

function canon(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sha(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

const HAN = /^[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]$/;

/** §5 identity: NFC + kanji codepoint identity (pinned family semantics). */
function edgeIdOf(character: string, entryId: string): string {
  const kanjiIdentity = Array.from(character.normalize("NFC"))
    .filter((ch) => HAN.test(ch))
    .join("");
  return `kanji:${kanjiIdentity}:dict:${entryId}`;
}

interface EdgeShape {
  edgeId: string;
  character: string;
  kanjiId: string;
  kanjiSourceRef: string;
  entryId: string;
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export interface VerificationCheck {
  name: string;
  expected: string;
  observed: string;
  ok: boolean;
}

export async function verifyKanjiJmdictGraph(): Promise<{
  checks: VerificationCheck[];
  ok: boolean;
  verdict: "PASS" | "FAIL";
}> {
  const checks: VerificationCheck[] = [];
  const add = (name: string, expected: unknown, observed: unknown) => {
    checks.push({
      name,
      expected: String(expected),
      observed: String(observed),
      ok: String(expected) === String(observed),
    });
  };

  const publish = resolve(process.cwd(), "data/kanji-jmdict-graph");
  if (!existsSync(resolve(publish, "state.json"))) {
    add("published graph state", "exists", "missing");
    return { checks, ok: false, verdict: "FAIL" };
  }
  const state = JSON.parse(readFileSync(resolve(publish, "state.json"), "utf-8"));
  const edgesActual = JSON.parse(
    readFileSync(resolve(publish, "edges.json"), "utf-8")
  ) as EdgeShape[];

  // ---- 1/2/3. independent load + derivation + IDs ----
  const client = new Client({
    connectionString:
      process.env.DATABASE_URL ||
      "postgresql://nihongo:nihongo@127.0.0.1:5432/app_db",
  });
  await client.connect();
  try {
    const kanjiRows = (
      await client.query(
        `SELECT id, character, source_ref FROM kanji_entries ORDER BY character`
      )
    ).rows as Array<{ id: string; character: string; source_ref: string }>;
    const dictRows = (
      await client.query(
        `SELECT id, kanji_characters FROM dictionary_entries
         WHERE source_ref = 'upstream:jmdict:2023-08' ORDER BY id`
      )
    ).rows as Array<{ id: string; kanji_characters: string[] }>;

    const kanjiByChar = new Map(kanjiRows.map((r) => [r.character, r]));
    const expectedEdges: EdgeShape[] = [];
    const referenced = new Set<string>();
    const referencedEntries = new Set<string>();
    const jmdictOnly = new Set<string>();
    let bearing = 0;
    let kanaOnly = 0;
    let multi = 0;
    let candidateEdges = 0;
    let bearingWithoutMatch = 0;
    for (const row of dictRows) {
      const chars = row.kanji_characters ?? [];
      if (chars.length === 0) kanaOnly++;
      else {
        bearing++;
        if (chars.length > 1) multi++;
      }
      const seen = new Set<string>();
      for (const raw of chars) {
        const character = raw.normalize("NFC");
        if (Array.from(raw).length !== 1 || character !== raw) continue;
        if (seen.has(character)) continue;
        seen.add(character);
        candidateEdges++;
        const k = kanjiByChar.get(character);
        if (!k) {
          jmdictOnly.add(character);
          continue;
        }
        referenced.add(character);
        referencedEntries.add(row.id);
        expectedEdges.push({
          edgeId: edgeIdOf(character, row.id),
          character,
          kanjiId: k.id,
          kanjiSourceRef: k.source_ref,
          entryId: row.id,
        });
      }
      if (chars.length > 0 && !referencedEntries.has(row.id)) bearingWithoutMatch++;
    }
    expectedEdges.sort((a, b) => (a.edgeId < b.edgeId ? -1 : 1));
    const zeroRef = kanjiRows.filter((r) => !referenced.has(r.character)).length;

    // ---- 6. counts vs published metrics + Gate-0 baseline ----
    add("metrics.totalJmdictEntries", dictRows.length, state.metrics.totalJmdictEntries);
    add("metrics.kanjiBearingEntries (Gate-0)", EXPECTED.kanjiBearingEntries, bearing);
    add("metrics.kanjiBearingEntries (state)", bearing, state.metrics.kanjiBearingEntries);
    add("metrics.kanaOnlyEntries (Gate-0)", EXPECTED.kanaOnlyEntries, kanaOnly);
    add("metrics.kanaOnlyEntries (state)", kanaOnly, state.metrics.kanaOnlyEntries);
    add(
      "metrics.distinctEntryKanjiCharacters (Gate-0)",
      EXPECTED.distinctReferencedCharacters,
      referenced.size + jmdictOnly.size
    );
    add(
      "metrics.distinctEntryKanjiCharacters (state)",
      referenced.size + jmdictOnly.size,
      state.metrics.distinctEntryKanjiCharacters
    );
    add("metrics.distinctReferencedKanji (state)", referenced.size, state.metrics.distinctReferencedKanji);
    add("metrics.zeroReferenceKanji (Gate-0)", EXPECTED.zeroReferenceKanji, zeroRef);
    add("metrics.zeroReferenceKanji (state)", zeroRef, state.metrics.zeroReferenceKanji);
    add("metrics.multiKanjiEntries (Gate-0)", EXPECTED.multiKanjiEntries, multi);
    add("metrics.multiKanjiEntries (state)", multi, state.metrics.multiKanjiEntries);
    add("metrics.jmdictOnlyCharacters (Gate-0)", EXPECTED.jmdictOnlyCharacters, jmdictOnly.size);
    add("metrics.jmdictOnlyCharacters (state)", jmdictOnly.size, state.metrics.jmdictOnlyCharacters);
    add("metrics.candidateEdges", candidateEdges, state.metrics.candidateEdges);
    add("metrics.acceptedEdges", expectedEdges.length, state.metrics.acceptedEdges);
    add(
      "metrics.unmatchedCandidateEdges",
      candidateEdges - expectedEdges.length,
      state.metrics.unmatchedCandidateEdges
    );
    add("metrics.nodeKanji", referenced.size, state.metrics.nodeKanji);
    add("metrics.nodeEntries", referencedEntries.size, state.metrics.nodeEntries);
    add(
      "metrics.kanjiBearingEntriesWithoutMatch",
      bearingWithoutMatch,
      state.metrics.kanjiBearingEntriesWithoutMatch
    );
    add("metrics.rejectedEdges", 0, state.metrics.rejectedEdges);
    add("metrics.duplicates", 0, state.metrics.duplicates);
    add("metrics.invalidEdges", 0, state.metrics.invalidEdges);
    add("metrics.provenanceViolations", 0, state.metrics.provenanceViolations);

    // classification
    add(
      "classification.jmdictOnlyCharacters",
      [...jmdictOnly].sort().join(","),
      state.classification.jmdictOnlyCharacters.join(",")
    );

    // ---- 7. edges + digests (independent recomputation) ----
    add("edge count", expectedEdges.length, edgesActual.length);
    let edgeMismatches = 0;
    for (let i = 0; i < expectedEdges.length && i < edgesActual.length; i++) {
      const e = expectedEdges[i];
      const a = edgesActual[i];
      if (
        a.edgeId !== e.edgeId ||
        a.character !== e.character ||
        a.kanjiId !== e.kanjiId ||
        a.kanjiSourceRef !== e.kanjiSourceRef ||
        a.entryId !== e.entryId
      ) {
        edgeMismatches++;
      }
    }
    add("edge mismatches (independent re-derivation)", 0, edgeMismatches);
    add("edgesDigest", sha(canon(edgesActual)), state.edgesDigest);
    add("idsDigest", sha(edgesActual.map((e) => e.edgeId).join("\n")), state.idsDigest);
    add(
      "provenanceDigest",
      sha(
        edgesActual
          .map((e) => `${e.edgeId}|${e.kanjiSourceRef}|${EXPECTED.entrySourceRef}`)
          .join("\n")
      ),
      state.provenanceDigest
    );
    const { graphDigest, ...body } = state;
    add("graphDigest", sha(canon(body)), graphDigest);

    // ---- 5/8. provenance inspection + forbidden identity scan ----
    let provenanceViolations = 0;
    for (const e of edgesActual) {
      if (!EXPECTED.allowedKanjiSourceRefs.includes(e.kanjiSourceRef as never)) {
        provenanceViolations++;
      }
      if (EXPECTED.forbiddenIdentities.includes(e.kanjiSourceRef as never)) {
        provenanceViolations++;
      }
    }
    add("edge provenance violations", 0, provenanceViolations);

    const stateText = JSON.stringify(state);
    let forbiddenHits = 0;
    for (const bad of EXPECTED.forbiddenIdentities) {
      if (stateText.includes(bad)) forbiddenHits++;
    }
    add("forbidden/obsolete identities in output", 0, forbiddenHits);
    add("state.contract.entrySourceRef", EXPECTED.entrySourceRef, state.contract.entrySourceRef);

    // ---- canonical DB immutability ----
    const kanjiAgg = (
      await client.query(
        `SELECT count(*)::int AS n, md5(string_agg(id || '|' || character || '|' || stroke_count || '|' || source_ref, ',' ORDER BY id)) AS d FROM kanji_entries`
      )
    ).rows[0];
    const dictAgg = (
      await client.query(
        `SELECT count(*)::int AS n, count(*) FILTER (WHERE source_ref = 'upstream:jmdict:2023-08')::int AS up, md5(string_agg(id || '|' || headword || '|' || reading || '|' || romaji, ',' ORDER BY id)) AS d FROM dictionary_entries`
      )
    ).rows[0];
    add("kanji_entries count unchanged", EXPECTED.kanjiCount, kanjiAgg.n);
    add("kanji_entries digest unchanged", EXPECTED.kanjiDigest, kanjiAgg.d);
    add("dictionary_entries count unchanged", EXPECTED.dictionaryCount, dictAgg.n);
    add("dictionary upstream unchanged", EXPECTED.dictionaryUpstream, dictAgg.up);
    add("dictionary digest unchanged", EXPECTED.dictionaryDigest, dictAgg.d);
  } finally {
    await client.end();
  }

  const ok = checks.every((c) => c.ok);
  return { checks, ok, verdict: ok ? "PASS" : "FAIL" };
}

async function main(): Promise<void> {
  const result = await verifyKanjiJmdictGraph();
  for (const c of result.checks) {
    console.log(
      `${c.ok ? "PASS" : "FAIL"} | ${c.name} | expected: ${c.expected} | observed: ${c.observed}`
    );
  }
  console.log(`Verdict: ${result.verdict}`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && /verify-kanji-jmdict-graph(\.ts|\.js)$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
