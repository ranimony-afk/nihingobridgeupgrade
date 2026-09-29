/**
 * Phase 14.4D: KanjiVG acquisition gates (additive) — source-identity re-pin.
 *
 * Required assertions (bounded recovery authorization §8):
 *  1. exact repository/tag/commit
 *  2. exact archive SHA/size
 *  3. exact index SHA/size
 *  4. exact corpus counts
 *  5. exact sourceRef
 *  6. wrong archive refusal
 *  7. wrong index refusal
 *  8. wrong version refusal
 *  9. duplicate identity refusal
 *  10. malformed source refusal
 *
 * Plus fail-closed extras from §7: wrong commit, wrong index size, unexpected
 * counts, license mismatch, source-version mismatch. Refusal cases must leave
 * no published asset state and must not touch any database.
 */

import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { AUTHORITATIVE_SOURCE_REGISTRY } from "@/services/knowledge/provenance";
import {
  KANJIVG_PINNED,
  parseTarEntries,
  verifyArchiveIdentity,
  verifyArchiveStructure,
  verifyIndexIdentity,
  verifyLicenseEvidence,
  verifySourceIdentity,
  generateCanonicalIndex,
  provisionKanjiVg,
  type TarEntry,
} from "../scripts/provision-kanjivg-ci";
import { KANJIVG_SOURCE_REF, transformKanjiVgSvg } from "@/etl/kanji/kanjiVgTransformer";
import { parseKanjiVgSvg } from "@/etl/kanji/kanjiVgParser";

const DATA_DIR = resolve(process.cwd(), "data");
const ARCHIVE_PATH = join(DATA_DIR, KANJIVG_PINNED.archive.filename);
const INDEX_PATH = join(DATA_DIR, KANJIVG_PINNED.index.filename);
const CORPUS_DIR = join(DATA_DIR, "kanjivg");

function fileEntry(name: string, content: string): TarEntry {
  return { name, type: "file", content: Buffer.from(content, "utf-8") };
}

function baseStructureEntries(): TarEntry[] {
  const root = KANJIVG_PINNED.archive.rootDirectory;
  const meta = KANJIVG_PINNED.metadataFiles.map((f) => fileEntry(`${root}/${f}`, "x"));
  // Minimal valid corpus shape is not required here: structure gates are
  // exercised with explicit counts injected below.
  return meta;
}

describe("Phase 14.4D: KanjiVG acquisition gates (source-identity re-pin)", () => {
  it("1. pins the exact repository, tag, and commit identity", () => {
    expect(KANJIVG_PINNED.repository).toBe("KanjiVG/kanjivg");
    expect(KANJIVG_PINNED.tag).toBe("r20240807");
    expect(KANJIVG_PINNED.commit).toBe("a4b51d966d832544c371d566f9c84174e4beff3b");
    expect(KANJIVG_PINNED.version).toBe("r20240807");
    expect(KANJIVG_PINNED.releaseDate).toBe("2024-08-07");

    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), "reports/gates/PHASE-14.4D-KANJIVG-ACQUISITION-MANIFEST.json"), "utf-8")
    );
    expect(manifest.repository.name).toBe("KanjiVG/kanjivg");
    expect(manifest.repository.tag).toBe("r20240807");
    expect(manifest.repository.commit).toBe("a4b51d966d832544c371d566f9c84174e4beff3b");
    expect(verifySourceIdentity({ repository: "KanjiVG/kanjivg", tag: "r20240807", commit: KANJIVG_PINNED.commit }).ok).toBe(true);
  });

  it("2. verifies the exact archive SHA-256 and size from consumed bytes", () => {
    expect(existsSync(ARCHIVE_PATH)).toBe(true);
    const bytes = readFileSync(ARCHIVE_PATH);
    const digest = createHash("sha256").update(bytes).digest("hex");
    expect(bytes.length).toBe(6403118);
    expect(digest).toBe("a0cbc5c950d5c68bf3b6b24468ebdb8a829e62f04a4f44e1c7e98bade2597dcd");
    expect(verifyArchiveIdentity(bytes).ok).toBe(true);
  });

  it("3. verifies the exact index SHA-256 and size", () => {
    expect(existsSync(INDEX_PATH)).toBe(true);
    const bytes = readFileSync(INDEX_PATH);
    const digest = createHash("sha256").update(bytes).digest("hex");
    expect(bytes.length).toBe(293747);
    expect(digest).toBe("43e9d0b71f7288e72bb6a74bdaa52498fe381a1045925789e62695fc863cf6d0");
    const svgFiles = readdirSync(CORPUS_DIR).filter((f) => f.endsWith(".svg"));
    expect(verifyIndexIdentity(bytes, svgFiles).ok).toBe(true);
  });

  it("4. verifies the exact corpus counts and filename invariants", () => {
    const svgFiles = readdirSync(CORPUS_DIR).filter((f) => f.endsWith(".svg"));
    const primary = svgFiles.filter((f) => /^[0-9a-f]{5}\.svg$/.test(f));
    const variants = svgFiles.filter((f) => /^[0-9a-f]{5}-.+\.svg$/.test(f));
    const bases = new Set(svgFiles.map((f) => f.slice(0, 5)));
    expect(svgFiles.length).toBe(11658);
    expect(primary.length).toBe(6699);
    expect(variants.length).toBe(4959);
    expect(bases.size).toBe(6699);
    expect(svgFiles.every((f) => /^[0-9a-f]{5}(-.*)?\.svg$/.test(f))).toBe(true);

    // structure gate on the real archive entry list
    const entries = parseTarEntries(gunzipSync(readFileSync(ARCHIVE_PATH)));
    const gate = verifyArchiveStructure(entries);
    expect(gate.ok).toBe(true);
    expect(gate.details?.svgFiles).toBe(11658);
    expect(gate.details?.distinctBases).toBe(6699);
  });

  it("5. preserves the exact sourceRef provenance identity upstream:kanjivg:2024-08", () => {
    const prov = AUTHORITATIVE_SOURCE_REGISTRY["upstream:kanjivg:2024-08"];
    expect(prov).toBeDefined();
    expect(prov.id).toBe("upstream:kanjivg:2024-08");
    expect(prov.license).toBe("CC-BY-SA-3.0");
    expect(KANJIVG_SOURCE_REF).toBe("upstream:kanjivg:2024-08");
    expect(KANJIVG_PINNED.sourceRef).toBe("upstream:kanjivg:2024-08");

    const parsed = parseKanjiVgSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="109" height="109" viewBox="0 0 109 109"><g id="kvg:065e5"><path id="kvg:065e5-s1" d="M1,1l2,2"/></g></svg>',
      "065e5.svg"
    );
    const transformed = transformKanjiVgSvg(parsed);
    expect(transformed.asset?.sourceRef).toBe("upstream:kanjivg:2024-08");
    expect(transformed.asset?.version).toBe("r20240807");
    expect(verifySourceIdentity({ sourceRef: "upstream:kanjivg:2024-08" }).ok).toBe(true);
  });

  it("6. refuses wrong archive bytes fail-closed and publishes no asset state", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "kvg-gate-"));
    try {
      writeFileSync(join(tmp, KANJIVG_PINNED.archive.filename), Buffer.from("not the pinned archive"));
      const result = await provisionKanjiVg({ dataDir: tmp, skipRemoteTagCheck: true });
      expect(result.ok).toBe(false);
      expect(result.failures.some((f) => f.gate === "archive-sha256" || f.gate === "archive-size")).toBe(true);
      expect(existsSync(join(tmp, "kanjivg"))).toBe(false);
      expect(existsSync(join(tmp, KANJIVG_PINNED.index.filename))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("7. refuses a tampered index fail-closed", () => {
    const good = readFileSync(INDEX_PATH);
    const tampered = Buffer.from(good);
    tampered[10] ^= 0x01;
    const gate = verifyIndexIdentity(tampered);
    expect(gate.ok).toBe(false);
    expect(gate.failures.some((f) => f.gate === "index-sha256")).toBe(true);

    const wrongSize = verifyIndexIdentity(good.subarray(0, good.length - 1));
    expect(wrongSize.ok).toBe(false);
    expect(wrongSize.failures.some((f) => f.gate === "index-size" || f.gate === "index-parse" || f.gate === "index-sha256")).toBe(true);
  });

  it("8. refuses a wrong source version fail-closed", () => {
    const gate = verifySourceIdentity({ version: "r20250422" });
    expect(gate.ok).toBe(false);
    expect(gate.failures.some((f) => f.gate === "source-version")).toBe(true);

    const gate2 = verifySourceIdentity({ tag: "r20240808" });
    expect(gate2.ok).toBe(false);
  });

  it("9. refuses duplicate character/file identities fail-closed", () => {
    const root = KANJIVG_PINNED.archive.rootDirectory;
    const entries: TarEntry[] = [
      ...baseStructureEntries(),
      fileEntry(`${root}/kanji/065e5.svg`, "<svg/>"),
      fileEntry(`${root}/kanji/065e5.svg`, "<svg/>"), // duplicate file identity
    ];
    const gate = verifyArchiveStructure(entries);
    expect(gate.ok).toBe(false);
    expect(gate.failures.some((f) => f.gate === "duplicate-identity")).toBe(true);

    // variant-only character without primary is also a duplicate/incoherent identity
    const gate2 = verifyArchiveStructure([
      ...baseStructureEntries(),
      fileEntry(`${root}/kanji/065e5.svg`, "<svg/>"),
      fileEntry(`${root}/kanji/065e6-Kaisho.svg`, "<svg/>"),
    ]);
    expect(gate2.ok).toBe(false);
    expect(gate2.failures.some((f) => f.gate === "duplicate-identity")).toBe(true);
  });

  it("10. refuses malformed source filenames fail-closed", () => {
    const root = KANJIVG_PINNED.archive.rootDirectory;
    const gate = verifyArchiveStructure([
      ...baseStructureEntries(),
      fileEntry(`${root}/kanji/zzz.svg`, "<svg/>"),
    ]);
    expect(gate.ok).toBe(false);
    expect(gate.failures.some((f) => f.gate === "malformed-filename")).toBe(true);

    const gate2 = verifyArchiveStructure([
      ...baseStructureEntries(),
      fileEntry(`${root}/kanji/065e.svg`, "<svg/>"), // 4-hex codepoint
    ]);
    expect(gate2.ok).toBe(false);
    expect(gate2.failures.some((f) => f.gate === "malformed-filename")).toBe(true);
  });

  it("11. refuses wrong commit identity fail-closed", () => {
    const gate = verifySourceIdentity({ commit: "0000000000000000000000000000000000000000" });
    expect(gate.ok).toBe(false);
    expect(gate.failures.some((f) => f.gate === "source-version" && f.message.includes("commit"))).toBe(true);
  });

  it("12. refuses unexpected corpus counts fail-closed", () => {
    const root = KANJIVG_PINNED.archive.rootDirectory;
    const gate = verifyArchiveStructure([
      ...baseStructureEntries(),
      fileEntry(`${root}/kanji/065e5.svg`, "<svg/>"),
    ]);
    expect(gate.ok).toBe(false);
    expect(gate.failures.some((f) => f.gate === "corpus-count")).toBe(true);
  });

  it("13. refuses license mismatch fail-closed", () => {
    const gate = verifyLicenseEvidence("All rights reserved", "Some project");
    expect(gate.ok).toBe(false);
    expect(gate.failures.some((f) => f.gate === "license")).toBe(true);

    const good = verifyLicenseEvidence(
      "THE WORK IS PROVIDED UNDER THE TERMS OF THIS CREATIVE COMMONS PUBLIC LICENSE. Attribution-ShareAlike 3.0",
      "KanjiVG is copyright Ulrich Apel and released under the Creative Commons Attribution-Share Alike 3.0 licence"
    );
    expect(good.ok).toBe(true);
  });

  it("14. canonical index generation is deterministic and matches the upstream make-index.py contract", () => {
    const svgFiles = readdirSync(CORPUS_DIR).filter((f) => f.endsWith(".svg"));
    const a = generateCanonicalIndex(svgFiles);
    const b = generateCanonicalIndex([...svgFiles].reverse());
    expect(a).toBe(b);
    expect(Buffer.from(a, "utf-8").equals(readFileSync(INDEX_PATH))).toBe(true);
    const parsed = JSON.parse(a);
    expect(Object.keys(parsed).length).toBe(6699);
    // lexical file order puts variants before primary, matching upstream generator
    expect(parsed["且"]).toEqual(["04e14-Kaisho.svg", "04e14.svg"]);
  });
});
