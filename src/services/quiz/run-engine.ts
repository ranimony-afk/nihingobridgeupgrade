import "server-only";

import { randomUUID } from "node:crypto";

import {
  createRun,
  completeRunRow,
  findRun,
  findRunItem,
  listRunItems,
  listRuns,
  recomputeRunTotals,
  runStats,
  saveRunItemAnswer,
  sectionAggregates,
  skillAggregates,
  toRunPublic,
  type NewRunItem,
  type RunRow,
} from "@/repositories/quiz";
import { getQuestionsByIds, getQuestionSecrets, queryQuestions } from "@/repositories/question";
import { gradeOne } from "@/services/questions/engine";
import type { QuestionKind, QuestionPublic, QuestionQuery, QuestionSkill } from "@/types/question";
import type {
  QuizRunDetail,
  QuizRunGradeResponse,
  QuizRunItemPublic,
  QuizRunKind,
  QuizRunResult,
  QuizRunSectionResult,
  QuizRunSection,
  QuizRunSkillResult,
  QuizRunStats,
  QuizStartInput,
} from "@/types/quiz";

/**
 * THE assessment run engine (phase 10.2).
 *
 * It owns *sampling, pacing and scoring* only. Correctness is never decided
 * here: every answer is graded through `gradeOne()` from the generic question
 * engine, which is the platform's single grading authority. Lesson exercises,
 * quizzes and JLPT attempts therefore can never drift apart.
 */

const QUIZ_PASS_PERCENT = 60;
const MAX_SAMPLE = 100;

const SKILLS: QuestionSkill[] = ["grammar", "kanji", "vocabulary", "reading"];
const KINDS: QuestionKind[] = ["multiple_choice", "cloze", "reading", "meaning"];

/** Only known bank values are forwarded — a bad blueprint value cannot 500. */
const asSkills = (values: string[]): QuestionSkill[] =>
  values.filter((value): value is QuestionSkill => (SKILLS as string[]).includes(value));
const asKinds = (values: string[]): QuestionKind[] =>
  values.filter((value): value is QuestionKind => (KINDS as string[]).includes(value));

export class RunError extends Error {
  constructor(
    readonly code: "not_found" | "expired" | "already_completed" | "empty_bank" | "unavailable",
    message: string,
  ) {
    super(message);
    this.name = "RunError";
  }
}

/** Deterministic per-section seed so a blueprint attempt is reproducible. */
function sectionSeed(seed: number, salt: string): number {
  let hash = 2166136261 ^ Math.abs(seed || 0);
  for (const char of salt) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash % 2147483647 || 1;
}

/** Samples `count` unused questions from the bank for one slice of a run. */
async function sampleQuestions(
  query: QuestionQuery,
  count: number,
  used: Set<number>,
  seed: number,
): Promise<QuestionPublic[]> {
  const picked: QuestionPublic[] = [];
  for (let attempt = 0; attempt < 4 && picked.length < count; attempt += 1) {
    const wanted = Math.min(MAX_SAMPLE, (count - picked.length) * (attempt + 1));
    const set = await queryQuestions({
      ...query,
      limit: Math.max(wanted, count),
      seed: seed + attempt * 7919,
    });
    if (set.questions.length === 0) break;
    for (const question of set.questions) {
      if (used.has(question.id)) continue;
      used.add(question.id);
      picked.push(question);
      if (picked.length === count) break;
    }
  }
  return picked;
}

/** Builds section framing with item position ranges. */
function buildSections(
  definitions: Array<{
    code: string;
    title: string;
    titleJa?: string | null;
    instructions?: string | null;
    position: number;
    timeLimitSeconds: number;
    questionCount: number;
    skills: string[];
    kinds: string[];
  }>,
): QuizRunSection[] {
  let position = 1;
  return definitions.map((definition) => {
    const section: QuizRunSection = {
      code: definition.code,
      title: definition.title,
      titleJa: definition.titleJa ?? null,
      instructions: definition.instructions ?? null,
      position: definition.position,
      timeLimitSeconds: definition.timeLimitSeconds,
      questionCount: definition.questionCount,
      skills: definition.skills,
      kinds: definition.kinds,
      fromPosition: position,
      toPosition: position + definition.questionCount - 1,
    };
    position += definition.questionCount;
    return section;
  });
}

export interface StartRunInput extends QuizStartInput {
  userId: number;
  /** Blueprint framing for JLPT attempts. */
  test?: {
    id: number | null;
    slug: string;
    level: number;
    title: string;
    passingPercent: number;
    sectionMinimumPercent: number;
    timeLimitSeconds: number;
    sections: Array<{
      code: string;
      title: string;
      titleJa: string | null;
      instructions: string | null;
      position: number;
      timeLimitSeconds: number;
      questionCount: number;
      skills: string[];
      kinds: string[];
    }>;
  } | null;
}

/**
 * Starts a run: samples the bank, freezes the item order and the clock.
 *
 * Sampling is seeded, so the same `(seed, filters)` always rebuilds the same
 * attempt — a requirement for reproducible quizzes and defensible JLPT scores.
 */
export async function startRun(input: StartRunInput): Promise<QuizRunDetail> {
  const seed =
    input.seed ?? Math.floor(Math.random() * 2147483000) + 1;
  const used = new Set<number>();
  const items: NewRunItem[] = [];

  if (input.test) {
    const sections = buildSections(input.test.sections);
    for (const section of sections) {
      const questions = await sampleQuestions(
        {
          skills: section.skills.length > 0 ? asSkills(section.skills) : undefined,
          kinds: section.kinds.length > 0 ? asKinds(section.kinds) : undefined,
          jlptLevel: input.test.level,
        },
        section.questionCount,
        used,
        sectionSeed(seed, `${input.test.slug}:${section.code}`),
      );
      if (questions.length < section.questionCount) {
        throw new RunError(
          "unavailable",
          `Section "${section.title}" needs ${section.questionCount} questions but the bank has ${questions.length}.`,
        );
      }
      questions.forEach((question, index) => {
        items.push({
          questionId: question.id,
          position: section.fromPosition + index,
          sectionCode: section.code,
          points: question.points,
        });
      });
    }
  } else {
    const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);
    const questions = await sampleQuestions(
      {
        skills: input.skills?.length ? asSkills(input.skills) : undefined,
        kinds: input.kinds?.length ? asKinds(input.kinds) : undefined,
        jlptLevel: input.jlptLevel ?? undefined,
      },
      limit,
      used,
      seed,
    );
    if (questions.length === 0) {
      throw new RunError("empty_bank", "No questions match those filters.");
    }
    questions.forEach((question, index) => {
      items.push({
        questionId: question.id,
        position: index + 1,
        sectionCode: null,
        points: question.points,
      });
    });
  }

  const run = await createRun({
    userId: input.userId,
    kind: input.test ? "jlpt" : (input.kind ?? "quiz"),
    title: input.test ? input.test.title : (input.title ?? "Practice quiz"),
    jlptTestId: input.test?.id ?? null,
    jlptSlug: input.test?.slug ?? null,
    seed,
    jlptLevel: input.test ? input.test.level : (input.jlptLevel ?? null),
    skills: input.skills ?? [],
    kinds: input.kinds ?? [],
    sections: input.test ? buildSections(input.test.sections) : [],
    timeLimitSeconds: input.test ? input.test.timeLimitSeconds : (input.timeLimitSeconds ?? null),
    items,
  });

  // Re-read through getRun so the response is byte-identical to a later fetch.
  return (await getRun(run.publicId, input.userId)) as QuizRunDetail;
}

/** Full run detail: public questions + revealed answers + result when done. */
export async function getRun(
  publicId: string,
  userId: number,
): Promise<QuizRunDetail | null> {
  const run = await findRun(publicId, userId);
  if (!run) return null;

  const items = await listRunItems(run.id);
  const questions = await getQuestionsByIds(items.map((item) => item.questionId));
  const byId = new Map(questions.map((question) => [question.id, question]));

  const mapped: QuizRunItemPublic[] = items.map((item) => {
    const question = byId.get(item.questionId);
    return {
      position: item.position,
      sectionCode: item.sectionCode,
      question: question ?? {
        id: item.questionId,
        sourceKey: "missing",
        skill: "grammar",
        kind: "multiple_choice",
        answerMode: "option",
        prompt: "This question is no longer available.",
        promptJa: null,
        instructions: null,
        jlptLevel: null,
        difficulty: 1,
        points: item.points,
        options: [],
        reference: null,
      },
      answer: item.answered
        ? {
            optionId: item.optionId,
            value: item.value,
            correct: Boolean(item.correct),
            awardedPoints: item.awardedPoints,
            points: item.points,
            correctAnswer: item.correctAnswer,
            feedback: item.feedback,
            explanation: item.explanation,
            elapsedMs: item.elapsedMs,
          }
        : null,
    };
  });

  return {
    run: toRunPublic(run),
    items: mapped,
    result: run.status === "completed" ? await buildResult(run) : null,
  };
}

/** Scores one answer through the shared grading authority. */
export async function answerRunItem(input: {
  publicId: string;
  userId: number;
  position: number;
  optionId?: number | null;
  value?: string | null;
  elapsedMs?: number | null;
}): Promise<QuizRunGradeResponse> {
  const run = await findRun(input.publicId, input.userId);
  if (!run) throw new RunError("not_found", "Run not found");

  if (run.status === "completed") throw new RunError("already_completed", "This run is already finished");
  if (run.expiresAt && new Date(run.expiresAt).getTime() <= Date.now()) {
    await completeRunRow(run.id, {
      percent: run.percent,
      passed: false,
      durationSeconds: run.timeLimitSeconds ?? null,
    });
    throw new RunError("expired", "Time is up for this run");
  }

  const item = await findRunItem(run.id, input.position);
  if (!item) throw new RunError("not_found", "Question not found in this run");

  if (item.answered) {
    const fresh = await recomputeRunTotals(run.id);
    const current = fresh ?? run;
    return {
      run: toRunPublic(current),
      position: item.position,
      grade: {
        correct: Boolean(item.correct),
        points: item.points,
        awardedPoints: item.awardedPoints,
        correctAnswer: item.correctAnswer,
        explanation: item.explanation,
        feedback: item.feedback,
      },
      remaining: current.questionCount - current.answeredCount,
    };
  }

  const secrets = await getQuestionSecrets([item.questionId]);
  const secret = secrets.get(item.questionId);
  if (!secret) throw new RunError("not_found", "The question backing this item is unavailable");

  const grade = gradeOne(
    { ...secret, options: secret.options },
    { optionId: input.optionId ?? null, value: input.value ?? null },
  );

  await saveRunItemAnswer({
    itemId: item.id,
    optionId: input.optionId ?? null,
    value: input.value ?? null,
    correct: grade.correct,
    awardedPoints: grade.awardedPoints,
    correctAnswer: grade.correctAnswer,
    feedback: grade.feedback,
    explanation: grade.explanation,
    elapsedMs: input.elapsedMs ?? null,
  });

  const updated = (await recomputeRunTotals(run.id)) ?? run;
  return {
    run: toRunPublic(updated),
    position: item.position,
    grade: {
      correct: grade.correct,
      points: grade.points,
      awardedPoints: grade.awardedPoints,
      correctAnswer: grade.correctAnswer,
      explanation: grade.explanation,
      feedback: grade.feedback,
    },
    remaining: updated.questionCount - updated.answeredCount,
  };
}

/** Assembles the scored result of a run (sections + skills + pass decision). */
export async function buildResult(run: RunRow): Promise<QuizRunResult> {
  const [items, sections, skills] = await Promise.all([
    listRunItems(run.id),
    sectionAggregates(run.id),
    skillAggregates(run.id),
  ]);

  const passingPercent = run.passingPercent ?? QUIZ_PASS_PERCENT;
  const sectionMinimum = run.sectionMinimumPercent ?? 0;

  const sectionResults: QuizRunSectionResult[] = run.sections.map((section) => {
    const aggregate = sections.find((entry) => entry.sectionCode === section.code);
    const questionCount = aggregate?.questionCount ?? 0;
    const totalPoints = aggregate?.totalPoints ?? 0;
    const score = aggregate?.score ?? 0;
    const percent = totalPoints === 0 ? 0 : Math.round((score / totalPoints) * 100);
    return {
      code: section.code,
      title: section.title,
      questionCount,
      answered: aggregate?.answered ?? 0,
      correct: aggregate?.correct ?? 0,
      score,
      totalPoints,
      percent,
      passed: run.kind === "jlpt" ? percent >= sectionMinimum : null,
    };
  });

  const skillResults: QuizRunSkillResult[] = skills.map((skill) => ({
    skill: skill.skill,
    questionCount: skill.questionCount,
    correct: skill.correct,
    percent: skill.percent,
  }));

  const overallPassed =
    run.percent >= passingPercent && sectionResults.every((section) => section.percent >= sectionMinimum);

  return {
    score: run.score,
    totalPoints: run.totalPoints,
    percent: run.percent,
    answered: run.answeredCount,
    correct: run.correctCount,
    incorrect: items.filter((item) => item.answered && !item.correct).length,
    skipped: items.filter((item) => !item.answered).length,
    passed: overallPassed,
    passingPercent,
    sectionMinimumPercent: run.kind === "jlpt" ? sectionMinimum : null,
    sections: sectionResults,
    skills: skillResults,
    durationSeconds: run.durationSeconds,
  };
}

/**
 * Finalises a run. Untimed quizzes and submitted-early JLPT attempts are both
 * allowed; unanswered items simply score zero.
 */
export async function finalizeRun(input: {
  publicId: string;
  userId: number;
  durationSeconds?: number | null;
}): Promise<QuizRunDetail | null> {
  const run = await findRun(input.publicId, input.userId);
  if (!run) throw new RunError("not_found", "Run not found");

  if (run.status === "completed") return getRun(run.publicId, run.userId);

  const expired = Boolean(run.expiresAt && new Date(run.expiresAt).getTime() <= Date.now());
  const recomputed = (await recomputeRunTotals(run.id)) ?? run;
  const result = await buildResult(recomputed);

  const duration =
    input.durationSeconds ??
    (expired
      ? run.timeLimitSeconds ?? null
      : Math.max(
          0,
          Math.round((Date.now() - new Date(run.startedAt).getTime()) / 1000),
        ));

  await completeRunRow(run.id, {
    percent: recomputed.percent,
    // A run that ran out of time with open items can never pass.
    passed: expired && recomputed.answeredCount < recomputed.questionCount ? false : result.passed,
    durationSeconds: duration,
  });

  return getRun(run.publicId, run.userId);
}

/** Expires the caller's overdue runs, then returns their history. */
export async function getRunHistory(
  userId: number,
  options: { kind?: QuizRunKind | null; limit?: number } = {},
) {
  const { expireOverdueRuns } = await import("@/repositories/quiz");
  await expireOverdueRuns(userId);
  const runs = await listRuns(userId, options);
  return runs.map(toRunPublic);
}

export async function getRunStats(): Promise<QuizRunStats> {
  return runStats();
}

/** Stable external id generator kept here so tests can predict shape. */
export function newRunPublicId(kind: QuizRunKind): string {
  return `${kind}-${randomUUID().slice(0, 8)}`;
}
