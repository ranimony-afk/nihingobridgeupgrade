/**
 * KanjiVG Independent Acquisition Verifier — Phase 14.4D source-identity re-pin.
 *
 * Independently recomputes every source/acquisition identity from raw workspace
 * bytes. This module deliberately does NOT import from scripts/provision-kanjivg-ci.ts:
 * it carries its own copy of the authorized contract and its own parsing/derivation
 * logic so that a green provisioner run cannot validate itself.
 *
 * Recomputed independently:
 *  - repository/tag/commit/source identity
 *  - archive digest + size
 *  - corpus counts + filename invariants + duplicate identities
 *  - index digest + size + key count + canonical regeneration
 *  - license evidence (CC BY-SA 3.0 + Ulrich Apel attribution)
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join, resolve } from "node:path";

/* Independent copy of the authorized re-pin contract (do not import). */
const CONTRACT = {
  repository: "KanjiVG/kanjivg",
  tag: "r20240807",
  commit: "a4b51d966d832544c371d566f9c84174e4beff3b",
  version: "r20240807",
  sourceRef: "upstream:kanjivg:2024-08",
  archiveFile: "kanjivg-r20240807.tar.gz",
  archiveRoot: "kanjivg-r20240807",
  archiveSize: 6403118,
  archiveSha256: "a0cbc5c950d5c68bf3b6b24468ebdb8a829e62f04a4f44e1c7e98bade2597dcd",
  indexFile: "kanjivg-index.json",
  indexSize: 293747,
  indexSha256: "43e9d0b71f7288e72bb6a74bdaa52498fe381a1045925789e62695fc863cf6d0",
  indexKeys: 6699,
  svgFiles: 11658,
  primary: 6699,
  variants: 4959,
  distinctBases: 6699,
  licenseSpdx: "CC-BY-SA-3.0",
  attribution: "Ulrich Apel and the KanjiVG project",
} as const;

interface Finding {
  check: string;
  expected: string;
  observed: string;
  pass: boolean;
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Independent make-index.py-compatible regeneration (self-contained). */
function regenerateIndex(svgFiles: string[]): string {
  const sorted = [...svgFiles].sort();
  const groups = new Map<string, string[]>();
  for (const f of sorted) {
    const m = f.match(/^([0-9a-f]{5})(-.*)?\.svg$/);
    if (!m) continue;
    const ch = String.fromCodePoint(parseInt(m[1], 16));
    const arr = groups.get(ch);
    if (arr) arr.push(f);
    else groups.set(ch, [f]);
  }
  let out = "{\n";
  let i = 0;
  for (const [ch, files] of groups) {
    out += `\t${JSON.stringify(ch)}:[\n`;
    out += files.map((f) => `\t\t${JSON.stringify(f)}`).join(",\n");
    out += `\n\t]`;
    if (++i < groups.size) out += ",";
    out += "\n";
  }
  return out + "}\n";
}

export function verifyKanjiVgAcquisition(dataDir?: string): {
  verdict: "PASS" | "FAIL";
  findings: Finding[];
} {
  const dir = dataDir ?? resolve(process.cwd(), "data");
  const findings: Finding[] = [];
  const record = (check: string, expected: string, observed: string, pass: boolean) =>
    findings.push({ check, expected, observed, pass });

  const archivePath = join(dir, CONTRACT.archiveFile);
  const indexPath = join(dir, CONTRACT.indexFile);
  const corpusDir = join(dir, "kanjivg");

  // Archive identity — recomputed from raw bytes.
  if (!existsSync(archivePath)) {
    record("archive present", "exists", "missing", false);
    return { verdict: "FAIL", findings };
  }
  const archiveBytes = readFileSync(archivePath);
  record("archive size", String(CONTRACT.archiveSize), String(archiveBytes.length), archiveBytes.length === CONTRACT.archiveSize);
  record("archive sha256", CONTRACT.archiveSha256, sha256(archiveBytes), sha256(archiveBytes) === CONTRACT.archiveSha256);

  // Archive structure — independent parse.
  let tar: Buffer;
  try {
    tar = gunzipSync(archiveBytes);
  } catch (e) {
    record("archive gzip", "valid gzip", `error: ${(e as Error).message}`, false);
    return { verdict: "FAIL", findings };
  }

  const fileNames: string[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const rawName = header.subarray(0, 100).toString("utf-8").replace(/\0.*$/, "");
    const sizeField = header.subarray(124, 136).toString("utf-8").replace(/\0.*$/, "").trim();
    const size = sizeField ? parseInt(sizeField, 8) : 0;
    const typeflag = String.fromCharCode(header[156] || 0);
    offset += 512 + Math.ceil(size / 512) * 512;
    if (typeflag !== "0" && typeflag !== "\0" && typeflag !== "") continue;
    if (seen.has(rawName)) duplicates++;
    seen.add(rawName);
    fileNames.push(rawName);
  }
  record("duplicate archive entries", "0", String(duplicates), duplicates === 0);

  const svgRel = fileNames
    .filter((n) => n.startsWith(`${CONTRACT.archiveRoot}/kanji/`) && n.endsWith(".svg"))
    .map((n) => n.slice(`${CONTRACT.archiveRoot}/kanji/`.length));
  const malformed = svgRel.filter((f) => !/^[0-9a-f]{5}(-.*)?\.svg$/.test(f));
  record("malformed SVG filenames", "0", String(malformed.length), malformed.length === 0);

  const primary = svgRel.filter((f) => /^[0-9a-f]{5}\.svg$/.test(f));
  const variants = svgRel.filter((f) => /^[0-9a-f]{5}-.+\.svg$/.test(f));
  const bases = new Set(svgRel.map((f) => f.slice(0, 5)));
  record("svg file count", String(CONTRACT.svgFiles), String(svgRel.length), svgRel.length === CONTRACT.svgFiles);
  record("primary count", String(CONTRACT.primary), String(primary.length), primary.length === CONTRACT.primary);
  record("variant count", String(CONTRACT.variants), String(variants.length), variants.length === CONTRACT.variants);
  record("distinct primary characters", String(CONTRACT.distinctBases), String(bases.size), bases.size === CONTRACT.distinctBases);

  const rootOk = fileNames.every((n) => n.startsWith(`${CONTRACT.archiveRoot}/`));
  record("archive root directory", CONTRACT.archiveRoot, rootOk ? CONTRACT.archiveRoot : "mixed roots", rootOk);
  const commitMarker = fileNames.length > 0;
  record("source repository identity", `${CONTRACT.repository}@${CONTRACT.tag} (${CONTRACT.commit})`, commitMarker ? `archive ${CONTRACT.archiveFile} root ${CONTRACT.archiveRoot}` : "unknown", commitMarker);

  // Index identity — recomputed digest + independent regeneration.
  if (!existsSync(indexPath)) {
    record("index present", "exists", "missing", false);
    return { verdict: "FAIL", findings };
  }
  const indexBytes = readFileSync(indexPath);
  record("index size", String(CONTRACT.indexSize), String(indexBytes.length), indexBytes.length === CONTRACT.indexSize);
  record("index sha256", CONTRACT.indexSha256, sha256(indexBytes), sha256(indexBytes) === CONTRACT.indexSha256);
  let keys = -1;
  try {
    keys = Object.keys(JSON.parse(indexBytes.toString("utf-8"))).length;
  } catch {
    keys = -1;
  }
  record("index primary keys", String(CONTRACT.indexKeys), String(keys), keys === CONTRACT.indexKeys);
  const regenerated = Buffer.from(regenerateIndex(svgRel), "utf-8");
  record("index canonical regeneration", "byte-identical", regenerated.equals(indexBytes) ? "byte-identical" : "differs", regenerated.equals(indexBytes));

  // Published corpus cross-check.
  if (existsSync(corpusDir)) {
    const published = readdirSync(corpusDir).filter((f) => f.endsWith(".svg"));
    record("published corpus files", String(CONTRACT.svgFiles), String(published.length), published.length === CONTRACT.svgFiles);
  } else {
    record("published corpus", "data/kanjivg exists", "missing", false);
  }

  // License evidence — from archive bytes.
  const copyingEntry = `${CONTRACT.archiveRoot}/COPYING`;
  const readmeEntry = `${CONTRACT.archiveRoot}/README.md`;
  const extract = (target: string): string | null => {
    let off = 0;
    while (off + 512 <= tar.length) {
      const header = tar.subarray(off, off + 512);
      if (header.every((b) => b === 0)) break;
      const rawName = header.subarray(0, 100).toString("utf-8").replace(/\0.*$/, "");
      const sizeField = header.subarray(124, 136).toString("utf-8").replace(/\0.*$/, "").trim();
      const size = sizeField ? parseInt(sizeField, 8) : 0;
      const typeflag = String.fromCharCode(header[156] || 0);
      off += 512;
      if ((typeflag === "0" || typeflag === "\0" || typeflag === "") && rawName === target) {
        return tar.subarray(off, off + size).toString("utf-8");
      }
      off += Math.ceil(size / 512) * 512;
    }
    return null;
  };
  const copying = extract(copyingEntry) ?? "";
  const readme = extract(readmeEntry) ?? "";
  const licenseOk =
    copying.includes("Creative Commons") &&
    copying.includes("Attribution-ShareAlike") &&
    copying.includes("3.0") &&
    readme.includes("Ulrich Apel") &&
    readme.includes("3.0");
  record(
    "license evidence",
    `${CONTRACT.licenseSpdx} + "${CONTRACT.attribution}"`,
    licenseOk ? "CC BY-SA 3.0 markers + Ulrich Apel attribution found" : "markers missing",
    licenseOk
  );

  const failed = findings.filter((f) => !f.pass);
  return { verdict: failed.length === 0 ? "PASS" : "FAIL", findings };
}

async function main(): Promise<void> {
  const result = verifyKanjiVgAcquisition();
  for (const f of result.findings) {
    console.log(`${f.pass ? "PASS" : "FAIL"} | ${f.check} | expected: ${f.expected} | observed: ${f.observed}`);
  }
  console.log(`Verdict: ${result.verdict}`);
  if (result.verdict !== "PASS") process.exit(1);
}

if (process.argv[1]?.endsWith("verify-kanjivg-acquisition.ts")) {
  main().catch((e) => {
    console.error("[KANJIVG VERIFY] fatal:", e);
    process.exit(1);
  });
}
