/**
 * Independent KanjiVG Ingestion Verifier — Phase 14.4D (§18).
 *
 * Independently recomputes — WITHOUT importing the ingestion engine, the
 * provisioner, the parser, or the transformer — and compares against the
 * published attachment state (data/kanjivg-attachment/state.json):
 *
 *   - source identity (repository / tag / commit / version / sourceRef)
 *   - archive digest + size
 *   - index digest + size + key count
 *   - corpus counts (11,658 SVG / 6,699 primary / 4,959 variants /
 *     0 malformed / 0 duplicates)
 *   - KanjiVG asset identity (kanjivg:${character})
 *   - stroke ordering + stroke identity (kvg:${hex}-s${n})
 *   - component identity
 *   - provenance (upstream:kanjivg:2024-08 — never first-party)
 *   - KANJIDIC2 stroke-count immutability (evidence-only comparison)
 *   - first-party preservation (45 rows / 33 mindtree / 12 corpus)
 *   - deterministic digest (canonical serialization, recomputed here)
 *   - expected omissions (KANJIVG_MISSING) and extras (KANJIVG_EXTRA)
 *
 * Exit code 0 = Verdict: PASS. Any mismatch = Verdict: FAIL (exit 1).
 */

import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

/**
 * Independent minimal ustar walk (own implementation — never the provisioner's
 * parser). Returns file entries as name → content.
 */
function tarWalk(tar: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const rawName = header.subarray(0, 100).toString("utf-8").replace(/\0.*$/, "");
    const prefix = header.subarray(345, 500).toString("utf-8").replace(/\0.*$/, "");
    const name = prefix ? `${prefix}/${rawName}` : rawName;
    const sizeField = header.subarray(124, 136).toString("utf-8").replace(/\0.*$/, "").trim();
    const size = parseInt(sizeField || "0", 8) || 0;
    const type = String.fromCharCode(header[156]) || "0";
    offset += 512;
    if (type === "0" || type === "\0") {
      files.set(name, tar.subarray(offset, offset + size));
    }
    offset += Math.ceil(size / 512) * 512;
  }
  return files;
}

// ---------------------------------------------------------------------------
// Independent constants (own copy — never imported from implementation)
// ---------------------------------------------------------------------------

const EXPECTED = {
  repository: "KanjiVG/kanjivg",
  tag: "r20240807",
  commit: "a4b51d966d832544c371d566f9c84174e4beff3b",
  sourceRef: "upstream:kanjivg:2024-08",
  version: "r20240807",
  archiveSize: 6403118,
  archiveSha256:
    "a0cbc5c950d5c68bf3b6b24468ebdb8a829e62f04a4f44e1c7e98bade2597dcd",
  indexSize: 293747,
  indexSha256:
    "43e9d0b71f7288e72bb6a74bdaa52498fe381a1045925789e62695fc863cf6d0",
  indexPrimaryKeys: 6699,
  svgFiles: 11658,
  primaryCharacters: 6699,
  variants: 4959,
  archiveFilename: "kanjivg-r20240807.tar.gz",
  license: "CC-BY-SA-3.0",
  attribution: "Ulrich Apel and the KanjiVG project (CC BY-SA 3.0)",
  kanjiTotal: 13108,
  kanjiUpstream: 13063,
  firstPartyTotal: 45,
  mindtree: 33,
  corpus: 12,
  dictionaryTotal: 206747,
  dictionaryUpstream: 206717,
  dictionaryFirstParty: 30,
} as const;

const FORBIDDEN_PROVENANCE = ["first-party:kanji-corpus:v1", "upstream:kanjivg:2024-04"];

// ---------------------------------------------------------------------------
// Independent canonical serialization (format contract re-implemented)
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

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

// ---------------------------------------------------------------------------
// Independent SVG extraction (own regex path — never the parser module)
// ---------------------------------------------------------------------------

function attr(tagStr: string, name: string): string | null {
  const m = tagStr.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return m ? m[1].trim() : null;
}

interface ExtractedStroke {
  id: string;
  path: string;
}

interface ExtractedAsset {
  strokeCount: number;
  strokes: ExtractedStroke[];
  componentLines: string[]; // `element|position|radical` in first-seen order
}

function extractSvg(content: string): ExtractedAsset {
  const strokes: ExtractedStroke[] = [];
  const pathRegex = /<path\b([^>]*)\/?>/gi;
  let m: RegExpExecArray | null;
  let i = 1;
  while ((m = pathRegex.exec(content)) !== null) {
    const d = attr(m[1], "d");
    if (!d) continue;
    const id = attr(m[1], "id") ?? "";
    strokes.push({ id, path: d });
    i++;
  }
  const seen = new Set<string>();
  const componentLines: string[] = [];
  const gRegex = /<g\b([^>]*)>/gi;
  while ((m = gRegex.exec(content)) !== null) {
    const element = attr(m[1], "kvg:element");
    if (!element) continue;
    const position = attr(m[1], "kvg:position") ?? "";
    const radical = attr(m[1], "kvg:radical") ?? "";
    const key = `${element}:${position}`;
    if (seen.has(key)) continue;
    seen.add(key);
    componentLines.push(`${element}|${position}|${radical}`);
  }
  return { strokeCount: strokes.length, strokes, componentLines };
}

function strokeSequenceHash(strokes: ExtractedStroke[]): string {
  return createHash("sha256")
    .update(strokes.map((s) => `${s.id}|${s.path}`).join("\n"))
    .digest("hex");
}

function componentSignature(lines: string[]): string {
  return createHash("sha256").update([...lines].sort().join("\n")).digest("hex");
}

// ---------------------------------------------------------------------------
// Independent database evidence
// ---------------------------------------------------------------------------

function dbUrl(): string {
  return (
    process.env.DATABASE_URL ||
    "postgresql://nihongo:nihongo@127.0.0.1:5432/app_db"
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

export interface VerificationCheck {
  name: string;
  expected: string;
  observed: string;
  ok: boolean;
}

export async function verifyKanjiVgIngestion(): Promise<{
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

  // ---- source: archive + index + corpus (independent hashing/walking) ----
  const archivePath = resolve(process.cwd(), "data/kanjivg-r20240807.tar.gz");
  const archiveBytes = readFileSync(archivePath);
  add("archive size", EXPECTED.archiveSize, archiveBytes.length);
  add(
    "archive sha256",
    EXPECTED.archiveSha256,
    createHash("sha256").update(archiveBytes).digest("hex")
  );

  const indexBytes = readFileSync(resolve(process.cwd(), "data/kanjivg-index.json"));
  add("index size", EXPECTED.indexSize, indexBytes.length);
  add(
    "index sha256",
    EXPECTED.indexSha256,
    createHash("sha256").update(indexBytes).digest("hex")
  );
  const index: Record<string, string[]> = JSON.parse(indexBytes.toString("utf-8"));
  add("index primary keys", EXPECTED.indexPrimaryKeys, Object.keys(index).length);

  const corpusDir = resolve(process.cwd(), "data/kanjivg");
  const svgFiles = readdirSync(corpusDir).filter((f) => f.endsWith(".svg"));
  add("svg file count", EXPECTED.svgFiles, svgFiles.length);
  let primary = 0;
  let variants = 0;
  let malformed = 0;
  const codepointBases = new Set<string>();
  for (const f of svgFiles) {
    const base = f.replace(/\.svg$/i, "");
    const codepoint = base.split("-")[0];
    if (!/^[0-9a-f]{4,5}$/.test(codepoint)) {
      malformed++;
      continue;
    }
    if (base.includes("-")) variants++;
    else {
      primary++;
      codepointBases.add(codepoint);
    }
  }
  add("primary svg count", EXPECTED.primaryCharacters, primary);
  add("variant svg count", EXPECTED.variants, variants);
  add("malformed filenames", 0, malformed);
  add("duplicate identity", 0, primary - codepointBases.size);

  // license evidence — independent minimal tar walk over the real archive
  const tarFiles = tarWalk(gunzipSync(archiveBytes));
  const copying = tarFiles.get("kanjivg-r20240807/COPYING")?.toString("utf-8") ?? "";
  const readme = tarFiles.get("kanjivg-r20240807/README.md")?.toString("utf-8") ?? "";
  const licenseOk =
    /Creative Commons/i.test(copying) &&
    /Attribution-ShareAlike/i.test(copying) &&
    /3\.0/.test(copying) &&
    /Ulrich Apel/i.test(readme) &&
    /Attribution-Share Alike/i.test(readme);
  add("license evidence", "found", licenseOk ? "found" : "missing");

  // ---- published attachment state ----
  const statePath = resolve(process.cwd(), "data/kanjivg-attachment/state.json");
  if (!existsSync(statePath)) {
    add("attachment state", "exists", "missing");
    return { checks, ok: false, verdict: "FAIL" };
  }
  const state = JSON.parse(readFileSync(statePath, "utf-8"));

  // source identity recorded in state
  add("state.sourceRef", EXPECTED.sourceRef, state.contract.sourceRef);
  add("state.version", EXPECTED.version, state.contract.version);
  add("state.repository", EXPECTED.repository, state.contract.repository);
  add("state.tag", EXPECTED.tag, state.contract.tag);
  add("state.commit", EXPECTED.commit, state.contract.commit);
  add("state.archiveSha256", EXPECTED.archiveSha256, state.contract.archiveSha256);
  add("state.indexSha256", EXPECTED.indexSha256, state.contract.indexSha256);

  // ---- database invariants (independent SQL) ----
  const db = await withClient(async (c) => {
    const kanji = (
      await c.query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE source_ref = 'upstream:kanjidic2:2023-08')::int AS upstream,
                count(*) FILTER (WHERE source_ref = 'first-party:kanji-mindtree:v1')::int AS mindtree,
                count(*) FILTER (WHERE source_ref = 'first-party:kanji-corpus:v1')::int AS corpus
         FROM kanji_entries`
      )
    ).rows[0];
    const dict = (
      await c.query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE source_ref = 'upstream:jmdict:2023-08')::int AS upstream,
                count(*) FILTER (WHERE source_ref LIKE 'first-party:%')::int AS fp
         FROM dictionary_entries`
      )
    ).rows[0];
    const rows = (
      await c.query(`SELECT id, character, stroke_count, source_ref FROM kanji_entries ORDER BY character`)
    ).rows as Array<{ id: string; character: string; stroke_count: number; source_ref: string }>;
    return { kanji, dict, rows };
  });

  add("kanji_entries total", EXPECTED.kanjiTotal, db.kanji.total);
  add("kanji upstream KANJIDIC2", EXPECTED.kanjiUpstream, db.kanji.upstream);
  add("first-party total", EXPECTED.firstPartyTotal, db.kanji.mindtree + db.kanji.corpus);
  add("first-party mindtree", EXPECTED.mindtree, db.kanji.mindtree);
  add("first-party corpus", EXPECTED.corpus, db.kanji.corpus);
  add("dictionary total", EXPECTED.dictionaryTotal, db.dict.total);
  add("dictionary upstream", EXPECTED.dictionaryUpstream, db.dict.upstream);
  add("dictionary first-party", EXPECTED.dictionaryFirstParty, db.dict.fp);

  const hashi = db.rows.find((r) => r.character === "箸");
  const road = db.rows.find((r) => r.character === "道");
  add("箸 id", "kj-hashi", hashi?.id ?? "absent");
  add("箸 kanji_entries.stroke_count (KANJIDIC2 authority)", 14, hashi?.stroke_count ?? "absent");
  add("箸 source_ref", "first-party:kanji-mindtree:v1", hashi?.source_ref ?? "absent");
  add("道 id", "kanji-road", road?.id ?? "absent");
  add("道 source_ref", "first-party:kanji-corpus:v1", road?.source_ref ?? "absent");

  // ---- recompute classification, fingerprints and digest independently ----
  const dbCharMap = new Map(db.rows.map((r) => [r.character, r]));
  const matched: string[] = [];
  const extra: string[] = [];
  const assetsRecomputed: Record<string, unknown> = {};
  let variantAssetsCount = 0;
  let strokesTotal = 0;
  let strokeDiscrepancy = 0;
  const discrepanciesRecomputed: Array<Record<string, unknown>> = [];

  for (const character of Object.keys(index).sort()) {
    const files = [...index[character]].sort();
    const primaryFile = files.find((f) => !f.includes("-")) ?? files[0];
    const codepoint = primaryFile.replace(/\.svg$/i, "");
    const parsed = extractSvg(readFileSync(resolve(corpusDir, primaryFile), "utf-8"));

    // stroke identity + ordering (independent check)
    const strokeIds = parsed.strokes.map((s) => s.id);
    const strokeIdsValid =
      strokeIds.length > 0 &&
      strokeIds.every((id, idx) =>
        new RegExp(`^kvg:${codepoint}-s${idx + 1}$`).test(id)
      ) &&
      new Set(strokeIds).size === strokeIds.length;

    const variantRecords = files
      .filter((f) => f !== primaryFile)
      .map((f) => {
        const v = extractSvg(readFileSync(resolve(corpusDir, f), "utf-8"));
        return {
          file: f,
          variantType: f.replace(/\.svg$/i, "").split("-").slice(1).join("-"),
          strokeCount: v.strokeCount,
          strokeSequenceHash: strokeSequenceHash(v.strokes),
        };
      })
      .sort((a, b) => (a.file < b.file ? -1 : 1));
    variantAssetsCount += variantRecords.length;
    strokesTotal += parsed.strokeCount;

    const dbRow = dbCharMap.get(character) ?? null;
    const classification = dbRow ? "KANJIVG_MATCH" : "KANJIVG_EXTRA";
    if (dbRow) matched.push(character);
    else extra.push(character);

    const strokeStatus = !dbRow
      ? "NO_KANJIDIC_ROW"
      : dbRow.stroke_count === parsed.strokeCount
        ? "STROKE_COUNT_MATCH"
        : "STROKE_COUNT_DISCREPANCY";
    if (strokeStatus === "STROKE_COUNT_DISCREPANCY") {
      strokeDiscrepancy++;
      discrepanciesRecomputed.push({
        character,
        canonicalKanjiId: dbRow!.id,
        kanjidicStrokeCount: dbRow!.stroke_count,
        kanjivgStrokeCount: parsed.strokeCount,
        status: "STROKE_COUNT_DISCREPANCY",
        note: `Discrepancy: KANJIDIC2=${dbRow!.stroke_count} strokes vs KanjiVG=${parsed.strokeCount} strokes`,
      });
    }

    assetsRecomputed[`kanjivg:${character}`] = {
      assetId: `kanjivg:${character}`,
      character,
      codepoint,
      canonicalKanjiId: dbRow ? dbRow.id : null,
      classification,
      sourceRef: EXPECTED.sourceRef,
      version: EXPECTED.version,
      primaryFile,
      variantAssets: variantRecords,
      strokeCount: parsed.strokeCount,
      strokeIds,
      strokeSequenceHash: strokeSequenceHash(parsed.strokes),
      componentSignature: componentSignature(parsed.componentLines),
      kanjidicStrokeCount: dbRow ? dbRow.stroke_count : null,
      strokeStatus,
    };

    if (!strokeIdsValid) {
      add(`stroke identity ordering (${character})`, "kvg:<hex>-s1..sN unique", "INVALID");
    }
    if (Object.keys(index[character]).length === 0) {
      add(`index file list (${character})`, "non-empty", "empty");
    }
  }

  const missingRecomputed = db.rows
    .filter((r) => !index[r.character])
    .map((r) => ({
      character: r.character,
      canonicalKanjiId: r.id,
      classification: "KANJIVG_MISSING",
    }))
    .sort((a, b) => (a.canonicalKanjiId < b.canonicalKanjiId ? -1 : 1));

  discrepanciesRecomputed.sort((a, b) =>
    (a.canonicalKanjiId as string) < (b.canonicalKanjiId as string) ? -1 : 1
  );

  add("state.attached (independently derived)", matched.length, state.counts.attached);
  add("state.kanjivgExtra", extra.length, state.counts.kanjivgExtra);
  add("state.kanjivgMissing", missingRecomputed.length, state.counts.kanjivgMissing);
  add("state.variantAssets", variantAssetsCount, state.counts.variantAssets);
  add("state.strokesTotal", strokesTotal, state.counts.strokesTotal);
  add("state.strokeDiscrepancy", strokeDiscrepancy, state.counts.strokeDiscrepancy);
  add(
    "state.strokeMatch",
    matched.length - strokeDiscrepancy,
    state.counts.strokeMatch
  );

  // classification lists
  const matchedSorted = [...matched].sort();
  const extraSorted = [...extra].sort();
  add(
    "classification.matched list",
    `sha256:${createHash("sha256").update(matchedSorted.join("\n")).digest("hex").slice(0, 16)}`,
    `sha256:${createHash("sha256").update(state.classification.matched.join("\n")).digest("hex").slice(0, 16)}`
  );
  add(
    "classification.extra list",
    `sha256:${createHash("sha256").update(extraSorted.join("\n")).digest("hex").slice(0, 16)}`,
    `sha256:${createHash("sha256").update(state.classification.extra.join("\n")).digest("hex").slice(0, 16)}`
  );
  add(
    "classification.missing list",
    `sha256:${createHash("sha256").update(JSON.stringify(missingRecomputed)).digest("hex").slice(0, 16)}`,
    `sha256:${createHash("sha256").update(JSON.stringify(state.classification.missing)).digest("hex").slice(0, 16)}`
  );

  // per-asset provenance + full state digest (independent reconstruction)
  let provenanceViolations = 0;
  for (const [assetId, rec] of Object.entries(state.assets)) {
    const r = rec as { sourceRef: string; version: string; assetId: string };
    if (
      r.sourceRef !== EXPECTED.sourceRef ||
      r.version !== EXPECTED.version ||
      r.assetId !== assetId ||
      FORBIDDEN_PROVENANCE.includes(r.sourceRef)
    ) {
      provenanceViolations++;
    }
  }
  add("provenance violations", 0, provenanceViolations);

  // full body from the verifier's OWN constants + recomputed records
  const contractRecomputed = {
    repository: EXPECTED.repository,
    tag: EXPECTED.tag,
    commit: EXPECTED.commit,
    sourceRef: EXPECTED.sourceRef,
    version: EXPECTED.version,
    archiveFilename: EXPECTED.archiveFilename,
    archiveSha256: EXPECTED.archiveSha256,
    archiveSize: EXPECTED.archiveSize,
    indexSha256: EXPECTED.indexSha256,
    indexSize: EXPECTED.indexSize,
    indexPrimaryKeys: EXPECTED.indexPrimaryKeys,
    svgFiles: EXPECTED.svgFiles,
    primaryCharacters: EXPECTED.primaryCharacters,
    variants: EXPECTED.variants,
    license: EXPECTED.license,
    attribution: EXPECTED.attribution,
  };
  const body = {
    contract: contractRecomputed,
    counts: {
      dbKanji: db.rows.length,
      indexedPrimaryKeys: Object.keys(index).length,
      attached: matchedSorted.length,
      kanjivgExtra: extraSorted.length,
      kanjivgMissing: missingRecomputed.length,
      variantAssets: variantAssetsCount,
      strokesTotal,
      strokeMatch: matchedSorted.length - strokeDiscrepancy,
      strokeDiscrepancy,
    },
    classification: {
      matched: matchedSorted,
      extra: extraSorted,
      missing: missingRecomputed,
    },
    assets: Object.fromEntries(
      Object.keys(assetsRecomputed)
        .sort()
        .map((k) => [k, assetsRecomputed[k]])
    ),
    discrepancies: discrepanciesRecomputed,
  };
  const recomputedDigest = createHash("sha256").update(canonicalJson(body)).digest("hex");
  add("deterministic digest", recomputedDigest, state.digest);

  // per-asset fingerprint spot audit (full audit = digest equality above)
  const assetKeysRecomputed = Object.keys(assetsRecomputed).sort();
  const assetKeysState = Object.keys(state.assets).sort();
  add("asset identity set", assetKeysRecomputed.length, assetKeysState.length);
  const mismatchedAssets = assetKeysRecomputed.filter((k, i) => k !== assetKeysState[i]);
  add("asset identity keys", 0, mismatchedAssets.length);

  // 箸 discrepancy evidence preserved (visual evidence never overwrote KANJIDIC2)
  const hashiAsset = state.assets["kanjivg:箸"];
  if (hashiAsset) {
    const h = hashiAsset as unknown as {
      strokeStatus: string;
      kanjidicStrokeCount: number;
      strokeCount: number;
    };
    add("箸 evidence: kanjidicStrokeCount recorded", 14, h.kanjidicStrokeCount);
    add(
      "箸 evidence: KANJIDIC2 stroke_count still authoritative",
      14,
      hashi?.stroke_count ?? "absent"
    );
  }

  const ok = checks.every((c) => c.ok);
  return { checks, ok, verdict: ok ? "PASS" : "FAIL" };
}

async function main(): Promise<void> {
  const result = await verifyKanjiVgIngestion();
  for (const c of result.checks) {
    console.log(
      `${c.ok ? "PASS" : "FAIL"} | ${c.name} | expected: ${c.expected} | observed: ${c.observed}`
    );
  }
  console.log(`Verdict: ${result.verdict}`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && /verify-kanjivg-ingestion(\.ts|\.js)$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
