/**
 * JLPTEngine — Comprehensive JLPT preparation service.
 *
 * P42: N5–N1 support with vocabulary, kanji, grammar, reading, listening,
 * mock tests, timers, scores, and weakness analysis.
 */

import { eq, and, asc, sql, desc } from "drizzle-orm";
import { db } from "@/db";
import {
  dictionaryEntries,
  dictionarySenses,
  kanjiEntries,
  grammarPatterns,
  grammarExamples,
  sentences,
  sentenceTranslations,
  vocabularyProgress,
  kanjiProgress,
  grammarProgress,
  testResults,
  practiceTests,
} from "@/db/schema";
import { QuizEngine, type QuestionSeed } from "./quiz-engine";
import { ListeningService } from "./listening";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type JlptLevel = 1 | 2 | 3 | 4 | 5;

/** Official JLPT section structure. */
const JLPT_SECTIONS = {
  5: { vocab: 25, grammar: 25, reading: 10, listening: 15, timeMinutes: 90 },
  4: { vocab: 25, grammar: 25, reading: 15, listening: 20, timeMinutes: 115 },
  3: { vocab: 25, grammar: 30, reading: 20, listening: 25, timeMinutes: 140 },
  2: { vocab: 30, grammar: 30, reading: 25, listening: 30, timeMinutes: 155 },
  1: { vocab: 30, grammar: 30, reading: 30, listening: 35, timeMinutes: 170 },
} as const;

/** JLPT level overview with content stats and learner readiness. */
export interface JlptLevelOverview {
  level: JlptLevel;
  /** Official test structure. */
  structure: typeof JLPT_SECTIONS[JlptLevel];
  /** Content available in our database. */
  content: {
    vocabularyCount: number;
    kanjiCount: number;
    grammarCount: number;
    sentenceCount: number;
  };
  /** Learner's readiness (null if not logged in). */
  readiness: JlptReadiness | null;
}

export interface JlptReadiness {
  learnerId: string;
  level: JlptLevel;
  /** Per-domain mastery percentage (0–100). */
  vocabulary: DomainReadiness;
  kanji: DomainReadiness;
  grammar: DomainReadiness;
  /** Overall estimated readiness (weighted average). */
  overallPercent: number;
  /** Estimated pass probability based on mastery data. */
  passEstimate: "likely" | "possible" | "unlikely" | "insufficient_data";
  /** Weakness areas that need more study. */
  weaknesses: WeaknessItem[];
}

export interface DomainReadiness {
  total: number;
  mastered: number;
  familiar: number;
  practicing: number;
  introduced: number;
  unseen: number;
  percent: number;
}

export interface WeaknessItem {
  domain: "vocabulary" | "kanji" | "grammar" | "reading" | "listening";
  description: string;
  severity: "critical" | "moderate" | "minor";
  suggestion: string;
  /** IDs of items to review. */
  itemIds: string[];
}

/** A generated JLPT mock test. */
export interface JlptMockTest {
  level: JlptLevel;
  title: string;
  timeLimitMinutes: number;
  sections: JlptMockSection[];
  totalQuestions: number;
  totalPoints: number;
}

export interface JlptMockSection {
  name: string;
  questions: ReturnType<typeof QuizEngine.render>[];
  /** Full questions for grading (server-side). */
  _questions: ReturnType<typeof QuizEngine.multipleChoice>[];
  timeMinutes: number;
  points: number;
}

export interface JlptScoreBreakdown {
  level: JlptLevel;
  overall: { score: number; maxScore: number; percent: number; passed: boolean };
  sections: {
    name: string;
    score: number;
    maxScore: number;
    percent: number;
    passed: boolean;
  }[];
  /** Per-JLPT-section minimum scores (all must pass). */
  sectionMinimums: { name: string; minimum: number; achieved: number; passed: boolean }[];
  timeUsedSeconds: number;
  timeLimitSeconds: number;
  weaknesses: WeaknessItem[];
}

// ─────────────────────────────────────────────
// JLPTEngine
// ─────────────────────────────────────────────

export const JLPTEngine = {

  /** Get overview for a JLPT level with content stats and readiness. */
  async getOverview(level: JlptLevel, learnerId?: string): Promise<JlptLevelOverview> {
    const [vocabCount, kanjiCount, grammarCount, sentCount] = await Promise.all([
      db.select({ c: sql<number>`count(*)::int` }).from(dictionaryEntries).where(eq(dictionaryEntries.jlptLevel, level)),
      db.select({ c: sql<number>`count(*)::int` }).from(kanjiEntries).where(eq(kanjiEntries.jlptLevel, level)),
      db.select({ c: sql<number>`count(*)::int` }).from(grammarPatterns).where(eq(grammarPatterns.jlptLevel, level)),
      db.select({ c: sql<number>`count(*)::int` }).from(sentences).where(eq(sentences.jlptLevel, level)),
    ]);

    let readiness: JlptReadiness | null = null;
    if (learnerId) {
      readiness = await this.getReadiness(level, learnerId);
    }

    return {
      level,
      structure: JLPT_SECTIONS[level],
      content: {
        vocabularyCount: vocabCount[0]?.c ?? 0,
        kanjiCount: kanjiCount[0]?.c ?? 0,
        grammarCount: grammarCount[0]?.c ?? 0,
        sentenceCount: sentCount[0]?.c ?? 0,
      },
      readiness,
    };
  },

  /** Get all 5 level overviews at once. */
  async getDashboard(learnerId?: string): Promise<JlptLevelOverview[]> {
    const levels: JlptLevel[] = [5, 4, 3, 2, 1];
    return Promise.all(levels.map((l) => this.getOverview(l, learnerId)));
  },

  /** Calculate learner readiness for a JLPT level. */
  async getReadiness(level: JlptLevel, learnerId: string): Promise<JlptReadiness> {
    // Vocabulary readiness
    const vocabEntries = await db.select({ id: dictionaryEntries.id }).from(dictionaryEntries).where(eq(dictionaryEntries.jlptLevel, level));
    const vocabIds = vocabEntries.map((e) => e.id);
    const vocabReady = await this._domainReadiness(learnerId, vocabIds, "vocabulary");

    // Kanji readiness
    const kanjiRows = await db.select({ id: kanjiEntries.id }).from(kanjiEntries).where(eq(kanjiEntries.jlptLevel, level));
    const kanjiIds = kanjiRows.map((e) => e.id);
    const kanjiReady = await this._domainReadiness(learnerId, kanjiIds, "kanji");

    // Grammar readiness
    const grammarRows = await db.select({ id: grammarPatterns.id }).from(grammarPatterns).where(eq(grammarPatterns.jlptLevel, level));
    const grammarIds = grammarRows.map((e) => e.id);
    const grammarReady = await this._domainReadiness(learnerId, grammarIds, "grammar");

    // Weighted overall (vocab 35%, kanji 25%, grammar 40%)
    const overallPercent = Math.round(
      vocabReady.percent * 0.35 + kanjiReady.percent * 0.25 + grammarReady.percent * 0.40,
    );

    // Estimate pass probability
    let passEstimate: JlptReadiness["passEstimate"] = "insufficient_data";
    const totalItems = vocabReady.total + kanjiReady.total + grammarReady.total;
    if (totalItems > 0) {
      const touchedItems = totalItems - vocabReady.unseen - kanjiReady.unseen - grammarReady.unseen;
      if (touchedItems < totalItems * 0.3) passEstimate = "insufficient_data";
      else if (overallPercent >= 75) passEstimate = "likely";
      else if (overallPercent >= 50) passEstimate = "possible";
      else passEstimate = "unlikely";
    }

    // Identify weaknesses
    const weaknesses = this._analyzeWeaknesses(level, vocabReady, kanjiReady, grammarReady, vocabIds, kanjiIds, grammarIds);

    return {
      learnerId, level, vocabulary: vocabReady, kanji: kanjiReady, grammar: grammarReady,
      overallPercent, passEstimate, weaknesses,
    };
  },

  /** Generate a JLPT mock test. */
  async generateMockTest(level: JlptLevel): Promise<JlptMockTest> {
    const structure = JLPT_SECTIONS[level];
    const limit = Math.min; // Clamp to available data

    // Fetch seeds for each domain
    const vocabRows = await db.select().from(dictionaryEntries)
      .where(eq(dictionaryEntries.jlptLevel, level))
      .orderBy(sql`RANDOM()`)
      .limit(structure.vocab);

    const vocabSeeds: QuestionSeed[] = [];
    for (const v of vocabRows) {
      const senses = await db.select({ glosses: dictionarySenses.glosses }).from(dictionarySenses)
        .where(eq(dictionarySenses.entryId, v.id)).limit(1);
      const meanings = senses.flatMap((s) => (s.glosses as Record<string, string[]>).en ?? []).slice(0, 3);
      vocabSeeds.push({ target: v.headword, reading: v.reading, meanings, pos: v.pos ?? undefined, knowledgeRef: v.id, jlpt: level });
    }

    const grammarRows = await db.select().from(grammarPatterns)
      .where(eq(grammarPatterns.jlptLevel, level))
      .orderBy(sql`RANDOM()`)
      .limit(structure.grammar);

    const grammarSeeds: QuestionSeed[] = grammarRows.map((g) => ({
      target: g.title, reading: undefined, meanings: [g.meaning],
      knowledgeRef: g.id, jlpt: level,
    }));

    // Build sections
    const vocabQs = QuizEngine.generateMixed(vocabSeeds, 1);
    const grammarQs = QuizEngine.generateMixed(grammarSeeds, 1);

    // Reading section: use comprehension-style questions from sentences
    const readingSentences = await db.select().from(sentences)
      .where(eq(sentences.jlptLevel, level))
      .orderBy(sql`RANDOM()`)
      .limit(structure.reading);

    const readingQs = readingSentences.map((s) => {
      const id = `jlpt-r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      return QuizEngine.translation(id, { target: s.japanese, meanings: ["(translate)"], jlpt: level }, "ja_to_en");
    });

    // Listening section: generate from available sentences
    const listeningSet = await ListeningService.generatePractice({ jlpt: level, count: Math.min(structure.listening, 5) });

    const sections: JlptMockSection[] = [
      {
        name: "Vocabulary / 語彙",
        questions: vocabQs.map(QuizEngine.render),
        _questions: vocabQs,
        timeMinutes: Math.round(structure.timeMinutes * 0.25),
        points: vocabQs.reduce((s, q) => s + q.points, 0),
      },
      {
        name: "Grammar / 文法",
        questions: grammarQs.map(QuizEngine.render),
        _questions: grammarQs,
        timeMinutes: Math.round(structure.timeMinutes * 0.25),
        points: grammarQs.reduce((s, q) => s + q.points, 0),
      },
      {
        name: "Reading / 読解",
        questions: readingQs.map(QuizEngine.render),
        _questions: readingQs,
        timeMinutes: Math.round(structure.timeMinutes * 0.25),
        points: readingQs.reduce((s, q) => s + q.points, 0),
      },
      {
        name: "Listening / 聴解",
        questions: [], // Listening uses its own exercise format
        _questions: [],
        timeMinutes: Math.round(structure.timeMinutes * 0.25),
        points: listeningSet.totalPoints,
      },
    ];

    const totalQuestions = sections.reduce((s, sec) => s + sec.questions.length, 0) + listeningSet.totalExercises;
    const totalPoints = sections.reduce((s, sec) => s + sec.points, 0);

    return {
      level,
      title: `JLPT N${level} Mock Test`,
      timeLimitMinutes: structure.timeMinutes,
      sections,
      totalQuestions,
      totalPoints,
    };
  },

  /** Grade a mock test and produce score breakdown with weakness analysis. */
  async gradeMockTest(
    level: JlptLevel,
    learnerId: string,
    sectionAnswers: Record<string, Record<string, unknown>>,
    sectionQuestions: Record<string, ReturnType<typeof QuizEngine.multipleChoice>[]>,
    timeUsedSeconds: number,
  ): Promise<JlptScoreBreakdown> {
    const structure = JLPT_SECTIONS[level];
    const sectionNames = Object.keys(sectionAnswers);
    const sectionResults: JlptScoreBreakdown["sections"] = [];
    let totalScore = 0;
    let totalMax = 0;

    for (const name of sectionNames) {
      const answers = sectionAnswers[name]!;
      const questions = sectionQuestions[name] ?? [];
      const graded = QuizEngine.gradeAll(questions, answers);

      const maxScore = graded.totalPoints;
      totalScore += graded.earnedPoints;
      totalMax += maxScore;

      sectionResults.push({
        name,
        score: graded.earnedPoints,
        maxScore,
        percent: maxScore > 0 ? Math.round((graded.earnedPoints / maxScore) * 100) : 0,
        passed: maxScore > 0 ? (graded.earnedPoints / maxScore) >= 0.33 : true, // 33% per-section minimum
      });
    }

    const overallPercent = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
    // JLPT passes at ~50% overall AND 33% per section (estimated, actual thresholds vary)
    const allSectionsPassed = sectionResults.every((s) => s.passed);
    const overallPassed = overallPercent >= 50 && allSectionsPassed;

    // Section minimums
    const sectionMinimums = sectionResults.map((s) => ({
      name: s.name,
      minimum: 33,
      achieved: s.percent,
      passed: s.passed,
    }));

    // Weakness analysis from results
    const weaknesses: WeaknessItem[] = [];
    for (const sec of sectionResults) {
      if (sec.percent < 50) {
        weaknesses.push({
          domain: sec.name.toLowerCase().includes("vocab") ? "vocabulary"
            : sec.name.toLowerCase().includes("grammar") ? "grammar"
            : sec.name.toLowerCase().includes("reading") ? "reading"
            : "listening",
          description: `${sec.name}: ${sec.percent}% (below passing threshold)`,
          severity: sec.percent < 33 ? "critical" : "moderate",
          suggestion: `Focus on N${level} ${sec.name.split("/")[0]!.trim().toLowerCase()} practice`,
          itemIds: [],
        });
      }
    }

    return {
      level,
      overall: { score: totalScore, maxScore: totalMax, percent: overallPercent, passed: overallPassed },
      sections: sectionResults,
      sectionMinimums,
      timeUsedSeconds,
      timeLimitSeconds: structure.timeMinutes * 60,
      weaknesses,
    };
  },

  /** Get past test results for a learner at a JLPT level. */
  async getHistory(learnerId: string, level?: JlptLevel): Promise<{
    results: { id: string; testTitle: string; score: number; maxScore: number; percentage: number; passed: boolean; completedAt: Date }[];
    bestScore: number | null;
    averageScore: number | null;
    attemptCount: number;
  }> {
    const conds = [eq(testResults.learnerId, learnerId)];
    if (level) {
      const tests = await db.select({ id: practiceTests.id }).from(practiceTests).where(eq(practiceTests.jlptLevel, level));
      const testIds = tests.map((t) => t.id);
      if (testIds.length > 0) {
        conds.push(sql`${testResults.testId} IN (${sql.join(testIds.map((id) => sql`${id}`), sql`, `)})`);
      }
    }

    const results = await db.select().from(testResults)
      .where(and(...conds))
      .orderBy(desc(testResults.completedAt));

    const mapped = results.map((r) => ({
      id: r.id, testTitle: "", score: r.score, maxScore: r.maxScore,
      percentage: r.percentage, passed: r.passed, completedAt: r.completedAt,
    }));

    return {
      results: mapped,
      bestScore: results.length > 0 ? Math.max(...results.map((r) => r.percentage)) : null,
      averageScore: results.length > 0 ? Math.round(results.reduce((s, r) => s + r.percentage, 0) / results.length) : null,
      attemptCount: results.length,
    };
  },

  // ─── Internal ───

  async _domainReadiness(
    learnerId: string,
    entityIds: string[],
    domain: "vocabulary" | "kanji" | "grammar",
  ): Promise<DomainReadiness> {
    const total = entityIds.length;
    if (total === 0) return { total: 0, mastered: 0, familiar: 0, practicing: 0, introduced: 0, unseen: 0, percent: 0 };

    const table = domain === "vocabulary" ? vocabularyProgress
      : domain === "kanji" ? kanjiProgress
      : grammarProgress;
    const idCol = domain === "vocabulary" ? vocabularyProgress.entryId
      : domain === "kanji" ? kanjiProgress.kanjiId
      : grammarProgress.grammarId;

    const rows = await db.select({
      mastery: table.mastery,
      count: sql<number>`count(*)::int`,
    }).from(table)
      .where(and(
        eq(table.learnerId, learnerId),
        sql`${idCol} IN (${sql.join(entityIds.map((id) => sql`${id}`), sql`, `)})`,
      ))
      .groupBy(table.mastery);

    const counts: Record<string, number> = {};
    let touched = 0;
    for (const r of rows) { counts[r.mastery] = r.count; touched += r.count; }

    const mastered = counts["mastered"] ?? 0;
    const familiar = counts["familiar"] ?? 0;
    const practicing = counts["practicing"] ?? 0;
    const introduced = counts["introduced"] ?? 0;
    const unseen = total - touched;

    // Weighted readiness: mastered=100%, familiar=75%, practicing=50%, introduced=25%, unseen=0%
    const weighted = (mastered * 100 + familiar * 75 + practicing * 50 + introduced * 25) / total;
    const percent = Math.round(weighted);

    return { total, mastered, familiar, practicing, introduced, unseen, percent };
  },

  _analyzeWeaknesses(
    level: JlptLevel,
    vocab: DomainReadiness,
    kanji: DomainReadiness,
    grammar: DomainReadiness,
    vocabIds: string[],
    kanjiIds: string[],
    grammarIds: string[],
  ): WeaknessItem[] {
    const weaknesses: WeaknessItem[] = [];

    if (vocab.total > 0 && vocab.percent < 50) {
      weaknesses.push({
        domain: "vocabulary",
        description: `Only ${vocab.percent}% of N${level} vocabulary mastered (${vocab.mastered}/${vocab.total})`,
        severity: vocab.percent < 25 ? "critical" : "moderate",
        suggestion: `Study ${vocab.unseen + vocab.introduced} unseen/new N${level} words`,
        itemIds: vocabIds.slice(0, 10),
      });
    }

    if (kanji.total > 0 && kanji.percent < 50) {
      weaknesses.push({
        domain: "kanji",
        description: `Only ${kanji.percent}% of N${level} kanji mastered (${kanji.mastered}/${kanji.total})`,
        severity: kanji.percent < 25 ? "critical" : "moderate",
        suggestion: `Review ${kanji.unseen + kanji.introduced} unseen/new N${level} kanji`,
        itemIds: kanjiIds.slice(0, 10),
      });
    }

    if (grammar.total > 0 && grammar.percent < 50) {
      weaknesses.push({
        domain: "grammar",
        description: `Only ${grammar.percent}% of N${level} grammar mastered (${grammar.mastered}/${grammar.total})`,
        severity: grammar.percent < 25 ? "critical" : "moderate",
        suggestion: `Study ${grammar.unseen + grammar.introduced} unseen/new N${level} grammar patterns`,
        itemIds: grammarIds.slice(0, 10),
      });
    }

    if (vocab.unseen > vocab.total * 0.7) {
      weaknesses.push({
        domain: "vocabulary",
        description: `${vocab.unseen} of ${vocab.total} words haven't been studied yet`,
        severity: "critical",
        suggestion: "Start learning N" + level + " vocabulary through lessons or flashcards",
        itemIds: [],
      });
    }

    return weaknesses.sort((a, b) => {
      const sev = { critical: 0, moderate: 1, minor: 2 };
      return sev[a.severity] - sev[b.severity];
    });
  },
};
