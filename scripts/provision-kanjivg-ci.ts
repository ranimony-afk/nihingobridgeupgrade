/**
 * KanjiVG Controlled Acquisition Provisioner — Phase 14.4D source-identity re-pin.
 *
 * Acquires ONLY the pinned r20240807 release of github.com/KanjiVG/kanjivg and
 * verifies every locked identity before publishing anything into the gitignored
 * transient asset store (data/kanjivg/ + data/kanjivg-index.json).
 *
 * HARD FAIL-CLOSED GATES (any mismatch aborts before any published write):
 *  - source version / tag / commit identity
 *  - archive SHA-256 + size
 *  - archive structure (root dir, metadata set, filename invariants)
 *  - corpus counts (11,658 SVG = 6,699 primary + 4,959 variants, 6,699 bases)
 *  - duplicate identity refusal
 *  - license evidence (CC BY-SA 3.0 + Ulrich Apel attribution)
 *  - canonical index identity (upstream make-index.py semantics)
 *
 * Never writes database rows. Never commits the raw corpus.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { gunzipSync } from "node:zlib";
import { join, resolve } from "node:path";

/* ------------------------------------------------------------------ */
/* Authorized pinned identity (Phase 14.4D source-identity re-pin).    */
/* ------------------------------------------------------------------ */

export const KANJIVG_PINNED = {
  repository: "KanjiVG/kanjivg",
  repositoryUrl: "https://github.com/KanjiVG/kanjivg",
  tag: "r20240807",
  commit: "a4b51d966d832544c371d566f9c84174e4beff3b",
  releaseDate: "2024-08-07",
  version: "r20240807",
  sourceRef: "upstream:kanjivg:2024-08",
  archive: {
    filename: "kanjivg-r20240807.tar.gz",
    url: "https://codeload.github.com/KanjiVG/kanjivg/tar.gz/refs/tags/r20240807",
    rootDirectory: "kanjivg-r20240807",
    compressedSize: 6403118,
    sha256: "a0cbc5c950d5c68bf3b6b24468ebdb8a829e62f04a4f44e1c7e98bade2597dcd",
  },
  index: {
    filename: "kanjivg-index.json",
    generator: "upstream make-index.py",
    size: 293747,
    sha256: "43e9d0b71f7288e72bb6a74bdaa52498fe381a1045925789e62695fc863cf6d0",
    primaryKeys: 6699,
  },
  corpus: {
    svgFiles: 11658,
    primary: 6699,
    variants: 4959,
    distinctPrimaryCharacters: 6699,
  },
  license: {
    spdx: "CC-BY-SA-3.0",
    attribution: "Ulrich Apel and the KanjiVG project",
    copyingMarkers: ["Creative Commons", "Attribution-ShareAlike", "3.0"],
    readmeMarkers: ["Ulrich Apel", "Creative Commons", "3.0"],
  },
  /** Root-level files expected inside the pinned repository tree. */
  metadataFiles: [
    ".gitignore",
    "COPYING",
    "README.md",
    "clean.py",
    "kanjivg.py",
    "kvg-index.json",
    "kvg-lookup.py",
    "kvg.py",
    "make-index.py",
    "updatepublic.sh",
    "utils.py",
    "xmlhandler.py",
  ],
} as const;

export const SVG_FILENAME_PATTERN = /^([0-9a-f]{5})(-.+)?\.svg$/;

/* ------------------------------------------------------------------ */
/* Minimal fail-closed tar reader (ustar + pax + GNU long names).      */
/* ------------------------------------------------------------------ */

export interface TarEntry {
  name: string;
  type: "file" | "directory" | "pax" | "other";
  content: Buffer;
}

function parseOctal(raw: string): number {
  const s = raw.replace(/\0.*$/, "").trim();
  if (!s) return 0;
  const n = parseInt(s, 8);
  if (Number.isNaN(n)) throw new Error(`Malformed tar numeric field: ${JSON.stringify(raw)}`);
  return n;
}

export function parseTarEntries(tar: Buffer): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;
  let pendingPaxPath: string | null = null;

  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break; // end-of-archive

    const rawName = header.subarray(0, 100).toString("utf-8").replace(/\0.*$/, "");
    const size = parseOctal(header.subarray(124, 136).toString("utf-8"));
    const typeflag = String.fromCharCode(header[156] || 0);
    const prefix = header.subarray(345, 500).toString("utf-8").replace(/\0.*$/, "");
    const name = prefix ? `${prefix}/${rawName}` : rawName;

    offset += 512;
    const dataLen = Math.ceil(size / 512) * 512;
    if (offset + dataLen > tar.length) throw new Error(`Truncated tar entry: ${name}`);
    const content = tar.subarray(offset, offset + size);
    offset += dataLen;

    if (typeflag === "g" || typeflag === "x") {
      // pax headers: "LEN key=value\n" records; keep path override if present.
      let pos = 0;
      while (pos < content.length) {
        const spaceIdx = content.indexOf(0x20, pos);
        if (spaceIdx < 0) break;
        const recLen = parseInt(content.subarray(pos, spaceIdx).toString("utf-8"), 10);
        if (!Number.isInteger(recLen) || recLen <= 0) break;
        const record = content.subarray(spaceIdx + 1, pos + recLen - 1).toString("utf-8");
        const eq = record.indexOf("=");
        if (eq > 0) {
          const key = record.slice(0, eq);
          const value = record.slice(eq + 1);
          if (key === "path") pendingPaxPath = value;
        }
        pos += recLen;
      }
      entries.push({ name, type: "pax", content: Buffer.alloc(0) });
      continue;
    }

    if (typeflag === "L" || typeflag === "K") {
      pendingPaxPath = content.toString("utf-8").replace(/\0.*$/, "");
      entries.push({ name, type: "pax", content: Buffer.alloc(0) });
      continue;
    }

    const finalName = pendingPaxPath ?? name;
    pendingPaxPath = null;

    if (typeflag === "5") {
      entries.push({ name: finalName, type: "directory", content: Buffer.alloc(0) });
    } else if (typeflag === "0" || typeflag === "\0" || typeflag === "") {
      entries.push({ name: finalName, type: "file", content: Buffer.from(content) });
    } else {
      entries.push({ name: finalName, type: "other", content: Buffer.from(content) });
    }
  }

  return entries;
}

/* ------------------------------------------------------------------ */
/* Verification gates (pure; fail-closed on every mismatch).           */
/* ------------------------------------------------------------------ */

export interface GateFailure {
  gate: string;
  message: string;
}

export interface GateResult {
  ok: boolean;
  failures: GateFailure[];
  details?: Record<string, unknown>;
}

function fail(gate: string, message: string): GateFailure {
  return { gate, message };
}

export function verifyArchiveIdentity(
  archiveBytes: Buffer,
  expected: { sha256: string; compressedSize: number } = {
    sha256: KANJIVG_PINNED.archive.sha256,
    compressedSize: KANJIVG_PINNED.archive.compressedSize,
  }
): GateResult {
  const failures: GateFailure[] = [];
  const sha256 = createHash("sha256").update(archiveBytes).digest("hex");
  if (sha256 !== expected.sha256) {
    failures.push(fail("archive-sha256", `archive SHA-256 mismatch: got ${sha256}, expected ${expected.sha256}`));
  }
  if (archiveBytes.length !== expected.compressedSize) {
    failures.push(
      fail("archive-size", `archive size mismatch: got ${archiveBytes.length}, expected ${expected.compressedSize}`)
    );
  }
  return { ok: failures.length === 0, failures, details: { sha256, size: archiveBytes.length } };
}

export interface CorpusStructure {
  svgFiles: string[];
  primary: string[];
  variants: string[];
  distinctBases: string[];
  metadataFiles: string[];
}

export function verifyArchiveStructure(entries: TarEntry[]): GateResult {
  const failures: GateFailure[] = [];
  const rootDir = KANJIVG_PINNED.archive.rootDirectory;
  const svgFiles: string[] = [];
  const primary: string[] = [];
  const variants: string[] = [];
  const bases = new Set<string>();
  const metadataFiles: string[] = [];
  const seenNames = new Set<string>();

  for (const entry of entries) {
    if (entry.type === "pax") continue;
    const name = entry.name.replace(/\/+$/, "");

    if (entry.type === "directory") {
      if (name !== rootDir && !name.startsWith(`${rootDir}/`)) {
        failures.push(fail("structure-root", `unexpected directory outside pinned root: ${entry.name}`));
      }
      continue;
    }
    if (entry.type !== "file") {
      failures.push(fail("structure-type", `unexpected tar entry type for ${entry.name}`));
      continue;
    }

    if (seenNames.has(name)) {
      failures.push(fail("duplicate-identity", `duplicate archive entry: ${name}`));
    }
    seenNames.add(name);

    if (!name.startsWith(`${rootDir}/`)) {
      failures.push(fail("structure-root", `entry outside pinned root directory: ${name}`));
      continue;
    }
    const rel = name.slice(rootDir.length + 1);

    if (rel.startsWith("kanji/")) {
      const file = rel.slice("kanji/".length);
      if (file.includes("/")) {
        failures.push(fail("structure-nesting", `unexpected nested path under kanji/: ${file}`));
        continue;
      }
      const m = file.match(SVG_FILENAME_PATTERN);
      if (!m) {
        failures.push(fail("malformed-filename", `malformed SVG filename: ${file}`));
        continue;
      }
      svgFiles.push(file);
      if (m[2]) {
        variants.push(file);
        bases.add(m[1]);
      } else {
        primary.push(file);
        bases.add(m[1]);
      }
    } else if (rel.includes("/")) {
      failures.push(fail("structure-nesting", `unexpected nested path: ${rel}`));
    } else {
      metadataFiles.push(rel);
    }
  }

  const expectedMeta = new Set<string>(KANJIVG_PINNED.metadataFiles);
  for (const f of metadataFiles) {
    if (!expectedMeta.has(f)) failures.push(fail("structure-metadata", `unexpected metadata file: ${f}`));
  }
  for (const f of expectedMeta) {
    if (!metadataFiles.includes(f)) failures.push(fail("structure-metadata", `missing metadata file: ${f}`));
  }

  const primaryBases = new Set(primary.map((f) => f.replace(/\.svg$/, "")));
  const variantOnly = [...bases].filter((b) => !primaryBases.has(b));
  if (variantOnly.length > 0) {
    failures.push(fail("duplicate-identity", `variant-only character identities without primary: ${variantOnly.slice(0, 5).join(", ")}`));
  }

  const c = KANJIVG_PINNED.corpus;
  if (svgFiles.length !== c.svgFiles) {
    failures.push(fail("corpus-count", `unexpected SVG count: got ${svgFiles.length}, expected ${c.svgFiles}`));
  }
  if (primary.length !== c.primary) {
    failures.push(fail("corpus-count", `unexpected primary count: got ${primary.length}, expected ${c.primary}`));
  }
  if (variants.length !== c.variants) {
    failures.push(fail("corpus-count", `unexpected variant count: got ${variants.length}, expected ${c.variants}`));
  }
  if (bases.size !== c.distinctPrimaryCharacters) {
    failures.push(
      fail("corpus-count", `unexpected distinct character count: got ${bases.size}, expected ${c.distinctPrimaryCharacters}`)
    );
  }

  return {
    ok: failures.length === 0,
    failures,
    details: {
      svgFiles: svgFiles.length,
      primary: primary.length,
      variants: variants.length,
      distinctBases: bases.size,
      metadataFiles: metadataFiles.sort(),
    },
  };
}

export function verifyLicenseEvidence(copyingText: string, readmeText: string): GateResult {
  const failures: GateFailure[] = [];
  const copyingLower = copyingText.toLowerCase();
  const readmeLower = readmeText.toLowerCase();
  for (const marker of KANJIVG_PINNED.license.copyingMarkers) {
    if (!copyingLower.includes(marker.toLowerCase())) {
      failures.push(fail("license", `COPYING missing license marker: ${marker}`));
    }
  }
  for (const marker of KANJIVG_PINNED.license.readmeMarkers) {
    if (!readmeLower.includes(marker.toLowerCase())) {
      failures.push(fail("license", `README missing attribution/license marker: ${marker}`));
    }
  }
  return { ok: failures.length === 0, failures };
}

export function verifySourceIdentity(input: {
  repository?: string;
  tag?: string;
  commit?: string;
  version?: string;
  sourceRef?: string;
}): GateResult {
  const failures: GateFailure[] = [];
  const p = KANJIVG_PINNED;
  if (input.repository !== undefined && input.repository !== p.repository) {
    failures.push(fail("source-version", `repository mismatch: got ${input.repository}, expected ${p.repository}`));
  }
  if (input.tag !== undefined && input.tag !== p.tag) {
    failures.push(fail("source-version", `tag mismatch: got ${input.tag}, expected ${p.tag}`));
  }
  if (input.commit !== undefined && input.commit !== p.commit) {
    failures.push(fail("source-version", `commit mismatch: got ${input.commit}, expected ${p.commit}`));
  }
  if (input.version !== undefined && input.version !== p.version) {
    failures.push(fail("source-version", `version mismatch: got ${input.version}, expected ${p.version}`));
  }
  if (input.sourceRef !== undefined && input.sourceRef !== p.sourceRef) {
    failures.push(fail("source-version", `sourceRef mismatch: got ${input.sourceRef}, expected ${p.sourceRef}`));
  }
  return { ok: failures.length === 0, failures };
}

/**
 * Deterministic index generator — byte-compatible with the upstream
 * repository's make-index.py (json.dump ensure_ascii=False, indent="\t",
 * separators=(",", ":") + trailing newline; files in lexical sort order).
 */
export function generateCanonicalIndex(svgFileNames: string[]): string {
  const sorted = [...svgFileNames].sort();
  const index = new Map<string, string[]>();
  for (const file of sorted) {
    const m = file.match(SVG_FILENAME_PATTERN);
    if (!m) continue;
    const character = String.fromCodePoint(parseInt(m[1], 16));
    const list = index.get(character);
    if (list) list.push(file);
    else index.set(character, [file]);
  }

  const parts: string[] = [];
  let first = true;
  for (const [character, files] of index) {
    if (!first) parts.push(",\n");
    first = false;
    parts.push(`\t${JSON.stringify(character)}:[\n`);
    parts.push(files.map((f) => `\t\t${JSON.stringify(f)}`).join(",\n"));
    parts.push(`\n\t]`);
  }
  return `{\n${parts.join("")}\n}\n`;
}

export function verifyIndexIdentity(
  indexBytes: Buffer,
  svgFileNames?: string[]
): GateResult {
  const failures: GateFailure[] = [];
  const p = KANJIVG_PINNED.index;
  const sha256 = createHash("sha256").update(indexBytes).digest("hex");
  if (sha256 !== p.sha256) {
    failures.push(fail("index-sha256", `index SHA-256 mismatch: got ${sha256}, expected ${p.sha256}`));
  }
  if (indexBytes.length !== p.size) {
    failures.push(fail("index-size", `index size mismatch: got ${indexBytes.length}, expected ${p.size}`));
  }

  let keys: string[] = [];
  try {
    const parsed = JSON.parse(indexBytes.toString("utf-8"));
    keys = Object.keys(parsed);
    if (keys.length !== p.primaryKeys) {
      failures.push(fail("index-keys", `index key count mismatch: got ${keys.length}, expected ${p.primaryKeys}`));
    }
  } catch (e) {
    failures.push(fail("index-parse", `index is not valid JSON: ${(e as Error).message}`));
  }

  if (svgFileNames) {
    const regenerated = Buffer.from(generateCanonicalIndex(svgFileNames), "utf-8");
    if (!regenerated.equals(indexBytes)) {
      failures.push(fail("index-generation", "index is not byte-identical to the canonical make-index.py generation"));
    }
  }

  return { ok: failures.length === 0, failures, details: { sha256, size: indexBytes.length, keys: keys.length } };
}

/* ------------------------------------------------------------------ */
/* Acquisition + staged publication.                                   */
/* ------------------------------------------------------------------ */

export interface ProvisionResult {
  ok: boolean;
  failures: GateFailure[];
  archive: { path: string; sha256: string; size: number };
  corpus: { svgFiles: number; primary: number; variants: number; distinctBases: number };
  index: { path: string; sha256: string; size: number; keys: number };
  license: { spdx: string; attribution: string };
  remoteTagCommit?: { checked: boolean; resolved: string | null };
}

async function fetchTagCommit(tag: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${KANJIVG_PINNED.repository}/commits/${tag}`, {
      headers: { "User-Agent": "nihongo-kanjivg-provisioner" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { sha?: string };
    return body.sha ?? null;
  } catch {
    return null;
  }
}

export async function provisionKanjiVg(
  options: { skipRemoteTagCheck?: boolean; dataDir?: string } = {}
): Promise<ProvisionResult> {
  const dataDir = options.dataDir ?? resolve(process.cwd(), "data");
  const archivePath = join(dataDir, KANJIVG_PINNED.archive.filename);
  const failures: GateFailure[] = [];

  // 1. Source identity (exact version pin; no latest/master lookup).
  const sourceGate = verifySourceIdentity({
    repository: KANJIVG_PINNED.repository,
    tag: KANJIVG_PINNED.tag,
    commit: KANJIVG_PINNED.commit,
    version: KANJIVG_PINNED.version,
    sourceRef: KANJIVG_PINNED.sourceRef,
  });
  failures.push(...sourceGate.failures);

  // 2. Remote tag → commit identity (fail closed on resolution failure).
  let remoteTagCommit: ProvisionResult["remoteTagCommit"];
  if (!options.skipRemoteTagCheck) {
    const resolved = await fetchTagCommit(KANJIVG_PINNED.tag);
    remoteTagCommit = { checked: true, resolved };
    if (resolved !== KANJIVG_PINNED.commit) {
      failures.push(
        fail("source-version", `tag ${KANJIVG_PINNED.tag} resolves to ${resolved ?? "(unresolved)"}, expected ${KANJIVG_PINNED.commit}`)
      );
    }
  }

  // 3. Acquire archive bytes (download only if absent; identity always verified).
  if (!existsSync(archivePath)) {
    mkdirSync(dataDir, { recursive: true });
    const res = await fetch(KANJIVG_PINNED.archive.url, { headers: { "User-Agent": "nihongo-kanjivg-provisioner" } });
    if (!res.ok) {
      failures.push(fail("archive-acquire", `archive download failed: HTTP ${res.status}`));
    } else {
      writeFileSync(archivePath, Buffer.from(await res.arrayBuffer()));
    }
  }
  if (!existsSync(archivePath)) {
    return {
      ok: false,
      failures: [...failures, fail("archive-acquire", "archive missing after acquisition attempt")],
      archive: { path: archivePath, sha256: "", size: 0 },
      corpus: { svgFiles: 0, primary: 0, variants: 0, distinctBases: 0 },
      index: { path: join(dataDir, KANJIVG_PINNED.index.filename), sha256: "", size: 0, keys: 0 },
      license: { spdx: KANJIVG_PINNED.license.spdx, attribution: KANJIVG_PINNED.license.attribution },
      remoteTagCommit,
    };
  }
  const archiveBytes = readFileSync(archivePath);
  const archiveGate = verifyArchiveIdentity(archiveBytes);
  failures.push(...archiveGate.failures);

  // 4. Parse + structural verification (fail closed; nothing published yet).
  let entries: TarEntry[] = [];
  try {
    entries = parseTarEntries(gunzipSync(archiveBytes));
  } catch (e) {
    failures.push(fail("archive-structure", `archive parse failed: ${(e as Error).message}`));
  }
  const structureGate = entries.length > 0 ? verifyArchiveStructure(entries) : null;
  if (structureGate) failures.push(...structureGate.failures);

  const filesByName = new Map(entries.filter((e) => e.type === "file").map((e) => [e.name, e.content]));
  const rootDir = KANJIVG_PINNED.archive.rootDirectory;
  const copying = filesByName.get(`${rootDir}/COPYING`)?.toString("utf-8") ?? "";
  const readme = filesByName.get(`${rootDir}/README.md`)?.toString("utf-8") ?? "";
  if (!copying || !readme) {
    failures.push(fail("license", "COPYING or README.md missing from archive"));
  } else {
    failures.push(...verifyLicenseEvidence(copying, readme).failures);
  }

  // 5. Index: consume upstream shipped kvg-index.json + verify canonical generation.
  const svgFileNames = entries
    .filter((e) => e.type === "file" && e.name.startsWith(`${rootDir}/kanji/`))
    .map((e) => e.name.slice(`${rootDir}/kanji/`.length));
  const shippedIndex = filesByName.get(`${rootDir}/kvg-index.json`);
  if (!shippedIndex) {
    failures.push(fail("index-generation", "upstream kvg-index.json missing from archive"));
    return {
      ok: false,
      failures,
      archive: { path: archivePath, sha256: archiveGate.details?.sha256 as string, size: archiveBytes.length },
      corpus: { svgFiles: 0, primary: 0, variants: 0, distinctBases: 0 },
      index: { path: join(dataDir, KANJIVG_PINNED.index.filename), sha256: "", size: 0, keys: 0 },
      license: { spdx: KANJIVG_PINNED.license.spdx, attribution: KANJIVG_PINNED.license.attribution },
      remoteTagCommit,
    };
  }
  const indexGate = verifyIndexIdentity(shippedIndex, svgFileNames);
  failures.push(...indexGate.failures);

  const corpusSummary = {
    svgFiles: svgFileNames.length,
    primary: (structureGate?.details?.primary as number) ?? 0,
    variants: (structureGate?.details?.variants as number) ?? 0,
    distinctBases: (structureGate?.details?.distinctBases as number) ?? 0,
  };

  if (failures.length > 0) {
    // Fail closed: no published state is created or modified.
    return {
      ok: false,
      failures,
      archive: { path: archivePath, sha256: archiveGate.details?.sha256 as string, size: archiveBytes.length },
      corpus: corpusSummary,
      index: {
        path: join(dataDir, KANJIVG_PINNED.index.filename),
        sha256: indexGate.details?.sha256 as string,
        size: shippedIndex.length,
        keys: indexGate.details?.keys as number,
      },
      license: { spdx: KANJIVG_PINNED.license.spdx, attribution: KANJIVG_PINNED.license.attribution },
      remoteTagCommit,
    };
  }

  // 6. Staged publication (atomic-ish swap; failures above never reach this).
  const staging = join(dataDir, `kanjivg-staging-${process.pid}`);
  const finalDir = join(dataDir, "kanjivg");
  const finalIndex = join(dataDir, KANJIVG_PINNED.index.filename);
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(join(staging, "kanji"), { recursive: true });
  for (const file of svgFileNames) {
    const content = filesByName.get(`${rootDir}/kanji/${file}`);
    if (!content) continue;
    writeFileSync(join(staging, "kanji", file), content);
  }
  writeFileSync(join(staging, "kanjivg-index.json"), shippedIndex);
  rmSync(finalDir, { recursive: true, force: true });
  renameSync(join(staging, "kanji"), finalDir);
  renameSync(join(staging, "kanjivg-index.json"), finalIndex);
  rmSync(staging, { recursive: true, force: true });

  const published = readdirSync(finalDir).filter((f) => f.endsWith(".svg"));
  if (published.length !== KANJIVG_PINNED.corpus.svgFiles) {
    throw new Error(`post-publish verification failed: ${published.length} SVG files published`);
  }
  const publishedIndex = readFileSync(finalIndex);
  const postGate = verifyIndexIdentity(publishedIndex, published);
  if (!postGate.ok) throw new Error(`post-publish index verification failed: ${postGate.failures.map((f) => f.message).join("; ")}`);

  return {
    ok: true,
    failures: [],
    archive: {
      path: archivePath,
      sha256: archiveGate.details?.sha256 as string,
      size: archiveBytes.length,
    },
    corpus: corpusSummary,
    index: {
      path: finalIndex,
      sha256: postGate.details?.sha256 as string,
      size: publishedIndex.length,
      keys: postGate.details?.keys as number,
    },
    license: { spdx: KANJIVG_PINNED.license.spdx, attribution: KANJIVG_PINNED.license.attribution },
    remoteTagCommit,
  };
}

/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  const result = await provisionKanjiVg();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    console.error("[KANJIVG PROVISION] FAIL-CLOSED — no canonical asset state published:");
    for (const f of result.failures) console.error(`  [${f.gate}] ${f.message}`);
    process.exit(1);
  }
  console.log(
    `[KANJIVG PROVISION] VERIFIED ${KANJIVG_PINNED.repository}@${KANJIVG_PINNED.tag} (${KANJIVG_PINNED.commit}) ` +
      `archive ${result.archive.sha256} (${result.archive.size} B), ` +
      `corpus ${result.corpus.svgFiles} SVG = ${result.corpus.primary} primary + ${result.corpus.variants} variants, ` +
      `index ${result.index.sha256} (${result.index.size} B, ${result.index.keys} keys)`
  );
}

if (process.argv[1]?.endsWith("provision-kanjivg-ci.ts")) {
  main().catch((e) => {
    console.error("[KANJIVG PROVISION] fatal:", e);
    process.exit(1);
  });
}
