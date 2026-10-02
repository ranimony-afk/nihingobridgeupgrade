/**
 * Independent Kanji Decomposition Verifier — Phase 14.4F (§12).
 *
 * Independently recomputes — WITHOUT importing the engine or the 14.4D parser —
 * and compares against the published derived state (data/kanji-decomposition/):
 *
 *   1. canonical kanji + radical identity (own SQL)
 *   2. expected component/containment/variant relationships (own raw-SVG walk)
 *   3. deterministic IDs (own reimplementation of the identity algorithms)
 *   4. expected digests (own canonical serialization)
 *   5. provenance inspection (own allowed/forbidden sets)
 *   6. counts (all metrics)
 *   7. expected-vs-actual comparison (records + digests)
 *   8. obsolete-provenance / unexpected-record / duplicate-identity detection
 *   9. canonical DB immutability (counts + digests unchanged)
 *
 * Verdict PASS (exit 0) / FAIL (exit 1).
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { Client } from "pg";

// ---------------------------------------------------------------------------
// Independent constants (own copies — never imported from the engine)
// ---------------------------------------------------------------------------

const EXPECTED = {
  sourceRef: "upstream:kanjivg:2024-08",
  forbidden: [
    "kanjivg:0.99",
    "upstream:kanjivg:0.99",
    "kanjivg:2024-04",
    "upstream:kanjivg:2024-04",
    "kanjidic2:2024-03",
    "upstream:kanjidic2:2024-03",
  ],
  archiveSha256: "a0cbc5c950d5c68bf3b6b24468ebdb8a829e62f04a4f44e1c7e98bade2597dcd",
  archiveSize: 6403118,
  indexSha256: "43e9d0b71f7288e72bb6a74bdaa52498fe381a1045925789e62695fc863cf6d0",
  indexSize: 293747,
  totalSvgFiles: 11658,
  standardFiles: 6699,
  variantFiles: 4959,
  kanjiCount: 13108,
  kanjiDigest: "4e2b27a3249661c87241fd3637160ae7",
  dictionaryCount: 206747,
  dictionaryDigest: "42907c1d35e1151d64dd57cdef1eddab",
  // Gate-0 derived identities (standard files)
  sourceOnlyCharacters: 286,
  elementGroupsTotal: 43862,
  rootGroups: 6699,
  nonRootGroups: 37163,
  variantTypeRows: 88,
} as const;

// ---------------------------------------------------------------------------
// Independent serialization + identities
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

const compId = (glyphIdentity: string, elementId: string, orderIndex: number) =>
  `comp-${glyphIdentity}-${elementId}-${orderIndex}`;
const contId = (glyphIdentity: string, parentIndex: number, childIndex: number) =>
  `cont-${glyphIdentity}-${parentIndex}-${childIndex}`;
const varId = (hex: string, type: string) => `kvg-var-${hex}-${type || "std"}`;

// ---------------------------------------------------------------------------
// Independent raw-SVG extraction (own regex walk — not the engine's)
// ---------------------------------------------------------------------------

interface XGroup {
  id: string | null;
  element: string;
  positionRaw: string | null;
  radicalType: string | null;
  part: number | null;
  number: number | null;
  phonetic: string | null;
  variantMarked: boolean;
  variantOf: string | null;
  tradForm: boolean;
  radicalForm: boolean;
  partial: boolean;
  parentIdx: number | null;
  isRoot: boolean;
}

function attrMap(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(/([\w:]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

function walkSvg(svg: string): { groups: XGroup[]; rootElement: string | null } {
  const groups: XGroup[] = [];
  const stack: Array<{ elIdx: number | null }> = [];
  let rootElement: string | null = null;
  const tokens = /<g\b([^>]*)>|<\/g>/g;
  let m: RegExpExecArray | null;
  while ((m = tokens.exec(svg)) !== null) {
    if (m[0] === "</g>") {
      stack.pop();
      continue;
    }
    const a = attrMap(m[1]);
    const elIdx = a["kvg:element"] !== undefined ? groups.length : null;
    if (elIdx !== null) {
      const isRoot = groups.length === 0;
      const parent = [...stack].reverse().find((s) => s.elIdx !== null);
      groups.push({
        id: a.id ?? null,
        element: a["kvg:element"],
        positionRaw: a["kvg:position"] ?? null,
        radicalType: a["kvg:radical"] ?? null,
        part: a["kvg:part"] ? parseInt(a["kvg:part"], 10) : null,
        number: a["kvg:number"] ? parseInt(a["kvg:number"], 10) : null,
        phonetic: a["kvg:phon"] ?? null,
        variantMarked: a["kvg:variant"] === "true",
        variantOf: a["kvg:original"] ?? null,
        tradForm: a["kvg:tradForm"] !== undefined,
        radicalForm: a["kvg:radicalForm"] !== undefined,
        partial: a["kvg:partial"] !== undefined,
        parentIdx: isRoot ? null : parent ? parent.elIdx : null,
        isRoot,
      });
      if (isRoot) rootElement = a["kvg:element"];
    }
    stack.push({ elIdx });
  }
  return { groups, rootElement };
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

export async function verifyKanjiDecomposition(options?: { publishDir?: string }): Promise<{
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

  const publish = options?.publishDir ?? resolve(process.cwd(), "data/kanji-decomposition");
  const required = ["state.json", "components.json", "containment.json", "variants.json"];
  for (const f of required) {
    if (!existsSync(resolve(publish, f))) {
      add(`published state file ${f}`, "exists", "missing");
      return { checks, ok: false, verdict: "FAIL" };
    }
  }
  const state = JSON.parse(readFileSync(resolve(publish, "state.json"), "utf-8"));
  const actualComponents = JSON.parse(readFileSync(resolve(publish, "components.json"), "utf-8"));
  const actualContainment = JSON.parse(readFileSync(resolve(publish, "containment.json"), "utf-8"));
  const actualVariants = JSON.parse(readFileSync(resolve(publish, "variants.json"), "utf-8"));

  // ---- source identity (independent) ----
  const dataDir = resolve(process.cwd(), "data");
  const archiveBytes = readFileSync(resolve(dataDir, "kanjivg-r20240807.tar.gz"));
  add("archive sha256", EXPECTED.archiveSha256, sha(archiveBytes));
  add("archive size", EXPECTED.archiveSize, archiveBytes.length);
  const indexBytes = readFileSync(resolve(dataDir, "kanjivg-index.json"));
  add("index sha256", EXPECTED.indexSha256, sha(indexBytes));
  add("index size", EXPECTED.indexSize, indexBytes.length);

  // ---- canonical DB (independent SQL) ----
  const client = new Client({
    connectionString:
      process.env.DATABASE_URL ||
      "postgresql://nihongo:nihongo@127.0.0.1:5432/app_db",
  });
  await client.connect();
  try {
    const kanjiRows = (
      await client.query(`SELECT id, character FROM kanji_entries ORDER BY character`)
    ).rows as Array<{ id: string; character: string }>;
    const radicalRows = (
      await client.query(`SELECT id, character, alt_forms FROM kanji_radicals`)
    ).rows as Array<{ id: string; character: string; alt_forms: string[] | null }>;
    const kanjiByChar = new Map(kanjiRows.map((r) => [r.character, r]));
    const radByChar = new Map<string, string>();
    const radByAlt = new Map<string, string>();
    for (const r of radicalRows) {
      if (!radByChar.has(r.character)) radByChar.set(r.character, r.id);
      for (const alt of r.alt_forms ?? []) if (!radByAlt.has(alt)) radByAlt.set(alt, r.id);
    }

    // ---- independent derivation (all standard files; source-only namespaced) ----
    const corpusDir = resolve(dataDir, "kanjivg");
    const allFiles = readdirSync(corpusDir).filter((f) => f.endsWith(".svg"));
    const standard = allFiles.filter((f) => /^[0-9a-f]{4,5}\.svg$/.test(f));
    const variantFiles = allFiles.filter((f) => !/^[0-9a-f]{4,5}\.svg$/.test(f));
    add("corpus total files", EXPECTED.totalSvgFiles, allFiles.length);
    add("corpus standard files", EXPECTED.standardFiles, standard.length);
    add("corpus variant files", EXPECTED.variantFiles, variantFiles.length);

    const expComponents: Array<Record<string, unknown>> = [];
    const expContainment: Array<Record<string, unknown>> = [];
    const sourceOnly: string[] = [];
    const referenced = new Set<string>();
    let groupsTotal = 0;
    let rootGroups = 0;
    let srcGroups = 0;
    let phonetic = 0;
    let variantMarked = 0;
    let radicalMarked = 0;
    let multiChar = 0;

    const elementIdOf = (literal: string): string => {
      const norm = literal.normalize("NFC");
      return radByChar.get(norm) ?? radByAlt.get(norm) ?? `kvg-el:${norm}`;
    };

    for (const file of standard) {
      const hex = file.replace(".svg", "");
      const character = String.fromCodePoint(parseInt(hex, 16));
      const svg = readFileSync(resolve(corpusDir, file), "utf-8");
      const kanji = kanjiByChar.get(character);
      const glyphIdentity = kanji ? kanji.id : `src:${hex}`;
      const glyphClass = kanji ? "kanji" : "source-only";
      if (!kanji) {
        sourceOnly.push(character);
      } else {
        referenced.add(character);
      }
      const { groups, rootElement } = walkSvg(svg);
      if (rootElement !== character) {
        add(`glyph identity ${file}`, character, rootElement);
      }
      groupsTotal += groups.length;
      rootGroups += groups.length > 0 ? 1 : 0;
      if (!kanji) srcGroups += groups.length;

      const compIdxByGroup = new Map<number, number>();
      const local: Array<{ orderIndex: number; elementLiteral: string; parentIndex: number }> = [];
      let orderIndex = 0;
      for (let gi = 0; gi < groups.length; gi++) {
        const g = groups[gi];
        if (g.isRoot) continue;
        const identityLiteral = g.variantMarked && g.variantOf ? g.variantOf : g.element;
        const elementId = elementIdOf(identityLiteral);
        if ([...g.element].length !== 1) multiChar++;
        if (g.phonetic) phonetic++;
        if (g.variantMarked) variantMarked++;
        if (g.radicalType) radicalMarked++;
        const parentIndex = g.parentIdx === null ? -1 : (compIdxByGroup.get(g.parentIdx) ?? -1);
        expComponents.push({
          id: compId(glyphIdentity, elementId, orderIndex),
          kanjiId: glyphIdentity,
          glyphClass,
          character,
          elementId,
          elementLiteral: g.element,
          renderedAs: g.element,
          role: g.phonetic ? "phonetic" : "structural",
          phonetic: g.phonetic,
          positionRaw: g.positionRaw,
          orderIndex,
          radicalType: g.radicalType,
          variantOf: g.variantMarked ? g.variantOf : null,
          variantMarked: g.variantMarked,
          parentIndex,
          provenance: EXPECTED.sourceRef,
        });
        local.push({ orderIndex, elementLiteral: g.element, parentIndex });
        compIdxByGroup.set(gi, orderIndex);
        orderIndex++;
      }
      for (const rec of local) {
        expContainment.push({
          id: contId(glyphIdentity, rec.parentIndex, rec.orderIndex),
          kanjiId: glyphIdentity,
          glyphClass,
          character,
          parentIndex: rec.parentIndex,
          childIndex: rec.orderIndex,
          childLiteral: rec.elementLiteral,
          provenance: EXPECTED.sourceRef,
        });
      }
    }

    add("source-only characters (Gate-0: 286)", EXPECTED.sourceOnlyCharacters, sourceOnly.length);
    add("element groups total (Gate-0: 43,862)", EXPECTED.elementGroupsTotal, groupsTotal);
    add("root groups (Gate-0: 6,699)", EXPECTED.rootGroups, rootGroups);
    add("non-root groups (Gate-0: 37,163)", EXPECTED.nonRootGroups, expComponents.length);
    add("source-only element groups", 353, srcGroups);
    add("kanji with glyph evidence", referenced.size, state.metrics.kanjiWithComponents);
    add(
      "kanji without glyph evidence",
      kanjiRows.length - referenced.size,
      state.metrics.kanjiWithoutComponents
    );

    // variants (independent — per-file records + type summary)
    const expVariants: Array<Record<string, unknown>> = [];
    const typeCounts = new Map<string, number>();
    let compat = 0;
    let vAttached = 0;
    for (const file of variantFiles) {
      const base = file.replace(/\.svg$/, "");
      const m = base.match(/^([0-9a-f]{4,5})-(.+)$/);
      if (!m) {
        add(`variant filename ${file}`, "hex-suffix", base);
        continue;
      }
      const [, hex, type] = m;
      const character = String.fromCodePoint(parseInt(hex, 16));
      const isCompat = parseInt(hex, 16) >= 0xf900 && parseInt(hex, 16) <= 0xfaff;
      if (isCompat) compat++;
      const attached = kanjiByChar.has(character);
      if (attached) vAttached++;
      typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
      expVariants.push({
        id: varId(hex, type),
        character,
        unicode: `U+${hex.toUpperCase()}`,
        primaryHex: hex,
        variantType: type,
        attachedToCanonical: attached,
        isCompatibilityIdeograph: isCompat,
        provenance: EXPECTED.sourceRef,
      });
    }
    add("variant-style suffix types (Gate-0: 88)", EXPECTED.variantTypeRows, typeCounts.size);
    add("compatibility variant files", compat, state.metrics.compatibilityVariantFiles);
    add("attached variant files", vAttached, state.metrics.attachedVariantFiles);

    // ---- counts vs published metrics ----
    add("metrics.elementGroupsTotal", groupsTotal, state.metrics.elementGroupsTotal);
    add("metrics.rootGroups", rootGroups, state.metrics.rootGroups);
    add("metrics.componentRows", expComponents.length, state.metrics.componentRows);
    add(
      "metrics.canonicalComponentRows",
      expComponents.filter((c) => c.glyphClass === "kanji").length,
      state.metrics.canonicalComponentRows
    );
    add(
      "metrics.sourceOnlyComponentRows",
      expComponents.filter((c) => c.glyphClass === "source-only").length,
      state.metrics.sourceOnlyComponentRows
    );
    add("metrics.containmentRows", expContainment.length, state.metrics.containmentRows);
    add("metrics.variantRows", expVariants.length, state.metrics.variantRows);
    add("metrics.variantTypeRows", typeCounts.size, state.metrics.variantTypeRows);
    add("metrics.phoneticComponents", phonetic, state.metrics.phoneticComponents);
    add("metrics.variantMarkedComponents", variantMarked, state.metrics.variantMarkedComponents);
    add("metrics.radicalMarkedComponents", radicalMarked, state.metrics.radicalMarkedComponents);
    add("metrics.multiCharElementLiterals", multiChar, state.metrics.multiCharElementLiterals);
    add("metrics.sourceOnlyCharacters", sourceOnly.length, state.metrics.sourceOnlyCharacters);
    add("metrics.invalidEdges", 0, state.metrics.invalidEdges);
    add("metrics.duplicates", 0, state.metrics.duplicates);
    add("metrics.provenanceViolations", 0, state.metrics.provenanceViolations);

    // ---- record-by-record comparison (ids + key fields) ----
    let compMismatch = 0;
    const actualById = new Map(actualComponents.map((r: Record<string, unknown>) => [r.id as string, r]));
    for (const e of expComponents) {
      const a = actualById.get(e.id as string) as Record<string, unknown> | undefined;
      if (
        !a ||
        a.kanjiId !== e.kanjiId ||
        a.glyphClass !== e.glyphClass ||
        a.elementId !== e.elementId ||
        a.elementLiteral !== e.elementLiteral ||
        a.role !== e.role ||
        a.positionRaw !== e.positionRaw ||
        a.orderIndex !== e.orderIndex ||
        a.parentIndex !== e.parentIndex ||
        a.provenance !== e.provenance
      ) {
        compMismatch++;
      }
    }
    add("component mismatches (independent re-derivation)", 0, compMismatch);
    add("component count equality", expComponents.length, actualComponents.length);

    const contById = new Map(actualContainment.map((r: Record<string, unknown>) => [r.id as string, r]));
    let contMismatch = 0;
    for (const e of expContainment) {
      const a = contById.get(e.id as string) as Record<string, unknown> | undefined;
      if (!a || a.parentIndex !== e.parentIndex || a.childIndex !== e.childIndex || a.provenance !== e.provenance) {
        contMismatch++;
      }
    }
    add("containment mismatches (independent re-derivation)", 0, contMismatch);

    const varById = new Map(actualVariants.map((r: Record<string, unknown>) => [r.id as string, r]));
    let varMismatch = 0;
    for (const e of expVariants) {
      const a = varById.get(e.id as string) as Record<string, unknown> | undefined;
      if (!a || a.variantType !== e.variantType || a.provenance !== e.provenance || a.character !== e.character) {
        varMismatch++;
      }
    }
    add("variant mismatches (independent re-derivation)", 0, varMismatch);

    // ---- digests (independent canon) ----
    add("componentsDigest", sha(canon(actualComponents)), state.componentsDigest);
    add("containmentDigest", sha(canon(actualContainment)), state.containmentDigest);
    add("variantsDigest", sha(canon(actualVariants)), state.variantsDigest);
    add(
      "idsDigest",
      sha(
        [
          ...actualComponents.map((r: Record<string, unknown>) => r.id),
          ...actualContainment.map((r: Record<string, unknown>) => r.id),
          ...actualVariants.map((r: Record<string, unknown>) => r.id),
        ].join("\n")
      ),
      state.idsDigest
    );
    add(
      "provenanceDigest",
      sha(
        [...actualComponents, ...actualContainment, ...actualVariants]
          .map((r: Record<string, unknown>) => `${r.id}|${r.provenance}`)
          .join("\n")
      ),
      state.provenanceDigest
    );
    const { graphDigest, ...body } = state;
    add("graphDigest", sha(canon(body)), graphDigest);

    // ---- provenance + forbidden scan + duplicates ----
    let provViolations = 0;
    let dupIds = 0;
    const seen = new Set<string>();
    for (const r of [...actualComponents, ...actualContainment, ...actualVariants] as Array<Record<string, unknown>>) {
      if (r.provenance !== EXPECTED.sourceRef) provViolations++;
      if (seen.has(r.id as string)) dupIds++;
      seen.add(r.id as string);
    }
    add("provenance violations", 0, provViolations);
    add("duplicate identities", 0, dupIds);
    const stateText = JSON.stringify(state);
    let forbiddenHits = 0;
    for (const bad of EXPECTED.forbidden) if (stateText.includes(bad)) forbiddenHits++;
    add("obsolete provenance in output", 0, forbiddenHits);

    // ---- canonical DB immutability ----
    const kanjiAgg = (
      await client.query(
        `SELECT count(*)::int AS n, md5(string_agg(id || '|' || character || '|' || stroke_count || '|' || source_ref, ',' ORDER BY id)) AS d FROM kanji_entries`
      )
    ).rows[0];
    const dictAgg = (
      await client.query(
        `SELECT count(*)::int AS n, md5(string_agg(id || '|' || headword || '|' || reading || '|' || romaji, ',' ORDER BY id)) AS d FROM dictionary_entries`
      )
    ).rows[0];
    add("kanji_entries count unchanged", EXPECTED.kanjiCount, kanjiAgg.n);
    add("kanji_entries digest unchanged", EXPECTED.kanjiDigest, kanjiAgg.d);
    add("dictionary_entries count unchanged", EXPECTED.dictionaryCount, dictAgg.n);
    add("dictionary digest unchanged", EXPECTED.dictionaryDigest, dictAgg.d);
  } finally {
    await client.end();
  }

  const ok = checks.every((c) => c.ok);
  return { checks, ok, verdict: ok ? "PASS" : "FAIL" };
}

async function main(): Promise<void> {
  const result = await verifyKanjiDecomposition();
  for (const c of result.checks) {
    console.log(
      `${c.ok ? "PASS" : "FAIL"} | ${c.name} | expected: ${c.expected} | observed: ${c.observed}`
    );
  }
  console.log(`Verdict: ${result.verdict}`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && /verify-kanji-decomposition(\.ts|\.js)$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
