import { db } from "@/db";
import {
  questions as questionsTable,
  jlptTests as jlptTestsTable,
  jlptTestQuestions as jlptTestQuestionsTable,
  testSessions as testSessionsTable,
  testAnswers as testAnswersTable,
  userAnalytics as userAnalyticsTable,
} from "@/db/schema";
import { eq, and, desc, sql, ilike, inArray } from "drizzle-orm";
import { ALL_SEED_QUESTIONS, SEED_JLPT_TESTS } from "@/services/quiz/seedData";
import { QuizEngine } from "@/services/quiz/engine";
import {
  Question,
  JLPTLevel,
  TestAnswerSubmission,
  DetailedTestResult,
  QuestionCategory,
  QuestionSection,
} from "@/types/quiz";
import { JLPTTestModel } from "@/types/jlpt";

export class TestService {
  /**
   * Seed the database with authentic JLPT questions and tests if empty
   */
  static async ensureSeeded(): Promise<void> {
    try {
      const existingCountResult = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(questionsTable);
      const count = existingCountResult[0]?.count ?? 0;

      if (count === 0) {
        // Insert questions
        for (const q of ALL_SEED_QUESTIONS) {
          await db
            .insert(questionsTable)
            .values({
              id: q.id,
              jlptLevel: q.jlptLevel,
              section: q.section,
              category: q.category,
              mondaiNumber: q.mondaiNumber,
              mondaiTitle: q.mondaiTitle,
              questionType: q.questionType,
              prompt: q.prompt,
              promptFurigana: q.promptFurigana,
              promptTranslation: q.promptTranslation,
              passage: q.passage,
              passageFurigana: q.passageFurigana,
              passageTranslation: q.passageTranslation,
              audioScript: q.audioScript,
              audioUrl: q.audioUrl,
              options: q.options,
              starOrderParts: q.starOrderParts ?? null,
              correctAnswer: q.correctAnswer,
              explanation: q.explanation,
              explanationBreakdown: q.explanationBreakdown ?? null,
              difficulty: q.difficulty,
              tags: q.tags,
              isActive: true,
            })
            .onConflictDoNothing();
        }

        // Insert Tests
        for (const test of SEED_JLPT_TESTS) {
          await db
            .insert(jlptTestsTable)
            .values({
              id: test.id,
              title: test.title,
              jlptLevel: test.jlptLevel,
              code: test.code,
              description: test.description,
              totalDurationMinutes: test.totalDurationMinutes,
              sectionDurations: test.sectionDurations,
              passingScore: test.passingScore,
              totalScore: test.totalScore,
              sectionConfigs: test.sectionConfigs,
              isPublished: true,
            })
            .onConflictDoNothing();
        }

        // Link N5 questions to Mock Test 01
        const n5Questions = ALL_SEED_QUESTIONS.filter((q) => q.jlptLevel === "N5");
        let order = 1;
        for (const q of n5Questions) {
          const sectionKey =
            q.section === "listening" ? "listening" : "language_knowledge_reading";
          await db
            .insert(jlptTestQuestionsTable)
            .values({
              id: `tq-n5-01-${q.id}`,
              testId: "jlpt-n5-mock-01",
              questionId: q.id,
              sectionKey,
              mondaiNumber: q.mondaiNumber,
              orderIndex: order++,
              points: 1.0,
            })
            .onConflictDoNothing();
        }
      }
    } catch (error) {
      console.error("Failed to seed database questions:", error);
    }
  }

  /**
   * List all available tests
   */
  static async listTests(level?: JLPTLevel): Promise<JLPTTestModel[]> {
    await this.ensureSeeded();

    const query = db.select().from(jlptTestsTable);
    const tests = level ? await query.where(eq(jlptTestsTable.jlptLevel, level)) : await query;

    const result: JLPTTestModel[] = [];
    for (const t of tests) {
      const qCountResult = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(jlptTestQuestionsTable)
        .where(eq(jlptTestQuestionsTable.testId, t.id));

      result.push({
        id: t.id,
        title: t.title,
        jlptLevel: t.jlptLevel as JLPTLevel,
        code: t.code,
        description: t.description,
        totalDurationMinutes: t.totalDurationMinutes,
        sectionDurations: t.sectionDurations as Record<string, number>,
        passingScore: t.passingScore,
        totalScore: t.totalScore,
        sectionConfigs: t.sectionConfigs as any,
        questionCount: qCountResult[0]?.count ?? 0,
      });
    }

    return result;
  }

  /**
   * Retrieve test details and its questions
   */
  static async getTestById(testId: string): Promise<{ test: JLPTTestModel; questions: Question[] } | null> {
    await this.ensureSeeded();

    const [testRow] = await db
      .select()
      .from(jlptTestsTable)
      .where(eq(jlptTestsTable.id, testId))
      .limit(1);

    if (!testRow) {
      // Check if it's in seed definition
      const fallback = SEED_JLPT_TESTS.find((t) => t.id === testId);
      if (!fallback) return null;
      const seedQs = ALL_SEED_QUESTIONS.filter((q) => q.jlptLevel === fallback.jlptLevel);
      return {
        test: { ...fallback, questionCount: seedQs.length },
        questions: seedQs,
      };
    }

    const testQuestionLinks = await db
      .select()
      .from(jlptTestQuestionsTable)
      .where(eq(jlptTestQuestionsTable.testId, testId))
      .orderBy(jlptTestQuestionsTable.orderIndex);

    let questions: Question[] = [];

    if (testQuestionLinks.length > 0) {
      const qIds = testQuestionLinks.map((l) => l.questionId);
      const qRows = await db
        .select()
        .from(questionsTable)
        .where(inArray(questionsTable.id, qIds));

      // Preserve order from test links
      const qMap = new Map(qRows.map((q) => [q.id, q as unknown as Question]));
      for (const link of testQuestionLinks) {
        const found = qMap.get(link.questionId);
        if (found) {
          questions.push(found);
        }
      }
    } else {
      // Fallback to all questions for this level
      const qRows = await db
        .select()
        .from(questionsTable)
        .where(eq(questionsTable.jlptLevel, testRow.jlptLevel))
        .orderBy(questionsTable.mondaiNumber);
      questions = qRows as unknown as Question[];
    }

    return {
      test: {
        id: testRow.id,
        title: testRow.title,
        jlptLevel: testRow.jlptLevel as JLPTLevel,
        code: testRow.code,
        description: testRow.description,
        totalDurationMinutes: testRow.totalDurationMinutes,
        sectionDurations: testRow.sectionDurations as Record<string, number>,
        passingScore: testRow.passingScore,
        totalScore: testRow.totalScore,
        sectionConfigs: testRow.sectionConfigs as any,
        questionCount: questions.length,
      },
      questions,
    };
  }

  /**
   * Start a new test session (timed or untimed, full or custom drill)
   */
  static async startSession(params: {
    userId?: string;
    testId?: string;
    quizType: "jlpt_mock" | "quick_drill" | "section_practice" | "weakness_drill" | "custom_quiz";
    jlptLevel: JLPTLevel;
    sectionFilter?: string;
    isTimed?: boolean;
    customTimeMinutes?: number;
    questionLimit?: number;
    questionCategories?: QuestionCategory[];
  }): Promise<{ sessionId: string; timeLimitSeconds: number; questions: Question[] }> {
    await this.ensureSeeded();

    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const userId = params.userId || "anonymous-user";
    const isTimed = params.isTimed ?? true;

    let targetQuestions: Question[] = [];
    let timeLimitMinutes = 90;

    if (params.testId) {
      const testData = await this.getTestById(params.testId);
      if (testData) {
        targetQuestions = testData.questions;
        timeLimitMinutes = testData.test.totalDurationMinutes;
      }
    }

    if (targetQuestions.length === 0) {
      // Custom drill or query
      const query = db
        .select()
        .from(questionsTable)
        .where(eq(questionsTable.jlptLevel, params.jlptLevel));

      const rows = (await query) as unknown as Question[];
      targetQuestions = rows;

      if (params.sectionFilter && params.sectionFilter !== "all") {
        targetQuestions = targetQuestions.filter((q) => q.section === params.sectionFilter);
      }

      if (params.questionCategories && params.questionCategories.length > 0) {
        targetQuestions = targetQuestions.filter((q) =>
          params.questionCategories!.includes(q.category)
        );
      }

      // Shuffle and limit if specified
      if (params.questionLimit && params.questionLimit > 0) {
        targetQuestions = [...targetQuestions]
          .sort(() => Math.random() - 0.5)
          .slice(0, params.questionLimit);
      }

      timeLimitMinutes =
        params.customTimeMinutes ||
        Math.max(10, Math.round(targetQuestions.length * 1.5));
    }

    const timeLimitSeconds = isTimed ? timeLimitMinutes * 60 : 3600 * 5;

    await db.insert(testSessionsTable).values({
      id: sessionId,
      userId,
      testId: params.testId || null,
      quizType: params.quizType,
      jlptLevel: params.jlptLevel,
      sectionFilter: params.sectionFilter || "all",
      status: "in_progress",
      isTimed,
      timeLimitSeconds,
      timeRemainingSeconds: timeLimitSeconds,
      totalTimeSpentSeconds: 0,
      currentSectionIndex: 0,
    });

    return {
      sessionId,
      timeLimitSeconds,
      questions: targetQuestions,
    };
  }

  /**
   * Retrieve active session state and saved answers
   */
  static async getSessionState(sessionId: string): Promise<{
    session: typeof testSessionsTable.$inferSelect;
    answers: Array<typeof testAnswersTable.$inferSelect>;
    questions: Question[];
  } | null> {
    await this.ensureSeeded();

    const [session] = await db
      .select()
      .from(testSessionsTable)
      .where(eq(testSessionsTable.id, sessionId))
      .limit(1);

    if (!session) return null;

    const savedAnswers = await db
      .select()
      .from(testAnswersTable)
      .where(eq(testAnswersTable.sessionId, sessionId));

    let questions: Question[] = [];

    if (session.testId) {
      const testData = await this.getTestById(session.testId);
      if (testData) {
        questions = testData.questions;
      }
    } else {
      // Drill by level / category
      const qRows = await db
        .select()
        .from(questionsTable)
        .where(eq(questionsTable.jlptLevel, session.jlptLevel));
      questions = qRows as unknown as Question[];
      if (session.sectionFilter && session.sectionFilter !== "all") {
        questions = questions.filter((q) => q.section === session.sectionFilter);
      }
    }

    return {
      session,
      answers: savedAnswers,
      questions,
    };
  }

  /**
   * Save a single question answer in session
   */
  static async saveAnswer(
    sessionId: string,
    submission: TestAnswerSubmission
  ): Promise<void> {
    const answerId = `ans-${sessionId}-${submission.questionId}`;

    const [questionRow] = await db
      .select()
      .from(questionsTable)
      .where(eq(questionsTable.id, submission.questionId))
      .limit(1);

    let isCorrect: boolean | null = null;
    if (questionRow) {
      const evalRes = QuizEngine.evaluateAnswer(
        questionRow as unknown as Question,
        submission
      );
      isCorrect = evalRes.isCorrect;
    }

    await db
      .insert(testAnswersTable)
      .values({
        id: answerId,
        sessionId,
        questionId: submission.questionId,
        selectedAnswer: submission.selectedAnswer || null,
        starOrderSubmitted: submission.starOrderSubmitted || null,
        isCorrect,
        timeSpentSeconds: submission.timeSpentSeconds || 0,
        isFlagged: Boolean(submission.isFlagged),
        answeredAt: new Date(),
      })
      .onConflictDoUpdate({
        target: testAnswersTable.id,
        set: {
          selectedAnswer: submission.selectedAnswer || null,
          starOrderSubmitted: submission.starOrderSubmitted || null,
          isCorrect,
          timeSpentSeconds: submission.timeSpentSeconds || 0,
          isFlagged: Boolean(submission.isFlagged),
          answeredAt: new Date(),
        },
      });
  }

  /**
   * Submit test session, grade everything, and generate deep diagnostics
   */
  static async submitSession(
    sessionId: string,
    finalAnswers?: TestAnswerSubmission[]
  ): Promise<DetailedTestResult | null> {
    const sessionState = await this.getSessionState(sessionId);
    if (!sessionState) return null;

    const { session, questions } = sessionState;

    if (finalAnswers && finalAnswers.length > 0) {
      for (const ans of finalAnswers) {
        await this.saveAnswer(sessionId, ans);
      }
    }

    // Reload saved answers after updating
    const allAnswers = await db
      .select()
      .from(testAnswersTable)
      .where(eq(testAnswersTable.sessionId, sessionId));

    let title = "JLPT Custom Practice Quiz";
    if (session.testId) {
      const testData = await this.getTestById(session.testId);
      if (testData) {
        title = testData.test.title;
      }
    }

    const result = QuizEngine.calculateFullExamResult({
      sessionId,
      testId: session.testId,
      title,
      jlptLevel: session.jlptLevel as JLPTLevel,
      quizType: session.quizType,
      isTimed: session.isTimed,
      timeLimitSeconds: session.timeLimitSeconds,
      startedAt: session.startedAt,
      completedAt: new Date(),
      questions,
      answers: allAnswers.map((a) => ({
        questionId: a.questionId,
        selectedAnswer: a.selectedAnswer || undefined,
        starOrderSubmitted: (a.starOrderSubmitted as string[]) || undefined,
        timeSpentSeconds: a.timeSpentSeconds || 0,
        isFlagged: a.isFlagged,
      })),
    });

    // Update session table with final grade
    await db
      .update(testSessionsTable)
      .set({
        status: "completed",
        score: result.score,
        maxScore: result.maxScore,
        passed: result.passed,
        sectionScores: result.sectionScores,
        categoryBreakdown: result.categoryBreakdown,
        recommendations: result.recommendations,
        totalTimeSpentSeconds: result.totalTimeSpentSeconds,
        completedAt: new Date(),
      })
      .where(eq(testSessionsTable.id, sessionId));

    // Update user analytics
    try {
      const userId = session.userId || "anonymous-user";
      await this.updateUserAnalytics(userId, session.jlptLevel as JLPTLevel, result);
    } catch (e) {
      console.warn("Could not update user analytics:", e);
    }

    return result;
  }

  /**
   * Update aggregate user learning metrics
   */
  private static async updateUserAnalytics(
    userId: string,
    level: JLPTLevel,
    result: DetailedTestResult
  ): Promise<void> {
    const [existing] = await db
      .select()
      .from(userAnalyticsTable)
      .where(
        and(
          eq(userAnalyticsTable.userId, userId),
          eq(userAnalyticsTable.jlptLevel, level)
        )
      )
      .limit(1);

    const questionsAttempted = result.evaluations.length;
    const questionsCorrect = result.evaluations.filter((e) => e.isCorrect).length;

    const weakPoints: string[] = [];
    for (const [key, cat] of Object.entries(result.categoryBreakdown)) {
      if (cat.percentage < 60) {
        weakPoints.push(cat.categoryName);
      }
    }

    if (!existing) {
      await db.insert(userAnalyticsTable).values({
        id: `analytics-${userId}-${level}`,
        userId,
        jlptLevel: level,
        testsCompleted: result.quizType === "jlpt_mock" ? 1 : 0,
        drillsCompleted: result.quizType !== "jlpt_mock" ? 1 : 0,
        totalQuestionsAnswered: questionsAttempted,
        totalCorrectAnswers: questionsCorrect,
        averageScorePercent: result.percentage,
        streakDays: 1,
        weakGrammarPoints: weakPoints,
        categoryMastery: Object.fromEntries(
          Object.entries(result.categoryBreakdown).map(([k, v]) => [
            k,
            { attempted: v.total, correct: v.correct, masteryPercent: v.percentage },
          ])
        ),
      });
    } else {
      const totalAns = existing.totalQuestionsAnswered + questionsAttempted;
      const totalCor = existing.totalCorrectAnswers + questionsCorrect;
      const avgPct = totalAns > 0 ? (totalCor / totalAns) * 100 : 0;

      await db
        .update(userAnalyticsTable)
        .set({
          testsCompleted:
            existing.testsCompleted + (result.quizType === "jlpt_mock" ? 1 : 0),
          drillsCompleted:
            existing.drillsCompleted + (result.quizType !== "jlpt_mock" ? 1 : 0),
          totalQuestionsAnswered: totalAns,
          totalCorrectAnswers: totalCor,
          averageScorePercent: Math.round(avgPct * 10) / 10,
          lastActiveAt: new Date(),
          weakGrammarPoints: Array.from(
            new Set([...(existing.weakGrammarPoints as string[] || []), ...weakPoints])
          ),
          updatedAt: new Date(),
        })
        .where(eq(userAnalyticsTable.id, existing.id));
    }
  }

  /**
   * Question Bank Search and Filtering
   */
  static async queryQuestions(params: {
    level?: JLPTLevel;
    section?: QuestionSection;
    category?: QuestionCategory;
    mondaiNumber?: number;
    keyword?: string;
    tag?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ questions: Question[]; total: number }> {
    await this.ensureSeeded();

    const query = db.select().from(questionsTable);
    const conditions = [];

    if (params.level) {
      conditions.push(eq(questionsTable.jlptLevel, params.level));
    }
    if (params.section) {
      conditions.push(eq(questionsTable.section, params.section));
    }
    if (params.category) {
      conditions.push(eq(questionsTable.category, params.category));
    }
    if (params.mondaiNumber) {
      conditions.push(eq(questionsTable.mondaiNumber, params.mondaiNumber));
    }
    if (params.keyword) {
      conditions.push(
        sql`(${questionsTable.prompt} ILIKE ${`%${params.keyword}%`} OR ${questionsTable.promptTranslation} ILIKE ${`%${params.keyword}%`} OR ${questionsTable.explanation} ILIKE ${`%${params.keyword}%`})`
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const baseCount = db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(questionsTable);
    const [countRow] = whereClause
      ? await baseCount.where(whereClause)
      : await baseCount;
    const total = countRow?.count ?? 0;

    let itemsQuery = db.select().from(questionsTable);
    if (whereClause) {
      itemsQuery = itemsQuery.where(whereClause) as any;
    }

    const limit = params.limit || 50;
    const offset = params.offset || 0;

    const rows = await itemsQuery
      .orderBy(questionsTable.mondaiNumber, questionsTable.id)
      .limit(limit)
      .offset(offset);

    let list = rows as unknown as Question[];
    if (params.tag) {
      list = list.filter((q) => q.tags?.includes(params.tag!));
    }

    return {
      questions: list,
      total,
    };
  }

  /**
   * Get single question by ID
   */
  static async getQuestionById(id: string): Promise<Question | null> {
    await this.ensureSeeded();

    const [row] = await db
      .select()
      .from(questionsTable)
      .where(eq(questionsTable.id, id))
      .limit(1);

    return (row as unknown as Question) || null;
  }
}
