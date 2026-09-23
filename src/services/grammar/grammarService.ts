import { db } from "@/db";
import {
  grammarPatterns as grammarTable,
  exampleSentences as sentenceTable,
} from "@/db/schema";
import { and, eq, ilike, or, type SQL } from "drizzle-orm";
import { normalizeJLPTLevel, type JLPTLevel } from "@/etl/grammar/types";

export interface GrammarFilterOptions {
  level?: string;
  keyword?: string;
  tag?: string;
  limit?: number;
  offset?: number;
}

export class GrammarService {
  /**
   * Look up a pattern by ID or slug with linked example sentences.
   */
  static async getPatternWithExamples(idOrSlug: string) {
    const [byId] = await db
      .select()
      .from(grammarTable)
      .where(or(eq(grammarTable.id, idOrSlug), eq(grammarTable.slug, idOrSlug)))
      .limit(1);

    if (!byId) return null;

    // Use example_sentences.grammar_id to connect examples to grammar
    const examples = await db
      .select()
      .from(sentenceTable)
      .where(eq(sentenceTable.grammarId, byId.id))
      .limit(10);

    return {
      pattern: byId,
      examples,
    };
  }

  /**
   * Search and filter grammar patterns by JLPT level and query.
   */
  static async listPatterns(options: GrammarFilterOptions = {}) {
    const { level, keyword, limit = 50, offset = 0 } = options;
    const filters: SQL[] = [];

    if (level && level !== "all") {
      const normalizedLevel = normalizeJLPTLevel(level);
      filters.push(eq(grammarTable.jlptLevel, normalizedLevel));
    }

    if (keyword && keyword.trim()) {
      const q = `%${keyword.trim()}%`;
      filters.push(
        or(
          ilike(grammarTable.title, q),
          ilike(grammarTable.slug, q),
          ilike(grammarTable.structure, q),
          ilike(grammarTable.meaning, q),
          ilike(grammarTable.explanation, q),
        ) as SQL,
      );
    }

    const rows = await db
      .select()
      .from(grammarTable)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .limit(limit)
      .offset(offset);

    return rows;
  }
}
