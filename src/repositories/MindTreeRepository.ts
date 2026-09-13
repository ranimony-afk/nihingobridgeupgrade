/**
 * Canonical persistence boundary for the Kanji Mind Tree (Phase 06.4).
 *
 * The only MindTree* module that imports Drizzle/database tables. Every query
 * below reads a real relationship table — kanji_characters, radicals,
 * kanji_components, dictionary_entries/senses, kanji_readings/meanings — so the
 * rendered tree can never drift from the database graph.
 */

import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  dictionaryEntries,
  dictionarySenses,
  etlImportRuns,
  kanjiCharacters,
  kanjiComponents,
  kanjiMeanings,
  kanjiReadings,
  radicals,
} from "@/db/schema";

export type MindTreeKanjiCore = {
  id: number;
  source: string;
  literal: string;
  importRunId: number | null;
  strokeCount: number | null;
  grade: number | null;
  frequencyRank: number | null;
  radicalClassical: number | null;
};

export type MindTreeRadicalRow = {
  id: number;
  number: number;
  character: string;
  variants: unknown;
  strokeCount: number;
  meaning: string;
  reading: string;
};

export type MindTreeComponentRow = {
  component: string;
  position: number;
  radicalNumber: number | null;
  radicalCharacter: string | null;
  radicalMeaning: string | null;
};

export type MindTreeVocabRow = {
  id: number;
  headword: string;
  primaryReading: string;
  isCommon: boolean;
  frequencyRank: number | null;
};

export type MindTreeRelatedRow = {
  id: number;
  literal: string;
  strokeCount: number | null;
  grade: number | null;
  frequencyRank: number | null;
};

const KANJI_SOURCE = "kanjidic2";

export class MindTreeRepository {
  async findKanjiCore(literal: string): Promise<MindTreeKanjiCore | null> {
    const [record] = await db
      .select({
        id: kanjiCharacters.id,
        source: kanjiCharacters.source,
        literal: kanjiCharacters.literal,
        importRunId: kanjiCharacters.importRunId,
        strokeCount: kanjiCharacters.strokeCount,
        grade: kanjiCharacters.grade,
        frequencyRank: kanjiCharacters.frequencyRank,
        radicalClassical: kanjiCharacters.radicalClassical,
      })
      .from(kanjiCharacters)
      .where(
        and(
          eq(kanjiCharacters.source, KANJI_SOURCE),
          eq(kanjiCharacters.literal, literal),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async findRadicalByNumber(number: number): Promise<MindTreeRadicalRow | null> {
    const [record] = await db
      .select({
        id: radicals.id,
        number: radicals.number,
        character: radicals.character,
        variants: radicals.variants,
        strokeCount: radicals.strokeCount,
        meaning: radicals.meaning,
        reading: radicals.reading,
      })
      .from(radicals)
      .where(eq(radicals.number, number))
      .limit(1);
    return record ?? null;
  }

  /** Components of one kanji, resolved against the radical table. */
  async findComponents(kanjiId: number): Promise<MindTreeComponentRow[]> {
    return db
      .select({
        component: kanjiComponents.component,
        position: kanjiComponents.position,
        radicalNumber: radicals.number,
        radicalCharacter: radicals.character,
        radicalMeaning: radicals.meaning,
      })
      .from(kanjiComponents)
      .leftJoin(radicals, eq(radicals.id, kanjiComponents.radicalId))
      .where(eq(kanjiComponents.kanjiId, kanjiId))
      .orderBy(asc(kanjiComponents.position), asc(kanjiComponents.component));
  }

  /** Dictionary words whose headword contains this kanji. */
  async findVocabulary(literal: string, limit: number): Promise<MindTreeVocabRow[]> {
    return db
      .select({
        id: dictionaryEntries.id,
        headword: dictionaryEntries.headword,
        primaryReading: dictionaryEntries.primaryReading,
        isCommon: dictionaryEntries.isCommon,
        frequencyRank: dictionaryEntries.frequencyRank,
      })
      .from(dictionaryEntries)
      .where(
        and(
          eq(dictionaryEntries.source, "jmdict"),
          sql`position(${literal} in ${dictionaryEntries.headword}) > 0`,
        ),
      )
      .orderBy(
        sql`${dictionaryEntries.isCommon} desc`,
        asc(dictionaryEntries.frequencyRank),
        asc(dictionaryEntries.id),
      )
      .limit(limit);
  }

  async countVocabulary(literal: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(dictionaryEntries)
      .where(
        and(
          eq(dictionaryEntries.source, "jmdict"),
          sql`position(${literal} in ${dictionaryEntries.headword}) > 0`,
        ),
      );
    return Number(row?.count ?? 0);
  }

  /** Siblings classified under the same Kangxi radical (excludes the centre). */
  async findRelatedByRadical(
    radicalNumber: number,
    excludeKanjiId: number,
    limit: number,
  ): Promise<MindTreeRelatedRow[]> {
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
          eq(kanjiCharacters.source, KANJI_SOURCE),
          eq(kanjiCharacters.radicalClassical, radicalNumber),
          ne(kanjiCharacters.id, excludeKanjiId),
        ),
      )
      .orderBy(asc(kanjiCharacters.frequencyRank), asc(kanjiCharacters.literal))
      .limit(limit);
  }

  /**
   * Kanji sharing at least one component with the centre (excludes itself),
   * ordered by shared-component count desc. The shared components are resolved
   * per candidate so the UI can explain *why* two kanji are linked.
   */
  async findRelatedByComponents(
    kanjiId: number,
    limit: number,
  ): Promise<(MindTreeRelatedRow & { sharedComponents: string[]; sharedCount: number })[]> {
    const own = await db
      .select({ component: kanjiComponents.component })
      .from(kanjiComponents)
      .where(eq(kanjiComponents.kanjiId, kanjiId));
    const ownComponents = own.map((row) => row.component);
    if (ownComponents.length === 0) return [];

    // Candidates ordered by overlap size. Fully-qualified correlation: Drizzle
    // would otherwise render an unqualified "id" in the SELECT list that the
    // inner table shadows (Phase 06.1 defect class).
    const candidates = await db
      .select({
        id: kanjiCharacters.id,
        literal: kanjiCharacters.literal,
        strokeCount: kanjiCharacters.strokeCount,
        grade: kanjiCharacters.grade,
        frequencyRank: kanjiCharacters.frequencyRank,
        sharedCount: sql<number>`(
          select count(distinct kc2."component")
          from "kanji_components" kc2
          where kc2."kanji_id" = "kanji_characters"."id"
            and kc2."component" in ${ownComponents}
        )`,
      })
      .from(kanjiCharacters)
      .where(
        and(
          eq(kanjiCharacters.source, KANJI_SOURCE),
          ne(kanjiCharacters.id, kanjiId),
          sql`exists (
            select 1 from "kanji_components" kc
            where kc."kanji_id" = "kanji_characters"."id"
              and kc."component" in ${ownComponents}
          )`,
        ),
      )
      .orderBy(
        sql`(
          select count(distinct kc2."component")
          from "kanji_components" kc2
          where kc2."kanji_id" = "kanji_characters"."id"
            and kc2."component" in ${ownComponents}
        ) desc`,
        asc(kanjiCharacters.frequencyRank),
        asc(kanjiCharacters.literal),
      )
      .limit(limit);

    if (candidates.length === 0) return [];

    const candidateIds = candidates.map((row) => row.id);
    const edgeRows = await db
      .select({
        kanjiId: kanjiComponents.kanjiId,
        component: kanjiComponents.component,
      })
      .from(kanjiComponents)
      .where(
        and(
          inArray(kanjiComponents.kanjiId, candidateIds),
          inArray(kanjiComponents.component, ownComponents),
        ),
      );

    const sharedByKanji = new Map<number, string[]>();
    for (const row of edgeRows) {
      const current = sharedByKanji.get(row.kanjiId) ?? [];
      if (!current.includes(row.component)) current.push(row.component);
      sharedByKanji.set(row.kanjiId, current);
    }

    return candidates.map((row) => ({
      id: row.id,
      literal: row.literal,
      strokeCount: row.strokeCount,
      grade: row.grade,
      frequencyRank: row.frequencyRank,
      sharedComponents: (sharedByKanji.get(row.id) ?? []).sort(),
      sharedCount: Number(row.sharedCount ?? 0),
    }));
  }

  async findReadings(kanjiId: number): Promise<{ type: string; value: string }[]> {
    return db
      .select({ type: kanjiReadings.type, value: kanjiReadings.value })
      .from(kanjiReadings)
      .where(eq(kanjiReadings.kanjiId, kanjiId))
      .orderBy(asc(kanjiReadings.position));
  }

  async findMeanings(kanjiIds: number[]): Promise<Map<number, string[]>> {
    if (kanjiIds.length === 0) return new Map();
    const rows = await db
      .select({
        kanjiId: kanjiMeanings.kanjiId,
        value: kanjiMeanings.value,
      })
      .from(kanjiMeanings)
      .where(
        and(
          inArray(kanjiMeanings.kanjiId, kanjiIds),
          eq(kanjiMeanings.language, "en"),
        ),
      )
      .orderBy(asc(kanjiMeanings.kanjiId), asc(kanjiMeanings.position));
    const map = new Map<number, string[]>();
    for (const row of rows) {
      const current = map.get(row.kanjiId) ?? [];
      current.push(row.value);
      map.set(row.kanjiId, current);
    }
    return map;
  }

  async findFirstGlosses(entryIds: number[]): Promise<Map<number, string>> {
    if (entryIds.length === 0) return new Map();
    const rows = await db
      .select({ entryId: dictionarySenses.entryId, glosses: dictionarySenses.glosses })
      .from(dictionarySenses)
      .where(inArray(dictionarySenses.entryId, entryIds))
      .orderBy(asc(dictionarySenses.entryId), asc(dictionarySenses.position));
    const glosses = new Map<number, string>();
    for (const row of rows) {
      if (glosses.has(row.entryId) || !Array.isArray(row.glosses)) continue;
      const first = row.glosses.find(
        (value): value is string => typeof value === "string",
      );
      if (first) glosses.set(row.entryId, first);
    }
    return glosses;
  }

  async findImportRun(id: number) {
    const [run] = await db
      .select({
        sourceUrl: etlImportRuns.sourceUrl,
        license: etlImportRuns.license,
        attribution: etlImportRuns.attribution,
        isFixture: etlImportRuns.isFixture,
        status: etlImportRuns.status,
      })
      .from(etlImportRuns)
      .where(eq(etlImportRuns.id, id))
      .limit(1);
    return run ?? null;
  }
}
