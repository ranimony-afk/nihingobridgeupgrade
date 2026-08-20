/**
 * KnowledgeRetrieval — Unified search across all platform knowledge.
 *
 * P51: The RAG foundation. Searches dictionary, kanji, grammar, sentences,
 * JLPT data, courses, and lessons. Returns structured context that the
 * AI tutor injects into prompts for grounded responses.
 *
 * This service does NOT call any AI provider — it's pure database retrieval.
 * The AI layer (P52+) consumes this service's output as prompt context.
 */

import { eq, and, or, sql, asc, ilike, desc } from "drizzle-orm";
import { db } from "@/db";
import {
  dictionaryEntries,
  dictionarySenses,
  dictionaryReadings,
  kanjiEntries,
  kanjiReadings,
  kanjiComponents,
  kanjiComponentLinks,
  grammarPatterns,
  grammarExamples,
  sentences,
  sentenceTranslations,
  courses,
  courseModules,
  lessons,
  lessonItems,
  vocabularyProgress,
  kanjiProgress,
  grammarProgress,
} from "@/db/schema";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

/** A single piece of retrieved knowledge, ready for AI context injection. */
export interface KnowledgeChunk {
  /** Which domain this came from. */
  domain: "dictionary" | "kanji" | "grammar" | "sentence" | "course" | "lesson";
  /** Relevance score (0–1). Higher = more relevant to the query. */
  relevance: number;
  /** The entity ID for reference linking. */
  id: string;
  /** Human-readable title/label. */
  title: string;
  /** The actual content that goes into the AI prompt. */
  content: string;
  /** Structured metadata for the AI to interpret. */
  metadata: Record<string, unknown>;
}

/** Full retrieval result with context ready for AI. */
export interface RetrievalResult {
  query: string;
  chunks: KnowledgeChunk[];
  totalChunks: number;
  /** Pre-formatted context string for direct prompt injection. */
  contextText: string;
  /** Token estimate (rough: 1 token ≈ 4 chars for English, 2 chars for Japanese). */
  estimatedTokens: number;
  /** Which domains were searched. */
  domainsSearched: string[];
  /** Learner context if provided. */
  learnerContext: LearnerContext | null;
}

/** Learner-specific context for personalised AI responses. */
export interface LearnerContext {
  learnerId: string;
  jlptLevel: number | null;
  /** Words the learner knows (mastered/familiar). */
  knownWords: string[];
  /** Words the learner is currently studying. */
  studyingWords: string[];
  /** Grammar patterns the learner knows. */
  knownGrammar: string[];
  /** Current course/lesson context. */
  currentLesson: string | null;
}

export interface RetrievalOptions {
  /** Max chunks to return per domain. */
  maxPerDomain?: number;
  /** Total max chunks across all domains. */
  maxTotal?: number;
  /** Which domains to search (default: all). */
  domains?: ("dictionary" | "kanji" | "grammar" | "sentence" | "course" | "lesson")[];
  /** JLPT level filter (only return content at this level or below). */
  jlptLevel?: number;
  /** Learner ID for personalised context. */
  learnerId?: string;
  /** Specific entity IDs to include regardless of search. */
  includeIds?: { domain: string; id: string }[];
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function isJapanese(text: string): boolean {
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(text);
}

function estimateTokens(text: string): number {
  const jpChars = (text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g) || []).length;
  const otherChars = text.length - jpChars;
  return Math.ceil(jpChars / 2 + otherChars / 4);
}

// ─────────────────────────────────────────────
// KnowledgeRetrieval
// ─────────────────────────────────────────────

export const KnowledgeRetrieval = {

  /**
   * Retrieve relevant knowledge for a query.
   * This is the main entry point for the AI tutor's RAG pipeline.
   */
  async retrieve(query: string, options: RetrievalOptions = {}): Promise<RetrievalResult> {
    const {
      maxPerDomain = 5,
      maxTotal = 15,
      domains = ["dictionary", "kanji", "grammar", "sentence", "course", "lesson"],
      jlptLevel,
      learnerId,
      includeIds = [],
    } = options;

    const allChunks: KnowledgeChunk[] = [];

    // Run domain searches in parallel
    const searches = [];
    if (domains.includes("dictionary")) searches.push(this._searchDictionary(query, maxPerDomain, jlptLevel));
    if (domains.includes("kanji")) searches.push(this._searchKanji(query, maxPerDomain, jlptLevel));
    if (domains.includes("grammar")) searches.push(this._searchGrammar(query, maxPerDomain, jlptLevel));
    if (domains.includes("sentence")) searches.push(this._searchSentences(query, maxPerDomain, jlptLevel));
    if (domains.includes("course")) searches.push(this._searchCourses(query, maxPerDomain));
    if (domains.includes("lesson")) searches.push(this._searchLessons(query, maxPerDomain));

    const results = await Promise.all(searches);
    for (const chunks of results) allChunks.push(...chunks);

    // Include specific IDs if requested
    for (const { domain, id } of includeIds) {
      const chunk = await this._getById(domain, id);
      if (chunk && !allChunks.some((c) => c.id === chunk.id)) {
        chunk.relevance = 1.0; // Explicitly requested = max relevance
        allChunks.push(chunk);
      }
    }

    // Sort by relevance and limit
    allChunks.sort((a, b) => b.relevance - a.relevance);
    const finalChunks = allChunks.slice(0, maxTotal);

    // Build learner context if requested
    let learnerContext: LearnerContext | null = null;
    if (learnerId) {
      learnerContext = await this._getLearnerContext(learnerId);
    }

    // Format context text for prompt injection
    const contextText = this._formatContext(finalChunks, learnerContext);

    return {
      query,
      chunks: finalChunks,
      totalChunks: finalChunks.length,
      contextText,
      estimatedTokens: estimateTokens(contextText),
      domainsSearched: domains,
      learnerContext,
    };
  },

  /**
   * Retrieve context for a specific entity (e.g., "explain this grammar point").
   */
  async retrieveForEntity(domain: string, id: string, learnerId?: string): Promise<RetrievalResult> {
    const chunk = await this._getById(domain, id);
    const chunks = chunk ? [chunk] : [];

    // Also get related content
    if (chunk) {
      if (domain === "dictionary") {
        // Get example sentences for this word
        const sentenceChunks = await this._getSentencesForEntry(id, 3);
        chunks.push(...sentenceChunks);
      } else if (domain === "grammar") {
        // Get examples and related patterns
        const examples = await this._getGrammarExamples(id);
        if (examples) chunks.push(examples);
      }
    }

    let learnerContext: LearnerContext | null = null;
    if (learnerId) learnerContext = await this._getLearnerContext(learnerId);

    const contextText = this._formatContext(chunks, learnerContext);

    return {
      query: `${domain}:${id}`,
      chunks,
      totalChunks: chunks.length,
      contextText,
      estimatedTokens: estimateTokens(contextText),
      domainsSearched: [domain],
      learnerContext,
    };
  },

  /**
   * Retrieve JLPT-level overview for study guidance.
   */
  async retrieveJlptContext(level: number, learnerId?: string): Promise<RetrievalResult> {
    const chunks: KnowledgeChunk[] = [];

    // Sample vocabulary at this level
    const vocabRows = await db.select().from(dictionaryEntries)
      .where(eq(dictionaryEntries.jlptLevel, level))
      .orderBy(asc(dictionaryEntries.frequencyRank))
      .limit(5);
    for (const v of vocabRows) {
      const senses = await db.select().from(dictionarySenses)
        .where(eq(dictionarySenses.entryId, v.id)).limit(1);
      const meanings = senses.flatMap((s) => ((s.glosses as Record<string, string[]>).en ?? [])).slice(0, 2);
      chunks.push({
        domain: "dictionary", relevance: 0.8, id: v.id,
        title: `${v.headword} (${v.reading})`,
        content: `${v.headword} (${v.reading}): ${meanings.join(", ")}`,
        metadata: { jlpt: level, headword: v.headword, reading: v.reading, meanings, isCommon: v.isCommon },
      });
    }

    // Grammar at this level
    const grammarRows = await db.select().from(grammarPatterns)
      .where(eq(grammarPatterns.jlptLevel, level))
      .orderBy(asc(grammarPatterns.difficulty))
      .limit(5);
    for (const g of grammarRows) {
      chunks.push({
        domain: "grammar", relevance: 0.8, id: g.id,
        title: g.title,
        content: `${g.title} (${g.structure}): ${g.meaning}. ${g.explanation}`,
        metadata: { jlpt: level, structure: g.structure, meaning: g.meaning },
      });
    }

    // Kanji at this level
    const kanjiRows = await db.select().from(kanjiEntries)
      .where(eq(kanjiEntries.jlptLevel, level))
      .orderBy(asc(kanjiEntries.frequencyRank))
      .limit(5);
    for (const k of kanjiRows) {
      chunks.push({
        domain: "kanji", relevance: 0.7, id: k.id,
        title: k.character,
        content: `${k.character}: ${k.meanings.join(", ")}. On: ${(k.onReadings ?? []).join(", ")}. Kun: ${(k.kunReadings ?? []).join(", ")}`,
        metadata: { jlpt: level, character: k.character, meanings: k.meanings, strokeCount: k.strokeCount },
      });
    }

    let learnerContext: LearnerContext | null = null;
    if (learnerId) learnerContext = await this._getLearnerContext(learnerId);

    const contextText = this._formatContext(chunks, learnerContext);
    return {
      query: `jlpt:N${level}`,
      chunks, totalChunks: chunks.length, contextText,
      estimatedTokens: estimateTokens(contextText),
      domainsSearched: ["dictionary", "grammar", "kanji"],
      learnerContext,
    };
  },

  // ═══════════════════════════════════════════
  // Domain-specific search
  // ═══════════════════════════════════════════

  async _searchDictionary(query: string, limit: number, jlpt?: number): Promise<KnowledgeChunk[]> {
    const conds = [];
    if (isJapanese(query)) {
      conds.push(or(
        ilike(dictionaryEntries.headword, `%${query}%`),
        ilike(dictionaryEntries.reading, `%${query}%`),
      )!);
    } else {
      conds.push(sql`EXISTS (SELECT 1 FROM ${dictionarySenses} WHERE ${dictionarySenses.entryId} = ${dictionaryEntries.id} AND ${dictionarySenses.glosses}::text ILIKE ${"%" + query + "%"})`);
    }
    if (jlpt) conds.push(eq(dictionaryEntries.jlptLevel, jlpt));

    const rows = await db.select().from(dictionaryEntries)
      .where(and(...conds))
      .orderBy(asc(dictionaryEntries.frequencyRank))
      .limit(limit);

    const chunks: KnowledgeChunk[] = [];
    for (const row of rows) {
      const senses = await db.select().from(dictionarySenses)
        .where(eq(dictionarySenses.entryId, row.id)).orderBy(asc(dictionarySenses.position)).limit(3);
      const meanings = senses.flatMap((s) => ((s.glosses as Record<string, string[]>).en ?? [])).slice(0, 5);
      const relevance = row.headword === query || row.reading === query ? 1.0 : 0.7;

      chunks.push({
        domain: "dictionary", relevance, id: row.id,
        title: `${row.headword} (${row.reading})`,
        content: `Vocabulary: ${row.headword} (${row.reading}) — ${meanings.join("; ")}. POS: ${(row.pos ?? []).join(", ")}. JLPT: N${row.jlptLevel ?? "?"}. Common: ${row.isCommon ? "yes" : "no"}.`,
        metadata: { headword: row.headword, reading: row.reading, meanings, pos: row.pos, jlpt: row.jlptLevel, isCommon: row.isCommon, frequencyRank: row.frequencyRank },
      });
    }
    return chunks;
  },

  async _searchKanji(query: string, limit: number, jlpt?: number): Promise<KnowledgeChunk[]> {
    const conds = [];
    if (/^[\u4E00-\u9FFF]$/.test(query)) {
      conds.push(eq(kanjiEntries.character, query));
    } else if (isJapanese(query)) {
      conds.push(sql`EXISTS (SELECT 1 FROM ${kanjiReadings} WHERE ${kanjiReadings.kanjiId} = ${kanjiEntries.id} AND ${kanjiReadings.reading} ILIKE ${"%" + query + "%"})`);
    } else {
      conds.push(sql`array_to_string(${kanjiEntries.meanings}, ' ') ILIKE ${"%" + query + "%"}`);
    }
    if (jlpt) conds.push(eq(kanjiEntries.jlptLevel, jlpt));

    const rows = await db.select().from(kanjiEntries).where(and(...conds)).orderBy(asc(kanjiEntries.frequencyRank)).limit(limit);

    return rows.map((k) => ({
      domain: "kanji" as const, relevance: k.character === query ? 1.0 : 0.6, id: k.id,
      title: k.character,
      content: `Kanji: ${k.character} — Meanings: ${k.meanings.join(", ")}. On: ${(k.onReadings ?? []).join(", ")}. Kun: ${(k.kunReadings ?? []).join(", ")}. Strokes: ${k.strokeCount}. Grade: ${k.grade ?? "?"}.  JLPT: N${k.jlptLevel ?? "?"}.`,
      metadata: { character: k.character, meanings: k.meanings, onReadings: k.onReadings, kunReadings: k.kunReadings, strokeCount: k.strokeCount, grade: k.grade, jlpt: k.jlptLevel },
    }));
  },

  async _searchGrammar(query: string, limit: number, jlpt?: number): Promise<KnowledgeChunk[]> {
    const conds = [sql`(${grammarPatterns.title} ILIKE ${"%" + query + "%"} OR ${grammarPatterns.meaning} ILIKE ${"%" + query + "%"} OR ${grammarPatterns.structure} ILIKE ${"%" + query + "%"} OR ${grammarPatterns.explanation} ILIKE ${"%" + query + "%"})`];
    if (jlpt) conds.push(eq(grammarPatterns.jlptLevel, jlpt));

    const rows = await db.select().from(grammarPatterns).where(and(...conds)).orderBy(asc(grammarPatterns.difficulty)).limit(limit);
    const chunks: KnowledgeChunk[] = [];

    for (const g of rows) {
      const examples = await db.select().from(grammarExamples)
        .where(eq(grammarExamples.grammarId, g.id)).orderBy(asc(grammarExamples.position)).limit(2);
      const exText = examples.map((e) => `  ${e.ja} → ${e.en}`).join("\n");
      const relevance = g.title.includes(query) ? 0.9 : 0.6;

      chunks.push({
        domain: "grammar", relevance, id: g.id,
        title: `${g.title} (${g.structure})`,
        content: `Grammar: ${g.title}\nPattern: ${g.structure}\nMeaning: ${g.meaning}\nExplanation: ${g.explanation}\n${g.formation ? `Formation: ${g.formation}\n` : ""}${g.notes ? `Notes: ${g.notes}\n` : ""}JLPT: N${g.jlptLevel ?? "?"}\nExamples:\n${exText}`,
        metadata: { title: g.title, structure: g.structure, meaning: g.meaning, jlpt: g.jlptLevel, difficulty: g.difficulty, exampleCount: examples.length },
      });
    }
    return chunks;
  },

  async _searchSentences(query: string, limit: number, jlpt?: number): Promise<KnowledgeChunk[]> {
    const conds = [ilike(sentences.japanese, `%${query}%`)];
    if (jlpt) conds.push(eq(sentences.jlptLevel, jlpt));

    const rows = await db.select().from(sentences).where(and(...conds)).limit(limit);
    const chunks: KnowledgeChunk[] = [];

    for (const s of rows) {
      const trans = await db.select().from(sentenceTranslations)
        .where(and(eq(sentenceTranslations.sentenceId, s.id), eq(sentenceTranslations.lang, "en"))).limit(1);
      const english = trans[0]?.translation ?? "";

      chunks.push({
        domain: "sentence", relevance: 0.5, id: s.id,
        title: s.japanese.slice(0, 30),
        content: `Example sentence: ${s.japanese}\nTranslation: ${english}\nJLPT: N${s.jlptLevel ?? "?"}`,
        metadata: { japanese: s.japanese, english, jlpt: s.jlptLevel },
      });
    }
    return chunks;
  },

  async _searchCourses(query: string, limit: number): Promise<KnowledgeChunk[]> {
    const rows = await db.select().from(courses)
      .where(or(ilike(courses.title, `%${query}%`), ilike(courses.description, `%${query}%`))!)
      .limit(limit);

    return rows.map((c) => ({
      domain: "course" as const, relevance: 0.4, id: c.id,
      title: c.title,
      content: `Course: ${c.title}. Level: ${c.level}. JLPT: N${c.jlptLevel ?? "?"}. ${c.description ?? ""}`,
      metadata: { title: c.title, level: c.level, jlpt: c.jlptLevel, status: c.status },
    }));
  },

  async _searchLessons(query: string, limit: number): Promise<KnowledgeChunk[]> {
    const rows = await db.select().from(lessons)
      .where(or(ilike(lessons.title, `%${query}%`), ilike(lessons.summary, `%${query}%`))!)
      .limit(limit);

    return rows.map((l) => ({
      domain: "lesson" as const, relevance: 0.3, id: l.id,
      title: l.title,
      content: `Lesson: ${l.title}. Type: ${l.kind}. ${l.summary ?? ""}. JLPT: N${l.jlptLevel ?? "?"}. XP: ${l.xpReward}.`,
      metadata: { title: l.title, kind: l.kind, jlpt: l.jlptLevel, xpReward: l.xpReward },
    }));
  },

  // ═══════════════════════════════════════════
  // Entity lookup
  // ═══════════════════════════════════════════

  async _getById(domain: string, id: string): Promise<KnowledgeChunk | null> {
    switch (domain) {
      case "dictionary": {
        const [row] = await db.select().from(dictionaryEntries).where(eq(dictionaryEntries.id, id)).limit(1);
        if (!row) return null;
        const senses = await db.select().from(dictionarySenses).where(eq(dictionarySenses.entryId, id)).limit(3);
        const meanings = senses.flatMap((s) => ((s.glosses as Record<string, string[]>).en ?? []));
        return {
          domain: "dictionary", relevance: 1.0, id: row.id,
          title: `${row.headword} (${row.reading})`,
          content: `Vocabulary: ${row.headword} (${row.reading}) — ${meanings.join("; ")}. POS: ${(row.pos ?? []).join(", ")}. JLPT: N${row.jlptLevel ?? "?"}`,
          metadata: { headword: row.headword, reading: row.reading, meanings, pos: row.pos, jlpt: row.jlptLevel },
        };
      }
      case "kanji": {
        const [row] = await db.select().from(kanjiEntries).where(eq(kanjiEntries.id, id)).limit(1);
        if (!row) return null;
        return {
          domain: "kanji", relevance: 1.0, id: row.id, title: row.character,
          content: `Kanji: ${row.character} — ${row.meanings.join(", ")}. On: ${(row.onReadings ?? []).join(", ")}. Kun: ${(row.kunReadings ?? []).join(", ")}. Strokes: ${row.strokeCount}. JLPT: N${row.jlptLevel ?? "?"}`,
          metadata: { character: row.character, meanings: row.meanings, strokeCount: row.strokeCount, jlpt: row.jlptLevel },
        };
      }
      case "grammar": {
        const [row] = await db.select().from(grammarPatterns).where(eq(grammarPatterns.id, id)).limit(1);
        if (!row) return null;
        return {
          domain: "grammar", relevance: 1.0, id: row.id, title: row.title,
          content: `Grammar: ${row.title} (${row.structure}) — ${row.meaning}. ${row.explanation}`,
          metadata: { title: row.title, structure: row.structure, meaning: row.meaning, jlpt: row.jlptLevel },
        };
      }
      default: return null;
    }
  },

  async _getSentencesForEntry(entryId: string, limit: number): Promise<KnowledgeChunk[]> {
    const rows = await db.select().from(sentences).where(eq(sentences.dictionaryEntryId, entryId)).limit(limit);
    const chunks: KnowledgeChunk[] = [];
    for (const s of rows) {
      const trans = await db.select().from(sentenceTranslations).where(and(eq(sentenceTranslations.sentenceId, s.id), eq(sentenceTranslations.lang, "en"))).limit(1);
      chunks.push({
        domain: "sentence", relevance: 0.8, id: s.id,
        title: s.japanese.slice(0, 30),
        content: `Example: ${s.japanese} → ${trans[0]?.translation ?? ""}`,
        metadata: { japanese: s.japanese, english: trans[0]?.translation },
      });
    }
    return chunks;
  },

  async _getGrammarExamples(grammarId: string): Promise<KnowledgeChunk | null> {
    const examples = await db.select().from(grammarExamples).where(eq(grammarExamples.grammarId, grammarId)).limit(5);
    if (examples.length === 0) return null;
    return {
      domain: "grammar", relevance: 0.7, id: `${grammarId}-examples`,
      title: "Examples",
      content: examples.map((e) => `${e.ja} → ${e.en}`).join("\n"),
      metadata: { grammarId, count: examples.length },
    };
  },

  // ═══════════════════════════════════════════
  // Learner context
  // ═══════════════════════════════════════════

  async _getLearnerContext(learnerId: string): Promise<LearnerContext> {
    const knownWords = await db.select({ hw: dictionaryEntries.headword })
      .from(vocabularyProgress)
      .innerJoin(dictionaryEntries, eq(vocabularyProgress.entryId, dictionaryEntries.id))
      .where(and(eq(vocabularyProgress.learnerId, learnerId), sql`${vocabularyProgress.mastery} IN ('mastered', 'familiar')`))
      .limit(50);

    const studyingWords = await db.select({ hw: dictionaryEntries.headword })
      .from(vocabularyProgress)
      .innerJoin(dictionaryEntries, eq(vocabularyProgress.entryId, dictionaryEntries.id))
      .where(and(eq(vocabularyProgress.learnerId, learnerId), sql`${vocabularyProgress.mastery} IN ('introduced', 'practicing')`))
      .limit(20);

    const knownGrammar = await db.select({ title: grammarPatterns.title })
      .from(grammarProgress)
      .innerJoin(grammarPatterns, eq(grammarProgress.grammarId, grammarPatterns.id))
      .where(and(eq(grammarProgress.learnerId, learnerId), sql`${grammarProgress.mastery} IN ('mastered', 'familiar', 'practicing')`))
      .limit(30);

    // Determine approximate JLPT level from what they've studied
    const vocabJlpt = await db.select({ jlpt: dictionaryEntries.jlptLevel })
      .from(vocabularyProgress)
      .innerJoin(dictionaryEntries, eq(vocabularyProgress.entryId, dictionaryEntries.id))
      .where(and(eq(vocabularyProgress.learnerId, learnerId), sql`${vocabularyProgress.mastery} != 'unseen'`))
      .limit(1);

    return {
      learnerId,
      jlptLevel: vocabJlpt[0]?.jlpt ?? null,
      knownWords: knownWords.map((w) => w.hw),
      studyingWords: studyingWords.map((w) => w.hw),
      knownGrammar: knownGrammar.map((g) => g.title),
      currentLesson: null,
    };
  },

  // ═══════════════════════════════════════════
  // Context formatting for AI prompt injection
  // ═══════════════════════════════════════════

  _formatContext(chunks: KnowledgeChunk[], learner: LearnerContext | null): string {
    if (chunks.length === 0 && !learner) return "";

    const parts: string[] = [];
    parts.push("=== KNOWLEDGE CONTEXT ===");

    // Group chunks by domain
    const byDomain = new Map<string, KnowledgeChunk[]>();
    for (const c of chunks) {
      if (!byDomain.has(c.domain)) byDomain.set(c.domain, []);
      byDomain.get(c.domain)!.push(c);
    }

    for (const [domain, domainChunks] of byDomain) {
      parts.push(`\n--- ${domain.toUpperCase()} ---`);
      for (const chunk of domainChunks) {
        parts.push(chunk.content);
      }
    }

    if (learner) {
      parts.push("\n--- LEARNER PROFILE ---");
      parts.push(`JLPT Level: N${learner.jlptLevel ?? "?"}`);
      if (learner.knownWords.length > 0) parts.push(`Known words: ${learner.knownWords.join(", ")}`);
      if (learner.studyingWords.length > 0) parts.push(`Currently studying: ${learner.studyingWords.join(", ")}`);
      if (learner.knownGrammar.length > 0) parts.push(`Known grammar: ${learner.knownGrammar.join(", ")}`);
    }

    parts.push("\n=== END CONTEXT ===");
    return parts.join("\n");
  },
};
