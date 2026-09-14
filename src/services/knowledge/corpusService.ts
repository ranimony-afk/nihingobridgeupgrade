/**
 * KnowledgeCorpusService — seeding and provenance for the knowledge corpus.
 *
 * Owns the additive Phase 13.2 tables (knowledge_sources, dictionary_entries,
 * grammar_patterns, example_sentences). Kanji remains owned by
 * KnowledgeService — this service never redefines or reseeds it.
 *
 * Pure database work: no AI provider is called from here.
 */

import { db } from "@/db";
import {
  dictionaryEntries as dictionaryTable,
  exampleSentences as sentenceTable,
  grammarPatterns as grammarTable,
  knowledgeSources as sourceTable,
} from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { KANJI } from "@/data/kanji";
import {
  DICTIONARY_ENTRIES,
  DICTIONARY_SOURCE_REF,
  EXAMPLE_SENTENCES,
  GRAMMAR_PATTERNS,
  GRAMMAR_SOURCE_REF,
  KNOWLEDGE_SOURCES,
  SENTENCE_SOURCE_REF,
} from "@/data/lexicon";

export interface ProvenanceRecord {
  sourceRef: string;
  name: string;
  version: string;
  license: string;
  url: string | null;
  domain: string;
}

export class KnowledgeCorpusService {
  /**
   * Register provenance rows for every knowledge domain, including kanji,
   * which is seeded by KnowledgeService. Runs independently of record
   * seeding so an already-populated database still resolves sources.
   */
  static async ensureSources(): Promise<void> {
    const [row] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(sourceTable);
    if ((row?.count ?? 0) >= KNOWLEDGE_SOURCES.length) return;

    for (const source of KNOWLEDGE_SOURCES) {
      await db
        .insert(sourceTable)
        .values({
          id: source.id,
          name: source.name,
          version: source.version,
          license: source.license,
          url: source.url,
          description: source.description,
          domain: source.domain,
          recordCount:
            source.domain === "dictionary"
              ? DICTIONARY_ENTRIES.length
              : source.domain === "grammar"
                ? GRAMMAR_PATTERNS.length
                : source.domain === "sentence"
                  ? EXAMPLE_SENTENCES.length
                  : source.domain === "kanji"
                    ? KANJI.length
                    : 0,
        })
        .onConflictDoNothing();
    }
  }

  /** Idempotently load the first-party corpus. Safe to call on every request. */
  static async ensureSeeded(): Promise<void> {
    await this.ensureSources();

    const [row] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(dictionaryTable);
    if ((row?.count ?? 0) > 0) return;

    for (const entry of DICTIONARY_ENTRIES) {
      await db
        .insert(dictionaryTable)
        .values({ ...entry, sourceRef: DICTIONARY_SOURCE_REF })
        .onConflictDoNothing();
    }

    for (const pattern of GRAMMAR_PATTERNS) {
      await db
        .insert(grammarTable)
        .values({ ...pattern, sourceRef: GRAMMAR_SOURCE_REF })
        .onConflictDoNothing();
    }

    for (const sentence of EXAMPLE_SENTENCES) {
      await db
        .insert(sentenceTable)
        .values({ ...sentence, sourceRef: SENTENCE_SOURCE_REF })
        .onConflictDoNothing();
    }
  }

  /** Resolve provenance rows for the source refs attached to retrieved records. */
  static async getProvenance(sourceRefs: string[]): Promise<ProvenanceRecord[]> {
    const unique = [...new Set(sourceRefs)].filter(Boolean);
    if (unique.length === 0) return [];

    const rows = await db
      .select()
      .from(sourceTable)
      .where(inArray(sourceTable.id, unique));

    return rows.map((row) => ({
      sourceRef: row.id,
      name: row.name,
      version: row.version,
      license: row.license,
      url: row.url,
      domain: row.domain,
    }));
  }

  static async getDictionaryEntry(id: string) {
    const [row] = await db
      .select()
      .from(dictionaryTable)
      .where(eq(dictionaryTable.id, id))
      .limit(1);
    return row ?? null;
  }

  static async getGrammarPattern(idOrSlug: string) {
    const [byId] = await db
      .select()
      .from(grammarTable)
      .where(eq(grammarTable.id, idOrSlug))
      .limit(1);
    if (byId) return byId;

    const [bySlug] = await db
      .select()
      .from(grammarTable)
      .where(eq(grammarTable.slug, idOrSlug))
      .limit(1);
    return bySlug ?? null;
  }

  static async getSentence(id: string) {
    const [row] = await db
      .select()
      .from(sentenceTable)
      .where(eq(sentenceTable.id, id))
      .limit(1);
    return row ?? null;
  }

  /** Corpus counts, used by the retrieval API and gate checks. */
  static async getStats(): Promise<{
    dictionary: number;
    grammar: number;
    sentences: number;
    sources: number;
  }> {
    await this.ensureSeeded();
    const [dict] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(dictionaryTable);
    const [grammar] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(grammarTable);
    const [sentences] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(sentenceTable);
    const [sources] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(sourceTable);

    return {
      dictionary: dict?.count ?? 0,
      grammar: grammar?.count ?? 0,
      sentences: sentences?.count ?? 0,
      sources: sources?.count ?? 0,
    };
  }
}
