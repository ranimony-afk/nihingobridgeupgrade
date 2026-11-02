/**
 * Canonical Kanji dataset model — state classification and planning, DB-free.
 *
 * These tests encode the production observation that motivated the
 * provisioning work: 208 kana rows, 33 Mind Tree kanji, 55 elements and
 * 71 composition edges is NOT a finished database. It is the Mind Tree dataset
 * with the 12-row curated corpus missing.
 */

import { describe, expect, it } from "vitest";

import {
  BOOTSTRAP_EXPECTATIONS,
  decideKanjiBootstrap,
  type KanjiBootstrapCounts,
} from "@/services/knowledge/canonicalBootstrapGuard";
import {
  buildCanonicalDatasets,
  buildCorpusPilotDataset,
  buildMindtreeDataset,
  classifyCanonicalState,
  digestRows,
  expectedCanonicalTotals,
  planIsNoop,
  planProvisioning,
  subtractDataset,
  validateCanonicalInvariants,
  type CanonicalRows,
} from "@/services/knowledge/canonicalDataset";
import { buildKanaDataset } from "@/data/kana";

const EXPECTED_KANA = buildKanaDataset().length;

function mindtreeOnly(): CanonicalRows {
  const dataset = buildMindtreeDataset();
  return {
    radicals: dataset.rows.radicals.map((r) => ({ ...r })),
    kanji: dataset.rows.kanji.map((k) => ({ ...k })),
    composition: dataset.rows.composition.map((c) => ({ ...c })),
  };
}

function fullyProvisioned(): CanonicalRows {
  const rows = mindtreeOnly();
  const corpus = buildCorpusPilotDataset();
  return {
    radicals: [...rows.radicals, ...corpus.rows.radicals.map((r) => ({ ...r }))],
    kanji: [...rows.kanji, ...corpus.rows.kanji.map((k) => ({ ...k }))],
    composition: [...rows.composition, ...corpus.rows.composition.map((c) => ({ ...c }))],
  };
}

function productionKana() {
  return { total: EXPECTED_KANA, provenance: { "first-party:kana-core:v1": EXPECTED_KANA } };
}

describe("dataset definitions", () => {
  it("derives the expected first-party foundation from repository source data", () => {
    const totals = expectedCanonicalTotals();
    expect(totals.kanji).toBe(45);
    expect(totals.provenance["first-party:kanji-mindtree:v1"]).toBe(33);
    expect(totals.provenance["first-party:kanji-corpus:v1"]).toBe(12);
    // The corpus dataset contributes 8 elements and 19 edges on top of the
    // Mind Tree's 55 / 71. A "provisioned" database is therefore 63 / 90, not
    // 55 / 71: the 12 headwords cannot be added without their elements.
    expect(totals.radicals).toBe(63);
    expect(totals.composition).toBe(90);
    expect(buildCanonicalDatasets()).toHaveLength(2);
    expect(BOOTSTRAP_EXPECTATIONS.firstPartyKanji).toBe(45);
  });

  it("keeps the two datasets disjoint by id and character", () => {
    const mindtree = buildMindtreeDataset();
    const corpus = buildCorpusPilotDataset();
    const mindtreeIds = new Set(mindtree.rows.kanji.map((k) => k.id));
    const mindtreeChars = new Set(mindtree.rows.kanji.map((k) => k.character));
    for (const row of corpus.rows.kanji) {
      expect(mindtreeIds.has(row.id)).toBe(false);
      expect(mindtreeChars.has(row.character)).toBe(false);
    }
    const mindtreeElements = new Set(mindtree.rows.radicals.map((r) => r.id));
    for (const row of corpus.rows.radicals) {
      expect(mindtreeElements.has(row.id)).toBe(false);
    }
  });
});

describe("classifyCanonicalState", () => {
  it("classifies the observed production shape as PARTIALLY_PROVISIONED", () => {
    const report = classifyCanonicalState({
      kana: productionKana(),
      observed: mindtreeOnly(),
      expectedKana: EXPECTED_KANA,
    });

    expect(report.status).toBe("PARTIALLY_PROVISIONED");
    const corpus = report.assessments.find((a) => a.id === "kanji-corpus-pilot");
    expect(corpus?.status).toBe("EMPTY");
    expect(corpus?.missing.kanji).toHaveLength(12);
    const mindtree = report.assessments.find((a) => a.id === "kanji-mindtree");
    expect(mindtree?.status).toBe("COMPLETE");
    expect(report.issues.join(" ")).toMatch(/12 kanji/);
    expect(report.remediation).toMatch(/operator procedure/i);
  });

  it("classifies an untouched database as EMPTY", () => {
    const report = classifyCanonicalState({
      kana: { total: 0, provenance: {} },
      observed: { radicals: [], kanji: [], composition: [] },
      expectedKana: EXPECTED_KANA,
    });
    expect(report.status).toBe("EMPTY");
    expect(report.remediation).not.toBeNull();
  });

  it("classifies both datasets present as FULLY_PROVISIONED", () => {
    const report = classifyCanonicalState({
      kana: productionKana(),
      observed: fullyProvisioned(),
      expectedKana: EXPECTED_KANA,
    });
    expect(report.status).toBe("FULLY_PROVISIONED");
    expect(report.assessments.every((a) => a.status === "COMPLETE")).toBe(true);
    expect(report.remediation).toBeNull();
  });

  it("classifies a drifted canonical row as INCONSISTENT", () => {
    const rows = fullyProvisioned();
    const target = rows.kanji.find((k) => k.id === "kanji-road");
    expect(target).toBeDefined();
    target!.meaning = "edited by hand";
    const report = classifyCanonicalState({
      kana: productionKana(),
      observed: rows,
      expectedKana: EXPECTED_KANA,
    });
    expect(report.status).toBe("INCONSISTENT");
    const corpus = report.assessments.find((a) => a.id === "kanji-corpus-pilot");
    expect(corpus?.status).toBe("CONFLICTING");
    expect(corpus?.drifted.kanji).toContain("kanji-road");
  });

  it("reports UNKNOWN rather than EMPTY when the state cannot be read", () => {
    const report = classifyCanonicalState({
      kana: null,
      observed: null,
      expectedKana: EXPECTED_KANA,
    });
    expect(report.status).toBe("UNKNOWN");
    expect(report.assessments).toEqual([]);
  });

  it("flags a kana count that exceeds the expected baseline as INCONSISTENT", () => {
    const report = classifyCanonicalState({
      kana: { total: EXPECTED_KANA + 5, provenance: {} },
      observed: fullyProvisioned(),
      expectedKana: EXPECTED_KANA,
    });
    expect(report.status).toBe("INCONSISTENT");
    expect(report.issues.join(" ")).toMatch(/kana_entries/);
  });
});

describe("planProvisioning", () => {
  it("plans exactly the missing corpus rows against the production shape", () => {
    const plan = planProvisioning(buildCorpusPilotDataset(), mindtreeOnly());
    expect(plan.blockers).toEqual([]);
    expect(plan.inserts.kanji).toHaveLength(12);
    expect(plan.inserts.radicals).toHaveLength(8);
    expect(plan.inserts.composition).toHaveLength(19);
    expect(plan.alreadyPresent).toEqual({ radicals: 0, kanji: 0, composition: 0 });
    expect(plan.expectedAfter).toEqual({ radicals: 63, kanji: 45, composition: 90 });
    expect(plan.inserts.kanji.map((k) => k.character)).toEqual(
      expect.arrayContaining(["道", "鑑", "観", "念"])
    );
  });

  it("is a no-op once the dataset is complete (idempotent)", () => {
    const plan = planProvisioning(buildCorpusPilotDataset(), fullyProvisioned());
    expect(planIsNoop(plan)).toBe(true);
    expect(plan.blockers).toEqual([]);
    expect(plan.alreadyPresent.kanji).toBe(12);
  });

  it("stops on a content difference instead of overwriting it", () => {
    const rows = mindtreeOnly();
    const corpus = buildCorpusPilotDataset();
    const existing = { ...corpus.rows.kanji[0], meaning: "locally edited" };
    rows.kanji.push(existing);
    const plan = planProvisioning(corpus, rows);
    expect(plan.blockers.length).toBeGreaterThan(0);
    expect(plan.blockers.join(" ")).toMatch(/different content/);
  });

  it("stops when a canonical character is already owned by another id", () => {
    const rows = mindtreeOnly();
    const corpus = buildCorpusPilotDataset();
    const squatter = {
      ...corpus.rows.kanji[0],
      id: "legacy-import-road",
      sourceRef: "upstream:kanjidic2:2023-08",
    };
    rows.kanji.push(squatter);
    const plan = planProvisioning(corpus, rows);
    expect(plan.blockers.join(" ")).toMatch(/already exists under id/);
  });
});

describe("validateCanonicalInvariants", () => {
  it("accepts a fully provisioned foundation", () => {
    const violations = validateCanonicalInvariants({
      observed: fullyProvisioned(),
      kana: productionKana(),
      expectedKana: EXPECTED_KANA,
    });
    expect(violations).toEqual([]);
  });

  it("reports the missing corpus dataset on the production shape", () => {
    const violations = validateCanonicalInvariants({
      observed: mindtreeOnly(),
      kana: productionKana(),
      expectedKana: EXPECTED_KANA,
    });
    expect(violations.map((v) => v.code)).toContain("DATASET_INCOMPLETE");
    expect(violations.map((v) => v.detail).join(" ")).toMatch(/kanji-corpus-pilot/);
  });

  it("detects dangling composition edges and duplicate characters", () => {
    const rows = fullyProvisioned();
    rows.composition.push({
      id: "comp-ghost",
      kanjiId: "kanji-does-not-exist",
      elementId: "el-does-not-exist",
      role: "semantic",
      position: null,
      renderedAs: "X",
      orderIndex: 1,
    });
    rows.kanji.push({ ...rows.kanji[0], id: "duplicate-character-row" });
    const violations = validateCanonicalInvariants({
      observed: rows,
      kana: productionKana(),
      expectedKana: EXPECTED_KANA,
    });
    const codes = violations.map((v) => v.code);
    expect(codes).toContain("DANGLING_COMPOSITION_EDGE");
    expect(codes).toContain("DUPLICATE_CHARACTER");
  });

  it("detects an unexpected mutation of pre-existing rows", () => {
    const violations = validateCanonicalInvariants({
      observed: fullyProvisioned(),
      kana: productionKana(),
      expectedKana: EXPECTED_KANA,
      untouchedDigestBefore: "before",
      untouchedDigestAfter: "after",
    });
    expect(violations.map((v) => v.code)).toContain("UNEXPECTED_MUTATION");
  });
});

describe("digestRows / subtractDataset", () => {
  it("excludes the dataset's own rows from the untouched digest", () => {
    const full = fullyProvisioned();
    const corpus = buildCorpusPilotDataset();
    const untouched = subtractDataset(full, corpus);
    expect(untouched.kanji).toHaveLength(33);
    expect(untouched.radicals).toHaveLength(55);
    expect(untouched.composition).toHaveLength(71);
    expect(digestRows(untouched)).toBe(digestRows(mindtreeOnly()));
  });
});

describe("decideKanjiBootstrap", () => {
  const mindtreeShape: KanjiBootstrapCounts = {
    kana: EXPECTED_KANA,
    kanjiTotal: 33,
    mindtreeKanji: 33,
    corpusKanji: 0,
    otherKanji: 0,
    radicals: 55,
    composition: 71,
  };

  it("seeds only when the canonical tables are empty", () => {
    expect(
      decideKanjiBootstrap({
        ...mindtreeShape,
        kana: 0,
        kanjiTotal: 0,
        mindtreeKanji: 0,
        radicals: 0,
        composition: 0,
      }).action
    ).toBe("seed");
  });

  it("treats populated kana as irrelevant evidence about Kanji provisioning", () => {
    const decision = decideKanjiBootstrap({
      ...mindtreeShape,
      kana: 0,
      kanjiTotal: 0,
      mindtreeKanji: 0,
      radicals: 0,
      composition: 0,
    });
    expect(decision.action).toBe("seed");
  });

  it("skips on the observed production shape and names the corpus gap", () => {
    const decision = decideKanjiBootstrap(mindtreeShape);
    expect(decision.action).toBe("skip");
    expect(decision.reason).toMatch(/corpus dataset is incomplete/);
  });

  it("refuses a partial foundation instead of repairing it", () => {
    const decision = decideKanjiBootstrap({ ...mindtreeShape, radicals: 12, composition: 0 });
    expect(decision.action).toBe("refuse");
    expect(decision.reason).toMatch(/partial or inconsistent/);
  });

  it("refuses when more Mind Tree rows exist than the dataset defines", () => {
    const decision = decideKanjiBootstrap({
      ...mindtreeShape,
      kanjiTotal: 40,
      mindtreeKanji: 40,
    });
    expect(decision.action).toBe("refuse");
  });
});
