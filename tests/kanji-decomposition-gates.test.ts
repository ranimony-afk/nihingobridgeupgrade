/**
 * PHASE 14.4F — CONTROLLED KANJI STRUCTURAL DECOMPOSITION GATES
 * Gate matrix §13.1–§13.15. Stateful ordered flow:
 *   Run 1 (empty baseline) → verify → idempotent Run 2 → forced-failure rollback
 *   → canaries → semantics → protected invariants.
 * Full regression (54 files incl. this one) is run separately in the gate sequence.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { Client } from "pg";

import {
  CONTRACT_POSITIONS,
  CONTRACT_ROLES,
  DECOMPOSITION_CONTRACT,
  FORBIDDEN_PROVENANCE_IDENTITIES,
  POSITION_MAP,
  deriveComponentId,
  deriveContainmentId,
  deriveVariantId,
  executeKanjiDecompositionRun,
  extractGlyphEvidence,
  validateComponentRecord,
  validateContainmentRecord,
  validateDerivedSets,
  validateVariantRecord,
  verifyExistingDecompositionState,
  verifySourceIdentity,
} from "../scripts/ingest-kanji-decomposition";
import type {
  ComponentRecord,
  ContainmentRecord,
  VariantRecord,
} from "../scripts/ingest-kanji-decomposition";
import { verifyKanjiDecomposition } from "../scripts/verify-kanji-decomposition";

const BASE = process.env.NIHONGO_REPO_BASE ?? resolve(__dirname, "..");
const PUBLISH = resolve(BASE, "data/kanji-decomposition");
const STAGING = resolve(BASE, "data/kanji-decomposition.staging");
const PREV = resolve(BASE, "data/kanji-decomposition.prev");
const CORPUS = resolve(BASE, "data/kanjivg");

const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

function canon(v: unknown): string {
  const s = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(s);
    if (x && typeof x === "object") {
      const o: Record<string, unknown> = {};
      for (const k of Object.keys(x as object).sort()) o[k] = s((x as Record<string, unknown>)[k]);
      return o;
    }
    return x;
  };
  return JSON.stringify(s(v));
}

function hashDir(dir: string): string {
  if (!existsSync(dir)) return "ABSENT";
  const files = readdirSync(dir).sort();
  return sha256(files.map((f) => `${f}:${sha256(readFileSync(resolve(dir, f)))}`).join("\n"));
}

function readState() {
  return JSON.parse(readFileSync(resolve(PUBLISH, "state.json"), "utf-8"));
}

function readRows(name: string) {
  return JSON.parse(readFileSync(resolve(PUBLISH, name), "utf-8")) as Array<Record<string, unknown>>;
}

async function withDb<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({
    connectionString:
      process.env.DATABASE_URL || "postgresql://nihongo:nihongo@127.0.0.1:5432/app_db",
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

interface Snapshot {
  hash: string;
  db: { kanji: string; dict: string; extra: string };
  graphDigest: string;
  componentsDigest: string;
}

async function snapshotAll(): Promise<Snapshot> {
  const db = await withDb(async (c) => {
    const kanji = (
      await c.query(
        `SELECT count(*)::int AS n, md5(string_agg(id || '|' || character || '|' || stroke_count || '|' || source_ref, ',' ORDER BY id)) AS d FROM kanji_entries`
      )
    ).rows[0];
    const dict = (
      await c.query(
        `SELECT count(*)::int AS n, md5(string_agg(id || '|' || headword || '|' || reading || '|' || romaji, ',' ORDER BY id)) AS d FROM dictionary_entries`
      )
    ).rows[0];
    const extra = (
      await c.query(
        `SELECT
          (SELECT count(*)::int FROM kanji_radicals) AS radicals,
          (SELECT count(*)::int FROM kanji_composition) AS composition,
          (SELECT count(*)::int FROM grammar_patterns) AS grammar`
      )
    ).rows[0];
    return {
      kanji: `${kanji.n}:${kanji.d}`,
      dict: `${dict.n}:${dict.d}`,
      extra: `${extra.radicals}:${extra.composition}:${extra.grammar}`,
    };
  });
  const state = existsSync(resolve(PUBLISH, "state.json"))
    ? readState()
    : { graphDigest: "ABSENT", componentsDigest: "ABSENT" };
  return {
    hash: hashDir(PUBLISH),
    db,
    graphDigest: state.graphDigest,
    componentsDigest: state.componentsDigest,
  };
}

/** §13.4 five-count idempotency comparison between two derivations. */
function diffCounts(before: Record<string, unknown>[], after: Record<string, unknown>[]) {
  const b = new Map(before.map((r) => [r.id as string, r]));
  const a = new Map(after.map((r) => [r.id as string, r]));
  let inserts = 0;
  let updates = 0;
  let duplicates = 0;
  let unexpected = 0;
  const seen = new Set<string>();
  for (const r of after) {
    const id = r.id as string;
    if (seen.has(id)) duplicates++;
    seen.add(id);
    const old = b.get(id);
    if (!old) inserts++;
    else if (JSON.stringify(old) !== JSON.stringify(r)) updates++;
  }
  for (const id of b.keys()) if (!a.has(id)) unexpected++;
  return { inserts, updates, duplicates, drift: 0, unexpected };
}

let baseline: Snapshot;
let run1: Awaited<ReturnType<typeof executeKanjiDecompositionRun>>;
const workDirs: string[] = [];

beforeAll(() => {
  for (const d of [PUBLISH, STAGING, PREV]) rmSync(d, { recursive: true, force: true });
});

afterAll(() => {
  for (const d of workDirs) rmSync(d, { recursive: true, force: true });
});

describe("PHASE 14.4F — controlled kanji decomposition gates", () => {
  // ------------------------------------------------------------------ §13.1/13.3
  it("13.1/13.3 Run 1 on empty baseline publishes derivation that independent verification accepts", async () => {
    baseline = await snapshotAll();
    expect(
      readdirSync(resolve(BASE, "data")).filter((f) => f.startsWith("kanji-decomposition"))
    ).toEqual([]);

    run1 = await executeKanjiDecompositionRun({ phase: 1 });

    // §13.1/13.3 anchor counts (Gate-0 recon + independent pre-computation)
    expect(run1.metrics.kanjiWithComponents).toBe(6413);
    expect(run1.metrics.kanjiWithoutComponents).toBe(6695);
    expect(run1.metrics.sourceOnlyCharacters).toBe(286);
    expect(run1.metrics.totalFiles).toBe(11658);
    expect(run1.metrics.standardFiles).toBe(6699);
    expect(run1.metrics.variantFiles).toBe(4959);
    expect(run1.metrics.elementGroupsTotal).toBe(43862);
    expect(run1.metrics.rootGroups).toBe(6699);
    expect(run1.metrics.componentRows).toBe(37163);
    expect(run1.metrics.canonicalComponentRows).toBe(37096);
    expect(run1.metrics.sourceOnlyComponentRows).toBe(67);
    expect(run1.metrics.sourceOnlyElementGroups).toBe(353);
    expect(run1.metrics.containmentRows).toBe(37163);
    expect(run1.metrics.kanjiWithComponentRows).toBe(6297);
    // §13.10: 88 variant-style suffix records over 4,959 per-file variant glyphs
    expect(run1.metrics.variantTypeRows).toBe(88);
    expect(run1.metrics.variantRows).toBe(4959);
    expect(run1.metrics.attachedVariantFiles).toBe(4959);
    expect(run1.metrics.unattachedVariantFiles).toBe(0);
    expect(run1.metrics.compatibilityVariantFiles).toBe(0);
    expect(run1.metrics.phoneticComponents).toBe(1246);
    expect(run1.metrics.variantMarkedComponents).toBe(5804);
    expect(run1.metrics.radicalMarkedComponents).toBe(7026);
    expect(run1.metrics.multiCharElementLiterals).toBe(27);
    expect(run1.metrics.provenanceViolations).toBe(0);
    expect(run1.metrics.duplicates).toBe(0);
    expect(run1.metrics.invalidEdges).toBe(0);
    expect(run1.metrics.malformedGlyphs).toBe(0);
    expect(run1.metrics.identityMismatches).toBe(0);
    for (const d of [
      run1.idsDigest,
      run1.componentsDigest,
      run1.containmentDigest,
      run1.variantsDigest,
      run1.provenanceDigest,
      run1.graphDigest,
    ]) {
      expect(d).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(run1.dbImmutable).toBe(true);
    expect(run1.rollback).toBeNull();

    for (const f of ["state.json", "components.json", "containment.json", "variants.json", "digest.txt"]) {
      expect(existsSync(resolve(PUBLISH, f))).toBe(true);
    }
    expect(existsSync(STAGING)).toBe(false);
    expect(existsSync(PREV)).toBe(false);

    // state carries the registered provenance and the classification lists
    const state = readState();
    expect(state.contract.entrySourceRef).toBe("upstream:kanjivg:2024-08");
    expect(state.sourceIdentity.sourceRef).toBe("upstream:kanjivg:2024-08");
    expect(state.classification.sourceOnlyCharacters.length).toBe(286);
    expect(state.classification.canonicalOnlyWithoutGlyphCount).toBe(6695);
    expect(state.variantTypes.length).toBe(88);

    // independent verification must PASS
    const v = await verifyKanjiDecomposition();
    for (const c of v.checks.filter((c) => !c.ok)) console.log("VERIFY FAIL:", c);
    expect(v.verdict).toBe("PASS");
    expect(v.ok).toBe(true);
  }, 600_000);

  // ------------------------------------------------------------------ §13.2
  it("13.2 provenance is upstream:kanjivg:2024-08 everywhere and obsolete forms are absent", () => {
    const all = JSON.stringify([readRows("components.json"), readRows("containment.json"), readRows("variants.json")]);
    for (const bad of FORBIDDEN_PROVENANCE_IDENTITIES) {
      expect(all).not.toContain(bad);
    }
    const components = readRows("components.json");
    expect(components.length).toBe(37163);
    expect(components.every((r) => r.provenance === "upstream:kanjivg:2024-08")).toBe(true);
    expect(DECOMPOSITION_CONTRACT.entrySourceRef).toBe("upstream:kanjivg:2024-08");
    expect(DECOMPOSITION_CONTRACT.entrySourceRef).not.toBe("kanjivg:0.99");
  });

  // ------------------------------------------------------------------ §13.4
  it("13.4 second run (CLI, --require-valid-existing-state) is idempotent: five counts all zero", async () => {
    const before = await snapshotAll();
    const rowsBefore = [readRows("components.json"), readRows("containment.json"), readRows("variants.json")];

    // two-pass CLI smoke: phase 2 with existing-state validation
    const out = execFileSync(
      "npx",
      ["tsx", "scripts/ingest-kanji-decomposition.ts", "--phase=2", "--require-valid-existing-state"],
      { cwd: BASE, encoding: "utf-8", env: { ...process.env }, timeout: 600_000 }
    );
    expect(out).toContain('"phase": 2');
    expect(out).toContain('"dbImmutable": true');

    const rowsAfter = [readRows("components.json"), readRows("containment.json"), readRows("variants.json")];
    for (let i = 0; i < 3; i++) {
      expect(diffCounts(rowsBefore[i], rowsAfter[i])).toEqual({
        inserts: 0,
        updates: 0,
        duplicates: 0,
        drift: 0,
        unexpected: 0,
      });
    }
    const after = await snapshotAll();
    expect(after.hash).toBe(before.hash); // byte-identical
    expect(after.db).toEqual(before.db);
    expect(after.graphDigest).toBe(before.graphDigest);
    expect(after.componentsDigest).toBe(run1.componentsDigest);
  }, 600_000);

  // ------------------------------------------------------------------ §13.5/13.6
  it("13.5/13.6 forced failure after staging write rolls back to byte-identical prior state", async () => {
    const before = await snapshotAll();
    const failing = await executeKanjiDecompositionRun({
      phase: 2,
      forceFailAfterStagingWrite: true,
    });
    expect(failing.rollback?.forced).toBe(true);
    expect(failing.rollback?.stagingCleaned).toBe(true);
    expect(failing.rollback?.previousStatePreserved).toBe(true);
    expect(failing.rollback?.previousGraphDigest).toBe(before.graphDigest);
    expect(failing.graphDigest).toBe(before.graphDigest);
    expect(existsSync(STAGING)).toBe(false);
    expect(existsSync(PREV)).toBe(false);

    const after = await snapshotAll();
    expect(after.hash).toBe(before.hash); // byte-identical prior state
    expect(after.db).toEqual(before.db);
    expect(after.graphDigest).toBe(before.graphDigest);

    // run again after rollback: still idempotent-zero
    const run3 = await executeKanjiDecompositionRun({ phase: 2 });
    expect(run3.componentsDigest).toBe(before.componentsDigest);
    expect(run3.graphDigest).toBe(before.graphDigest);
    const final = await snapshotAll();
    expect(final.hash).toBe(before.hash);
  }, 600_000);

  // ------------------------------------------------------------------ §13.7
  it("13.7 output record types and structures are enforced (schemas + validators)", () => {
    const goodComponent: ComponentRecord = {
      id: deriveComponentId("kanji-明", "el-hi", 0),
      kanjiId: "kanji-明",
      glyphClass: "kanji",
      character: "明",
      elementId: "el-hi",
      elementLiteral: "日",
      renderedAs: "日",
      role: "structural",
      phonetic: null,
      position: "left",
      positionRaw: "left",
      orderIndex: 0,
      part: null,
      number: null,
      radicalType: "general",
      variantOf: null,
      variantMarked: false,
      tradForm: false,
      radicalForm: false,
      partial: false,
      strokeOrders: [1, 2, 3, 4],
      parentIndex: -1,
      depth: 1,
      provenance: DECOMPOSITION_CONTRACT.entrySourceRef,
      evidence: { file: "kanjivg/0660e.svg", groupId: "kvg:0660e-g1", strokeIds: ["kvg:0660e-s1"] },
    };
    expect(() => validateComponentRecord(goodComponent)).not.toThrow();

    // wrong role vocabulary → rejected (never fabricated)
    expect(() =>
      validateComponentRecord({ ...goodComponent, role: "ideogram" })
    ).toThrow(/INVALID ROLE/);
    // phonetic role without evidence → rejected
    expect(() =>
      validateComponentRecord({ ...goodComponent, role: "phonetic" })
    ).toThrow(/PHONETIC ROLE WITHOUT EVIDENCE/);
    // source-only row attached to a kanji identity → rejected
    expect(() =>
      validateComponentRecord({
        ...goodComponent,
        glyphClass: "source-only",
      })
    ).toThrow(/SOURCE-ONLY ROW ATTACHED/);
    // kanji row carrying a source-only identity → rejected
    expect(() =>
      validateComponentRecord({
        ...goodComponent,
        id: deriveComponentId("src:00421", "el-hi", 0),
        kanjiId: "src:00421",
        glyphClass: "kanji",
      })
    ).toThrow(/KANJI ROW WITH SOURCE-ONLY/);
    // wrong id family → rejected
    expect(() =>
      validateComponentRecord({ ...goodComponent, id: "comp-wrong" })
    ).toThrow(/MALFORMED COMPONENT IDENTITY/);
    // wrong provenance → rejected
    expect(() =>
      validateComponentRecord({ ...goodComponent, provenance: "kanjivg:0.99" })
    ).toThrow(/WRONG SOURCE IDENTITY/);

    // containment + variant validators
    const goodContainment: ContainmentRecord = {
      id: deriveContainmentId("kanji-明", -1, 0),
      kanjiId: "kanji-明",
      glyphClass: "kanji",
      character: "明",
      parentIndex: -1,
      childIndex: 0,
      parentLiteral: "明",
      childLiteral: "日",
      provenance: DECOMPOSITION_CONTRACT.entrySourceRef,
      evidence: { file: "kanjivg/0660e.svg", parentGroupId: "kvg:0660e", childGroupId: "kvg:0660e-g1" },
    };
    expect(() => validateContainmentRecord(goodContainment)).not.toThrow();
    expect(() =>
      validateContainmentRecord({ ...goodContainment, id: "cont-wrong" })
    ).toThrow(/MALFORMED CONTAINMENT/);
    const goodVariant: VariantRecord = {
      id: deriveVariantId("08857", "nelson"),
      character: "蠧",
      unicode: "U+8857",
      primaryHex: "08857",
      variantType: "nelson",
      renderedElement: "蠧",
      attachedToCanonical: true,
      isCompatibilityIdeograph: false,
      provenance: DECOMPOSITION_CONTRACT.entrySourceRef,
      evidence: { file: "kanjivg/08857-nelson.svg", rootGroupId: "kvg:08857" },
    };
    expect(() => validateVariantRecord(goodVariant)).not.toThrow();
    expect(() =>
      validateVariantRecord({ ...goodVariant, id: "kvg-var-08857-wrong" })
    ).toThrow(/MALFORMED VARIANT/);

    // id algorithms are deterministic and self-describing
    expect(deriveComponentId("kanji-剛", "el-hito", 3)).toBe("comp-kanji-剛-el-hito-3");
    expect(deriveContainmentId("kanji-剛", -1, 0)).toBe("cont-kanji-剛--1-0");
    expect(deriveVariantId("08857", "nelson")).toBe("kvg-var-08857-nelson");
    expect(deriveVariantId("08857", "")).toBe("kvg-var-08857-std");

    // declared vocabulary
    expect(CONTRACT_ROLES).toContain("phonetic");
    expect(CONTRACT_ROLES).toContain("structural");
    expect(CONTRACT_POSITIONS).toContain("enclosure");
    expect(CONTRACT_POSITIONS).toContain("left");
  });

  // ------------------------------------------------------------------ §13.8
  it("13.8 digest invariants: each digest equals its documented content; graphDigest covers all", () => {
    const components = readRows("components.json");
    const containment = readRows("containment.json");
    const variants = readRows("variants.json");
    const state = readState();
    expect(sha256(canon(components))).toBe(state.componentsDigest);
    expect(sha256(canon(containment))).toBe(state.containmentDigest);
    expect(sha256(canon(variants))).toBe(state.variantsDigest);
    expect(
      sha256([...components, ...containment, ...variants].map((r) => `${r.id}|${r.provenance}`).join("\n"))
    ).toBe(state.provenanceDigest);
    expect(sha256([...components, ...containment, ...variants].map((r) => r.id).join("\n"))).toBe(state.idsDigest);
    const { graphDigest, ...body } = state;
    expect(sha256(canon(body))).toBe(graphDigest);
    expect(readFileSync(resolve(PUBLISH, "digest.txt"), "utf-8").trim()).toBe(graphDigest);
  });

  // ------------------------------------------------------------------ §13.9
  it("13.9 semantic distinctions are declared (radical ≠ component ≠ containment ≠ role ≠ position ≠ rendered ≠ variant)", () => {
    // role ≠ radical: radical marks are evidence, never roles
    const components = readRows("components.json");
    const radicalMarked = components.filter((c) => c.radicalType !== null);
    expect(radicalMarked.length).toBe(7026);
    expect(radicalMarked.every((c) => c.role === "phonetic" || c.role === "structural")).toBe(true);
    // variant ≠ normalized: variant-marked rows keep the rendered form verbatim
    // (renderedAs === elementLiteral), and kvg:original evidence is preserved
    // where the source provides it (3,554 rows) — never fabricated where it
    // does not (2,250 rows carry the mark without an original attribute).
    const variantMarked = components.filter((c) => c.variantMarked === true);
    expect(variantMarked.length).toBe(5804);
    expect(variantMarked.every((c) => c.renderedAs === c.elementLiteral)).toBe(true);
    expect(variantMarked.filter((c) => c.variantOf !== null).length).toBe(3554);
    expect(variantMarked.filter((c) => c.variantOf === null).length).toBe(2250);
    // position: named categories + enclosures; raw evidence always preserved
    expect(POSITION_MAP["tare"]).toBe("enclosure");
    expect(POSITION_MAP["kamaec"]).toBe("enclosure");
    expect(POSITION_MAP["\u2ff5A"]).toBe("enclosure"); // ⿵A
    expect(POSITION_MAP["\u2ff62"]).toBe("enclosure"); // ⿶2
    expect(Object.keys(POSITION_MAP).length).toBe(15);
    expect(POSITION_MAP["left"]).toBe("left");
    // containment ≠ IDS: relationship classes are declared distinctly
    expect(DECOMPOSITION_CONTRACT.relationshipClasses.graphicalComponent).toContain("KVG_COMPONENT");
    expect(DECOMPOSITION_CONTRACT.relationshipClasses.containment).toContain("KVG_CONTAINS");
    expect(DECOMPOSITION_CONTRACT.relationshipClasses.containment).not.toContain("IDS");
    expect(DECOMPOSITION_CONTRACT.relationshipClasses.radicalClassification).toContain("referenced, never written");
    expect(DECOMPOSITION_CONTRACT.relationshipClasses.variantIdentity).toContain("never folded");
  });

  // ------------------------------------------------------------------ §13.10
  it("13.10 variant identity is derived and distinct from components (88 suffix records, 4,959 glyphs)", () => {
    const variants = readRows("variants.json");
    expect(variants.length).toBe(4959);
    expect(new Set(variants.map((v) => v.id)).size).toBe(4959);
    expect(variants.every((v) => v.provenance === "upstream:kanjivg:2024-08")).toBe(true);
    // variant records carry NO component semantics and never collide with component ids
    expect(variants.every((v) => !("role" in v) && !("elementId" in v) && !("orderIndex" in v))).toBe(true);
    expect(variants.every((v) => (v.id as string).startsWith("kvg-var-"))).toBe(true);
    // 88 distinct variant-style suffix types preserved (Gate-0 suffix set)
    const types = new Set(variants.map((v) => v.variantType));
    expect(types.size).toBe(88);
    expect([...types].sort()).toContain("Kaisho");
    const state = readState();
    expect(state.variantTypes.length).toBe(88);
    expect(state.variantTypes.reduce((n: number, t: { files: number }) => n + t.files, 0)).toBe(4959);
    // variant-marked COMPONENTS remain distinct from variant FILES
    const components = readRows("components.json");
    expect(components.some((c) => c.variantMarked === true)).toBe(true);
  });

  // ------------------------------------------------------------------ §13.11
  it("13.11 source-only KanjiVG characters are classified (286) and never attached or omitted", async () => {
    const state = readState();
    expect(state.metrics.sourceOnlyCharacters).toBe(286);
    expect(state.classification.sourceOnlyCharacters.length).toBe(286);
    const components = readRows("components.json");
    const srcRows = components.filter((c) => c.glyphClass === "source-only");
    expect(srcRows.length).toBe(67);
    expect(srcRows.every((c) => (c.kanjiId as string).startsWith("src:"))).toBe(true);
    // none of the 286 source-only characters may carry a kanji identity
    const srcChars = new Set(state.classification.sourceOnlyCharacters);
    expect(srcRows.every((c) => srcChars.has(c.character))).toBe(true);
    const kanjiRows = await withDb((c) =>
      c.query(`SELECT character FROM kanji_entries`).then((r) => new Set(r.rows.map((x) => x.character)))
    );
    expect(srcRows.every((c) => !kanjiRows.has(c.character))).toBe(true);
    // canonical-only kanji without glyph are counted, not invented
    expect(state.classification.canonicalOnlyWithoutGlyphCount).toBe(6695);
  });

  // ------------------------------------------------------------------ §13.12
  it("13.12 fabrication canary FAILS: missing relationships and zero-claim states are rejected", async () => {
    // (a) glyph without any element-group identity → derive throws (cannot fabricate)
    const tmp = mkdtempSync(resolve(tmpdir(), "decomp-canary-"));
    workDirs.push(tmp);
    const stripped = readFileSync(resolve(CORPUS, "0660e.svg"), "utf-8").replace(/ kvg:element="[^"]*"/g, "");
    expect(() => extractGlyphEvidence(stripped, "明")).toThrow(/MALFORMED/);
    // identity mismatch (root element ≠ character) → reject
    const swapped = readFileSync(resolve(CORPUS, "0660e.svg"), "utf-8").replace(
      'kvg:element="明"',
      'kvg:element="月"'
    );
    expect(() => extractGlyphEvidence(swapped, "明")).toThrow(/IDENTITY MISMATCH/);
    // a valid file still extracts cleanly (control)
    expect(extractGlyphEvidence(readFileSync(resolve(CORPUS, "0660e.svg"), "utf-8"), "明").groups.length).toBe(3);

    // (b) zero-claim state where source evidence exists → independent verification FAILS
    const zeroDir = resolve(tmp, "zero-claim");
    mkdirSync(zeroDir, { recursive: true });
    const emptyState = {
      schemaVersion: "1.0.0",
      contract: "nihongo-kanji-decomposition@1",
      metrics: {
        totalFiles: 11658,
        standardFiles: 6699,
        variantFiles: 4959,
        sourceOnlyCharacters: 0,
        kanjiWithComponents: 0,
        kanjiWithoutComponents: 13108,
        rootGroups: 0,
        elementGroupsTotal: 0,
        componentRows: 0,
        canonicalComponentRows: 0,
        sourceOnlyComponentRows: 0,
        sourceOnlyElementGroups: 0,
        containmentRows: 0,
        variantRows: 0,
        variantTypeRows: 0,
        radicalMarkedComponents: 0,
        phoneticComponents: 0,
        variantMarkedComponents: 0,
        kanjiWithComponentRows: 0,
        canonicalOnlyWithoutGlyph: 13108,
        attachedVariantFiles: 0,
        unattachedVariantFiles: 0,
        compatibilityVariantFiles: 0,
        multiCharElementLiterals: 0,
        invalidEdges: 0,
        duplicates: 0,
        provenanceViolations: 0,
        malformedGlyphs: 0,
        identityMismatches: 0,
      },
      componentsDigest: sha256(canon([])),
      containmentDigest: sha256(canon([])),
      variantsDigest: sha256(canon([])),
      idsDigest: sha256(""),
      provenanceDigest: sha256(""),
      variantTypes: [],
    } as Record<string, unknown>;
    writeFileSync(resolve(zeroDir, "state.json"), JSON.stringify(emptyState), "utf-8");
    writeFileSync(resolve(zeroDir, "components.json"), "[]", "utf-8");
    writeFileSync(resolve(zeroDir, "containment.json"), "[]", "utf-8");
    writeFileSync(resolve(zeroDir, "variants.json"), "[]", "utf-8");
    const v = await verifyKanjiDecomposition({ publishDir: zeroDir });
    expect(v.verdict).toBe("FAIL");

    // (c) corrupted published state is rejected by the engine verifier
    const corruptDir = resolve(tmp, "corrupt");
    mkdirSync(corruptDir, { recursive: true });
    for (const f of ["state.json", "components.json", "containment.json", "variants.json"]) {
      copyFileSync(resolve(PUBLISH, f), resolve(corruptDir, f));
    }
    writeFileSync(resolve(corruptDir, "components.json"), "[]", "utf-8");
    expect(() => verifyExistingDecompositionState(corruptDir)).toThrow(/digest/i);
  }, 600_000);

  // ------------------------------------------------------------------ §13.13
  it("13.13 containment edges come from structural group trees, not IDS", () => {
    const engineSrc = readFileSync(resolve(BASE, "scripts/ingest-kanji-decomposition.ts"), "utf-8");
    // engine never reads KANJIDIC2 and never parses IDS strings
    expect(engineSrc).not.toMatch(/kanjidic2\.xml/);
    expect(engineSrc).not.toMatch(/parseIds|IDS_PARSE|idsString/);
    // every component row has exactly one containment edge (group-tree parent → child)
    const components = readRows("components.json");
    const containment = readRows("containment.json");
    expect(containment.length).toBe(components.length);
    const contIds = new Set(containment.map((c) => c.id));
    for (const c of components) {
      const edgeId = deriveContainmentId(c.kanjiId as string, c.parentIndex as number, c.orderIndex as number);
      expect(contIds.has(edgeId)).toBe(true);
    }
    // structural example: 明 = root ← {日}, {月} (group tree, not an IDS string)
    const meiEdges = containment.filter((c) => c.character === "明");
    expect(meiEdges.length).toBe(2);
    expect(meiEdges.every((e) => e.parentIndex === -1)).toBe(true);
  });

  // ------------------------------------------------------------------ §13.14
  it("13.14 protected 14.4C/D/E data and immutability invariants hold", async () => {
    // canonical DB digests unchanged from pre-Run-1 baseline
    const now = await snapshotAll();
    expect(now.db.kanji).toBe(baseline.db.kanji);
    expect(now.db.dict).toBe(baseline.db.dict);
    expect(now.db.extra).toBe(baseline.db.extra);
    expect(now.db.kanji).toMatch(/^13108:4e2b27a3249661c87241fd3637160ae7$/);
    expect(now.db.dict).toMatch(/^206747:42907c1d35e1151d64dd57cdef1eddab$/);
    // worktree changes limited to the sanctioned files + untracked evidence
    // reports + platform session memory (.claude/) — everything else must be clean
    const porcelain = execFileSync("git", ["status", "--porcelain"], { cwd: BASE, encoding: "utf-8" })
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !l.includes("reports/gates/") && !l.includes("reports/AUDIT"))
      .filter((l) => !l.includes(".claude/"))
      .map((l) => l.replace(/^\?\?\s*/, "").replace(/^M\s*/, "").replace(/^ M\s*/, ""));
    for (const entry of porcelain) {
      expect([
        "scripts/ingest-kanji-decomposition.ts",
        "scripts/verify-kanji-decomposition.ts",
        "tests/kanji-decomposition-gates.test.ts",
        ".gitignore",
      ]).toContain(entry);
    }
    // engine never writes to the database (no INSERT/UPDATE/DELETE statements)
    const engineSrc = readFileSync(resolve(BASE, "scripts/ingest-kanji-decomposition.ts"), "utf-8");
    expect(engineSrc).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(engineSrc).not.toMatch(/\bUPDATE\s+[a-z_]+\s+SET\b/i);
    expect(engineSrc).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  // ------------------------------------------------------------------ §13.15
  it("13.15 representative decompositions resolve actual KanjiVG semantics correctly", () => {
    const components = readRows("components.json") as Array<{
      kanjiId: string;
      character: string;
      glyphClass: string;
      elementLiteral: string;
      renderedAs: string;
      role: string;
      phonetic: string | null;
      positionRaw: string | null;
      position: string | null;
      radicalType: string | null;
      variantOf: string | null;
      variantMarked: boolean;
      orderIndex: number;
      parentIndex: number;
    }>;

    // 明 (U+660E): [{日} {月}], left/right; radical=general evidence on 日 only
    const mei = components.filter((c) => c.character === "明");
    expect(mei.length).toBe(2);
    expect(mei[0].elementLiteral).toBe("日");
    expect(mei[0].positionRaw).toBe("left");
    expect(mei[0].position).toBe("left");
    expect(mei[0].radicalType).toBe("general");
    expect(mei[0].role).toBe("structural");
    expect(mei[0].parentIndex).toBe(-1);
    expect(mei[1].elementLiteral).toBe("月");
    expect(mei[1].positionRaw).toBe("right");
    expect(mei[1].radicalType).toBeNull();

    // 休 (U+4F11): [{亻 variant→人} {木}] — variant ≠ normalized: renderedAs keeps 亻
    const rest = components.filter((c) => c.character === "休");
    expect(rest.length).toBe(2);
    expect(rest[0].elementLiteral).toBe("亻");
    expect(rest[0].renderedAs).toBe("亻");
    expect(rest[0].variantMarked).toBe(true);
    expect(rest[0].variantOf).toBe("人");
    expect(rest[1].elementLiteral).toBe("木");

    // LEFT/RIGHT/TOP/BOTTOM aliases resolve to the named categories (exact counts,
    // all rows incl. the 67 source-only rows)
    expect(components.filter((c) => c.position === "left").length).toBe(5019);
    expect(components.filter((c) => c.position === "right").length).toBe(4727);
    expect(components.filter((c) => c.position === "top").length).toBe(5214);
    expect(components.filter((c) => c.position === "bottom").length).toBe(4759);
    expect(components.filter((c) => c.position === "middle").length).toBe(3);

    // anomalous/extension positions map to enclosure with raw preserved (e.g. 仄 tare)
    const enclosures = components.filter((c) => c.position === "enclosure");
    expect(enclosures.length).toBe(1491);
    expect(
      enclosures.every((c) =>
        ["tare", "tarec", "kamae", "kamaec", "nyo", "nyoc", "\u2ff5A", "\u2ff5B", "\u2ff61", "\u2ff62"].includes(
          c.positionRaw as string
        )
      )
    ).toBe(true);
    // the single anomalous position literal (倠, variant-file only) never becomes a category
    expect(components.every((c) => c.positionRaw !== "倠")).toBe(true);

    // phonetic role exists exactly where kvg:phon evidence exists
    const phon = components.filter((c) => c.role === "phonetic");
    expect(phon.length).toBe(1246);
    expect(phon.every((c) => c.phonetic !== null)).toBe(true);
    const structural = components.filter((c) => c.role === "structural");
    expect(structural.every((c) => c.phonetic === null)).toBe(true);
    expect(phon.length + structural.length).toBe(components.length);
  });

  // ------------------------------------------------------------------ §10 refusal matrix
  it("13.16 refusal matrix (§10): every fail-closed path rejects before mutation and leaves published state unchanged", async () => {
    const stateBefore = hashDir(PUBLISH);

    const expectRefusal = (env: Record<string, string>, args: string[], pattern: RegExp) => {
      let out = "";
      let failed = false;
      try {
        execFileSync("npx", ["tsx", "scripts/ingest-kanji-decomposition.ts", ...args], {
          cwd: BASE,
          encoding: "utf-8",
          env: { ...process.env, ...env },
          timeout: 120_000,
        });
      } catch (e) {
        failed = true;
        out = `${(e as { stdout?: string }).stdout ?? ""}${(e as { stderr?: string }).stderr ?? ""}`;
      }
      expect(failed).toBe(true); // exit non-zero
      expect(out).toMatch(pattern);
      // previous published state remains unchanged after every refusal
      expect(hashDir(PUBLISH)).toBe(stateBefore);
    };

    // wrong DB target → rejected before mutation
    expectRefusal(
      { NIHONGO_DB_TARGET_CLASS: "production" },
      ["--phase=2"],
      /TARGET_CLASSIFICATION REFUSED/
    );
    expectRefusal(
      { NIHONGO_DB_EXPECTED_DATABASE: "other_db" },
      ["--phase=2"],
      /TARGET_CLASSIFICATION REFUSED/
    );
    // wrong provenance / wrong source identity claim → rejected before mutation
    expectRefusal(
      {},
      ["--phase=2", "--claimed-source-ref=kanjivg:0.99"],
      /WRONG SOURCE IDENTITY CLAIM/
    );
    expectRefusal(
      {},
      ["--phase=2", "--claimed-source-ref=upstream:kanjivg:2024-04"],
      /WRONG SOURCE IDENTITY CLAIM/
    );

    // malformed component identity → rejected (validator)
    expect(() =>
      validateComponentRecord({
        id: "comp-kanji-明-el-hi-0-garbage",
        kanjiId: "kanji-明",
        glyphClass: "kanji",
        character: "明",
        elementId: "el-hi",
        elementLiteral: "日",
        renderedAs: "日",
        role: "structural",
        phonetic: null,
        position: "left",
        positionRaw: "left",
        orderIndex: 0,
        part: null,
        number: null,
        radicalType: null,
        variantOf: null,
        variantMarked: false,
        tradForm: false,
        radicalForm: false,
        partial: false,
        strokeOrders: [1],
        parentIndex: -1,
        depth: 1,
        provenance: DECOMPOSITION_CONTRACT.entrySourceRef,
        evidence: { file: "kanjivg/0660e.svg", groupId: "g", strokeIds: [] },
      })
    ).toThrow(/MALFORMED COMPONENT IDENTITY/);

    // duplicate component identity → rejected before publication
    expect(() =>
      validateDerivedSets(
        [
          {
            id: deriveComponentId("kanji-明", "el-hi", 0),
            kanjiId: "kanji-明",
            glyphClass: "kanji",
            character: "明",
            elementId: "el-hi",
            elementLiteral: "日",
            renderedAs: "日",
            role: "structural",
            phonetic: null,
            position: "left",
            positionRaw: "left",
            orderIndex: 0,
            part: null,
            number: null,
            radicalType: null,
            variantOf: null,
            variantMarked: false,
            tradForm: false,
            radicalForm: false,
            partial: false,
            strokeOrders: [1],
            parentIndex: -1,
            depth: 1,
            provenance: DECOMPOSITION_CONTRACT.entrySourceRef,
            evidence: { file: "kanjivg/0660e.svg", groupId: "g", strokeIds: [] },
          },
          {
            id: deriveComponentId("kanji-明", "el-hi", 0),
            kanjiId: "kanji-明",
            glyphClass: "kanji",
            character: "明",
            elementId: "el-hi",
            elementLiteral: "日",
            renderedAs: "日",
            role: "structural",
            phonetic: null,
            position: "left",
            positionRaw: "left",
            orderIndex: 0,
            part: null,
            number: null,
            radicalType: null,
            variantOf: null,
            variantMarked: false,
            tradForm: false,
            radicalForm: false,
            partial: false,
            strokeOrders: [1],
            parentIndex: -1,
            depth: 1,
            provenance: DECOMPOSITION_CONTRACT.entrySourceRef,
            evidence: { file: "kanjivg/0660e.svg", groupId: "g", strokeIds: [] },
          },
        ],
        [],
        []
      )
    ).toThrow(/DUPLICATE DETERMINISTIC EDGE/);

    // corrupted source evidence → rejected before derivation (identity pins)
    const tamper = mkdtempSync(resolve(tmpdir(), "decomp-src-tamper-"));
    workDirs.push(tamper);
    mkdirSync(resolve(tamper, "kanjivg"), { recursive: true });
    const archive = resolve(BASE, "data", "kanjivg-r20240807.tar.gz");
    const bytes = readFileSync(archive);
    bytes[bytes.length - 1] = bytes[bytes.length - 1] ^ 0xff; // flip one byte
    writeFileSync(resolve(tamper, "kanjivg-r20240807.tar.gz"), bytes);
    writeFileSync(resolve(tamper, "kanjivg-index.json"), readFileSync(resolve(BASE, "data", "kanjivg-index.json")));
    writeFileSync(resolve(tamper, "kanjivg", "04e00.svg"), readFileSync(resolve(CORPUS, "04e00.svg")));
    expect(() => verifySourceIdentity(tamper)).toThrow(/ARCHIVE IDENTITY MISMATCH|CORPUS COUNT/);
    // index tamper likewise
    writeFileSync(resolve(tamper, "kanjivg-r20240807.tar.gz"), readFileSync(archive));
    writeFileSync(resolve(tamper, "kanjivg-index.json"), "[]");
    expect(() => verifySourceIdentity(tamper)).toThrow(/INDEX IDENTITY MISMATCH/);

    // wrong Kanji identity + fabricated component + published-state corruption
    // are covered by 13.7 / 13.12 (all also leave published state unchanged).
    expect(hashDir(PUBLISH)).toBe(stateBefore);
  }, 600_000);

  // ------------------------------------------------------------------ §12 static dependency check
  it("13.17 verifier independence (§12): static dependency check — no engine, parser, or shared digest imports", () => {
    const verifierSrc = readFileSync(resolve(BASE, "scripts/verify-kanji-decomposition.ts"), "utf-8");
    const engineSrc = readFileSync(resolve(BASE, "scripts/ingest-kanji-decomposition.ts"), "utf-8");
    // verifier must not import the engine (in any path form)
    expect(verifierSrc).not.toMatch(/from\s+["'].*ingest-kanji-decomposition["']/);
    expect(verifierSrc).not.toMatch(/require\(["'].*ingest-kanji-decomposition/);
    // verifier must not import the 14.4D parser or transformer
    expect(verifierSrc).not.toMatch(/kanjiVgParser|kanjiVgTransformer|provision-kanjivg/);
    // engine must not import the verifier
    expect(engineSrc).not.toMatch(/verify-kanji-decomposition/);
    // verifier defines its own serialization (no shared digest module)
    expect(verifierSrc).toMatch(/function canon\(/);
    expect(verifierSrc).toMatch(/function sha\(/);
  });
});
