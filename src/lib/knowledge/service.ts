import "server-only";

import { and, asc, desc, eq, ilike, lte, or, sql, type SQLWrapper } from "drizzle-orm";
import { db } from "@/db";
import {
  knowledgeCollocations,
  knowledgeDatasets,
  knowledgeGrammarExamples,
  knowledgeGrammarPoints,
  knowledgeIdioms,
  knowledgeImportRuns,
  knowledgeKanji,
  knowledgeKanjiComponents,
  knowledgeKanjiMeanings,
  knowledgeKanjiReadings,
  knowledgeKanjiStrokes,
  knowledgeLexemeGlosses,
  knowledgeLexemeReadings,
  knowledgeLexemeSenses,
  knowledgeLexemeSpellings,
  knowledgeLexemes,
  knowledgeNames,
  knowledgeSentenceTokens,
  knowledgeSentenceTranslations,
  knowledgeSentences,
  knowledgeSrsCards,
  knowledgeSrsReviews,
  knowledgeValidationIssues,
} from "@/db/schema";
import { calculateSrsTransition } from "@/lib/knowledge/srs";

export type KnowledgeSearchKind = "lexeme" | "kanji" | "grammar" | "sentence" | "idiom" | "collocation" | "name";

export type KnowledgeSearchResult = {
  kind: KnowledgeSearchKind;
  id: string;
  title: string;
  reading: string | null;
  summary: string | null;
  jlptLevel: string | null;
  score: number;
};

function clampPageLimit(limit: number | undefined): number {
  return Math.min(50, Math.max(1, limit ?? 20));
}

function searchPredicate(searchText: SQLWrapper, query: string, pattern: string) {
  return sql`to_tsvector('simple', coalesce(${searchText}, '')) @@ websearch_to_tsquery('simple', ${query}) OR ${searchText} ILIKE ${pattern}`;
}

export async function searchKnowledge(input: {
  query: string;
  kinds?: KnowledgeSearchKind[];
  limit?: number;
  offset?: number;
}): Promise<KnowledgeSearchResult[]> {
  const query = input.query.trim();
  if (!query) return [];
  const pattern = `%${query.replace(/[%_]/g, "\\$&")}%`;
  const limit = clampPageLimit(input.limit);
  const offset = Math.max(0, input.offset ?? 0);
  const kinds = input.kinds?.length ? input.kinds : ["lexeme", "kanji", "grammar", "sentence", "idiom", "collocation", "name"];
  const perKindLimit = Math.max(5, Math.ceil(limit / Math.max(1, kinds.length)));
  const results: KnowledgeSearchResult[] = [];

  if (kinds.includes("lexeme")) {
    const rows = await db
      .select({ id: knowledgeLexemes.id, spelling: knowledgeLexemes.primarySpelling, reading: knowledgeLexemes.primaryReading, summary: knowledgeLexemes.primaryGloss, jlpt: knowledgeLexemes.jlptLevel, score: sql<number>`ts_rank(to_tsvector('simple', ${knowledgeLexemes.searchText}), websearch_to_tsquery('simple', ${query}))` })
      .from(knowledgeLexemes)
      .where(or(searchPredicate(knowledgeLexemes.searchText, query, pattern), ilike(knowledgeLexemes.primarySpelling, pattern), ilike(knowledgeLexemes.primaryReading, pattern)))
      .orderBy(desc(sql`ts_rank(to_tsvector('simple', ${knowledgeLexemes.searchText}), websearch_to_tsquery('simple', ${query}))`))
      .limit(perKindLimit)
      .offset(offset);
    results.push(...rows.map((row) => ({ kind: "lexeme" as const, id: row.id, title: row.spelling ?? row.reading ?? "", reading: row.reading, summary: row.summary, jlptLevel: row.jlpt, score: Number(row.score ?? 0) })));
  }

  if (kinds.includes("kanji")) {
    const rows = await db
      .select({ id: knowledgeKanji.id, literal: knowledgeKanji.literal, summary: knowledgeKanji.searchText, jlpt: knowledgeKanji.jlptLevel, score: sql<number>`ts_rank(to_tsvector('simple', ${knowledgeKanji.searchText}), websearch_to_tsquery('simple', ${query}))` })
      .from(knowledgeKanji)
      .where(or(searchPredicate(knowledgeKanji.searchText, query, pattern), ilike(knowledgeKanji.literal, pattern)))
      .orderBy(desc(sql`ts_rank(to_tsvector('simple', ${knowledgeKanji.searchText}), websearch_to_tsquery('simple', ${query}))`))
      .limit(perKindLimit)
      .offset(offset);
    results.push(...rows.map((row) => ({ kind: "kanji" as const, id: row.id, title: row.literal, reading: null, summary: row.summary, jlptLevel: row.jlpt, score: Number(row.score ?? 0) })));
  }

  if (kinds.includes("grammar")) {
    const rows = await db
      .select({ id: knowledgeGrammarPoints.id, title: knowledgeGrammarPoints.title, pattern: knowledgeGrammarPoints.pattern, summary: knowledgeGrammarPoints.explanation, jlpt: knowledgeGrammarPoints.jlptLevel, score: sql<number>`ts_rank(to_tsvector('simple', ${knowledgeGrammarPoints.searchText}), websearch_to_tsquery('simple', ${query}))` })
      .from(knowledgeGrammarPoints)
      .where(or(searchPredicate(knowledgeGrammarPoints.searchText, query, pattern), ilike(knowledgeGrammarPoints.pattern, pattern)))
      .orderBy(desc(sql`ts_rank(to_tsvector('simple', ${knowledgeGrammarPoints.searchText}), websearch_to_tsquery('simple', ${query}))`))
      .limit(perKindLimit)
      .offset(offset);
    results.push(...rows.map((row) => ({ kind: "grammar" as const, id: row.id, title: row.title, reading: row.pattern, summary: row.summary, jlptLevel: row.jlpt, score: Number(row.score ?? 0) })));
  }

  if (kinds.includes("sentence")) {
    const rows = await db
      .select({ id: knowledgeSentences.id, text: knowledgeSentences.text, reading: knowledgeSentences.reading, jlpt: knowledgeSentences.jlptLevel, score: sql<number>`ts_rank(to_tsvector('simple', ${knowledgeSentences.searchText}), websearch_to_tsquery('simple', ${query}))` })
      .from(knowledgeSentences)
      .where(or(searchPredicate(knowledgeSentences.searchText, query, pattern), ilike(knowledgeSentences.text, pattern)))
      .orderBy(desc(sql`ts_rank(to_tsvector('simple', ${knowledgeSentences.searchText}), websearch_to_tsquery('simple', ${query}))`))
      .limit(perKindLimit)
      .offset(offset);
    results.push(...rows.map((row) => ({ kind: "sentence" as const, id: row.id, title: row.text, reading: row.reading, summary: null, jlptLevel: row.jlpt, score: Number(row.score ?? 0) })));
  }

  if (kinds.includes("idiom")) {
    const rows = await db
      .select({ id: knowledgeIdioms.id, expression: knowledgeIdioms.expression, reading: knowledgeIdioms.reading, meaning: knowledgeIdioms.meaning, jlpt: knowledgeIdioms.jlptLevel, score: sql<number>`ts_rank(to_tsvector('simple', ${knowledgeIdioms.searchText}), websearch_to_tsquery('simple', ${query}))` })
      .from(knowledgeIdioms)
      .where(or(searchPredicate(knowledgeIdioms.searchText, query, pattern), ilike(knowledgeIdioms.expression, pattern)))
      .orderBy(desc(sql`ts_rank(to_tsvector('simple', ${knowledgeIdioms.searchText}), websearch_to_tsquery('simple', ${query}))`))
      .limit(perKindLimit)
      .offset(offset);
    results.push(...rows.map((row) => ({ kind: "idiom" as const, id: row.id, title: row.expression, reading: row.reading, summary: row.meaning, jlptLevel: row.jlpt, score: Number(row.score ?? 0) })));
  }

  if (kinds.includes("collocation")) {
    const rows = await db
      .select({ id: knowledgeCollocations.id, headword: knowledgeCollocations.headword, collocate: knowledgeCollocations.collocate, example: knowledgeCollocations.example, score: sql<number>`ts_rank(to_tsvector('simple', ${knowledgeCollocations.searchText}), websearch_to_tsquery('simple', ${query}))` })
      .from(knowledgeCollocations)
      .where(searchPredicate(knowledgeCollocations.searchText, query, pattern))
      .orderBy(desc(sql`ts_rank(to_tsvector('simple', ${knowledgeCollocations.searchText}), websearch_to_tsquery('simple', ${query}))`))
      .limit(perKindLimit)
      .offset(offset);
    results.push(...rows.map((row) => ({ kind: "collocation" as const, id: row.id, title: `${row.headword} + ${row.collocate}`, reading: null, summary: row.example, jlptLevel: null, score: Number(row.score ?? 0) })));
  }

  if (kinds.includes("name")) {
    const rows = await db
      .select({ id: knowledgeNames.id, kanji: knowledgeNames.kanji, reading: knowledgeNames.reading, searchText: knowledgeNames.searchText })
      .from(knowledgeNames)
      .where(or(searchPredicate(knowledgeNames.searchText, query, pattern), ilike(knowledgeNames.reading, pattern), ilike(knowledgeNames.kanji, pattern)))
      .limit(perKindLimit)
      .offset(offset);
    results.push(...rows.map((row) => ({ kind: "name" as const, id: row.id, title: row.kanji ?? row.reading, reading: row.reading, summary: row.searchText, jlptLevel: null, score: 0 })));
  }

  return results.sort((left, right) => right.score - left.score).slice(0, limit);
}

export async function getLexemeDetail(lexemeId: string) {
  const [lexeme] = await db.select().from(knowledgeLexemes).where(eq(knowledgeLexemes.id, lexemeId)).limit(1);
  if (!lexeme) return null;
  const [spellings, readings, senses] = await Promise.all([
    db.select().from(knowledgeLexemeSpellings).where(eq(knowledgeLexemeSpellings.lexemeId, lexeme.id)).orderBy(desc(knowledgeLexemeSpellings.isPrimary), desc(knowledgeLexemeSpellings.priority)),
    db.select().from(knowledgeLexemeReadings).where(eq(knowledgeLexemeReadings.lexemeId, lexeme.id)).orderBy(desc(knowledgeLexemeReadings.isPrimary)),
    db.select().from(knowledgeLexemeSenses).where(eq(knowledgeLexemeSenses.lexemeId, lexeme.id)).orderBy(asc(knowledgeLexemeSenses.position)),
  ]);
  const senseIds = senses.map((sense) => sense.id);
  const glosses = senseIds.length > 0
    ? await db.select().from(knowledgeLexemeGlosses).where(sql`${knowledgeLexemeGlosses.senseId} = ANY(${senseIds})`).orderBy(asc(knowledgeLexemeGlosses.position))
    : [];
  return {
    ...lexeme,
    spellings,
    readings,
    senses: senses.map((sense) => ({ ...sense, glosses: glosses.filter((gloss) => gloss.senseId === sense.id) })),
  };
}

export async function getKanjiDetail(literal: string) {
  const [kanji] = await db.select().from(knowledgeKanji).where(eq(knowledgeKanji.literal, literal)).limit(1);
  if (!kanji) return null;
  const [readings, meanings, components, strokes] = await Promise.all([
    db.select().from(knowledgeKanjiReadings).where(eq(knowledgeKanjiReadings.kanjiId, kanji.id)),
    db.select().from(knowledgeKanjiMeanings).where(eq(knowledgeKanjiMeanings.kanjiId, kanji.id)).orderBy(asc(knowledgeKanjiMeanings.position)),
    db.select().from(knowledgeKanjiComponents).where(eq(knowledgeKanjiComponents.kanjiId, kanji.id)).orderBy(asc(knowledgeKanjiComponents.position)),
    db.select().from(knowledgeKanjiStrokes).where(eq(knowledgeKanjiStrokes.kanjiId, kanji.id)).orderBy(asc(knowledgeKanjiStrokes.strokeNumber)),
  ]);
  return { ...kanji, readings, meanings, components, strokes };
}

export async function listGrammarPoints(input: { jlptLevel?: string; limit?: number; offset?: number }) {
  const limit = clampPageLimit(input.limit);
  return db
    .select()
    .from(knowledgeGrammarPoints)
    .where(input.jlptLevel ? eq(knowledgeGrammarPoints.jlptLevel, input.jlptLevel) : undefined)
    .orderBy(asc(knowledgeGrammarPoints.pattern))
    .limit(limit)
    .offset(Math.max(0, input.offset ?? 0));
}

export async function getGrammarDetail(grammarId: string) {
  const [grammar] = await db.select().from(knowledgeGrammarPoints).where(eq(knowledgeGrammarPoints.id, grammarId)).limit(1);
  if (!grammar) return null;
  const examples = await db.select().from(knowledgeGrammarExamples).where(eq(knowledgeGrammarExamples.grammarPointId, grammarId)).orderBy(asc(knowledgeGrammarExamples.position));
  return { ...grammar, examples };
}

export async function listSentences(input: { language?: string; jlptLevel?: string; limit?: number; offset?: number }) {
  const filters = [] as ReturnType<typeof eq>[];
  if (input.language) filters.push(eq(knowledgeSentences.language, input.language));
  if (input.jlptLevel) filters.push(eq(knowledgeSentences.jlptLevel, input.jlptLevel));
  return db
    .select()
    .from(knowledgeSentences)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(knowledgeSentences.updatedAt))
    .limit(clampPageLimit(input.limit))
    .offset(Math.max(0, input.offset ?? 0));
}

export async function getSentenceDetail(sentenceId: string) {
  const [sentence] = await db.select().from(knowledgeSentences).where(eq(knowledgeSentences.id, sentenceId)).limit(1);
  if (!sentence) return null;
  const [translations, tokens] = await Promise.all([
    db.select().from(knowledgeSentenceTranslations).where(eq(knowledgeSentenceTranslations.sentenceId, sentenceId)),
    db.select().from(knowledgeSentenceTokens).where(eq(knowledgeSentenceTokens.sentenceId, sentenceId)).orderBy(asc(knowledgeSentenceTokens.position)),
  ]);
  return { ...sentence, translations, tokens };
}

export async function getKnowledgeAdminOverview() {
  const [datasets, latestRuns, issueCount, lexemeCount, kanjiCount, sentenceCount, grammarCount] = await Promise.all([
    db.select().from(knowledgeDatasets).orderBy(asc(knowledgeDatasets.key)),
    db.select().from(knowledgeImportRuns).orderBy(desc(knowledgeImportRuns.createdAt)).limit(30),
    db.select({ count: sql<number>`count(*)` }).from(knowledgeValidationIssues),
    db.select({ count: sql<number>`count(*)` }).from(knowledgeLexemes),
    db.select({ count: sql<number>`count(*)` }).from(knowledgeKanji),
    db.select({ count: sql<number>`count(*)` }).from(knowledgeSentences),
    db.select({ count: sql<number>`count(*)` }).from(knowledgeGrammarPoints),
  ]);
  return {
    datasets,
    latestRuns,
    metrics: {
      validationIssues: Number(issueCount[0]?.count ?? 0),
      lexemes: Number(lexemeCount[0]?.count ?? 0),
      kanji: Number(kanjiCount[0]?.count ?? 0),
      sentences: Number(sentenceCount[0]?.count ?? 0),
      grammar: Number(grammarCount[0]?.count ?? 0),
    },
  };
}

export async function getValidationIssues(input: { importRunId?: string; limit?: number; offset?: number }) {
  return db
    .select()
    .from(knowledgeValidationIssues)
    .where(input.importRunId ? eq(knowledgeValidationIssues.importRunId, input.importRunId) : undefined)
    .orderBy(desc(knowledgeValidationIssues.createdAt))
    .limit(clampPageLimit(input.limit))
    .offset(Math.max(0, input.offset ?? 0));
}

export async function getSrsQueue(userId: string, limit = 20) {
  return db
    .select()
    .from(knowledgeSrsCards)
    .where(and(eq(knowledgeSrsCards.userId, userId), lte(knowledgeSrsCards.dueAt, new Date())))
    .orderBy(asc(knowledgeSrsCards.dueAt))
    .limit(clampPageLimit(limit));
}

export async function reviewSrsCard(input: { userId: string; cardId: string; rating: number }) {
  const [card] = await db
    .select()
    .from(knowledgeSrsCards)
    .where(and(eq(knowledgeSrsCards.id, input.cardId), eq(knowledgeSrsCards.userId, input.userId)))
    .limit(1);
  if (!card) return null;

  const transition = calculateSrsTransition({
    intervalDays: card.intervalDays,
    easeFactorBps: card.easeFactorBps,
    repetitions: card.repetitions,
    lapses: card.lapses,
  }, input.rating);

  const [updated] = await db
    .update(knowledgeSrsCards)
    .set({
      state: transition.repetitions === 0 ? "relearning" : "review",
      dueAt: transition.dueAt,
      intervalDays: transition.intervalDays,
      easeFactorBps: transition.easeFactorBps,
      repetitions: transition.repetitions,
      lapses: transition.lapses,
      lastReviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(knowledgeSrsCards.id, card.id))
    .returning();

  await db.insert(knowledgeSrsReviews).values({
    cardId: card.id,
    rating: input.rating,
    previousIntervalDays: transition.previousIntervalDays,
    nextIntervalDays: transition.intervalDays,
    previousEaseFactorBps: transition.previousEaseFactorBps,
    nextEaseFactorBps: transition.easeFactorBps,
  });
  return updated;
}

export async function addSrsCard(input: { userId: string; entityType: string; entityId: string }) {
  const [card] = await db
    .insert(knowledgeSrsCards)
    .values({ userId: input.userId, entityType: input.entityType, entityId: input.entityId, state: "new" })
    .onConflictDoUpdate({
      target: [knowledgeSrsCards.userId, knowledgeSrsCards.entityType, knowledgeSrsCards.entityId],
      set: { updatedAt: new Date() },
    })
    .returning();
  return card;
}
