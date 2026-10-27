import {
  dictionaryEntries,
  kanjiEntries,
  exampleSentences,
  grammarPatterns,
  knowledgeSources,
} from "@/db/schema";
import { eq, or, ilike, and, sql, inArray, type SQL } from "drizzle-orm";
import {
  codePointLength,
  isValidRouteIdentifier,
  MAX_OFFSET,
  MAX_SEARCH_QUERY_LENGTH,
} from "@/lib/api/routeParams";
import {
  MAX_DICTIONARY_AUTOCOMPLETE_RESULTS,
  MAX_DICTIONARY_RELATED_KANJI,
  MAX_DICTIONARY_RESULTS,
} from "@/lib/dictionary/limits";
import { escapeLikePattern, sanitizeSearchQuery } from "@/services/search/matcher";
import {
  createDrizzlePublicationStore,
  resolveLearnerEntries,
} from "@/services/publication";
import type { PublicationStore } from "@/services/publication";
import { withDictionaryRead } from "./readTransaction";

export interface DictionarySearchOptions {
  query?: string;
  jlptLevel?: string;
  isCommon?: boolean;
  limit?: number;
  offset?: number;
}

export interface DictionarySense {
  glosses: string[];
  note?: string;
}

export interface DictionaryDetailedEntry {
  entry: typeof dictionaryEntries.$inferSelect;
  source: typeof knowledgeSources.$inferSelect | null;
  kanji: (typeof kanjiEntries.$inferSelect)[];
  sentences: (typeof exampleSentences.$inferSelect)[];
  relatedGrammar: (typeof grammarPatterns.$inferSelect)[];
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? Math.min(Math.max(value, min), max)
    : fallback;
}

function boundedQuery(value: string | undefined): string {
  const query = sanitizeSearchQuery(value ?? "");
  if (codePointLength(query) > MAX_SEARCH_QUERY_LENGTH) {
    throw new RangeError("Dictionary query exceeds the supported length");
  }
  return query;
}

/** Preserve the existing search ranking and use it for deterministic suggestions. */
function dictionaryOrder(query: string): SQL {
  return query
    ? sql`CASE
        WHEN ${dictionaryEntries.headword} = ${query} AND ${dictionaryEntries.jlptLevel} != 'NONE' THEN 1
        WHEN ${dictionaryEntries.headword} = ${query} THEN 2
        WHEN ${dictionaryEntries.reading} = ${query} AND ${dictionaryEntries.jlptLevel} != 'NONE' THEN 3
        WHEN ${dictionaryEntries.reading} = ${query} THEN 4
        WHEN lower(${dictionaryEntries.romaji}) = lower(${query}) THEN 5
        WHEN ${dictionaryEntries.senses}::text ILIKE ${'%"' + escapeLikePattern(query) + '"%'} AND ${dictionaryEntries.isCommon} = true THEN 6
        WHEN ${dictionaryEntries.senses}::text ILIKE ${'%"' + escapeLikePattern(query) + '"%'} THEN 7
        ELSE 8
      END, ${dictionaryEntries.frequencyRank} ASC NULLS LAST, ${dictionaryEntries.isCommon} DESC, ${dictionaryEntries.id} ASC`
    : sql`${dictionaryEntries.id} ASC`;
}

export class DictionaryService {
  /**
   * Backward-compatible, explicit fixture setup. It is never called by reads
   * and refuses targets that have not been classified as disposable.
   */
  static async ensureInitialized(): Promise<void> {
    const { seedDictionaryFixturesForDisposableDatabase } = await import("./fixtureSetup");
    await seedDictionaryFixturesForDisposableDatabase();
  }

  /** List/search canonical entries; no setup or seeding occurs on a read. */
  static async searchEntries(
    options: DictionarySearchOptions = {},
    publicationStoreOverride?: PublicationStore
  ) {
    const query = boundedQuery(options.query);
    const jlptLevel = options.jlptLevel?.trim() || undefined;
    const isCommon = options.isCommon;
    const limit = boundedInteger(options.limit, 25, 1, MAX_DICTIONARY_RESULTS);
    const offset = boundedInteger(options.offset, 0, 0, MAX_OFFSET);

    const conditions: SQL[] = [];
    if (query) {
      const pattern = `%${escapeLikePattern(query)}%`;
      conditions.push(
        or(
          ilike(dictionaryEntries.headword, pattern),
          ilike(dictionaryEntries.reading, pattern),
          ilike(dictionaryEntries.romaji, pattern),
          sql`${dictionaryEntries.senses}::text ILIKE ${pattern}`
        ) as SQL
      );
    }
    if (jlptLevel) conditions.push(eq(dictionaryEntries.jlptLevel, jlptLevel));
    if (typeof isCommon === "boolean") conditions.push(eq(dictionaryEntries.isCommon, isCommon));
    const whereClause = conditions.length ? and(...conditions) : undefined;

    return withDictionaryRead(async (tx) => {
      const [totalRow] = await tx
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(dictionaryEntries)
        .where(whereClause);
      const rows = await tx
        .select()
        .from(dictionaryEntries)
        .where(whereClause)
        .orderBy(dictionaryOrder(query))
        .limit(limit)
        .offset(offset);

      // A savepoint preserves canonical fallback even when the optional CMS
      // query fails: PostgreSQL otherwise leaves the outer transaction aborted.
      let entries = rows;
      if (rows.length) {
        try {
          entries = await tx.transaction(async (overlayTx) => {
            const publicationStore = publicationStoreOverride ?? createDrizzlePublicationStore(overlayTx);
            return (await resolveLearnerEntries(publicationStore, rows)).entries;
          });
        } catch {
          console.warn("Dictionary publication overlay unavailable; serving canonical.");
        }
      }

      // Preserve the existing exact-match ordering after publication overlays.
      if (query) {
        const qLower = query.toLowerCase();
        entries.sort((a, b) => {
          const aExact = a.headword === query || a.reading === query || a.romaji?.toLowerCase() === qLower;
          const bExact = b.headword === query || b.reading === query || b.romaji?.toLowerCase() === qLower;
          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;
          return 0;
        });
      }

      return { entries, total: totalRow?.count ?? 0, limit, offset };
    });
  }

  /** Bounded, deterministic autocomplete over the same canonical dictionary. */
  static async autocomplete(rawQuery: string, requestedLimit = 8) {
    const query = boundedQuery(rawQuery);
    if (!query) return [];
    const limit = boundedInteger(requestedLimit, 8, 1, MAX_DICTIONARY_AUTOCOMPLETE_RESULTS);
    const pattern = `%${escapeLikePattern(query)}%`;

    return withDictionaryRead(async (tx) => {
      const rows = await tx
        .select({
          id: dictionaryEntries.id,
          headword: dictionaryEntries.headword,
          reading: dictionaryEntries.reading,
          romaji: dictionaryEntries.romaji,
          jlptLevel: dictionaryEntries.jlptLevel,
          senses: dictionaryEntries.senses,
          isCommon: dictionaryEntries.isCommon,
        })
        .from(dictionaryEntries)
        .where(
          or(
            ilike(dictionaryEntries.headword, pattern),
            ilike(dictionaryEntries.reading, pattern),
            ilike(dictionaryEntries.romaji, pattern),
            sql`${dictionaryEntries.senses}::text ILIKE ${pattern}`
          )
        )
        .orderBy(dictionaryOrder(query))
        .limit(limit);

      return rows.map((row) => ({
        id: row.id,
        headword: row.headword,
        reading: row.reading,
        romaji: row.romaji,
        jlptLevel: row.jlptLevel,
        isCommon: row.isCommon,
        gloss: Array.isArray(row.senses) ? row.senses[0]?.glosses?.[0] || "" : "",
      }));
    });
  }

  /** Canonical entry, source attribution, and bounded related records. */
  static async getEntryDetail(
    idOrHeadword: string,
    publicationStoreOverride?: PublicationStore
  ): Promise<DictionaryDetailedEntry | null> {
    if (!isValidRouteIdentifier(idOrHeadword)) return null;

    return withDictionaryRead(async (tx) => {
      const [entry] = await tx
        .select()
        .from(dictionaryEntries)
        .where(or(eq(dictionaryEntries.id, idOrHeadword), eq(dictionaryEntries.headword, idOrHeadword)))
        .limit(1);
      if (!entry) return null;

      let resolvedEntry = entry;
      try {
        resolvedEntry = await tx.transaction(async (overlayTx) => {
          const publicationStore = publicationStoreOverride ?? createDrizzlePublicationStore(overlayTx);
          const resolved = await resolveLearnerEntries(publicationStore, [entry]);
          return resolved.entries[0] ?? entry;
        });
      } catch {
        console.warn("Dictionary publication overlay unavailable; serving canonical.");
      }

      let source: typeof knowledgeSources.$inferSelect | null = null;
      if (resolvedEntry.sourceRef) {
        const [sourceRow] = await tx
          .select()
          .from(knowledgeSources)
          .where(eq(knowledgeSources.id, resolvedEntry.sourceRef))
          .limit(1);
        source = sourceRow ?? null;
      }

      const kanjiChars = Array.isArray(resolvedEntry.kanjiCharacters)
        ? [...new Set(resolvedEntry.kanjiCharacters)].slice(0, MAX_DICTIONARY_RELATED_KANJI)
        : [];
      const kanji = kanjiChars.length
        ? await tx.select().from(kanjiEntries).where(inArray(kanjiEntries.character, kanjiChars)).limit(MAX_DICTIONARY_RELATED_KANJI)
        : [];

      const linkedSentence = sql`${exampleSentences.dictionaryEntryIds}::jsonb ? ${resolvedEntry.id}`;
      const headword = resolvedEntry.headword;
      const sentenceCondition = headword && codePointLength(headword) <= MAX_SEARCH_QUERY_LENGTH
        ? or(linkedSentence, ilike(exampleSentences.japanese, `%${escapeLikePattern(headword)}%`))
        : linkedSentence;
      const sentences = await tx
        .select()
        .from(exampleSentences)
        .where(sentenceCondition)
        .limit(6);

      const grammarIds = sentences.map((sentence) => sentence.grammarId).filter((id): id is string => Boolean(id));
      const relatedGrammar = grammarIds.length
        ? await tx.select().from(grammarPatterns).where(inArray(grammarPatterns.id, grammarIds)).limit(4)
        : [];

      return { entry: resolvedEntry, source, kanji, sentences, relatedGrammar };
    });
  }
}
