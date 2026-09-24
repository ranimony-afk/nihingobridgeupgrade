/**
 * Phase 14.4C: Controlled KANJIDIC2 Canonical Ingestion Test Suite.
 *
 * Verifies all 20 invariants and operational requirements:
 * 1. Pre-ingestion safety audit passes (loopback 127.0.0.1, reject remote hosts)
 * 2. Provenance source upstream:kanjidic2:2023-08 verified in registry
 * 3. Database contains exactly 13,108 kanji records
 * 4. 45 baseline first-party records preserved exactly with their original IDs and sourceRefs
 * 5. Conflict record 箸 preserved with 14 strokes and first-party:kanji-mindtree:v1
 * 6. New KANJIDIC2 records follow kanji-${character} ID convention
 * 7. Zero duplicate characters across entire 13,108 kanji corpus
 * 8. Zero duplicate primary key IDs across entire 13,108 kanji corpus
 * 9. Zero null values in required columns
 * 10. All JLPT levels are valid (N5, N4, N3, N2, N1, NONE)
 * 11. All stroke counts are positive integers (>= 1)
 * 12. Dictionary entries table has 0 unexpected mutations (exactly 206,747 rows)
 * 13. Ingestion idempotency: re-running ingestion inserts 0 new rows and mutates 0 existing rows
 * 14. Read-back of core kanji (日, 本, 学, 生, 行) via KanjiReadingService
 * 15. Read-back of baseline kanji (明, 見, 箸) via KanjiReadingService
 * 16. Read-back of complex/rare kanji (龍, 鬱, 龖) via KanjiReadingService
 * 17. Detail contract returns complete expected shape matching Step 8
 * 18. Okurigana notation is preserved in readingsKun (e.g. た.べる, まな.ぶ)
 * 19. Normalized Kun readings available without punctuation (e.g. たべる, まなぶ)
 * 20. Compounds linked via dictionary_entries.kanji_characters without duplicating dictionary rows
 */

import { describe, it, expect } from "vitest";
import { db } from "@/db";
import { kanjiEntries, dictionaryEntries } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { AUTHORITATIVE_SOURCE_REGISTRY } from "@/services/knowledge/provenance";
import { KanjiReadingService } from "@/services/knowledge/kanjiReadingService";
import { assertSafeDatabaseUrl, executeKanjidicIngestion } from "../scripts/ingest-kanjidic2";

describe("Phase 14.4C: Controlled KANJIDIC2 Canonical Ingestion", () => {
  it("1. validates local PostgreSQL safety (127.0.0.1 loopback only)", () => {
    const dbUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/app_db";
    const res = assertSafeDatabaseUrl(dbUrl);
    expect(res.host).toBe("127.0.0.1");

    // Must reject forbidden hosts
    expect(() => assertSafeDatabaseUrl("postgresql://user:pass@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres")).toThrow();
    expect(() => assertSafeDatabaseUrl("postgresql://user:pass@ep-cool-fog-123.us-east-2.aws.neon.tech/neondb")).toThrow();
  });

  it("2. verifies upstream:kanjidic2:2023-08 provenance registration", () => {
    const prov = AUTHORITATIVE_SOURCE_REGISTRY["upstream:kanjidic2:2023-08"];
    expect(prov).toBeDefined();
    expect(prov.id).toBe("upstream:kanjidic2:2023-08");
    expect(prov.type).toBe("upstream");
    expect(prov.version).toBe("2023-08");
    expect(prov.releaseDate).toBe("2023-08-20");
    expect(prov.license).toBe("CC-BY-SA-3.0");
    expect(prov.status).toBe("active");
  });

  it("3. verifies database contains exactly 13,108 kanji records", async () => {
    const [row] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(kanjiEntries);
    expect(row.count).toBe(13108);
  });

  it("4. verifies 45 baseline first-party records are preserved with original IDs and provenance", async () => {
    const fpRows = await db
      .select({
        id: kanjiEntries.id,
        character: kanjiEntries.character,
        sourceRef: kanjiEntries.sourceRef,
      })
      .from(kanjiEntries)
      .where(sql`${kanjiEntries.sourceRef} LIKE 'first-party:%'`);

    expect(fpRows.length).toBe(45);

    const mei = fpRows.find((r) => r.character === "明");
    expect(mei).toBeDefined();
    expect(mei?.id).toBe("kj-mei");
    expect(mei?.sourceRef).toBe("first-party:kanji-mindtree:v1");

    const road = fpRows.find((r) => r.character === "道");
    expect(road).toBeDefined();
    expect(road?.id).toBe("kanji-road");
    expect(road?.sourceRef).toBe("first-party:kanji-corpus:v1");
  });

  it("5. verifies conflict record '箸' is preserved with 14 strokes and baseline provenance", async () => {
    const [hashi] = await db
      .select()
      .from(kanjiEntries)
      .where(eq(kanjiEntries.character, "箸"))
      .limit(1);

    expect(hashi).toBeDefined();
    expect(hashi.id).toBe("kj-hashi");
    expect(hashi.strokeCount).toBe(14); // Baseline preserved, not overwritten by 15 from KANJIDIC2
    expect(hashi.sourceRef).toBe("first-party:kanji-mindtree:v1");
  });

  it("6. verifies new KANJIDIC2 records follow 'kanji-${character}' ID convention", async () => {
    const sample = await db
      .select({ id: kanjiEntries.id, character: kanjiEntries.character })
      .from(kanjiEntries)
      .where(eq(kanjiEntries.sourceRef, "upstream:kanjidic2:2023-08"))
      .limit(10);

    expect(sample.length).toBe(10);
    for (const s of sample) {
      expect(s.id).toBe(`kanji-${s.character}`);
    }
  });

  it("7. verifies zero duplicate characters across all 13,108 kanji records", async () => {
    const dupChars = await db
      .select({
        character: kanjiEntries.character,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(kanjiEntries)
      .groupBy(kanjiEntries.character)
      .having(sql`count(*) > 1`);

    expect(dupChars.length).toBe(0);
  });

  it("8. verifies zero duplicate primary key IDs across all 13,108 kanji records", async () => {
    const dupIds = await db
      .select({
        id: kanjiEntries.id,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(kanjiEntries)
      .groupBy(kanjiEntries.id)
      .having(sql`count(*) > 1`);

    expect(dupIds.length).toBe(0);
  });

  it("9. verifies zero null values in required kanji_entries columns", async () => {
    const [nullRow] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(kanjiEntries)
      .where(
        sql`${kanjiEntries.id} IS NULL OR ${kanjiEntries.character} IS NULL OR ${kanjiEntries.meaning} IS NULL OR ${kanjiEntries.readingsKun} IS NULL OR ${kanjiEntries.readingsOn} IS NULL OR ${kanjiEntries.strokeCount} IS NULL OR ${kanjiEntries.jlptLevel} IS NULL OR ${kanjiEntries.sourceRef} IS NULL`
      );

    expect(nullRow.count).toBe(0);
  });

  it("10. verifies all JLPT levels are strictly valid (N5, N4, N3, N2, N1, NONE)", async () => {
    const [invalidJlpt] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(kanjiEntries)
      .where(
        sql`${kanjiEntries.jlptLevel} NOT IN ('N5', 'N4', 'N3', 'N2', 'N1', 'NONE')`
      );

    expect(invalidJlpt.count).toBe(0);
  });

  it("11. verifies all stroke counts are positive integers (>= 1)", async () => {
    const [invalidStrokes] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(kanjiEntries)
      .where(sql`${kanjiEntries.strokeCount} < 1`);

    expect(invalidStrokes.count).toBe(0);
  });

  it("12. verifies dictionary entries table has 0 unexpected mutations (exactly 206,747 rows)", async () => {
    const [dictCount] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(dictionaryEntries);

    expect(dictCount.count).toBe(206747);
  });

  it("13. verifies ingestion idempotency: repeated run produces 0 inserts and 0 drift", async () => {
    const rerun = await executeKanjidicIngestion(2);
    expect(rerun.insertedCount).toBe(0);
    expect(rerun.unexpectedUpdatesCount).toBe(0);
    expect(rerun.duplicatesCount).toBe(0);
    expect(rerun.driftCount).toBe(0);
    expect(rerun.totalKanjiInDb).toBe(13108);
  });

  it("14. verifies application read-back for newly ingested core kanji (日, 本, 学, 生, 行)", async () => {
    const service = new KanjiReadingService();
    const chars = ["日", "本", "学", "生", "行"];

    for (const ch of chars) {
      const detail = await service.getKanjiDetail(ch);
      expect(detail).not.toBeNull();
      expect(detail?.character).toBe(ch);
      expect(detail?.id).toBe(`kanji-${ch}`);
      expect(detail?.unicode.startsWith("U+")).toBe(true);
      expect(detail?.strokeCount).toBeGreaterThan(0);
      expect(detail?.provenance.sourceRef).toBe("upstream:kanjidic2:2023-08");
      expect(detail?.compounds.length).toBeGreaterThan(0);
    }
  });

  it("15. verifies application read-back for baseline canonical kanji (明, 見, 箸)", async () => {
    const service = new KanjiReadingService();

    const mei = await service.getKanjiDetail("明");
    expect(mei).not.toBeNull();
    expect(mei?.id).toBe("kj-mei");
    expect(mei?.strokeCount).toBe(8);
    expect(mei?.provenance.sourceRef).toBe("first-party:kanji-mindtree:v1");

    const miru = await service.getKanjiDetail("見");
    expect(miru).not.toBeNull();
    expect(miru?.id).toBe("kj-miru");
    expect(miru?.strokeCount).toBe(7);

    const hashi = await service.getKanjiDetail("箸");
    expect(hashi).not.toBeNull();
    expect(hashi?.id).toBe("kj-hashi");
    expect(hashi?.strokeCount).toBe(14); // Preserves canonical 14
  });

  it("16. verifies read-back for complex/rare kanji (龍, 鬱, 龖)", async () => {
    const service = new KanjiReadingService();

    const ryu = await service.getKanjiDetail("龍");
    expect(ryu).not.toBeNull();
    expect(ryu?.strokeCount).toBe(16);

    const utsu = await service.getKanjiDetail("鬱");
    expect(utsu).not.toBeNull();
    expect(utsu?.strokeCount).toBe(29);

    const doubleDragon = await service.getKanjiDetail("龖");
    expect(doubleDragon).not.toBeNull();
    expect(doubleDragon?.strokeCount).toBe(32);
    expect(doubleDragon?.unicode).toBe("U+9F96");
  });

  it("17. verifies detail contract returns complete expected shape matching Step 8", async () => {
    const service = new KanjiReadingService();
    const detail = await service.getKanjiDetail("学");

    expect(detail).not.toBeNull();
    if (!detail) return;

    expect(detail.character).toBe("学");
    expect(detail.unicode).toBe("U+5B66");
    expect(detail.codepoint).toBe("5b66");
    expect(detail.strokeCount).toBe(8);
    expect(Array.isArray(detail.strokeCountAlternatives)).toBe(true);
    expect(detail.grade).toBe(1);
    expect(detail.jlpt).toBe("N5");
    expect(Array.isArray(detail.onyomi)).toBe(true);
    expect(Array.isArray(detail.kunyomi)).toBe(true);
    expect(Array.isArray(detail.nanori)).toBe(true);
    expect(Array.isArray(detail.specialReadings)).toBe(true);
    expect(Array.isArray(detail.meanings)).toBe(true);
    expect(Array.isArray(detail.radicals)).toBe(true);
    expect(Array.isArray(detail.components)).toBe(true);
    expect(Array.isArray(detail.compounds)).toBe(true);
    expect(detail.provenance.sourceRef).toBe("upstream:kanjidic2:2023-08");
    expect(detail.provenance.verified).toBe(true);
  });

  it("18. preserves okurigana notation '.' in Kun'yomi readings", async () => {
    const service = new KanjiReadingService();
    const kunReadings = await service.getKunReadings("食");

    // KANJIDIC2 Kun'yomi for 食 contains okurigana: た.べる, く.う, く.らう
    expect(kunReadings.some((r) => r.includes("."))).toBe(true);
    expect(kunReadings).toContain("た.べる");
  });

  it("19. provides normalized Kun readings without okurigana delimiter", async () => {
    const service = new KanjiReadingService();
    const detail = await service.getKanjiDetail("食");

    expect(detail?.readings.kunNormalized).toContain("たべる");
    expect(detail?.readings.kunNormalized).toContain("くう");
    expect(detail?.readings.kunNormalized).toContain("くらう");
  });

  it("20. links compounds deterministically via dictionary_entries without duplicating entries", async () => {
    const service = new KanjiReadingService();
    const detail = await service.getKanjiDetail("日");

    expect(detail?.compounds.length).toBeGreaterThan(0);
    const compound = detail?.compounds[0];
    expect(compound).toBeDefined();
    expect(compound?.word).toBeDefined();
    expect(compound?.reading).toBeDefined();
    expect(compound?.meaning).toBeDefined();
  });
});
