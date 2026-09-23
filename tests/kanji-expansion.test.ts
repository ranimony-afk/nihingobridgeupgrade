import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/db";
import { kanjiEntries, kanjiRadicals, kanjiComposition } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  runKanjiETLPipeline,
  validateAndTransformKanjiData,
  PILOT_KANJI_ENTRIES,
  PILOT_RADICALS,
} from "@/etl/kanji";
import { KnowledgeService } from "@/services/knowledge/knowledgeService";

describe("Phase 6: Kanji Knowledge Expansion ETL", () => {
  beforeAll(async () => {
    // Ensure baseline is seeded first
    await KnowledgeService.ensureSeeded();
  });

  it("should validate and transform pilot kanji entries without error", () => {
    const transformed = validateAndTransformKanjiData(PILOT_KANJI_ENTRIES, PILOT_RADICALS);
    expect(transformed.kanji.length).toBe(12);
    expect(transformed.radicals.length).toBeGreaterThanOrEqual(5);
    expect(transformed.compositions.length).toBeGreaterThanOrEqual(12);

    // Validate multi-readings & vocabulary structures
    const road = transformed.kanji.find((k) => k.character === "道");
    expect(road).toBeDefined();
    expect(road?.readingsKun).toContain("みち");
    expect(road?.readingsOn).toContain("ドウ");
    expect(road?.vocabulary.length).toBeGreaterThan(0);
    expect(road?.strokeCount).toBe(12);
    expect(road?.jlptLevel).toBe("N5");
  });

  it("should perform dry-run successfully without altering database", async () => {
    const [kanjiCountBefore] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(kanjiEntries);
    const [radicalsCountBefore] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(kanjiRadicals);

    const dryRunResult = await runKanjiETLPipeline({ dryRun: true });
    expect(dryRunResult.kanjiProcessed).toBe(12);
    expect(dryRunResult.kanjiInserted).toBe(0);

    const [kanjiCountAfter] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(kanjiEntries);
    const [radicalsCountAfter] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(kanjiRadicals);

    expect(kanjiCountAfter.count).toBe(kanjiCountBefore.count);
    expect(radicalsCountAfter.count).toBe(radicalsCountBefore.count);
  });

  it("should run pilot ETL, inserting new entries while preserving existing records", async () => {
    const [kanjiCountBefore] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(kanjiEntries);
    const [radicalsCountBefore] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(kanjiRadicals);
    const [compCountBefore] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(kanjiComposition);

    expect(kanjiCountBefore.count).toBeGreaterThanOrEqual(33);
    expect(radicalsCountBefore.count).toBeGreaterThanOrEqual(55);
    expect(compCountBefore.count).toBeGreaterThanOrEqual(71);

    const runResult = await runKanjiETLPipeline();
    expect(runResult.kanjiInserted).toBe(12);
    expect(runResult.errors.length).toBe(0);

    // Verify baseline records are still intact
    const baselineKanji = await db
      .select()
      .from(kanjiEntries)
      .where(eq(kanjiEntries.character, "明"));
    expect(baselineKanji.length).toBe(1);
    expect(baselineKanji[0].meaning).toBe("bright, clear");

    // Verify newly inserted kanji with relationships
    const road = await db
      .select()
      .from(kanjiEntries)
      .where(eq(kanjiEntries.character, "道"));
    expect(road.length).toBe(1);
    expect(road[0].strokeCount).toBe(12);
    expect(road[0].jlptLevel).toBe("N5");

    // Check composition edges for 道
    const roadComp = await db
      .select()
      .from(kanjiComposition)
      .where(eq(kanjiComposition.kanjiId, "kanji-road"));
    expect(roadComp.length).toBe(2);

    // Verify total counts expanded properly
    const [kanjiCountAfter] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(kanjiEntries);
    expect(kanjiCountAfter.count).toBe(kanjiCountBefore.count + 12);
  });

  it("should be completely idempotent when re-run", async () => {
    const rerunResult = await runKanjiETLPipeline();
    expect(rerunResult.kanjiInserted).toBe(0);
    expect(rerunResult.kanjiSkipped).toBe(12);
    expect(rerunResult.radicalsInserted).toBe(0);
    expect(rerunResult.compositionInserted).toBe(0);
    expect(rerunResult.errors.length).toBe(0);
  });

  it("should integrate with KnowledgeService queries seamlessly", async () => {
    // KnowledgeService.getKanjiDetail
    const details = await KnowledgeService.getKanjiDetail("道");
    expect(details).not.toBeNull();
    expect(details?.kanji.character).toBe("道");
    expect(details?.profile.length).toBeGreaterThanOrEqual(1);

    // KnowledgeService.listKanji with JLPT filter
    const { kanji: n5List } = await KnowledgeService.listKanji({ level: "N5" });
    const containsRoad = n5List.some((k) => k.character === "道");
    expect(containsRoad).toBe(true);
  });
});
