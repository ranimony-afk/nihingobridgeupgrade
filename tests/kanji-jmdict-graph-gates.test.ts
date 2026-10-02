/**
 * Phase 14.4E — Controlled Kanji ↔ JMdict Graph Gates.
 *
 *  1.  §5  deterministic edge identity (5 explicit identity tests)
 *  2.  §6  read-only derivation reconciled against the Gate-0 baseline
 *  3.  §8.1-3   target refusals (unclassified / production / mismatched)
 *  4.  §8.4-5   provenance refusals (wrong JMdict identity, forbidden refs)
 *  5.  §8.6-9   relationship refusals (malformed / duplicate / invalid Unicode / forged)
 *  6.  §8.10    incompatible canonical baseline refusal
 *  7.  §8.12    interrupted execution leaves no partial state (stale staging recovery)
 *  8.  §10a     forced mid-run rollback from empty baseline
 *  9.  §9   Run 1 record (candidate/accepted/rejected/duplicates/digests)
 *  10. §10b     from-baseline rollback preserves the previous graph byte-identically
 *  11. §8.11    corrupted derived state is refused before mutation
 *  12. §11  Run 2 idempotency (INSERT/UPDATE/DUPLICATE/DRIFT/UNEXPECTED = 0)
 *  13. §12  independent verifier PASS
 *  14. §13/§16  coverage + final state audit (canonical digests unchanged,
 *      no obsolete provenance, transient state gitignored)
 *
 * All execution targets the explicitly disposable database only. The engine
 * performs zero database writes; the graph is file-derived (schema decision A).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { resolve } from "path";

import {
  deriveGraphEdgeId,
  validateGraphEdge,
  validateDerivedEdgeSet,
  deriveKanjiJmdictGraph,
  executeKanjiJmdictGraphRun,
  collectCanonicalBaseline,
  verifyCanonicalBaseline,
  verifyExistingGraphState,
  computeGraphDigest,
  canonicalJson,
  sha256Hex,
  GRAPH_CONTRACT,
  GATE0_METRIC_BASELINE,
  type DerivedGraph,
  type GraphEdgeRecord,
  type KanjiJmdictGraphRunResult,
} from "../scripts/ingest-kanji-jmdict-graph";
import { verifyKanjiJmdictGraph } from "../scripts/verify-kanji-jmdict-graph";

const PUBLISH_DIR = resolve(process.cwd(), "data/kanji-jmdict-graph");
const STAGING_DIR = resolve(process.cwd(), "data/kanji-jmdict-graph.staging");

function edge(partial: Partial<GraphEdgeRecord> & { character: string; entryId: string }): GraphEdgeRecord {
  return {
    edgeId: deriveGraphEdgeId(partial.character, partial.entryId),
    kanjiId: `kanji-${partial.character}`,
    kanjiSourceRef: "upstream:kanjidic2:2023-08",
    ...partial,
  };
}

let derivedReadonly: DerivedGraph | null = null;
let run1: KanjiJmdictGraphRunResult | null = null;
let run1StateBytes = "";
let run1EdgesBytes = "";

describe("Phase 14.4E: controlled Kanji ↔ JMdict graph gates", () => {
  beforeAll(() => {
    rmSync(PUBLISH_DIR, { recursive: true, force: true });
    rmSync(STAGING_DIR, { recursive: true, force: true });
    rmSync(resolve(process.cwd(), "data/kanji-jmdict-graph.prev"), {
      recursive: true,
      force: true,
    });
  });

  it("1. §5 deterministic edge identity: same pair same ID; different kanji/entry different ID", () => {
    const a = deriveGraphEdgeId("日", "de-jmdict-123");
    const b = deriveGraphEdgeId("日", "de-jmdict-123");
    expect(a).toBe(b);
    expect(a).toBe("kanji:日:dict:de-jmdict-123");

    // different kanji → different edge
    expect(deriveGraphEdgeId("本", "de-jmdict-123")).not.toBe(a);
    // different entry → different edge
    expect(deriveGraphEdgeId("日", "de-jmdict-456")).not.toBe(a);

    // NFC-normalized identity (historical family semantics retained)
    expect(deriveGraphEdgeId("日\u3099", "de-jmdict-123")).toBe("kanji:日:dict:de-jmdict-123");
  });

  it("2. §5 repeated derivation is byte-identical with stable ordering", async () => {
    const d1 = await deriveKanjiJmdictGraph();
    const d2 = await deriveKanjiJmdictGraph();
    expect(canonicalJson(d1.edges)).toBe(canonicalJson(d2.edges));
    expect(d1.idsDigest).toBe(d2.idsDigest);
    expect(d1.provenanceDigest).toBe(d2.provenanceDigest);
    // stable ordering: edgeId ascending, independent of DB row order
    for (let i = 1; i < d1.edges.length; i++) {
      expect(d1.edges[i - 1].edgeId < d1.edges[i].edgeId).toBe(true);
    }
    derivedReadonly = d1;
  });

  it("3. §6 read-only derivation reconciles against the Gate-0 baseline", () => {
    expect(derivedReadonly).not.toBeNull();
    const m = derivedReadonly!.metrics;
    expect(m.totalJmdictEntries).toBe(206717);
    expect(m.kanjiBearingEntries).toBe(GATE0_METRIC_BASELINE.kanjiBearingEntries);
    expect(m.kanaOnlyEntries).toBe(GATE0_METRIC_BASELINE.kanaOnlyEntries);
    // Gate-0 "distinct referenced characters" = ALL distinct entry kanji chars
    expect(m.distinctEntryKanjiCharacters).toBe(GATE0_METRIC_BASELINE.distinctReferencedCharacters);
    expect(m.distinctEntryKanjiCharacters).toBe(
      m.distinctReferencedKanji + m.jmdictOnlyCharacters
    );
    expect(m.distinctReferencedKanji).toBe(5880);
    expect(m.zeroReferenceKanji).toBe(GATE0_METRIC_BASELINE.zeroReferenceKanji);
    expect(m.distinctReferencedKanji + m.zeroReferenceKanji).toBe(13108);
    expect(m.multiKanjiEntries).toBe(GATE0_METRIC_BASELINE.multiKanjiEntries);
    expect(m.multiKeleEntries).toBe(GATE0_METRIC_BASELINE.multiKeleEntries);
    expect(m.okuriganaSurfaces).toBe(GATE0_METRIC_BASELINE.okuriganaSurfaces);
    expect(m.jmdictOnlyCharacters).toBe(GATE0_METRIC_BASELINE.jmdictOnlyCharacters);
    expect(derivedReadonly!.classification.jmdictOnlyCharacters.length).toBe(
      GATE0_METRIC_BASELINE.jmdictOnlyCharacters
    );
    // candidate = accepted + unmatched (JMdict-only chars, non-forged)
    expect(m.candidateEdges).toBe(m.acceptedEdges + m.unmatchedCandidateEdges);
    expect(m.acceptedEdges).toBeGreaterThan(100000);
    expect(m.unmatchedCandidateEdges).toBe(18);
    expect(m.duplicates).toBe(0);
    expect(m.invalidEdges).toBe(0);
    expect(m.provenanceViolations).toBe(0);
  });

  it("4. §8.1-3 target refusals: unclassified / production / mismatched database identity", async () => {
    const saved = {
      cls: process.env.NIHONGO_DB_TARGET_CLASS,
      db: process.env.NIHONGO_DB_EXPECTED_DATABASE,
    };
    try {
      process.env.NIHONGO_DB_TARGET_CLASS = "staging";
      await expect(executeKanjiJmdictGraphRun({ phase: 1 })).rejects.toThrow(
        /TARGET_CLASSIFICATION/
      );
      process.env.NIHONGO_DB_TARGET_CLASS = "production";
      await expect(executeKanjiJmdictGraphRun({ phase: 1 })).rejects.toThrow(
        /TARGET_CLASSIFICATION/
      );
      process.env.NIHONGO_DB_TARGET_CLASS = "disposable";
      process.env.NIHONGO_DB_EXPECTED_DATABASE = "other_db";
      await expect(executeKanjiJmdictGraphRun({ phase: 1 })).rejects.toThrow(
        /TARGET_CLASSIFICATION/
      );
      delete process.env.NIHONGO_DB_TARGET_CLASS;
      await expect(executeKanjiJmdictGraphRun({ phase: 1 })).rejects.toThrow(
        /TARGET_CLASSIFICATION/
      );
    } finally {
      if (saved.cls === undefined) delete process.env.NIHONGO_DB_TARGET_CLASS;
      else process.env.NIHONGO_DB_TARGET_CLASS = saved.cls;
      if (saved.db === undefined) delete process.env.NIHONGO_DB_EXPECTED_DATABASE;
      else process.env.NIHONGO_DB_EXPECTED_DATABASE = saved.db;
    }
    expect(existsSync(PUBLISH_DIR)).toBe(false);
    expect(existsSync(STAGING_DIR)).toBe(false);
  });

  it("5. §8.4-5 provenance refusals: wrong JMdict identity and forbidden references", async () => {
    await expect(
      executeKanjiJmdictGraphRun({
        phase: 1,
        claimedEntrySourceRef: "upstream:jmdict:2024-09",
      })
    ).rejects.toThrow(/WRONG JMDICT SOURCE IDENTITY/);

    await expect(
      executeKanjiJmdictGraphRun({
        phase: 1,
        claimedEntrySourceRef: "first-party:kanji-corpus:v1",
      })
    ).rejects.toThrow(/WRONG JMDICT SOURCE IDENTITY/);

    // obsolete era identities forbidden as used provenance
    expect(() =>
      validateGraphEdge(
        edge({
          character: "日",
          entryId: "de-jmdict-1",
          kanjiSourceRef: "kanjidic2:2024-03" as string,
        } as GraphEdgeRecord)
      )
    ).toThrow(/FORBIDDEN SOURCE REFERENCE/);

    expect(() =>
      validateGraphEdge(
        edge({
          character: "日",
          entryId: "de-jmdict-1",
          kanjiSourceRef: "kanjivg:0.99" as string,
        } as GraphEdgeRecord)
      )
    ).toThrow(/FORBIDDEN SOURCE REFERENCE/);

    expect(() =>
      validateGraphEdge(
        edge({
          character: "日",
          entryId: "de-jmdict-1",
          kanjiSourceRef: "first-party:totally-forged:v1",
        })
      )
    ).toThrow(/FORGED SOURCE REFERENCE/);

    expect(existsSync(PUBLISH_DIR)).toBe(false);
  });

  it("6. §8.6-9 relationship refusals: malformed / duplicate / invalid Unicode", () => {
    // malformed relationship (edgeId not matching the algorithm)
    expect(() =>
      validateGraphEdge({
        edgeId: "kanji:日:dict:de-jmdict-1:pos:0",
        character: "日",
        kanjiId: "kanji-日",
        kanjiSourceRef: "upstream:kanjidic2:2023-08",
        entryId: "de-jmdict-1",
      })
    ).toThrow(/MALFORMED RELATIONSHIP/);

    expect(() =>
      validateGraphEdge(
        edge({ character: "日", entryId: "not-an-entry-id" })
      )
    ).toThrow(/MALFORMED RELATIONSHIP/);

    // duplicate deterministic edge
    expect(() =>
      validateDerivedEdgeSet([
        edge({ character: "日", entryId: "de-jmdict-1" }),
        edge({ character: "日", entryId: "de-jmdict-1" }),
      ])
    ).toThrow(/DUPLICATE DETERMINISTIC EDGE/);

    // invalid Unicode/codepoint (multi-codepoint, non-kanji, non-NFC)
    expect(() =>
      validateGraphEdge(edge({ character: "日本", entryId: "de-jmdict-1" }))
    ).toThrow(/INVALID UNICODE/);
    expect(() =>
      validateGraphEdge(edge({ character: "あ", entryId: "de-jmdict-1" }))
    ).toThrow(/INVALID UNICODE/);
    expect(() =>
      validateGraphEdge(edge({ character: "\uFB5C", entryId: "de-jmdict-1" })) // compat ideograph
    ).toThrow(/INVALID UNICODE|NON-NFC/);

    expect(existsSync(PUBLISH_DIR)).toBe(false);
  });

  it("7. §8.10 incompatible canonical baseline is refused before any write", async () => {
    await expect(
      executeKanjiJmdictGraphRun({
        phase: 1,
        expectedBaseline: {
          ...(await collectCanonicalBaseline()),
          kanjiCount: 999,
        },
      })
    ).rejects.toThrow(/INCOMPATIBLE CANONICAL BASELINE/);
    expect(existsSync(PUBLISH_DIR)).toBe(false);
  });

  it("8. §8.12 interrupted execution leaves no partial state (stale staging recovered)", async () => {
    // simulate a crashed predecessor's abandoned staging area
    mkdirSync(STAGING_DIR, { recursive: true });
    writeFileSync(resolve(STAGING_DIR, "state.json"), "{corrupt-partial");
    const result = await executeKanjiJmdictGraphRun({
      phase: 1,
      forceFailAfterStagingWrite: true,
    });
    expect(result.rollback).not.toBeNull();
    expect(existsSync(STAGING_DIR)).toBe(false); // stale + new staging fully cleaned
    expect(existsSync(PUBLISH_DIR)).toBe(false); // no partial published graph
  });

  it("9. §10a forced mid-run rollback: failure after staged writes began leaves no partial graph", async () => {
    const result = await executeKanjiJmdictGraphRun({
      phase: 1,
      forceFailAfterStagingWrite: true,
    });
    expect(result.rollback!.forced).toBe(true);
    expect(result.rollback!.stagingCleaned).toBe(true);
    expect(result.rollback!.previousStatePreserved).toBe(true);
    expect(result.rollback!.previousGraphDigest).toBeNull(); // empty baseline
    expect(existsSync(PUBLISH_DIR)).toBe(false);
    expect(existsSync(STAGING_DIR)).toBe(false);
    // canonical state untouched
    const db = await collectCanonicalBaseline();
    verifyCanonicalBaseline(db);
  });

  it("10. §9 Run 1: controlled derivation publishes the canonical graph", async () => {
    run1 = await executeKanjiJmdictGraphRun({ phase: 1 });
    run1StateBytes = readFileSync(resolve(PUBLISH_DIR, "state.json"), "utf-8");
    run1EdgesBytes = readFileSync(resolve(PUBLISH_DIR, "edges.json"), "utf-8");
    expect(run1!.dbImmutable).toBe(true);
    expect(run1!.graphDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(run1!.metrics.candidateEdges).toBe(
      run1!.metrics.acceptedEdges + run1!.metrics.unmatchedCandidateEdges
    );
    expect(run1!.metrics.acceptedEdges).toBe(472793);
    expect(run1!.metrics.unmatchedCandidateEdges).toBe(18);
    expect(run1!.metrics.rejectedEdges).toBe(0);
    expect(run1!.metrics.duplicates).toBe(0);
    expect(run1!.metrics.invalidEdges).toBe(0);
    expect(run1!.metrics.provenanceViolations).toBe(0);
    expect(run1!.metrics.nodeKanji).toBe(5880); // 5,896 referenced − 16 JMdict-only
    expect(run1!.metrics.nodeEntries).toBe(165466); // 1 kanji-bearing entry matches no node
    expect(run1!.metrics.kanjiBearingEntriesWithoutMatch).toBe(1);
    expect(run1StateBytes.length).toBeGreaterThan(0);
    expect(run1EdgesBytes.length).toBeGreaterThan(0);
  });

  it("11. §10b from-baseline rollback: previous valid graph survives byte-identically", async () => {
    const result = await executeKanjiJmdictGraphRun({
      phase: 1,
      forceFailAfterStagingWrite: true,
      requireValidExistingState: true,
    });
    expect(result.rollback!.previousStatePreserved).toBe(true);
    expect(result.rollback!.previousGraphDigest).toBe(run1!.graphDigest);
    // previous valid state survives byte-for-byte
    expect(readFileSync(resolve(PUBLISH_DIR, "state.json"), "utf-8")).toBe(run1StateBytes);
    expect(readFileSync(resolve(PUBLISH_DIR, "edges.json"), "utf-8")).toBe(run1EdgesBytes);
    expect(existsSync(STAGING_DIR)).toBe(false);
  });

  it("12. §8.11 corrupted derived state is refused before mutation", async () => {
    // (a) byte-level tamper of state.json's graph digest → integrity refusal
    const stateOriginal = readFileSync(resolve(PUBLISH_DIR, "state.json"), "utf-8");
    const tampered = stateOriginal.replace(
      /"graphDigest": "([0-9a-f])/,
      (_m, c: string) => `"graphDigest": "${c === "a" ? "b" : "a"}`
    );
    expect(tampered).not.toBe(stateOriginal);
    writeFileSync(resolve(PUBLISH_DIR, "state.json"), tampered);
    await expect(
      executeKanjiJmdictGraphRun({ phase: 2, requireValidExistingState: true })
    ).rejects.toThrow(/CORRUPTED DERIVED STATE/);
    expect(readFileSync(resolve(PUBLISH_DIR, "state.json"), "utf-8")).toBe(tampered);

    // (b) corrupted edges.json payload → parse/integrity refusal
    const edgesOriginal = readFileSync(resolve(PUBLISH_DIR, "edges.json"), "utf-8");
    writeFileSync(resolve(PUBLISH_DIR, "edges.json"), "[[not-json");
    await expect(
      executeKanjiJmdictGraphRun({ phase: 2, requireValidExistingState: true })
    ).rejects.toThrow();
    expect(readFileSync(resolve(PUBLISH_DIR, "edges.json"), "utf-8")).toBe("[[not-json");

    // restore the valid state for the remaining gates
    writeFileSync(resolve(PUBLISH_DIR, "state.json"), stateOriginal);
    writeFileSync(resolve(PUBLISH_DIR, "edges.json"), edgesOriginal);
    verifyExistingGraphState(PUBLISH_DIR); // restored state is self-consistent
  });

  it("13. §11 Run 2 idempotency: 0 inserts / 0 updates / 0 duplicates / 0 drift / 0 unexpected", async () => {
    const run2 = await executeKanjiJmdictGraphRun({
      phase: 2,
      requireValidExistingState: true,
    });
    expect(run2.graphDigest).toBe(run1!.graphDigest);
    expect(run2.edgesDigest).toBe(run1!.edgesDigest);
    expect(run2.idsDigest).toBe(run1!.idsDigest);
    expect(run2.provenanceDigest).toBe(run1!.provenanceDigest);
    expect(run2.dbImmutable).toBe(true);
    expect(readFileSync(resolve(PUBLISH_DIR, "state.json"), "utf-8")).toBe(run1StateBytes);
    expect(readFileSync(resolve(PUBLISH_DIR, "edges.json"), "utf-8")).toBe(run1EdgesBytes);
  });

  it("14. §12 independent verifier recomputes the graph and PASSes", async () => {
    const verdict = await verifyKanjiJmdictGraph();
    const failed = verdict.checks.filter((c) => !c.ok);
    expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
    expect(verdict.verdict).toBe("PASS");
  });

  it("15. §13/§16 coverage + final state audit: canonical digests unchanged, no obsolete provenance", async () => {
    const state = JSON.parse(readFileSync(resolve(PUBLISH_DIR, "state.json"), "utf-8"));
    // fresh coverage (recomputed this run — no hardcoded historical metrics)
    expect(state.metrics.totalJmdictEntries).toBe(206717);
    expect(state.metrics.kanjiBearingEntries).toBe(165467);
    expect(state.metrics.kanaOnlyEntries).toBe(41250);
    expect(state.metrics.distinctEntryKanjiCharacters).toBe(5896);
    expect(state.metrics.distinctReferencedKanji).toBe(5880);
    expect(state.metrics.zeroReferenceKanji).toBe(7228);
    expect(state.metrics.jmdictOnlyCharacters).toBe(16);
    expect(state.metrics.candidateEdges).toBe(472811);
    expect(state.metrics.acceptedEdges).toBe(472793);
    expect(state.metrics.unmatchedCandidateEdges).toBe(18);
    expect(state.metrics.multiKeleEntries).toBe(30936);
    expect(state.classification.jmdictOnlyCharacters.length).toBe(16);

    // provenance: entry side constant; kanji side allowed-only; no obsolete identities
    expect(state.contract.entrySourceRef).toBe("upstream:jmdict:2023-08");
    const text = JSON.stringify(state);
    for (const bad of ["kanjidic2:2024-03", "kanjivg:0.99", "upstream:kanjivg:2024-04"]) {
      expect(text.includes(bad)).toBe(false);
    }

    // canonical DB unchanged (14.4C/14.4D protection)
    const db = await collectCanonicalBaseline();
    verifyCanonicalBaseline(db);
    expect(db.kanjiDigest).toBe("4e2b27a3249661c87241fd3637160ae7");
    expect(db.dictionaryDigest).toBe("42907c1d35e1151d64dd57cdef1eddab");

    // deterministic-ID digest + provenance digest consistency
    const edges = JSON.parse(readFileSync(resolve(PUBLISH_DIR, "edges.json"), "utf-8"));
    expect(sha256Hex(canonicalJson(edges))).toBe(state.edgesDigest);
    expect(state.idsDigest).toBe(
      sha256Hex(edges.map((e: { edgeId: string }) => e.edgeId).join("\n"))
    );

    // derived state is gitignored transient (never committed)
    const gitignore = readFileSync(resolve(process.cwd(), ".gitignore"), "utf-8");
    expect(gitignore).toContain("/data/kanji-jmdict-graph");
  });
});
