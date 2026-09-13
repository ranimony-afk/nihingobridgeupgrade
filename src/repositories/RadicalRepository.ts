/**
 * Canonical persistence boundary for radicals and kanji↔component relationships.
 *
 * The only Radical* module that imports Drizzle/database tables.
 */

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  etlImportRuns,
  kanjiCharacters,
  kanjiComponents,
  kanjiMeanings,
  radicals,
} from "@/db/schema";

export type RadicalRecord = {
  id: number;
  number: number;
  character: string;
  variants: unknown;
  strokeCount: number;
  meaning: string;
  reading: string;
  importRunId: number | null;
};

export type RadicalCountRecord = RadicalRecord & {
  kanjiCount: number;
  componentCount: number;
};

export type RadicalKanjiRecord = {
  id: number;
  literal: string;
  strokeCount: number | null;
  grade: number | null;
  frequencyRank: number | null;
};

export type ComponentOptionRecord = {
  component: string;
  radicalNumber: number | null;
  strokeCount: number | null;
  meaning: string;
  kanjiCount: number;
};

export class RadicalRepository {
  /**
   * All 214 radicals with corpus usage counts.
   *
   * Counts are computed with correlated subqueries using fully-qualified
   * references: Drizzle renders `${table.column}` unqualified inside a SELECT
   * list, where an inner table's own column would shadow it.
   */
  async listWithCounts(): Promise<RadicalCountRecord[]> {
    return db
      .select({
        id: radicals.id,
        number: radicals.number,
        character: radicals.character,
        variants: radicals.variants,
        strokeCount: radicals.strokeCount,
        meaning: radicals.meaning,
        reading: radicals.reading,
        importRunId: radicals.importRunId,
        kanjiCount: sql<number>`(
          select count(*) from "kanji_characters" kc
          where kc."radical_classical" = "radicals"."number"
            and kc."source" = 'kanjidic2'
        )`,
        componentCount: sql<number>`(
          select count(distinct kcomp."kanji_id") from "kanji_components" kcomp
          where kcomp."radical_id" = "radicals"."id"
        )`,
      })
      .from(radicals)
      .orderBy(asc(radicals.strokeCount), asc(radicals.number));
  }

  async findByNumber(number: number): Promise<RadicalRecord | null> {
    const [record] = await db
      .select({
        id: radicals.id,
        number: radicals.number,
        character: radicals.character,
        variants: radicals.variants,
        strokeCount: radicals.strokeCount,
        meaning: radicals.meaning,
        reading: radicals.reading,
        importRunId: radicals.importRunId,
      })
      .from(radicals)
      .where(eq(radicals.number, number))
      .limit(1);
    return record ?? null;
  }

  /** Kanji whose classifying (Kangxi) radical is this number. */
  async findKanjiByRadicalNumber(
    number: number,
    limit: number,
  ): Promise<RadicalKanjiRecord[]> {
    return db
      .select({
        id: kanjiCharacters.id,
        literal: kanjiCharacters.literal,
        strokeCount: kanjiCharacters.strokeCount,
        grade: kanjiCharacters.grade,
        frequencyRank: kanjiCharacters.frequencyRank,
      })
      .from(kanjiCharacters)
      .where(
        and(
          eq(kanjiCharacters.source, "kanjidic2"),
          eq(kanjiCharacters.radicalClassical, number),
        ),
      )
      .orderBy(asc(kanjiCharacters.frequencyRank), asc(kanjiCharacters.literal))
      .limit(limit);
  }

  /** Kanji that contain this radical as one of their components. */
  async findKanjiByRadicalComponent(
    radicalId: number,
    limit: number,
  ): Promise<RadicalKanjiRecord[]> {
    return db
      .select({
        id: kanjiCharacters.id,
        literal: kanjiCharacters.literal,
        strokeCount: kanjiCharacters.strokeCount,
        grade: kanjiCharacters.grade,
        frequencyRank: kanjiCharacters.frequencyRank,
      })
      .from(kanjiComponents)
      .innerJoin(kanjiCharacters, eq(kanjiCharacters.id, kanjiComponents.kanjiId))
      .where(eq(kanjiComponents.radicalId, radicalId))
      .orderBy(asc(kanjiCharacters.frequencyRank), asc(kanjiCharacters.literal))
      .limit(limit);
  }

  /**
   * Kanji containing EVERY supplied component (AND semantics).
   *
   * This is the classic multi-radical lookup: group by kanji and require the
   * count of matched distinct components to equal the number requested.
   */
  async findKanjiByAllComponents(
    components: string[],
    limit: number,
  ): Promise<RadicalKanjiRecord[]> {
    if (components.length === 0) return [];

    const rows = await db
      .select({
        id: kanjiCharacters.id,
        literal: kanjiCharacters.literal,
        strokeCount: kanjiCharacters.strokeCount,
        grade: kanjiCharacters.grade,
        frequencyRank: kanjiCharacters.frequencyRank,
      })
      .from(kanjiComponents)
      .innerJoin(kanjiCharacters, eq(kanjiCharacters.id, kanjiComponents.kanjiId))
      .where(inArray(kanjiComponents.component, components))
      .groupBy(
        kanjiCharacters.id,
        kanjiCharacters.literal,
        kanjiCharacters.strokeCount,
        kanjiCharacters.grade,
        kanjiCharacters.frequencyRank,
      )
      .having(
        sql`count(distinct ${kanjiComponents.component}) = ${components.length}`,
      )
      .orderBy(asc(kanjiCharacters.frequencyRank), asc(kanjiCharacters.literal))
      .limit(limit);

    return rows;
  }

  /** Components present in the corpus, with usage counts, for a picker UI. */
  async listComponentOptions(): Promise<ComponentOptionRecord[]> {
    return db
      .select({
        component: kanjiComponents.component,
        radicalNumber: sql<number | null>`max("radicals"."number")`,
        strokeCount: sql<number | null>`max("radicals"."stroke_count")`,
        meaning: sql<string>`coalesce(max("radicals"."meaning"), '')`,
        kanjiCount: sql<number>`count(distinct ${kanjiComponents.kanjiId})`,
      })
      .from(kanjiComponents)
      .leftJoin(radicals, eq(radicals.id, kanjiComponents.radicalId))
      .groupBy(kanjiComponents.component)
      .orderBy(desc(sql`count(distinct ${kanjiComponents.kanjiId})`), asc(kanjiComponents.component));
  }

  /** Components of a single kanji, resolved against the radical table. */
  async findComponentsForKanji(kanjiId: number) {
    return db
      .select({
        component: kanjiComponents.component,
        position: kanjiComponents.position,
        radicalNumber: radicals.number,
        radicalMeaning: radicals.meaning,
      })
      .from(kanjiComponents)
      .leftJoin(radicals, eq(radicals.id, kanjiComponents.radicalId))
      .where(eq(kanjiComponents.kanjiId, kanjiId))
      .orderBy(asc(kanjiComponents.position));
  }

  async findEnglishMeanings(kanjiIds: number[]): Promise<Map<number, string[]>> {
    if (kanjiIds.length === 0) return new Map();
    const rows = await db
      .select({
        kanjiId: kanjiMeanings.kanjiId,
        value: kanjiMeanings.value,
      })
      .from(kanjiMeanings)
      .where(and(inArray(kanjiMeanings.kanjiId, kanjiIds), eq(kanjiMeanings.language, "en")))
      .orderBy(asc(kanjiMeanings.kanjiId), asc(kanjiMeanings.position));

    const byKanji = new Map<number, string[]>();
    for (const row of rows) {
      const current = byKanji.get(row.kanjiId) ?? [];
      current.push(row.value);
      byKanji.set(row.kanjiId, current);
    }
    return byKanji;
  }

  async findImportRun(id: number) {
    const [run] = await db
      .select({
        source: etlImportRuns.source,
        license: etlImportRuns.license,
        attribution: etlImportRuns.attribution,
      })
      .from(etlImportRuns)
      .where(eq(etlImportRuns.id, id))
      .limit(1);
    return run ?? null;
  }
}
