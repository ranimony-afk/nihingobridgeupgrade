/**
 * TestEngine — Domain service for practice tests.
 *
 * P40: Full test lifecycle: start, session, answer, pause, resume, complete, score, results, review.
 */

import { eq, and, asc, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  practiceTests,
  testSections,
  questions,
  questionOptions,
  testSessions,
  testAnswers,
  testResults,
} from "@/db/schema";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

type SessionStatus = "in_progress" | "completed" | "abandoned" | "timed_out";

export interface TestOverview {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  jlptLevel: number | null;
  difficulty: string | null;
  timeLimitMinutes: number | null;
  totalPoints: number;
  passingScore: number | null;
  questionCount: number;
  sectionCount: number;
  sections: { id: string; title: string; questionCount: number; totalPoints: number }[];
}

export interface SessionView {
  id: string;
  testId: string;
  testTitle: string;
  learnerId: string;
  status: SessionStatus;
  startedAt: Date;
  endedAt: Date | null;
  timeSpentSeconds: number | null;
  timeLimitMinutes: number | null;
  currentQuestionIndex: number;
  totalQuestions: number;
  answeredCount: number;
  /** Questions in session order (answers stripped). */
  questions: QuestionForSession[];
}

export interface QuestionForSession {
  id: string;
  type: string;
  prompt: string;
  promptJa: string | null;
  context: string | null;
  audioUrl: string | null;
  imageUrl: string | null;
  points: number;
  options: { id: string; label: string; labelJa: string | null }[] | null;
  /** Whether this question has been answered in this session. */
  answered: boolean;
}

export interface AnswerInput {
  questionId: string;
  answer: unknown;
  timeSpentMs?: number;
}

export interface AnswerResult {
  questionId: string;
  accepted: boolean;
  isCorrect: boolean;
  pointsEarned: number;
}

export interface TestResultView {
  id: string;
  sessionId: string;
  testTitle: string;
  learnerId: string;
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  correctCount: number;
  totalQuestions: number;
  timeSpentSeconds: number | null;
  completedAt: Date;
  sectionBreakdown: { sectionId: string; title: string; score: number; maxScore: number; percentage: number }[] | null;
  xpAwarded: number;
}

export interface ReviewItem {
  questionId: string;
  type: string;
  prompt: string;
  promptJa: string | null;
  correctAnswer: unknown;
  userAnswer: unknown;
  isCorrect: boolean;
  pointsEarned: number;
  pointsPossible: number;
  explanation: string | null;
  options: { id: string; label: string; isCorrect: boolean }[] | null;
}

// ─────────────────────────────────────────────
// TestEngine
// ─────────────────────────────────────────────

export const TestEngine = {

  /** List available tests. */
  async listTests(opts?: { jlpt?: number }): Promise<TestOverview[]> {
    const conds = [eq(practiceTests.status, "published")];
    if (opts?.jlpt) conds.push(eq(practiceTests.jlptLevel, opts.jlpt));

    const tests = await db.select().from(practiceTests).where(and(...conds)).orderBy(asc(practiceTests.jlptLevel));
    const result: TestOverview[] = [];

    for (const test of tests) {
      const sections = await db.select().from(testSections).where(eq(testSections.testId, test.id)).orderBy(asc(testSections.sortOrder));
      const sectionViews = [];
      let totalQ = 0;
      for (const sec of sections) {
        const qCount = await db.select({ count: sql<number>`count(*)::int` }).from(questions).where(eq(questions.sectionId, sec.id));
        const c = qCount[0]?.count ?? 0;
        totalQ += c;
        sectionViews.push({ id: sec.id, title: sec.title, questionCount: c, totalPoints: sec.totalPoints });
      }
      result.push({
        id: test.id, slug: test.slug, title: test.title, description: test.description,
        jlptLevel: test.jlptLevel, difficulty: test.difficulty, timeLimitMinutes: test.timeLimitMinutes,
        totalPoints: test.totalPoints, passingScore: test.passingScore,
        questionCount: totalQ, sectionCount: sections.length, sections: sectionViews,
      });
    }
    return result;
  },

  // ── 1. START ──

  /** Start a new test session. Returns session with questions. */
  async start(testId: string, learnerId: string): Promise<SessionView> {
    const [test] = await db.select().from(practiceTests).where(eq(practiceTests.id, testId)).limit(1);
    if (!test) throw new Error("Test not found");

    // Gather all questions in section order
    const sections = await db.select().from(testSections).where(eq(testSections.testId, testId)).orderBy(asc(testSections.sortOrder));
    const allQs: (typeof questions.$inferSelect)[] = [];
    for (const sec of sections) {
      const qs = await db.select().from(questions).where(eq(questions.sectionId, sec.id)).orderBy(asc(questions.sortOrder));
      allQs.push(...qs);
    }

    // Optionally shuffle
    let orderedIds = allQs.map((q) => q.id);
    if (test.shuffleQuestions) orderedIds = orderedIds.sort(() => Math.random() - 0.5);

    const sessionId = genId("sess");
    await db.insert(testSessions).values({
      id: sessionId,
      testId,
      learnerId,
      status: "in_progress",
      currentQuestionIndex: 0,
      questionOrder: orderedIds,
    });

    return this.session(sessionId);
  },

  // ── 2. SESSION ──

  /** Get current session state. */
  async session(sessionId: string): Promise<SessionView> {
    const [sess] = await db.select().from(testSessions).where(eq(testSessions.id, sessionId)).limit(1);
    if (!sess) throw new Error("Session not found");

    const [test] = await db.select().from(practiceTests).where(eq(practiceTests.id, sess.testId)).limit(1);
    if (!test) throw new Error("Test not found");

    const qOrder = sess.questionOrder ?? [];
    const answeredRows = await db.select({ questionId: testAnswers.questionId }).from(testAnswers).where(eq(testAnswers.sessionId, sessionId));
    const answeredSet = new Set(answeredRows.map((a) => a.questionId));

    const sessionQuestions: QuestionForSession[] = [];
    for (const qId of qOrder) {
      const [q] = await db.select().from(questions).where(eq(questions.id, qId)).limit(1);
      if (!q) continue;
      const opts = await db.select().from(questionOptions).where(eq(questionOptions.questionId, qId)).orderBy(asc(questionOptions.sortOrder));

      sessionQuestions.push({
        id: q.id, type: q.type, prompt: q.prompt, promptJa: q.promptJa,
        context: q.context, audioUrl: q.audioUrl, imageUrl: q.imageUrl, points: q.points,
        options: opts.length > 0 ? opts.map((o) => ({ id: o.id, label: o.label, labelJa: o.labelJa })) : null,
        answered: answeredSet.has(q.id),
      });
    }

    return {
      id: sess.id, testId: sess.testId, testTitle: test.title,
      learnerId: sess.learnerId, status: sess.status as SessionStatus,
      startedAt: sess.startedAt, endedAt: sess.endedAt,
      timeSpentSeconds: sess.timeSpentSeconds, timeLimitMinutes: test.timeLimitMinutes,
      currentQuestionIndex: sess.currentQuestionIndex, totalQuestions: qOrder.length,
      answeredCount: answeredSet.size, questions: sessionQuestions,
    };
  },

  // ── 3. ANSWER ──

  /** Submit an answer for a question in a session. */
  async answer(sessionId: string, input: AnswerInput): Promise<AnswerResult> {
    const [sess] = await db.select().from(testSessions).where(eq(testSessions.id, sessionId)).limit(1);
    if (!sess || sess.status !== "in_progress") throw new Error("Session not active");

    const [q] = await db.select().from(questions).where(eq(questions.id, input.questionId)).limit(1);
    if (!q) throw new Error("Question not found");

    // Check if already answered
    const existing = await db.select().from(testAnswers)
      .where(and(eq(testAnswers.sessionId, sessionId), eq(testAnswers.questionId, input.questionId))).limit(1);
    if (existing.length > 0) throw new Error("Question already answered");

    // Grade the answer
    const correctAnswer = q.correctAnswer as Record<string, unknown>;
    const isCorrect = this._checkAnswer(q.type, input.answer, correctAnswer);
    const pointsEarned = isCorrect ? q.points : 0;

    await db.insert(testAnswers).values({
      id: genId("ta"),
      sessionId,
      questionId: input.questionId,
      answer: input.answer as Record<string, unknown>,
      isCorrect,
      pointsEarned,
      timeSpentMs: input.timeSpentMs ?? null,
    });

    // Advance question index
    await db.update(testSessions).set({
      currentQuestionIndex: sess.currentQuestionIndex + 1,
    }).where(eq(testSessions.id, sessionId));

    return { questionId: input.questionId, accepted: true, isCorrect, pointsEarned };
  },

  // ── 4. PAUSE ──

  /** Pause a session (records elapsed time). */
  async pause(sessionId: string): Promise<{ paused: boolean }> {
    const [sess] = await db.select().from(testSessions).where(eq(testSessions.id, sessionId)).limit(1);
    if (!sess || sess.status !== "in_progress") return { paused: false };

    const elapsed = Math.round((Date.now() - sess.startedAt.getTime()) / 1000);
    await db.update(testSessions).set({ timeSpentSeconds: elapsed }).where(eq(testSessions.id, sessionId));
    return { paused: true };
  },

  // ── 5. RESUME ──

  /** Resume a paused session. Returns current state. */
  async resume(sessionId: string): Promise<SessionView> {
    return this.session(sessionId);
  },

  // ── 6. COMPLETE ──

  /** Complete a session and calculate results. */
  async complete(sessionId: string): Promise<TestResultView> {
    const [sess] = await db.select().from(testSessions).where(eq(testSessions.id, sessionId)).limit(1);
    if (!sess) throw new Error("Session not found");

    const [test] = await db.select().from(practiceTests).where(eq(practiceTests.id, sess.testId)).limit(1);
    if (!test) throw new Error("Test not found");

    const elapsed = Math.round((Date.now() - sess.startedAt.getTime()) / 1000);
    const now = new Date();

    // Mark session complete
    await db.update(testSessions).set({
      status: "completed",
      endedAt: now,
      timeSpentSeconds: elapsed,
    }).where(eq(testSessions.id, sessionId));

    // Calculate scores
    const answers = await db.select().from(testAnswers).where(eq(testAnswers.sessionId, sessionId));
    const correctCount = answers.filter((a) => a.isCorrect).length;
    const totalScore = answers.reduce((sum, a) => sum + a.pointsEarned, 0);
    const totalQuestions = (sess.questionOrder ?? []).length;
    const maxScore = test.totalPoints;
    const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100 * 10) / 10 : 0;
    const passed = percentage >= (test.passingScore ?? 60);
    const xpAwarded = passed ? Math.round(percentage / 5) : Math.round(percentage / 10);

    // Section breakdown
    const sections = await db.select().from(testSections).where(eq(testSections.testId, test.id)).orderBy(asc(testSections.sortOrder));
    const breakdown = [];
    for (const sec of sections) {
      const secQs = await db.select({ id: questions.id }).from(questions).where(eq(questions.sectionId, sec.id));
      const secQIds = new Set(secQs.map((q) => q.id));
      const secAnswers = answers.filter((a) => secQIds.has(a.questionId));
      const secScore = secAnswers.reduce((sum, a) => sum + a.pointsEarned, 0);
      breakdown.push({
        sectionId: sec.id, title: sec.title,
        score: secScore, maxScore: sec.totalPoints,
        percentage: sec.totalPoints > 0 ? Math.round((secScore / sec.totalPoints) * 100) : 0,
      });
    }

    // Save result
    const resultId = genId("tr");
    await db.insert(testResults).values({
      id: resultId,
      sessionId,
      testId: test.id,
      learnerId: sess.learnerId,
      score: totalScore,
      maxScore,
      percentage,
      passed,
      correctCount,
      totalQuestions,
      timeSpentSeconds: elapsed,
      sectionBreakdown: breakdown,
      xpAwarded,
    });

    return this.results(resultId);
  },

  // ── 7. SCORE ──

  /** Get the result score for a completed session. */
  async score(sessionId: string): Promise<{ score: number; maxScore: number; percentage: number; passed: boolean } | null> {
    const [result] = await db.select().from(testResults).where(eq(testResults.sessionId, sessionId)).limit(1);
    if (!result) return null;
    return { score: result.score, maxScore: result.maxScore, percentage: result.percentage, passed: result.passed };
  },

  // ── 8. RESULTS ──

  /** Get full result details. */
  async results(resultId: string): Promise<TestResultView> {
    const [result] = await db.select().from(testResults).where(eq(testResults.id, resultId)).limit(1);
    if (!result) throw new Error("Result not found");

    const [test] = await db.select().from(practiceTests).where(eq(practiceTests.id, result.testId)).limit(1);

    return {
      id: result.id, sessionId: result.sessionId,
      testTitle: test?.title ?? "Unknown", learnerId: result.learnerId,
      score: result.score, maxScore: result.maxScore,
      percentage: result.percentage, passed: result.passed,
      correctCount: result.correctCount, totalQuestions: result.totalQuestions,
      timeSpentSeconds: result.timeSpentSeconds, completedAt: result.completedAt,
      sectionBreakdown: result.sectionBreakdown as TestResultView["sectionBreakdown"],
      xpAwarded: result.xpAwarded,
    };
  },

  // ── 9. REVIEW ──

  /** Review all answers for a completed session. */
  async review(sessionId: string): Promise<ReviewItem[]> {
    const answers = await db.select().from(testAnswers).where(eq(testAnswers.sessionId, sessionId));
    const items: ReviewItem[] = [];

    for (const ans of answers) {
      const [q] = await db.select().from(questions).where(eq(questions.id, ans.questionId)).limit(1);
      if (!q) continue;

      const opts = await db.select().from(questionOptions).where(eq(questionOptions.questionId, q.id)).orderBy(asc(questionOptions.sortOrder));

      items.push({
        questionId: q.id, type: q.type,
        prompt: q.prompt, promptJa: q.promptJa,
        correctAnswer: q.correctAnswer,
        userAnswer: ans.answer,
        isCorrect: ans.isCorrect,
        pointsEarned: ans.pointsEarned,
        pointsPossible: q.points,
        explanation: q.explanation,
        options: opts.length > 0 ? opts.map((o) => ({ id: o.id, label: o.label, isCorrect: o.isCorrect })) : null,
      });
    }

    return items;
  },

  // ── INTERNAL ──

  _checkAnswer(type: string, userAnswer: unknown, correctAnswer: Record<string, unknown>): boolean {
    const norm = (s: string) => s.trim().toLowerCase().replace(/[。、.!?,\s]+/g, "");

    if (type === "multiple_choice") {
      const correctOptionId = correctAnswer.optionId as string;
      if (typeof userAnswer === "string") return userAnswer === correctOptionId;
      if (typeof userAnswer === "object" && userAnswer !== null) return (userAnswer as Record<string, unknown>).optionId === correctOptionId;
      return false;
    }

    if (type === "fill_blank" || type === "free_text") {
      const accepted = (correctAnswer.accepted as string[]) ?? [];
      if (typeof userAnswer !== "string") return false;
      return accepted.some((a) => norm(userAnswer) === norm(a));
    }

    // Default: string comparison
    if (typeof userAnswer === "string" && typeof correctAnswer.answer === "string") {
      return norm(userAnswer) === norm(correctAnswer.answer as string);
    }

    return JSON.stringify(userAnswer) === JSON.stringify(correctAnswer);
  },

  /** Abandon a session. */
  async abandon(sessionId: string): Promise<void> {
    const elapsed = await this._getElapsed(sessionId);
    await db.update(testSessions).set({
      status: "abandoned", endedAt: new Date(), timeSpentSeconds: elapsed,
    }).where(eq(testSessions.id, sessionId));
  },

  async _getElapsed(sessionId: string): Promise<number> {
    const [sess] = await db.select().from(testSessions).where(eq(testSessions.id, sessionId)).limit(1);
    if (!sess) return 0;
    return Math.round((Date.now() - sess.startedAt.getTime()) / 1000);
  },
};
