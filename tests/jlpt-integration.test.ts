import { describe, it, expect, beforeAll } from "vitest";
import { TestService } from "@/services/jlpt/testService";
import { JLPTKnowledgeService } from "@/services/jlpt/knowledge";
import { db } from "@/db";
import { testSessions, testAnswers } from "@/db/schema";
import { eq } from "drizzle-orm";

describe("Phase 9: JLPT Knowledge Integration & Test Lifecycle", () => {
  beforeAll(async () => {
    // Ensure all tables and seed records are initialized
    await JLPTKnowledgeService.ensureInitialized();
  });

  describe("Cross-Domain JLPT Knowledge Aggregation (N5–N1)", () => {
    it("should aggregate live counts and sample entities for N5", async () => {
      const overview = await JLPTKnowledgeService.getLevelOverview("N5");
      expect(overview.level).toBe("N5");

      // Verify all domains are populated
      expect(overview.counts.vocabulary).toBeGreaterThan(0);
      expect(overview.counts.kanji).toBeGreaterThan(0);
      expect(overview.counts.grammar).toBeGreaterThan(0);
      expect(overview.counts.sentences).toBeGreaterThan(0);
      expect(overview.counts.questions).toBeGreaterThan(0);
      expect(overview.counts.tests).toBeGreaterThan(0);

      // Verify sample entities are returned with structured fields
      expect(overview.sampleVocabulary.length).toBeGreaterThan(0);
      expect(overview.sampleVocabulary[0].headword).toBeDefined();

      expect(overview.sampleKanji.length).toBeGreaterThan(0);
      expect(overview.sampleKanji[0].character).toBeDefined();

      expect(overview.sampleGrammar.length).toBeGreaterThan(0);
      expect(overview.sampleGrammar[0].title).toBeDefined();
    });

    it("should query N4, N3, N2, and N1 levels without crashing", async () => {
      for (const level of ["N4", "N3", "N2", "N1"] as const) {
        const overview = await JLPTKnowledgeService.getLevelOverview(level);
        expect(overview.level).toBe(level);
        expect(typeof overview.counts.vocabulary).toBe("number");
        expect(typeof overview.counts.kanji).toBe("number");
        expect(typeof overview.counts.grammar).toBe("number");
        expect(typeof overview.counts.sentences).toBe("number");
      }
    });
  });

  describe("Test Lifecycle: Launch, Question Retrieval, Answer Submission, Scoring, & Progress", () => {
    const testUserId = `test-user-${Date.now()}`;
    let activeSessionId: string;
    let questionsList: any[];

    it("should verify existing test suites are published and listable", async () => {
      const tests = await TestService.listTests("N5");
      expect(tests.length).toBeGreaterThanOrEqual(1);

      const mock01 = tests.find((t) => t.id === "jlpt-n5-mock-01");
      expect(mock01).toBeDefined();
      expect(mock01?.passingScore).toBe(80);
      expect(mock01?.totalScore).toBe(180);
      expect(mock01?.questionCount).toBeGreaterThan(0);
    });

    it("should launch a timed mock exam session and retrieve questions", async () => {
      const session = await TestService.startSession({
        userId: testUserId,
        testId: "jlpt-n5-mock-01",
        quizType: "jlpt_mock",
        jlptLevel: "N5",
        isTimed: true,
      });

      expect(session.sessionId).toBeDefined();
      expect(session.timeLimitSeconds).toBeGreaterThan(0);
      expect(session.questions.length).toBeGreaterThan(0);

      activeSessionId = session.sessionId;
      questionsList = session.questions;

      // Verify session row exists in test_sessions
      const [sessionRow] = await db
        .select()
        .from(testSessions)
        .where(eq(testSessions.id, activeSessionId));
      expect(sessionRow).toBeDefined();
      expect(sessionRow.status).toBe("in_progress");
      expect(sessionRow.userId).toBe(testUserId);
    });

    it("should save individual answers and evaluate correctness", async () => {
      const firstQ = questionsList[0];
      expect(firstQ).toBeDefined();

      // Submit correct answer
      await TestService.saveAnswer(activeSessionId, {
        questionId: firstQ.id,
        selectedAnswer: firstQ.correctAnswer,
        timeSpentSeconds: 15,
      });

      const sessionState = await TestService.getSessionState(activeSessionId);
      expect(sessionState).not.toBeNull();
      expect(sessionState?.answers.length).toBe(1);

      const savedAnswer = sessionState?.answers[0];
      expect(savedAnswer?.questionId).toBe(firstQ.id);
      expect(savedAnswer?.selectedAnswer).toBe(firstQ.correctAnswer);
      expect(savedAnswer?.isCorrect).toBe(true);
    });

    it("should submit the session, calculate section scores and diagnostics", async () => {
      // Answer the rest of questions
      const submissions = questionsList.map((q, idx) => ({
        questionId: q.id,
        selectedAnswer: idx % 2 === 0 ? q.correctAnswer : "incorrect-dummy-option",
        timeSpentSeconds: 10,
      }));

      const finalResult = await TestService.submitSession(activeSessionId, submissions);
      expect(finalResult).not.toBeNull();
      expect(finalResult?.sessionId).toBe(activeSessionId);
      expect(finalResult?.score).toBeGreaterThan(0);
      expect(typeof finalResult?.passed).toBe("boolean");
      expect(finalResult?.sectionScores).toBeDefined();
      expect(finalResult?.evaluations.length).toBe(questionsList.length);

      // Verify database updated
      const [sessionRow] = await db
        .select()
        .from(testSessions)
        .where(eq(testSessions.id, activeSessionId));
      expect(sessionRow.status).toBe("completed");
      expect(sessionRow.score).toBe(finalResult?.score);
    });

    it("should track user progress and history", async () => {
      const progress = await JLPTKnowledgeService.getUserProgress(testUserId, "N5");
      expect(progress.userId).toBe(testUserId);
      expect(progress.completedTestsCount).toBe(1);
      expect(progress.recentSessions.length).toBe(1);
      expect(progress.recentSessions[0].id).toBe(activeSessionId);
      expect(progress.averageScorePercent).toBeGreaterThan(0);
    });
  });
});
