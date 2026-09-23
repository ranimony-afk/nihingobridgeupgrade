import { db } from "@/db";
import {
  dictionaryEntries,
  kanjiEntries,
  exampleSentences,
  grammarPatterns,
  knowledgeSources,
} from "@/db/schema";
import { eq, or, ilike, and, sql, inArray, type SQL } from "drizzle-orm";
import { KnowledgeCorpusService } from "@/services/knowledge/corpusService";
import { KnowledgeService } from "@/services/knowledge/knowledgeService";
import { escapeLikePattern } from "@/services/search/matcher";

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

export class DictionaryService {
  static async ensureInitialized(): Promise<void> {
    await Promise.all([
      KnowledgeCorpusService.ensureSeeded(),
      KnowledgeService.ensureSeeded(),
    ]);
  }

  /**
   * List or search dictionary entries with multi-script queries, JLPT filters, and common-word filters.
   */
  static async searchEntries(options: DictionarySearchOptions = {}) {
    await this.ensureInitialized();

    const query = options.query?.trim() || "";
    const jlptLevel = options.jlptLevel?.trim() || undefined;
    const isCommon = options.isCommon;
    const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);

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

    if (jlptLevel) {
      conditions.push(eq(dictionaryEntries.jlptLevel, jlptLevel));
    }

    if (typeof isCommon === "boolean") {
      conditions.push(eq(dictionaryEntries.isCommon, isCommon));
    }

    const whereClause = conditions.length ? and(...conditions) : undefined;

    const [totalRow] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(dictionaryEntries)
      .where(whereClause);

    const rows = await db
      .select()
      .from(dictionaryEntries)
      .where(whereClause)
      .limit(limit)
      .offset(offset);

    // Sort exact matches on headword, reading, or romaji first
    if (query) {
      const qLower = query.toLowerCase();
      rows.sort((a, b) => {
        const aExact =
          a.headword === query ||
          a.reading === query ||
          a.romaji?.toLowerCase() === qLower;
        const bExact =
          b.headword === query ||
          b.reading === query ||
          b.romaji?.toLowerCase() === qLower;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return 0;
      });
    }

    return {
      entries: rows,
      total: totalRow?.count ?? 0,
      limit,
      offset,
    };
  }

  /**
   * Lightweight autocomplete helper for header and quick-search input.
   */
  static async autocomplete(query: string, limit = 8) {
    if (!query.trim()) return [];
    await this.ensureInitialized();

    const pattern = `%${escapeLikePattern(query.trim())}%`;
    const rows = await db
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
      .limit(limit);

    return rows.map((r) => {
      const senses = Array.isArray(r.senses) ? r.senses : [];
      const primaryGloss = senses[0]?.glosses?.[0] || "";
      return {
        id: r.id,
        headword: r.headword,
        reading: r.reading,
        romaji: r.romaji,
        jlptLevel: r.jlptLevel,
        isCommon: r.isCommon,
        gloss: primaryGloss,
      };
    });
  }

  /**
   * Full detailed view for a single dictionary entry including related kanji, sentences, grammar, and source provenance.
   */
  static async getEntryDetail(idOrHeadword: string): Promise<DictionaryDetailedEntry | null> {
    await this.ensureInitialized();

    const [entry] = await db
      .select()
      .from(dictionaryEntries)
      .where(
        or(
          eq(dictionaryEntries.id, idOrHeadword),
          eq(dictionaryEntries.headword, idOrHeadword)
        )
      )
      .limit(1);

    if (!entry) return null;

    // 1. Fetch Source Provenance
    let source: typeof knowledgeSources.$inferSelect | null = null;
    if (entry.sourceRef) {
      const [srcRow] = await db
        .select()
        .from(knowledgeSources)
        .where(eq(knowledgeSources.id, entry.sourceRef))
        .limit(1);
      source = srcRow ?? null;
    }

    // 2. Fetch Related Kanji
    const kanjiChars = entry.kanjiCharacters || [];
    let relatedKanji: (typeof kanjiEntries.$inferSelect)[] = [];
    if (kanjiChars.length > 0) {
      relatedKanji = await db
        .select()
        .from(kanjiEntries)
        .where(inArray(kanjiEntries.character, kanjiChars));
    }

    // 3. Fetch Linked Sentences
    const sentences = await db
      .select()
      .from(exampleSentences)
      .where(
        or(
          sql`${exampleSentences.dictionaryEntryIds}::jsonb ? ${entry.id}`,
          ilike(exampleSentences.japanese, `%${entry.headword}%`)
        )
      )
      .limit(6);

    // 4. Fetch Related Grammar Points (from sentence grammar links or tags)
    const grammarIds = sentences
      .map((s) => s.grammarId)
      .filter((id): id is string => Boolean(id));

    let relatedGrammar: (typeof grammarPatterns.$inferSelect)[] = [];
    if (grammarIds.length > 0) {
      relatedGrammar = await db
        .select()
        .from(grammarPatterns)
        .where(inArray(grammarPatterns.id, grammarIds))
        .limit(4);
    }

    return {
      entry,
      source,
      kanji: relatedKanji,
      sentences,
      relatedGrammar,
    };
  }
}
