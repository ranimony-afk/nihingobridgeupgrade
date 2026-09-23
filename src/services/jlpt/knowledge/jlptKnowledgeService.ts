import { db } from "@/db";
import {
  dictionaryEntries,
  kanjiEntries,
  grammarPatterns,
  exampleSentences,
  questions,
  jlptTests,
  testSessions,
} from "@/db/schema";
import { eq, sql, desc, and } from "drizzle-orm";
import type { JLPTLevel } from "@/types/quiz";
import { KnowledgeCorpusService } from "@/services/knowledge/corpusService";
import { KnowledgeService } from "@/services/knowledge/knowledgeService";
import { TestService } from "@/services/jlpt/testService";

export interface JLPTLevelOverview {
  level: JLPTLevel;
  counts: {
    vocabulary: number;
    kanji: number;
    grammar: number;
    sentences: number;
    questions: number;
    tests: number;
  };
  sampleVocabulary: { id: string; headword: string; reading: string; glosses: string[] }[];
  sampleKanji: { id: string; character: string; meaning: string; strokeCount: number }[];
  sampleGrammar: { id: string; title: string; meaning: string; structure: string }[];
}

export interface JLPTUserProgress {
  userId: string;
  level: JLPTLevel;
  completedTestsCount: number;
  passedTestsCount: number;
  averageScorePercent: number;
  recentSessions: Array<{
    id: string;
    testId: string | null;
    score: number | null;
    maxScore: number | null;
    passed: boolean | null;
    completedAt: Date | null;
  }>;
}

export class JLPTKnowledgeService {
  static async ensureInitialized(): Promise<void> {
    await Promise.all([
      KnowledgeCorpusService.ensureSeeded(),
      KnowledgeService.ensureSeeded(),
      TestService.ensureSeeded(),
    ]);
  }

  /**
   * Aggregates live counts and curated study samples across all 5 knowledge tables for a given JLPT level.
   */
  static async getLevelOverview(level: JLPTLevel): Promise<JLPTLevelOverview> {
    await this.ensureInitialized();

    // 1. Vocabulary
    const [vocabCount] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(dictionaryEntries)
      .where(eq(dictionaryEntries.jlptLevel, level));

    const sampleVocabRows = await db
      .select()
      .from(dictionaryEntries)
      .where(eq(dictionaryEntries.jlptLevel, level))
      .limit(6);

    // 2. Kanji
    const [kanjiCount] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(kanjiEntries)
      .where(eq(kanjiEntries.jlptLevel, level));

    const sampleKanjiRows = await db
      .select()
      .from(kanjiEntries)
      .where(eq(kanjiEntries.jlptLevel, level))
      .limit(6);

    // 3. Grammar
    const [grammarCount] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(grammarPatterns)
      .where(eq(grammarPatterns.jlptLevel, level));

    const sampleGrammarRows = await db
      .select()
      .from(grammarPatterns)
      .where(eq(grammarPatterns.jlptLevel, level))
      .limit(6);

    // 4. Example Sentences
    const [sentenceCount] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(exampleSentences)
      .where(eq(exampleSentences.jlptLevel, level));

    // 5. Practice Questions
    const [questionCount] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(questions)
      .where(eq(questions.jlptLevel, level));

    // 6. Registered Tests
    const [testCount] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(jlptTests)
      .where(eq(jlptTests.jlptLevel, level));

    return {
      level,
      counts: {
        vocabulary: vocabCount?.count ?? 0,
        kanji: kanjiCount?.count ?? 0,
        grammar: grammarCount?.count ?? 0,
        sentences: sentenceCount?.count ?? 0,
        questions: questionCount?.count ?? 0,
        tests: testCount?.count ?? 0,
      },
      sampleVocabulary: sampleVocabRows.map((v) => ({
        id: v.id,
        headword: v.headword,
        reading: v.reading,
        glosses: Array.isArray(v.senses)
          ? v.senses.flatMap((s: any) => s.glosses || [])
          : [],
      })),
      sampleKanji: sampleKanjiRows.map((k) => ({
        id: k.id,
        character: k.character,
        meaning: k.meaning,
        strokeCount: k.strokeCount,
      })),
      sampleGrammar: sampleGrammarRows.map((g) => ({
        id: g.id,
        title: g.title,
        meaning: g.meaning,
        structure: g.structure,
      })),
    };
  }

  /**
   * Retrieves user JLPT test history, pass rate, and section progress.
   */
  static async getUserProgress(
    userId = "anonymous-user",
    level: JLPTLevel = "N5"
  ): Promise<JLPTUserProgress> {
    await this.ensureInitialized();

    const sessions = await db
      .select()
      .from(testSessions)
      .where(
        and(
          eq(testSessions.userId, userId),
          eq(testSessions.jlptLevel, level),
          eq(testSessions.status, "completed")
        )
      )
      .orderBy(desc(testSessions.completedAt))
      .limit(10);

    const completed = sessions.length;
    const passed = sessions.filter((s) => Boolean(s.passed)).length;

    let totalScoreSum = 0;
    let totalMaxSum = 0;

    for (const s of sessions) {
      if (s.score !== null && s.maxScore !== null && s.maxScore > 0) {
        totalScoreSum += s.score;
        totalMaxSum += s.maxScore;
      }
    }

    const averageScorePercent =
      totalMaxSum > 0 ? Number(((totalScoreSum / totalMaxSum) * 100).toFixed(1)) : 0;

    return {
      userId,
      level,
      completedTestsCount: completed,
      passedTestsCount: passed,
      averageScorePercent,
      recentSessions: sessions.map((s) => ({
        id: s.id,
        testId: s.testId,
        score: s.score,
        maxScore: s.maxScore,
        passed: s.passed,
        completedAt: s.completedAt,
      })),
    };
  }
}
