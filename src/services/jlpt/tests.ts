import "server-only";

import {
  bankCoverageByLevel,
  findTestBySlug,
  jlptStats,
  listTests,
  toTestPublic,
  type JlptTestRecord,
} from "@/repositories/jlpt";
import { attemptCountForTest } from "@/repositories/quiz";
import { finalizeRun, getRun, getRunHistory, RunError, startRun } from "@/services/quiz/run-engine";
import type { JlptAttemptSummary, JlptStats, JlptTestPublic } from "@/types/jlpt";
import type { QuizRunDetail, QuizRunPublic } from "@/types/quiz";

/**
 * Phase 10.3 — JLPT test service.
 *
 * Blueprints are structure only. Starting an attempt delegates entirely to the
 * shared run engine, so JLPT scoring, expiry and grading use exactly the same
 * code path as a practice quiz. Nothing here re-implements correctness.
 */

export async function listPublishedTests(): Promise<
  Array<JlptTestPublic & { attemptCount: number }>
> {
  const tests = await listTests({ publishedOnly: true });
  return Promise.all(
    tests.map(async (test) => ({
      ...toTestPublic(test),
      attemptCount: await attemptCountForTest(test.id),
    })),
  );
}

export async function getTest(slug: string): Promise<(JlptTestPublic & { attemptCount: number }) | null> {
  const test = await findTestBySlug(slug);
  if (!test) return null;
  return { ...toTestPublic(test), attemptCount: await attemptCountForTest(test.id) };
}

/** Starts a timed attempt for a published blueprint. */
export async function startAttempt(input: {
  userId: number;
  slug: string;
  seed?: number | null;
}): Promise<QuizRunDetail> {
  const test = await findTestBySlug(input.slug);
  if (!test || !test.published) throw new RunError("not_found", "That JLPT test does not exist");

  const publicTest = toTestPublic(test);
  if (!publicTest.available) {
    throw new RunError(
      "unavailable",
      "The question bank cannot currently fill every section of this test.",
    );
  }

  return startRun({
    userId: input.userId,
    seed: input.seed ?? null,
    test: {
      id: test.id,
      slug: test.slug,
      level: test.level,
      title: test.title,
      passingPercent: test.passingPercent,
      sectionMinimumPercent: test.sectionMinimumPercent,
      timeLimitSeconds: test.timeLimitSeconds,
      sections: test.sections.map((section) => ({
        code: section.code,
        title: section.title,
        titleJa: section.titleJa,
        instructions: section.instructions,
        position: section.position,
        timeLimitSeconds: section.timeLimitSeconds,
        questionCount: section.questionCount,
        skills: section.skills,
        kinds: section.kinds,
      })),
    },
  });
}

/** Loads an attempt (ownership enforced by the run engine). */
export async function getAttempt(
  publicId: string,
  userId: number,
): Promise<QuizRunDetail | null> {
  const detail = await getRun(publicId, userId);
  if (!detail || detail.run.kind !== "jlpt") return null;
  return detail;
}

/** Submits an attempt and returns the scored result with section gates. */
export async function submitAttempt(input: {
  publicId: string;
  userId: number;
  durationSeconds?: number | null;
}): Promise<QuizRunDetail | null> {
  const detail = await getAttempt(input.publicId, input.userId);
  if (!detail) throw new RunError("not_found", "Attempt not found");
  return finalizeRun({
    publicId: input.publicId,
    userId: input.userId,
    durationSeconds: input.durationSeconds ?? null,
  });
}

export async function listAttempts(
  userId: number,
  options: { limit?: number } = {},
): Promise<JlptAttemptSummary[]> {
  const runs = await getRunHistory(userId, { kind: "jlpt", limit: options.limit ?? 10 });
  return runs.map((run: QuizRunPublic) => ({
    publicId: run.publicId,
    testSlug: run.jlptSlug ?? "",
    testTitle: run.title,
    level: run.jlptLevel ?? 0,
    status: run.status,
    questionCount: run.questionCount,
    answeredCount: run.answeredCount,
    correctCount: run.correctCount,
    score: run.score,
    totalPoints: run.totalPoints,
    percent: run.percent,
    passed: run.passed,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    durationSeconds: run.durationSeconds,
  }));
}

export async function getJlptStats(): Promise<JlptStats> {
  const [stats, coverage] = await Promise.all([jlptStats(), bankCoverageByLevel()]);
  return { ...stats, bankQuestionsByLevel: coverage };
}

export type { JlptTestRecord };
