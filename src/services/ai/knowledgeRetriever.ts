/**
 * KnowledgeRetriever — structured retrieval across platform knowledge.
 *
 * Phase 13, Prompt 13.2. This is the retrieval half of the canonical AI
 * architecture selected in reports/ai/PHASE-13.1-AI-ARCHITECTURE-AUDIT.md:
 *
 *   route -> AI service -> KnowledgeRetriever -> canonical Postgres tables
 *                        -> (later) single AIProvider port
 *
 * Rules enforced here:
 *   - NO AI provider is called. This module is pure database retrieval, so
 *     it stays testable without credentials and cannot hallucinate.
 *   - Every returned chunk carries the underlying source record plus its
 *     provenance (source ref, version, licence), so grounded answers can
 *     cite real rows instead of invented facts.
 *   - Kanji is read from the existing canonical kanji tables; no second
 *     kanji store is introduced.
 */

import "server-only";

import { db } from "@/db";
import {
  dictionaryEntries as dictionaryTable,
  exampleSentences as sentenceTable,
  grammarPatterns as grammarTable,
  kanjiEntries as kanjiTable,
} from "@/db/schema";
import { and, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import {
  KnowledgeCorpusService,
  type ProvenanceRecord,
} from "@/services/knowledge/corpusService";

/* ============================================================
 * Types
 * ============================================================ */

export const KNOWLEDGE_DOMAINS = ["dictionary", "kanji", "grammar", "sentence"] as const;
export type KnowledgeDomain = (typeof KNOWLEDGE_DOMAINS)[number];

export type DictionaryRecord = typeof dictionaryTable.$inferSelect;
export type KanjiRecord = typeof kanjiTable.$inferSelect;
export type GrammarRecord = typeof grammarTable.$inferSelect;
export type SentenceRecord = typeof sentenceTable.$inferSelect;

export type KnowledgeRecord =
  | DictionaryRecord
  | KanjiRecord
  | GrammarRecord
  | SentenceRecord;

/** One retrieved unit of knowledge, ready for prompt grounding. */
export interface KnowledgeChunk<T extends KnowledgeRecord = KnowledgeRecord> {
  domain: KnowledgeDomain;
  /** Primary key of the source row. */
  id: string;
  /** Short human label, e.g. "水 (みず)". */
  title: string;
  /** Flattened text used for prompt injection. */
  content: string;
  /** 0–1 relevance score. */
  relevance: number;
  /** Why this row matched, for debugging and tests. */
  matchedOn: string;
  /** The untouched database row. */
  record: T;
  /** Provenance pointer stored on the row. */
  sourceRef: string;
  jlptLevel: string | null;
}

export interface RetrievalOptions {
  domains?: KnowledgeDomain[];
  /** Max chunks per domain. */
  maxPerDomain?: number;
  /** Max chunks overall. */
  maxTotal?: number;
  /** Restrict to a JLPT level such as "N5". */
  jlptLevel?: string;
}

export interface RetrievalResult {
  query: string;
  /** Detected script of the query. */
  queryType: "japanese" | "romaji" | "english" | "empty";
  chunks: KnowledgeChunk[];
  totalChunks: number;
  /** Chunk counts per domain. */
  domainCounts: Record<KnowledgeDomain, number>;
  domainsSearched: KnowledgeDomain[];
  /** Distinct provenance records behind the returned chunks. */
  sources: ProvenanceRecord[];
  /** Pre-formatted, citation-tagged context for prompt injection. */
  contextText: string;
  estimatedTokens: number;
}

/* ============================================================
 * Helpers
 * ============================================================ */

const JAPANESE_RE = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;

function classifyQuery(query: string): RetrievalResult["queryType"] {
  const trimmed = query.trim();
  if (!trimmed) return "empty";
  if (JAPANESE_RE.test(trimmed)) return "japanese";
  // Romaji heuristic: a single latin token with no spaces reads as a word lookup.
  if (/^[a-z][a-z'-]*$/i.test(trimmed)) return "romaji";
  return "english";
}

function estimateTokens(text: string): number {
  const jp = (text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g) ?? []).length;
  return Math.ceil(jp / 2 + (text.length - jp) / 4);
}

function like(value: string): string {
  return `%${value}%`;
}

/** jsonb array/object text search, used for readings, glosses and tags. */
function jsonbContainsText(column: SQL | unknown, needle: string): SQL {
  return sql`${column}::text ILIKE ${like(needle)}`;
}

function scoreText(query: string, candidate: string | null | undefined): number {
  if (!candidate) return 0;
  const q = query.trim().toLowerCase();
  const c = candidate.toLowerCase();
  if (!q) return 0;
  if (c === q) return 1;
  if (c.startsWith(q)) return 0.82;
  if (c.includes(q)) return 0.68;
  return 0;
}

function bestScore(
  query: string,
  candidates: Array<[string | null | undefined, string, number]>,
): { relevance: number; matchedOn: string } {
  let relevance = 0;
  let matchedOn = "none";
  for (const [value, label, weight] of candidates) {
    const score = scoreText(query, value) * weight;
    if (score > relevance) {
      relevance = score;
      matchedOn = label;
    }
  }
  return { relevance: Math.min(1, relevance), matchedOn };
}

function dedupeAndRank(chunks: KnowledgeChunk[], maxTotal: number): KnowledgeChunk[] {
  const seen = new Set<string>();
  const unique: KnowledgeChunk[] = [];
  for (const chunk of chunks.sort((a, b) => b.relevance - a.relevance)) {
    const key = `${chunk.domain}:${chunk.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(chunk);
  }
  return unique.slice(0, maxTotal);
}

/* ============================================================
 * Chunk builders — one per domain
 * ============================================================ */

function dictionaryChunk(
  row: DictionaryRecord,
  relevance: number,
  matchedOn: string,
): KnowledgeChunk<DictionaryRecord> {
  const glosses = row.senses.flatMap((sense) => sense.glosses);
  const notes = row.senses.map((sense) => sense.note).filter(Boolean);
  return {
    domain: "dictionary",
    id: row.id,
    title: `${row.headword} (${row.reading})`,
    content: [
      `${row.headword}【${row.reading}／${row.romaji}】`,
      `Part of speech: ${row.partsOfSpeech.join(", ") || "unspecified"}`,
      `Meaning: ${glosses.join("; ")}`,
      notes.length ? `Note: ${notes.join(" ")}` : "",
      `JLPT: ${row.jlptLevel}`,
    ]
      .filter(Boolean)
      .join("\n"),
    relevance,
    matchedOn,
    record: row,
    sourceRef: row.sourceRef,
    jlptLevel: row.jlptLevel,
  };
}

function kanjiChunk(
  row: KanjiRecord,
  relevance: number,
  matchedOn: string,
): KnowledgeChunk<KanjiRecord> {
  return {
    domain: "kanji",
    id: row.id,
    title: row.character,
    content: [
      `${row.character} — ${row.meaning}`,
      `On'yomi: ${row.readingsOn.join("、") || "—"}`,
      `Kun'yomi: ${row.readingsKun.join("、") || "—"}`,
      `Strokes: ${row.strokeCount}`,
      row.mnemonic ? `Mnemonic: ${row.mnemonic}` : "",
      row.vocabulary.length
        ? `Example words: ${row.vocabulary
            .slice(0, 3)
            .map((v) => `${v.word}（${v.reading}）${v.meaning}`)
            .join("; ")}`
        : "",
      `JLPT: ${row.jlptLevel}`,
    ]
      .filter(Boolean)
      .join("\n"),
    relevance,
    matchedOn,
    record: row,
    sourceRef: row.sourceRef,
    jlptLevel: row.jlptLevel,
  };
}

function grammarChunk(
  row: GrammarRecord,
  relevance: number,
  matchedOn: string,
): KnowledgeChunk<GrammarRecord> {
  return {
    domain: "grammar",
    id: row.id,
    title: row.title,
    content: [
      `${row.title} — ${row.meaning}`,
      `Structure: ${row.structure}`,
      `Explanation: ${row.explanation}`,
      row.formation ? `Formation: ${row.formation}` : "",
      row.commonMistakes.length
        ? `Common mistakes: ${row.commonMistakes.join(" | ")}`
        : "",
      `JLPT: ${row.jlptLevel}`,
    ]
      .filter(Boolean)
      .join("\n"),
    relevance,
    matchedOn,
    record: row,
    sourceRef: row.sourceRef,
    jlptLevel: row.jlptLevel,
  };
}

function sentenceChunk(
  row: SentenceRecord,
  relevance: number,
  matchedOn: string,
): KnowledgeChunk<SentenceRecord> {
  return {
    domain: "sentence",
    id: row.id,
    title: row.japanese,
    content: [
      row.japanese,
      `Reading: ${row.reading}`,
      `English: ${row.english}`,
      row.grammarId ? `Grammar: ${row.grammarId}` : "",
      `JLPT: ${row.jlptLevel}`,
    ]
      .filter(Boolean)
      .join("\n"),
    relevance,
    matchedOn,
    record: row,
    sourceRef: row.sourceRef,
    jlptLevel: row.jlptLevel,
  };
}

/* ============================================================
 * KnowledgeRetriever
 * ============================================================ */

export class KnowledgeRetriever {
  /**
   * Structured multi-domain retrieval.
   *
   * Returns ranked chunks, each wrapping the real source row, plus the
   * provenance records those rows came from.
   */
  static async retrieve(
    query: string,
    options: RetrievalOptions = {},
  ): Promise<RetrievalResult> {
    const {
      domains = [...KNOWLEDGE_DOMAINS],
      maxPerDomain = 5,
      maxTotal = 12,
      jlptLevel,
    } = options;

    const trimmed = query.trim();
    const queryType = classifyQuery(trimmed);

    if (queryType === "empty") {
      return this.emptyResult(trimmed, queryType, domains);
    }

    const [dictionary, kanji, grammar, sentence] = await Promise.all([
      domains.includes("dictionary")
        ? this.searchDictionary(trimmed, maxPerDomain, jlptLevel)
        : Promise.resolve([]),
      domains.includes("kanji")
        ? this.searchKanji(trimmed, maxPerDomain, jlptLevel)
        : Promise.resolve([]),
      domains.includes("grammar")
        ? this.searchGrammar(trimmed, maxPerDomain, jlptLevel)
        : Promise.resolve([]),
      domains.includes("sentence")
        ? this.searchSentences(trimmed, maxPerDomain, jlptLevel)
        : Promise.resolve([]),
    ]);

    const chunks = dedupeAndRank(
      [...dictionary, ...kanji, ...grammar, ...sentence],
      maxTotal,
    );

    return this.buildResult(trimmed, queryType, chunks, domains);
  }

  /**
   * Retrieve one entity plus the records directly linked to it.
   * Used when the learner asks about a specific word, kanji or pattern.
   */
  static async retrieveEntity(
    domain: KnowledgeDomain,
    id: string,
  ): Promise<RetrievalResult> {
    const chunks: KnowledgeChunk[] = [];

    if (domain === "dictionary") {
      const row = await KnowledgeCorpusService.getDictionaryEntry(id);
      if (row) {
        chunks.push(dictionaryChunk(row, 1, "entity"));
        chunks.push(...(await this.sentencesForEntry(row.id)));
        chunks.push(...(await this.kanjiForCharacters(row.kanjiCharacters)));
      }
    }

    if (domain === "grammar") {
      const row = await KnowledgeCorpusService.getGrammarPattern(id);
      if (row) {
        chunks.push(grammarChunk(row, 1, "entity"));
        const linked = await db
          .select()
          .from(sentenceTable)
          .where(eq(sentenceTable.grammarId, row.id))
          .limit(5);
        chunks.push(...linked.map((s) => sentenceChunk(s, 0.9, "grammar-link")));
      }
    }

    if (domain === "sentence") {
      const row = await KnowledgeCorpusService.getSentence(id);
      if (row) {
        chunks.push(sentenceChunk(row, 1, "entity"));
        if (row.grammarId) {
          const grammar = await KnowledgeCorpusService.getGrammarPattern(row.grammarId);
          if (grammar) chunks.push(grammarChunk(grammar, 0.9, "sentence-link"));
        }
      }
    }

    if (domain === "kanji") {
      const [row] = await db
        .select()
        .from(kanjiTable)
        .where(or(eq(kanjiTable.id, id), eq(kanjiTable.character, id)))
        .limit(1);
      if (row) {
        chunks.push(kanjiChunk(row, 1, "entity"));
        const words = await db
          .select()
          .from(dictionaryTable)
          .where(jsonbContainsText(dictionaryTable.kanjiCharacters, row.character))
          .limit(5);
        chunks.push(...words.map((w) => dictionaryChunk(w, 0.85, "kanji-link")));

        const linkedSentences = await db
          .select()
          .from(sentenceTable)
          .where(jsonbContainsText(sentenceTable.kanjiCharacters, row.character))
          .limit(5);
        chunks.push(...linkedSentences.map((s) => sentenceChunk(s, 0.82, "kanji-sentence-link")));
      }
    }

    return this.buildResult(`${domain}:${id}`, "japanese", chunks, [domain]);
  }

  /* ---------- domain searches ---------- */

  private static async searchDictionary(
    query: string,
    limit: number,
    jlptLevel?: string,
  ): Promise<KnowledgeChunk[]> {
    const filters: SQL[] = [
      or(
        ilike(dictionaryTable.headword, like(query)),
        ilike(dictionaryTable.reading, like(query)),
        ilike(dictionaryTable.romaji, like(query)),
        jsonbContainsText(dictionaryTable.senses, query),
        jsonbContainsText(dictionaryTable.tags, query),
      ) as SQL,
    ];
    if (jlptLevel) filters.push(eq(dictionaryTable.jlptLevel, jlptLevel));

    const rows = await db
      .select()
      .from(dictionaryTable)
      .where(and(...filters))
      .limit(limit * 4);

    return rows
      .map((row) => {
        const glosses = row.senses.flatMap((s) => s.glosses).join(" ");
        const { relevance, matchedOn } = bestScore(query, [
          [row.headword, "headword", 1],
          [row.reading, "reading", 0.98],
          [row.romaji, "romaji", 0.96],
          [glosses, "gloss", 0.8],
          [row.tags.join(" "), "tag", 0.5],
        ]);
        return dictionaryChunk(row, relevance, matchedOn);
      })
      .filter((chunk) => chunk.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
  }

  private static async searchKanji(
    query: string,
    limit: number,
    jlptLevel?: string,
  ): Promise<KnowledgeChunk[]> {
    const filters: SQL[] = [
      or(
        ilike(kanjiTable.character, like(query)),
        ilike(kanjiTable.meaning, like(query)),
        jsonbContainsText(kanjiTable.readingsKun, query),
        jsonbContainsText(kanjiTable.readingsOn, query),
        jsonbContainsText(kanjiTable.vocabulary, query),
      ) as SQL,
    ];
    if (jlptLevel) filters.push(eq(kanjiTable.jlptLevel, jlptLevel));

    const rows = await db
      .select()
      .from(kanjiTable)
      .where(and(...filters))
      .limit(limit * 4);

    return rows
      .map((row) => {
        const { relevance, matchedOn } = bestScore(query, [
          [row.character, "character", 1],
          [row.meaning, "meaning", 0.85],
          [row.readingsKun.join(" "), "kun-reading", 0.8],
          [row.readingsOn.join(" "), "on-reading", 0.8],
          [row.vocabulary.map((v) => `${v.word} ${v.meaning}`).join(" "), "vocabulary", 0.6],
        ]);
        return kanjiChunk(row, relevance, matchedOn);
      })
      .filter((chunk) => chunk.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
  }

  private static async searchGrammar(
    query: string,
    limit: number,
    jlptLevel?: string,
  ): Promise<KnowledgeChunk[]> {
    const filters: SQL[] = [
      or(
        ilike(grammarTable.title, like(query)),
        ilike(grammarTable.slug, like(query)),
        ilike(grammarTable.structure, like(query)),
        ilike(grammarTable.meaning, like(query)),
        ilike(grammarTable.explanation, like(query)),
        jsonbContainsText(grammarTable.tags, query),
      ) as SQL,
    ];
    if (jlptLevel) filters.push(eq(grammarTable.jlptLevel, jlptLevel));

    const rows = await db
      .select()
      .from(grammarTable)
      .where(and(...filters))
      .limit(limit * 4);

    return rows
      .map((row) => {
        const { relevance, matchedOn } = bestScore(query, [
          [row.title, "title", 1],
          [row.slug, "slug", 0.9],
          [row.structure, "structure", 0.85],
          [row.meaning, "meaning", 0.8],
          [row.explanation, "explanation", 0.6],
          [row.tags.join(" "), "tag", 0.5],
        ]);
        return grammarChunk(row, relevance, matchedOn);
      })
      .filter((chunk) => chunk.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
  }

  private static async searchSentences(
    query: string,
    limit: number,
    jlptLevel?: string,
  ): Promise<KnowledgeChunk[]> {
    const filters: SQL[] = [
      or(
        ilike(sentenceTable.japanese, like(query)),
        ilike(sentenceTable.reading, like(query)),
        ilike(sentenceTable.english, like(query)),
        jsonbContainsText(sentenceTable.tags, query),
      ) as SQL,
    ];
    if (jlptLevel) filters.push(eq(sentenceTable.jlptLevel, jlptLevel));

    const rows = await db
      .select()
      .from(sentenceTable)
      .where(and(...filters))
      .limit(limit * 4);

    return rows
      .map((row) => {
        const { relevance, matchedOn } = bestScore(query, [
          [row.japanese, "japanese", 0.9],
          [row.reading, "reading", 0.85],
          [row.english, "english", 0.8],
          [row.tags.join(" "), "tag", 0.5],
        ]);
        // Substring hits inside a long sentence are still useful grounding.
        const floor = row.japanese.includes(query) || row.reading.includes(query) ? 0.6 : 0;
        return sentenceChunk(row, Math.max(relevance, floor), relevance ? "text" : "substring");
      })
      .filter((chunk) => chunk.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
  }

  /* ---------- linked lookups ---------- */

  private static async sentencesForEntry(entryId: string): Promise<KnowledgeChunk[]> {
    const rows = await db
      .select()
      .from(sentenceTable)
      .where(sql`${sentenceTable.dictionaryEntryIds} @> ${JSON.stringify([entryId])}::jsonb`)
      .limit(4);
    return rows.map((row) => sentenceChunk(row, 0.88, "vocabulary-link"));
  }

  private static async kanjiForCharacters(characters: string[]): Promise<KnowledgeChunk[]> {
    if (characters.length === 0) return [];
    const rows = await db
      .select()
      .from(kanjiTable)
      .where(
        or(...characters.map((character) => eq(kanjiTable.character, character))) as SQL,
      )
      .limit(4);
    return rows.map((row) => kanjiChunk(row, 0.8, "kanji-of-word"));
  }

  /* ---------- result assembly ---------- */

  private static emptyResult(
    query: string,
    queryType: RetrievalResult["queryType"],
    domains: KnowledgeDomain[],
  ): RetrievalResult {
    return {
      query,
      queryType,
      chunks: [],
      totalChunks: 0,
      domainCounts: { dictionary: 0, kanji: 0, grammar: 0, sentence: 0 },
      domainsSearched: domains,
      sources: [],
      contextText: "",
      estimatedTokens: 0,
    };
  }

  private static async buildResult(
    query: string,
    queryType: RetrievalResult["queryType"],
    chunks: KnowledgeChunk[],
    domains: KnowledgeDomain[],
  ): Promise<RetrievalResult> {
    const sources = await KnowledgeCorpusService.getProvenance(
      chunks.map((chunk) => chunk.sourceRef),
    );
    const contextText = this.formatContext(chunks);

    const domainCounts: Record<KnowledgeDomain, number> = {
      dictionary: 0,
      kanji: 0,
      grammar: 0,
      sentence: 0,
    };
    for (const chunk of chunks) domainCounts[chunk.domain] += 1;

    return {
      query,
      queryType,
      chunks,
      totalChunks: chunks.length,
      domainCounts,
      domainsSearched: domains,
      sources,
      contextText,
      estimatedTokens: estimateTokens(contextText),
    };
  }

  /**
   * Format retrieved records for prompt injection.
   * Each block is tagged with its domain, row id and source ref so the
   * generation step can cite verifiable records.
   */
  static formatContext(chunks: KnowledgeChunk[]): string {
    if (chunks.length === 0) return "";

    const sections: string[] = ["KNOWLEDGE CONTEXT (cite these records; do not invent facts)"];
    for (const domain of KNOWLEDGE_DOMAINS) {
      const inDomain = chunks.filter((chunk) => chunk.domain === domain);
      if (inDomain.length === 0) continue;
      sections.push(`\n## ${domain.toUpperCase()}`);
      for (const chunk of inDomain) {
        sections.push(
          `\n[${chunk.domain}:${chunk.id} | source=${chunk.sourceRef}]\n${chunk.content}`,
        );
      }
    }
    return sections.join("\n");
  }
}
