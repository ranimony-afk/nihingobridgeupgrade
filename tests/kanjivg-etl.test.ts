/**
 * Phase 14.4D: KanjiVG Acquisition, Validation & Visual Intelligence Test Suite.
 *
 * Deterministic test suite covering all 25 operational and safety requirements:
 * 1. Provenance registration verified for upstream:kanjivg:2024-08
 * 2. Acquisition manifest verified
 * 3. XML/SVG parsing of valid KanjiVG SVG
 * 4. Stroke path extraction and viewBox preservation
 * 5. Component and radical hierarchy extraction (e.g. 明: left 日, right 月)
 * 6. Stroke order sequence validation (1..N)
 * 7. Detection and rejection of broken stroke order sequence
 * 8. Detection and rejection of duplicate stroke orders
 * 9. Detection and rejection of empty path geometry
 * 10. Malformed SVG handling without unhandled exceptions
 * 11. SVG Security: blocks executable script tags
 * 12. SVG Security: blocks inline event handler attributes (onload)
 * 13. SVG Security: blocks javascript: URI protocol
 * 14. SVG Security: blocks external HTTP/HTTPS network references
 * 15. Codepoint derivation accurately converts hex to character and U+XXXX
 * 16. Handles invalid/malformed codepoint strings gracefully
 * 17. Deterministic visual asset ID resolution matches canonical convention
 * 18. Accurately identifies STROKE_COUNT_MATCH
 * 19. Accurately identifies STROKE_COUNT_DISCREPANCY (including 箸)
 * 20. Representative kanji validation (一, 二, 日, 本, 学, 生, 食, 行, 見, 語, 漢, 龍, 箸, 鬱)
 * 21. Static stroke order diagram SVG renderer produces valid markup
 * 22. Animated stroke order SVG renderer produces valid CSS keyframes
 * 23. Mobile visual contract adherence (KanjiVisualAsset)
 * 24. Two-pass dry-run idempotency across all 11,658 files
 * 25. Zero database mutations verified during visual operations
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { db } from "@/db";
import { kanjiEntries, dictionaryEntries } from "@/db/schema";
import { sql } from "drizzle-orm";
import { AUTHORITATIVE_SOURCE_REGISTRY } from "@/services/knowledge/provenance";
import {
  parseKanjiVgSvg,
  validateSvgSecurity,
  codepointToCharacter,
} from "@/etl/kanji/kanjiVgParser";
import {
  transformKanjiVgSvg,
  validateStrokeSequence,
  compareStrokeCounts,
} from "@/etl/kanji/kanjiVgTransformer";
import { KanjiVisualService } from "@/services/knowledge/kanjiVisualService";
import { executeSingleKanjiVgDryRun } from "../scripts/dry-run-kanjivg";

const SAMPLE_VALID_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="109" height="109" viewBox="0 0 109 109">
<g id="kvg:StrokePaths_065e5" style="fill:none;stroke:#000000;stroke-width:3;">
<g id="kvg:065e5" kvg:element="日" kvg:radical="general">
	<path id="kvg:065e5-s1" kvg:type="㇑" d="M31.5,24.5c1.12,1.12,1.74,2.75,1.74,4.75c0,1.6-0.16,38.11-0.09,53.5"/>
	<path id="kvg:065e5-s2" kvg:type="㇕a" d="M33.48,26c0.8-0.05,37.67-3.01,40.77-3.25c3.19-0.25,5,1.75,5,4.25"/>
	<path id="kvg:065e5-s3" kvg:type="㇐a" d="M34.22,55.25c7.78-0.5,35.9-2.5,44.06-2.75"/>
	<path id="kvg:065e5-s4" kvg:type="㇐a" d="M34.23,86.5c10.52-0.75,34.15-2.12,43.81-2.25"/>
</g>
</g>
</svg>
`;

describe("Phase 14.4D: KanjiVG Visual Foundation & Stroke-Order Intelligence", () => {
  it("1. verifies provenance registration for upstream:kanjivg:2024-08", () => {
    const prov = AUTHORITATIVE_SOURCE_REGISTRY["upstream:kanjivg:2024-08"];
    expect(prov).toBeDefined();
    expect(prov.id).toBe("upstream:kanjivg:2024-08");
    expect(prov.license).toBe("CC-BY-SA-3.0");
    expect(prov.version).toBe("2024-08");
    expect(prov.status).toBe("active");
  });

  it("2. verifies acquisition manifest matches verified release", () => {
    const manifestPath = resolve(
      process.cwd(),
      "reports/gates/PHASE-14.4D-KANJIVG-ACQUISITION-MANIFEST.json"
    );
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    expect(manifest.source).toBe("upstream:kanjivg:2024-08");
    expect(manifest.releaseTag).toBe("r20240807");
    expect(manifest.archive.uncompressedFileCount).toBe(11658);
  });

  it("3. parses valid KanjiVG SVG into structured representation", () => {
    const parsed = parseKanjiVgSvg(SAMPLE_VALID_SVG, "065e5.svg");
    expect(parsed.character).toBe("日");
    expect(parsed.codepoint).toBe("065e5");
    expect(parsed.unicode).toBe("U+65E5");
    expect(parsed.strokeCount).toBe(4);
    expect(parsed.strokes.length).toBe(4);
    expect(parsed.isSafe).toBe(true);
  });

  it("4. extracts stroke paths and viewBox accurately", () => {
    const parsed = parseKanjiVgSvg(SAMPLE_VALID_SVG, "065e5.svg");
    expect(parsed.viewBox).toBe("0 0 109 109");
    expect(parsed.strokes[0].id).toBe("kvg:065e5-s1");
    expect(parsed.strokes[0].order).toBe(1);
    expect(parsed.strokes[0].path.startsWith("M31.5")).toBe(true);
    expect(parsed.strokes[0].type).toBe("㇑");
  });

  it("5. extracts component and radical hierarchy from SVG", () => {
    const svgPath = resolve(process.cwd(), "data/kanjivg/0660e.svg");
    const content = readFileSync(svgPath, "utf-8");
    const parsed = parseKanjiVgSvg(content, "0660e.svg");

    expect(parsed.character).toBe("明");
    expect(parsed.strokeCount).toBe(8);

    const elements = parsed.components.map((c) => c.element);
    expect(elements).toContain("明");
    expect(elements).toContain("日");
    expect(elements).toContain("月");

    const sun = parsed.components.find((c) => c.element === "日");
    expect(sun?.position).toBe("left");
    expect(sun?.radical).toBe("general");

    const moon = parsed.components.find((c) => c.element === "月");
    expect(moon?.position).toBe("right");
  });

  it("6. validates stroke sequence (1..N)", () => {
    const strokes = [
      { order: 1, path: "M0,0 L10,10" },
      { order: 2, path: "M10,10 L20,20" },
    ];
    const res = validateStrokeSequence(strokes);
    expect(res.isValid).toBe(true);
  });

  it("7. detects and rejects broken stroke order sequence", () => {
    const broken = [
      { order: 1, path: "M0,0 L10,10" },
      { order: 3, path: "M10,10 L20,20" }, // missing 2
    ];
    const res = validateStrokeSequence(broken);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain("Stroke order sequence broken");
  });

  it("8. detects and rejects duplicate stroke orders", () => {
    const dup = [
      { order: 1, path: "M0,0 L10,10" },
      { order: 1, path: "M10,10 L20,20" },
    ];
    const res = validateStrokeSequence(dup);
    expect(res.isValid).toBe(false);
  });

  it("9. detects and rejects empty path geometry", () => {
    const emptyPath = [
      { order: 1, path: "M0,0 L10,10" },
      { order: 2, path: "   " },
    ];
    const res = validateStrokeSequence(emptyPath);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain("Empty path geometry");
  });

  it("10. handles malformed SVG without throwing unhandled exceptions", () => {
    const malformed = `<svg><invalid-xml`;
    const parsed = parseKanjiVgSvg(malformed);
    expect(parsed.strokeCount).toBe(0);
    expect(parsed.strokes).toEqual([]);
  });

  it("11. SVG Security: blocks executable script tags", () => {
    const malicious = `<svg><script>alert('xss')</script><path d="M0,0"/></svg>`;
    const res = validateSvgSecurity(malicious);
    expect(res.isSafe).toBe(false);
    expect(res.errors.some((e) => e.includes("Forbidden tag"))).toBe(true);
  });

  it("12. SVG Security: blocks inline event handler attributes (onload)", () => {
    const malicious = `<svg onload="evil()"><path d="M0,0"/></svg>`;
    const res = validateSvgSecurity(malicious);
    expect(res.isSafe).toBe(false);
    expect(res.errors.some((e) => e.includes("event handler"))).toBe(true);
  });

  it("13. SVG Security: blocks javascript: protocol URIs", () => {
    const malicious = `<svg><a href="javascript:steal()"><path d="M0,0"/></a></svg>`;
    const res = validateSvgSecurity(malicious);
    expect(res.isSafe).toBe(false);
    expect(res.errors.some((e) => e.includes("javascript:"))).toBe(true);
  });

  it("14. SVG Security: blocks external HTTP/HTTPS network references", () => {
    const malicious = `<svg><image href="https://attacker.com/leak.png"/></svg>`;
    const res = validateSvgSecurity(malicious);
    expect(res.isSafe).toBe(false);
    expect(res.errors.some((e) => e.includes("external network reference"))).toBe(true);
  });

  it("15. codepointToCharacter accurately converts hex to character and U+XXXX", () => {
    const res1 = codepointToCharacter("065e5");
    expect(res1.character).toBe("日");
    expect(res1.unicode).toBe("U+65E5");

    const res2 = codepointToCharacter("05b66");
    expect(res2.character).toBe("学");
    expect(res2.unicode).toBe("U+5B66");
  });

  it("16. handles invalid/malformed codepoints gracefully", () => {
    const res = codepointToCharacter("invalid-hex");
    expect(res.character).toBe("");
    expect(res.unicode).toBe("");
  });

  it("17. deterministic visual asset ID resolution matches canonical convention", () => {
    const parsed = parseKanjiVgSvg(SAMPLE_VALID_SVG, "065e5.svg");
    const transformed1 = transformKanjiVgSvg(parsed, "kj-custom-id");
    expect(transformed1.asset?.canonicalKanjiId).toBe("kj-custom-id");

    const transformed2 = transformKanjiVgSvg(parsed);
    expect(transformed2.asset?.canonicalKanjiId).toBe("kanji-日");
  });

  it("18. accurately identifies STROKE_COUNT_MATCH", () => {
    const comp = compareStrokeCounts("日", "kanji-日", 4, 4);
    expect(comp.status).toBe("STROKE_COUNT_MATCH");
    expect(comp.note).toBeUndefined();
  });

  it("19. accurately identifies STROKE_COUNT_DISCREPANCY (including 箸)", () => {
    const comp = compareStrokeCounts("箸", "kj-hashi", 14, 15);
    expect(comp.status).toBe("STROKE_COUNT_DISCREPANCY");
    expect(comp.note).toContain("KANJIDIC2=14 strokes vs KanjiVG=15 strokes");
  });

  it("20. validates visual assets for representative kanji", () => {
    const service = new KanjiVisualService();
    const chars = ["一", "二", "日", "本", "学", "生", "食", "行", "見", "語", "漢", "龍", "箸", "鬱"];

    for (const ch of chars) {
      const asset = service.getVisualAsset(ch);
      expect(asset).not.toBeNull();
      expect(asset?.character).toBe(ch);
      expect(asset?.strokeCount).toBeGreaterThan(0);
      expect(asset?.strokes.length).toBe(asset?.strokeCount);
      expect(asset?.viewBox).toBe("0 0 109 109");
      expect(asset?.sourceRef).toBe("upstream:kanjivg:2024-08");
    }
  });

  it("21. static stroke order diagram renderer produces valid SVG markup", () => {
    const service = new KanjiVisualService();
    const diagram = service.renderStrokeOrderDiagram("学", { size: 120 });
    expect(diagram).not.toBeNull();
    expect(diagram?.includes("<svg")).toBe(true);
    expect(diagram?.includes('viewBox="0 0 109 109"')).toBe(true);
    expect(diagram?.includes('width="120"')).toBe(true);
    expect(diagram?.includes("kvg:05b66-s1")).toBe(true);
  });

  it("22. animated stroke order SVG renderer produces valid CSS animation rules", () => {
    const service = new KanjiVisualService();
    const anim = service.renderAnimatedStrokeSvg("生", { strokeSpeedSeconds: 0.3 });
    expect(anim).not.toBeNull();
    expect(anim?.includes("@keyframes drawStroke")).toBe(true);
    expect(anim?.includes("animation-delay:")).toBe(true);
    expect(anim?.includes("kvg-stroke")).toBe(true);
  });

  it("23. mobile visual contract adherence (KanjiVisualAsset)", () => {
    const service = new KanjiVisualService();
    const asset = service.getVisualAsset("食");

    expect(asset).not.toBeNull();
    if (!asset) return;

    expect(typeof asset.character).toBe("string");
    expect(typeof asset.canonicalKanjiId).toBe("string");
    expect(typeof asset.sourceRef).toBe("string");
    expect(typeof asset.viewBox).toBe("string");
    expect(typeof asset.strokeCount).toBe("number");
    expect(Array.isArray(asset.strokes)).toBe(true);
    expect(Array.isArray(asset.components)).toBe(true);
    expect(typeof asset.version).toBe("string");
  });

  it("24. two dry-run passes produce identical output digests (strict idempotency)", async () => {
    const [run1, run2] = await Promise.all([
      executeSingleKanjiVgDryRun(1),
      executeSingleKanjiVgDryRun(2),
    ]);

    expect(run1.totalFiles).toBe(11658);
    expect(run2.totalFiles).toBe(11658);
    expect(run1.validAssets).toBe(11658);
    expect(run1.validAssets).toBe(run2.validAssets);
    expect(run1.digest).toBe(run2.digest);
    expect(run1.digest).toBe("f3e937f093b4f1ea55da22ac5b3e61d333b193c0775eb195fed2121d9300fade");
  }, 45000);

  it("25. verifies zero database mutations during visual operations", async () => {
    const [kanjiRow] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(kanjiEntries);
    const [dictRow] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(dictionaryEntries);

    expect(kanjiRow.count).toBe(13108);
    expect(dictRow.count).toBe(206747);
  });
});
