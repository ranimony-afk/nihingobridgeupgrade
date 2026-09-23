import { db } from "@/db";
import {
  dictionaryEntries,
  kanjiEntries,
  kanjiRadicals,
  grammarPatterns,
  exampleSentences,
  questions,
} from "@/db/schema";
import { eq, or, ilike, and, sql, type SQL } from "drizzle-orm";
import { KnowledgeCorpusService } from "@/services/knowledge/corpusService";
import { KnowledgeService } from "@/services/knowledge/knowledgeService";
import { TestService } from "@/services/jlpt/testService";
import {
  defaultPublicationStore,
  resolveLearnerEntries,
} from "@/services/publication";
import type { PublicationStore } from "@/services/publication";
import {
  type SearchTarget,
  type UnifiedSearchOptions,
  type UnifiedSearchResponse,
  type UnifiedSearchResultItem,
  ALL_SEARCH_TARGETS,
} from "./types";
import {
  detectSearchScript,
  sanitizeSearchQuery,
  escapeLikePattern,
  calculateRelevance,
} from "./matcher";

export class UnifiedSearchService {
  /**
   * Ensure necessary baseline tables are initialized before searching.
   */
  static async ensureInitialized(): Promise<void> {
    await Promise.all([
      KnowledgeCorpusService.ensureSeeded(),
      KnowledgeService.ensureSeeded(),
      TestService.ensureSeeded(),
    ]);
  }

  /**
   * Primary entry point for multi-target unified search.
   */
  static async search(
    rawQuery: string,
    options: UnifiedSearchOptions = {}
  ): Promise<UnifiedSearchResponse> {
    const startTime = performance.now();
    await this.ensureInitialized();

    const query = sanitizeSearchQuery(rawQuery);
    const detectedScript = detectSearchScript(query);
    const requestedTargets = options.targets?.length
      ? options.targets
      : [...ALL_SEARCH_TARGETS];
    const jlptLevel = options.jlptLevel?.trim() || null;
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);
    const publicationStore: PublicationStore =
      options.publicationStore ?? defaultPublicationStore;

    // If query is empty and no JLPT filter is provided, return an empty response early
    if (!query && !jlptLevel) {
      return {
        query: "",
        detectedScript: "empty",
        appliedJlptLevel: null,
        targetsSearched: requestedTargets,
        results: [],
        totalResults: 0,
        metrics: {
          durationMs: Number((performance.now() - startTime).toFixed(2)),
          targetDurationsMs: {},
          totalFound: 0,
        },
      };
    }

    const targetDurationsMs: Partial<Record<SearchTarget, number>> = {};
    const searchPromises: Promise<UnifiedSearchResultItem[]>[] = [];

    for (const target of requestedTargets) {
      searchPromises.push(
        (async () => {
          const tStart = performance.now();
          const items = await this.searchTarget(
            target,
            query,
            jlptLevel,
            limit,
            publicationStore
          );
          targetDurationsMs[target] = Number((performance.now() - tStart).toFixed(2));
          return items;
        })()
      );
    }

    const resultsByTarget = await Promise.all(searchPromises);
    const allItems = resultsByTarget.flat();

    // Sort by relevance desc, then length asc, then display text
    allItems.sort((a, b) => {
      if (b.relevance !== a.relevance) {
        return b.relevance - a.relevance;
      }
      return a.displayText.length - b.displayText.length;
    });

    const paginated = allItems.slice(offset, offset + limit);
    const totalDurationMs = Number((performance.now() - startTime).toFixed(2));

    return {
      query,
      detectedScript,
      appliedJlptLevel: jlptLevel,
      targetsSearched: requestedTargets,
      results: paginated,
      totalResults: allItems.length,
      metrics: {
        durationMs: totalDurationMs,
        targetDurationsMs,
        totalFound: allItems.length,
      },
    };
  }

  private static async searchTarget(
    target: SearchTarget,
    query: string,
    jlptLevel: string | null,
    limit: number,
    publicationStore: PublicationStore = defaultPublicationStore
  ): Promise<UnifiedSearchResultItem[]> {
    switch (target) {
      case "dictionary":
        return this.searchDictionary(query, jlptLevel, limit, publicationStore);
      case "kanji":
        return this.searchKanji(query, jlptLevel, limit);
      case "radicals":
        return this.searchRadicals(query, limit);
      case "grammar":
        return this.searchGrammar(query, jlptLevel, limit);
      case "sentences":
        return this.searchSentences(query, jlptLevel, limit);
      case "jlpt":
        return this.searchJlpt(query, jlptLevel, limit);
      default:
        return [];
    }
  }

  /* ----------------- Target Searches ----------------- */

  private static async searchDictionary(
    query: string,
    jlptLevel: string | null,
    limit: number,
    publicationStore: PublicationStore = defaultPublicationStore
  ): Promise<UnifiedSearchResultItem[]> {
    const escaped = escapeLikePattern(query);
    const pattern = `%${escaped}%`;

    const conditions: SQL[] = [];
    if (query) {
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

    const rows = await db
      .select()
      .from(dictionaryEntries)
      .where(conditions.length ? and(...conditions) : undefined)
      .limit(limit * 2);

    // 13.5F: published CMS overrides replace the displayed dictionary
    // representation (entity identity and ranking inputs unchanged in
    // shape). Overlay failure degrades to canonical rows.
    let displayRows = rows;
    try {
      displayRows = (
        await resolveLearnerEntries(publicationStore, rows)
      ).entries;
    } catch (error) {
      console.warn(
        "Dictionary publication overlay unavailable; serving canonical.",
        error
      );
    }

    return displayRows.map((r) => {
      const senses = Array.isArray(r.senses) ? r.senses : [];
      const glossList = senses.flatMap((s: any) => s.glosses || []);
      const meaningText = glossList.join("; ") || "No gloss available";

      let relevance = 0.5;
      let matchedOn = "gloss";

      if (query) {
        const headScore = calculateRelevance(query, r.headword, 1.0);
        const readingScore = calculateRelevance(query, r.reading, 0.95);
        const romajiScore = calculateRelevance(query, r.romaji, 0.9);
        const glossScore = calculateRelevance(query, meaningText, 0.8);

        relevance = Math.max(headScore, readingScore, romajiScore, glossScore);
        if (relevance === headScore) matchedOn = "headword";
        else if (relevance === readingScore) matchedOn = "reading";
        else if (relevance === romajiScore) matchedOn = "romaji";
      } else if (jlptLevel) {
        relevance = 0.7;
        matchedOn = "jlpt_filter";
      }

      return {
        entityType: "dictionary",
        id: r.id,
        displayText: r.headword,
        reading: r.reading,
        meaning: meaningText,
        jlptLevel: r.jlptLevel,
        source: r.sourceRef,
        relevance,
        matchedOn,
      };
    });
  }

  private static async searchKanji(
    query: string,
    jlptLevel: string | null,
    limit: number
  ): Promise<UnifiedSearchResultItem[]> {
    const escaped = escapeLikePattern(query);
    const pattern = `%${escaped}%`;

    const conditions: SQL[] = [];
    if (query) {
      conditions.push(
        or(
          ilike(kanjiEntries.character, pattern),
          ilike(kanjiEntries.meaning, pattern),
          sql`${kanjiEntries.readingsKun}::text ILIKE ${pattern}`,
          sql`${kanjiEntries.readingsOn}::text ILIKE ${pattern}`,
          sql`${kanjiEntries.vocabulary}::text ILIKE ${pattern}`
        ) as SQL
      );
    }

    if (jlptLevel) {
      conditions.push(eq(kanjiEntries.jlptLevel, jlptLevel));
    }

    const rows = await db
      .select()
      .from(kanjiEntries)
      .where(conditions.length ? and(...conditions) : undefined)
      .limit(limit * 2);

    return rows.map((k) => {
      const readings = [...(k.readingsKun || []), ...(k.readingsOn || [])].join(", ");

      let relevance = 0.5;
      let matchedOn = "meaning";

      if (query) {
        const charScore = calculateRelevance(query, k.character, 1.0);
        const kunScore = Math.max(
          0,
          ...(k.readingsKun || []).map((r) => calculateRelevance(query, r, 0.95))
        );
        const onScore = Math.max(
          0,
          ...(k.readingsOn || []).map((r) => calculateRelevance(query, r, 0.95))
        );
        const meaningScore = calculateRelevance(query, k.meaning, 0.85);

        relevance = Math.max(charScore, kunScore, onScore, meaningScore);
        if (relevance === charScore) matchedOn = "character";
        else if (relevance === kunScore || relevance === onScore) matchedOn = "reading";
      } else if (jlptLevel) {
        relevance = 0.7;
        matchedOn = "jlpt_filter";
      }

      return {
        entityType: "kanji",
        id: k.id,
        displayText: k.character,
        reading: readings || null,
        meaning: k.meaning,
        jlptLevel: k.jlptLevel,
        source: k.sourceRef || "kanjidic2",
        relevance,
        matchedOn,
        metadata: {
          strokeCount: k.strokeCount,
          gradeLevel: k.gradeLevel,
        },
      };
    });
  }

  private static async searchRadicals(
    query: string,
    limit: number
  ): Promise<UnifiedSearchResultItem[]> {
    if (!query) return [];

    const escaped = escapeLikePattern(query);
    const pattern = `%${escaped}%`;

    const rows = await db
      .select()
      .from(kanjiRadicals)
      .where(
        or(
          ilike(kanjiRadicals.character, pattern),
          ilike(kanjiRadicals.meaning, pattern),
          ilike(kanjiRadicals.readingKun, pattern),
          ilike(kanjiRadicals.readingOn, pattern),
          sql`${kanjiRadicals.altForms}::text ILIKE ${pattern}`
        )
      )
      .limit(limit * 2);

    return rows.map((r) => {
      const readings = [r.readingKun, r.readingOn].filter(Boolean).join(", ");
      const charScore = calculateRelevance(query, r.character, 1.0);
      const kunScore = calculateRelevance(query, r.readingKun, 0.95);
      const onScore = calculateRelevance(query, r.readingOn, 0.95);
      const meaningScore = calculateRelevance(query, r.meaning, 0.85);

      const relevance = Math.max(charScore, kunScore, onScore, meaningScore);
      let matchedOn = "meaning";
      if (relevance === charScore) matchedOn = "character";
      else if (relevance === kunScore || relevance === onScore) matchedOn = "reading";

      return {
        entityType: "radicals",
        id: r.id,
        displayText: r.character,
        reading: readings || null,
        meaning: r.meaning,
        jlptLevel: null,
        source: r.sourceRef || "first-party:kanji-mindtree:v1",
        relevance,
        matchedOn,
        metadata: {
          category: r.category,
          strokeCount: r.strokeCount,
          typicalRole: r.typicalRole,
        },
      };
    });
  }

  private static async searchGrammar(
    query: string,
    jlptLevel: string | null,
    limit: number
  ): Promise<UnifiedSearchResultItem[]> {
    const escaped = escapeLikePattern(query);
    const pattern = `%${escaped}%`;

    const conditions: SQL[] = [];
    if (query) {
      conditions.push(
        or(
          ilike(grammarPatterns.title, pattern),
          ilike(grammarPatterns.slug, pattern),
          ilike(grammarPatterns.structure, pattern),
          ilike(grammarPatterns.meaning, pattern),
          ilike(grammarPatterns.explanation, pattern)
        ) as SQL
      );
    }

    if (jlptLevel) {
      conditions.push(eq(grammarPatterns.jlptLevel, jlptLevel));
    }

    const rows = await db
      .select()
      .from(grammarPatterns)
      .where(conditions.length ? and(...conditions) : undefined)
      .limit(limit * 2);

    return rows.map((g) => {
      let relevance = 0.5;
      let matchedOn = "meaning";

      if (query) {
        const titleScore = calculateRelevance(query, g.title, 1.0);
        const slugScore = calculateRelevance(query, g.slug, 0.95);
        const structureScore = calculateRelevance(query, g.structure, 0.9);
        const meaningScore = calculateRelevance(query, g.meaning, 0.85);

        relevance = Math.max(titleScore, slugScore, structureScore, meaningScore);
        if (relevance === titleScore) matchedOn = "title";
        else if (relevance === slugScore) matchedOn = "slug";
        else if (relevance === structureScore) matchedOn = "structure";
      } else if (jlptLevel) {
        relevance = 0.7;
        matchedOn = "jlpt_filter";
      }

      return {
        entityType: "grammar",
        id: g.id,
        displayText: g.title,
        reading: g.structure,
        meaning: g.meaning,
        jlptLevel: g.jlptLevel,
        source: g.sourceRef,
        relevance,
        matchedOn,
      };
    });
  }

  private static async searchSentences(
    query: string,
    jlptLevel: string | null,
    limit: number
  ): Promise<UnifiedSearchResultItem[]> {
    const escaped = escapeLikePattern(query);
    const pattern = `%${escaped}%`;

    const conditions: SQL[] = [];
    if (query) {
      conditions.push(
        or(
          ilike(exampleSentences.japanese, pattern),
          ilike(exampleSentences.reading, pattern),
          ilike(exampleSentences.english, pattern)
        ) as SQL
      );
    }

    if (jlptLevel) {
      conditions.push(eq(exampleSentences.jlptLevel, jlptLevel));
    }

    const rows = await db
      .select()
      .from(exampleSentences)
      .where(conditions.length ? and(...conditions) : undefined)
      .limit(limit * 2);

    return rows.map((s) => {
      let relevance = 0.5;
      let matchedOn = "english";

      if (query) {
        const japScore = calculateRelevance(query, s.japanese, 1.0);
        const readingScore = calculateRelevance(query, s.reading, 0.95);
        const engScore = calculateRelevance(query, s.english, 0.85);

        relevance = Math.max(japScore, readingScore, engScore);
        if (relevance === japScore) matchedOn = "japanese";
        else if (relevance === readingScore) matchedOn = "reading";
      } else if (jlptLevel) {
        relevance = 0.7;
        matchedOn = "jlpt_filter";
      }

      return {
        entityType: "sentences",
        id: s.id,
        displayText: s.japanese,
        reading: s.reading,
        meaning: s.english,
        jlptLevel: s.jlptLevel,
        source: s.sourceRef,
        relevance,
        matchedOn,
      };
    });
  }

  private static async searchJlpt(
    query: string,
    jlptLevel: string | null,
    limit: number
  ): Promise<UnifiedSearchResultItem[]> {
    const escaped = escapeLikePattern(query);
    const pattern = `%${escaped}%`;

    const conditions: SQL[] = [];
    if (query) {
      conditions.push(
        or(
          ilike(questions.prompt, pattern),
          ilike(questions.promptTranslation, pattern),
          ilike(questions.explanation, pattern),
          ilike(questions.mondaiTitle, pattern)
        ) as SQL
      );
    }

    if (jlptLevel) {
      conditions.push(eq(questions.jlptLevel, jlptLevel));
    }

    const rows = await db
      .select()
      .from(questions)
      .where(conditions.length ? and(...conditions) : undefined)
      .limit(limit * 2);

    return rows.map((q) => {
      let relevance = 0.5;
      let matchedOn = "promptTranslation";

      if (query) {
        const promptScore = calculateRelevance(query, q.prompt, 1.0);
        const titleScore = calculateRelevance(query, q.mondaiTitle, 0.9);
        const transScore = calculateRelevance(query, q.promptTranslation, 0.85);

        relevance = Math.max(promptScore, titleScore, transScore);
        if (relevance === promptScore) matchedOn = "prompt";
        else if (relevance === titleScore) matchedOn = "mondaiTitle";
      } else if (jlptLevel) {
        relevance = 0.7;
        matchedOn = "jlpt_filter";
      }

      return {
        entityType: "jlpt",
        id: q.id,
        displayText: q.prompt,
        reading: q.category,
        meaning: q.promptTranslation,
        jlptLevel: q.jlptLevel,
        source: "jlpt:question-bank:v1",
        relevance,
        matchedOn,
        metadata: {
          section: q.section,
          category: q.category,
          difficulty: q.difficulty,
        },
      };
    });
  }
}
