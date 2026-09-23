/**
 * KANJIDIC2 ETL Foundation & Dry-Run Test Suite — Phase 14.4B.
 *
 * Deterministic test suite covering all 25 architectural and operational invariants:
 * 1. Provenance registration verified
 * 2. Acquisition manifest matches verified release
 * 3. File size and SHA256 integrity match exactly
 * 4. Streaming parser parses valid character block
 * 5. Parser handles missing optional fields gracefully
 * 6. Parser extracts multiple stroke counts correctly
 * 7. Parser handles variant codepoints
 * 8. Unicode codepoint derivation is accurate
 * 9. Classical radical mapping works for standard radicals
 * 10. Nelson radical mapping is preserved when present
 * 11. Grade level is extracted (1-8, 9, 10, or null)
 * 12. JLPT level correctly mapped from old JLPT representation
 * 13. Frequency rank preserved when present
 * 14. Kun'yomi reading with okurigana delimiter '.' preserved
 * 15. Kun'yomi normalized form strips okurigana delimiter correctly
 * 16. On'yomi readings extracted and separated from Kun'yomi
 * 17. Nanori readings preserved distinctly
 * 18. Non-English meanings ignored for primary English definition
 * 19. Deterministic ID generation matches convention
 * 20. Existing kanji baseline records are not overwritten
 * 21. Full dry-run execution completes with valid record count
 * 22. Two dry-run passes produce identical output digests (idempotency)
 * 23. Peak memory remains strictly bounded under threshold
 * 24. JMdict candidate matching finds correct compounds deterministically
 * 25. Detail contract returns complete expected shape
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, createReadStream } from "fs";
import { resolve } from "path";
import { createHash } from "crypto";
import { Readable } from "stream";
import { db } from "@/db";
import { kanjiEntries, dictionaryEntries } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { AUTHORITATIVE_SOURCE_REGISTRY } from "@/services/knowledge/provenance";
import {
  parseKanjidicCharacterXml,
  streamKanjidicCharacters,
} from "@/etl/kanji/xmlParser";
import {
  transformKanjidicCharacter,
  normalizeKunReading,
  extractUnicodeCodepoints,
  generateKanjiId,
  mapOldJlptToModern,
} from "@/etl/kanji/transformer";
import { KanjiReadingService } from "@/services/knowledge/kanjiReadingService";
import {
  prepareKanjiJmdictLinkage,
  classifyCompoundReading,
  type CandidateDictionaryEntry,
} from "@/services/knowledge/kanjiJmdictLinkage";
import { executeSingleDryRun } from "../scripts/dry-run-kanjidic2";

const SAMPLE_CHARACTER_XML = `
<character>
<literal>亜</literal>
<codepoint>
<cp_value cp_type="ucs">4e9c</cp_value>
<cp_value cp_type="jis208">16-01</cp_value>
</codepoint>
<radical>
<rad_value rad_type="classical">7</rad_value>
<rad_value rad_type="nelson_c">1</rad_value>
</radical>
<misc>
<grade>8</grade>
<stroke_count>7</stroke_count>
<stroke_count>8</stroke_count>
<variant var_type="jis208">48-19</variant>
<freq>1509</freq>
<rad_name>つちへん</rad_name>
<jlpt>1</jlpt>
</misc>
<dic_number>
<dic_ref dr_type="nelson_c">43</dic_ref>
</dic_number>
<query_code>
<q_code qc_type="skip">4-7-1</q_code>
</query_code>
<reading_meaning>
<rmgroup>
<reading r_type="pinyin">ya4</reading>
<reading r_type="ja_on">ア</reading>
<reading r_type="ja_kun">つ.ぐ</reading>
<meaning>Asia</meaning>
<meaning>rank next</meaning>
<meaning m_lang="fr">Asie</meaning>
<meaning m_lang="es">Asia</meaning>
</rmgroup>
<nanori>や</nanori>
<nanori>つぎ</nanori>
</reading_meaning>
</character>
`;

describe("Phase 14.4B: KANJIDIC2 ETL Foundation & Dry-Run Invariants", () => {
  it("1. should have upstream:kanjidic2:2023-08 registered in provenance registry", () => {
    const entry = AUTHORITATIVE_SOURCE_REGISTRY["upstream:kanjidic2:2023-08"];
    expect(entry).toBeDefined();
    expect(entry.id).toBe("upstream:kanjidic2:2023-08");
    expect(entry.type).toBe("upstream");
    expect(entry.domain).toBe("kanji");
    expect(entry.version).toBe("2023-08");
    expect(entry.releaseDate).toBe("2023-08-20");
    expect(entry.license).toBe("CC-BY-SA-3.0");
    expect(entry.status).toBe("active");
  });

  it("2. should have valid acquisition manifest matching verified release", () => {
    const manifestPath = resolve(
      process.cwd(),
      "reports/gates/PHASE-14.4B-KANJIDIC2-ACQUISITION-MANIFEST.json"
    );
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    expect(manifest.source).toBe("upstream:kanjidic2:2023-08");
    expect(manifest.version).toBe("2023-08-20");
    expect(manifest.databaseVersion).toBe("2023-232");
    expect(manifest.fileVersion).toBe("4");
    expect(manifest.entryCount).toBe(13108);
    expect(manifest.SHA256).toBe(
      "260e6119fcc78cde438de7d7f8227d1c13260469d10ae36a01d866c61f7cc781"
    );
    expect(manifest.size).toBe(15643593);
  });

  it("3. should verify file size and SHA256 integrity of data/kanjidic2.xml", () => {
    const xmlPath = resolve(process.cwd(), "data/kanjidic2.xml");
    expect(existsSync(xmlPath)).toBe(true);
    const content = readFileSync(xmlPath);
    expect(content.length).toBe(15643593);
    const hash = createHash("sha256").update(content).digest("hex");
    expect(hash).toBe(
      "260e6119fcc78cde438de7d7f8227d1c13260469d10ae36a01d866c61f7cc781"
    );
  });

  it("4. streaming parser parses valid character block with all fields", () => {
    const parsed = parseKanjidicCharacterXml(SAMPLE_CHARACTER_XML);
    expect(parsed.literal).toBe("亜");
    expect(parsed.codepoints.some((cp) => cp.type === "ucs" && cp.value === "4e9c")).toBe(true);
    expect(parsed.radicals.some((r) => r.type === "classical" && r.value === 7)).toBe(true);
    expect(parsed.grade).toBe(8);
    expect(parsed.strokeCounts).toEqual([7, 8]);
    expect(parsed.frequency).toBe(1509);
    expect(parsed.jlptOld).toBe(1);
    expect(parsed.readings.some((r) => r.type === "ja_on" && r.value === "ア")).toBe(true);
    expect(parsed.readings.some((r) => r.type === "ja_kun" && r.value === "つ.ぐ")).toBe(true);
    expect(parsed.nanori).toContain("や");
    expect(parsed.nanori).toContain("つぎ");
    expect(parsed.meanings.some((m) => m.lang === "en" && m.text === "Asia")).toBe(true);
  });

  it("5. parser handles missing optional fields gracefully without throwing", () => {
    const minimalXml = `<character><literal>〇</literal><codepoint><cp_value cp_type="ucs">3007</cp_value></codepoint><radical><rad_value rad_type="classical">1</rad_value></radical><misc><stroke_count>1</stroke_count></misc></character>`;
    const parsed = parseKanjidicCharacterXml(minimalXml);
    expect(parsed.literal).toBe("〇");
    expect(parsed.strokeCounts).toEqual([1]);
    expect(parsed.grade).toBeNull();
    expect(parsed.frequency).toBeNull();
    expect(parsed.jlptOld).toBeNull();
    expect(parsed.readings).toEqual([]);
    expect(parsed.meanings).toEqual([]);
    expect(parsed.nanori).toEqual([]);
  });

  it("6. parser extracts multiple stroke counts correctly", () => {
    const parsed = parseKanjidicCharacterXml(SAMPLE_CHARACTER_XML);
    expect(parsed.strokeCounts.length).toBe(2);
    expect(parsed.strokeCounts[0]).toBe(7);
    expect(parsed.strokeCounts[1]).toBe(8);

    const transformed = transformKanjidicCharacter(parsed);
    expect(transformed.record?.strokeCount).toBe(7);
    expect(transformed.record?.additionalStrokeCounts).toEqual([8]);
  });

  it("7. parser extracts variant codepoints correctly", () => {
    const parsed = parseKanjidicCharacterXml(SAMPLE_CHARACTER_XML);
    expect(parsed.variants.length).toBeGreaterThan(0);
    expect(parsed.variants[0].type).toBe("jis208");
    expect(parsed.variants[0].value).toBe("48-19");
  });

  it("8. unicode codepoint derivation produces accurate hex and U+XXXX representation", () => {
    const res1 = extractUnicodeCodepoints("亜", "4e9c");
    expect(res1.hexCodepoint).toBe("4e9c");
    expect(res1.unicode).toBe("U+4E9C");

    const res2 = extractUnicodeCodepoints("学");
    expect(res2.hexCodepoint).toBe("5b66");
    expect(res2.unicode).toBe("U+5B66");
  });

  it("9. classical radical mapping works for standard radicals", () => {
    const parsed = parseKanjidicCharacterXml(SAMPLE_CHARACTER_XML);
    const transformed = transformKanjidicCharacter(parsed);
    expect(transformed.record?.classicalRadical).toBe(7);
  });

  it("10. nelson radical mapping is preserved when present", () => {
    const parsed = parseKanjidicCharacterXml(SAMPLE_CHARACTER_XML);
    const transformed = transformKanjidicCharacter(parsed);
    expect(transformed.record?.nelsonRadical).toBe(1);
  });

  it("11. grade level is extracted accurately (1-8, 9, 10, or null)", () => {
    const parsed = parseKanjidicCharacterXml(SAMPLE_CHARACTER_XML);
    const transformed = transformKanjidicCharacter(parsed);
    expect(transformed.record?.gradeLevel).toBe(8);

    const minimal = parseKanjidicCharacterXml(`<character><literal>〇</literal><codepoint><cp_value cp_type="ucs">3007</cp_value></codepoint><radical><rad_value rad_type="classical">1</rad_value></radical><misc><stroke_count>1</stroke_count></misc></character>`);
    const transMin = transformKanjidicCharacter(minimal);
    expect(transMin.record?.gradeLevel).toBeNull();
  });

  it("12. JLPT level correctly mapped from old JLPT representation", () => {
    expect(mapOldJlptToModern(4)).toBe("N5");
    expect(mapOldJlptToModern(3)).toBe("N4");
    expect(mapOldJlptToModern(2)).toBe("N2");
    expect(mapOldJlptToModern(1)).toBe("N1");
    expect(mapOldJlptToModern(null)).toBe("NONE");
  });

  it("13. frequency rank preserved when present", () => {
    const parsed = parseKanjidicCharacterXml(SAMPLE_CHARACTER_XML);
    const transformed = transformKanjidicCharacter(parsed);
    expect(transformed.record?.frequencyRank).toBe(1509);
  });

  it("14. Kun'yomi reading preserves okurigana delimiter '.' exactly", () => {
    const parsed = parseKanjidicCharacterXml(SAMPLE_CHARACTER_XML);
    const transformed = transformKanjidicCharacter(parsed);
    expect(transformed.record?.readingsKun).toContain("つ.ぐ");
  });

  it("15. Kun'yomi normalized form strips okurigana delimiter correctly", () => {
    expect(normalizeKunReading("つ.ぐ")).toBe("つぐ");
    expect(normalizeKunReading("た.べる")).toBe("たべる");
    expect(normalizeKunReading("-づ.く")).toBe("づく");
    expect(normalizeKunReading("お.える")).toBe("おえる");
  });

  it("16. On'yomi readings are extracted and separated from Kun'yomi", () => {
    const parsed = parseKanjidicCharacterXml(SAMPLE_CHARACTER_XML);
    const transformed = transformKanjidicCharacter(parsed);
    expect(transformed.record?.readingsOn).toEqual(["ア"]);
    expect(transformed.record?.readingsKun).toEqual(["つ.ぐ"]);
    expect(transformed.record?.normalizedReadingsKun).toEqual(["つぐ"]);
  });

  it("17. Nanori readings are preserved distinctly", () => {
    const parsed = parseKanjidicCharacterXml(SAMPLE_CHARACTER_XML);
    const transformed = transformKanjidicCharacter(parsed);
    expect(transformed.record?.readingsNanori).toEqual(["や", "つぎ"]);
  });

  it("18. non-English meanings are ignored for primary English definition", () => {
    const parsed = parseKanjidicCharacterXml(SAMPLE_CHARACTER_XML);
    const transformed = transformKanjidicCharacter(parsed);
    expect(transformed.record?.primaryMeaning).toBe("Asia");
    expect(transformed.record?.meanings).toEqual(["Asia", "rank next"]);
    expect(transformed.record?.meanings).not.toContain("Asie");
  });

  it("19. deterministic ID generation matches convention and existing ID preservation", () => {
    const existingMap = new Map<string, string>([
      ["明", "kj-mei"],
      ["道", "kanji-road"],
    ]);
    expect(generateKanjiId("明", existingMap)).toBe("kj-mei");
    expect(generateKanjiId("道", existingMap)).toBe("kanji-road");
    expect(generateKanjiId("亜", existingMap)).toBe("kanji-亜");
    expect(generateKanjiId("学", existingMap)).toBe("kanji-学");
  });

  it("20. existing kanji baseline records are not overwritten", async () => {
    const rows = await db
      .select({ id: kanjiEntries.id, character: kanjiEntries.character, meaning: kanjiEntries.meaning })
      .from(kanjiEntries)
      .where(eq(kanjiEntries.character, "明"));

    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe("kj-mei");
    expect(rows[0].meaning).toBe("bright, clear");
  });

  it("21. full dry-run execution completes with 13,108 valid records", async () => {
    const result = await executeSingleDryRun(1);
    expect(result.totalRecords).toBe(13108);
    expect(result.validRecords).toBe(13108);
    expect(result.rejectedRecords).toBe(0);
    expect(result.onReadingsCount).toBeGreaterThan(15000);
    expect(result.kunReadingsCount).toBeGreaterThan(10000);
  }, 30000);

  it("22. two dry-run passes produce identical output digests (strict idempotency)", async () => {
    const [run1, run2] = await Promise.all([
      executeSingleDryRun(1),
      executeSingleDryRun(2),
    ]);
    expect(run1.totalRecords).toBe(13108);
    expect(run2.totalRecords).toBe(13108);
    expect(run1.validRecords).toBe(run2.validRecords);
    expect(run1.digest).toBe(run2.digest);
    expect(run1.digest).toBe("63d0e901fb3b3cbacfddbe329ff1393011390382c3bbb8c152db2947d41ddc75");
  }, 45000);

  it("23. peak memory remains strictly bounded under threshold (< 256 MB)", async () => {
    const result = await executeSingleDryRun(1);
    expect(result.peakHeapMb).toBeLessThan(128);
    expect(result.peakRssMb).toBeLessThan(256);
  }, 30000);

  it("24. JMdict candidate matching finds correct compounds deterministically", () => {
    const candidates: CandidateDictionaryEntry[] = [
      {
        id: "de-jmdict-1342670",
        kanjiCharacters: ["食", "事"],
        reading: "しょくじ",
        senses: [{ note: null, glosses: ["meal", "dinner"] }],
      },
      {
        id: "de-jmdict-1342680",
        kanjiCharacters: ["食"],
        reading: "たべる",
        senses: [{ note: null, glosses: ["to eat"] }],
      },
    ];

    const linkages = prepareKanjiJmdictLinkage(
      "食",
      ["ショク", "ジキ"],
      ["た.べる", "く.う"],
      candidates
    );

    expect(linkages.length).toBe(2);
    const shokuji = linkages.find((l) => l.headword === "食事");
    const taberu = linkages.find((l) => l.headword === "食");

    expect(shokuji?.compoundType).toBe("ON_COMPOUND");
    expect(shokuji?.matchedReading).toBe("ショク");
    expect(taberu?.compoundType).toBe("KUN_SOLO");
    expect(taberu?.matchedReading).toBe("た.べる");
  });

  it("25. detail contract returns complete expected shape", async () => {
    const readingService = new KanjiReadingService();
    const detail = await readingService.getKanjiDetail("明");
    expect(detail).not.toBeNull();
    expect(detail?.character).toBe("明");
    expect(detail?.unicode).toBe("U+660E");
    expect(detail?.strokeCount).toBe(8);
    expect(detail?.readings.on).toBeDefined();
    expect(detail?.readings.kun).toBeDefined();
    expect(detail?.readings.kunNormalized).toBeDefined();
    expect(detail?.meanings).toContain("bright, clear");
    expect(detail?.provenance.sourceRef).toBe("first-party:kanji-mindtree:v1");
  });
});
