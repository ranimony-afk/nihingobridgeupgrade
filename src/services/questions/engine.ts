import "server-only";

import {
  getQuestionBankStats,
  getQuestionSecrets,
  getQuestionsByIds,
  mapExercisesToQuestions,
  queryQuestions,
} from "@/repositories/question";
import type {
  QuestionAnswerInput,
  QuestionBankStats,
  QuestionGrade,
  QuestionQuery,
  QuestionSet,
} from "@/types/question";

/**
 * THE generic question engine.
 *
 * This is the single grading authority for the platform. Lesson exercises,
 * quizzes and JLPT tests are all consumers — none of them re-implements
 * correctness. A client submits answers and never a score.
 */

/** Katakana -> hiragana so a learner may answer in either script. */
const toHiragana = (value: string) =>
  value.replace(/[\u30a1-\u30f6]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));

/**
 * Canonical answer normalisation, mirrored exactly by
 * `etl/lib/question-utils.mjs` so stored answers and typed input always compare
 * on identical terms.
 */
export function normalizeAnswer(value: string): string {
  return toHiragana(String(value ?? "").normalize("NFKC"))
    .toLowerCase()
    .replace(/[\s.,。、・.-]/g, "")
    .trim();
}

export async function getQuestions(query: QuestionQuery): Promise<QuestionSet> {
  try {
    const result = await queryQuestions(query);
    return {
      questions: result.questions,
      total: result.total,
      totalPoints: result.questions.reduce((sum, question) => sum + question.points, 0),
      filters: {
        skills: query.skills ?? [],
        jlptLevel: query.jlptLevel ?? null,
        kinds: query.kinds ?? [],
      },
    };
  } catch {
    return {
      questions: [],
      total: 0,
      totalPoints: 0,
      filters: { skills: [], jlptLevel: null, kinds: [] },
    };
  }
}

export async function getQuestionSetByIds(ids: number[]): Promise<QuestionSet> {
  try {
    const questions = await getQuestionsByIds(ids);
    return {
      questions,
      total: questions.length,
      totalPoints: questions.reduce((sum, question) => sum + question.points, 0),
      filters: { skills: [], jlptLevel: null, kinds: [] },
    };
  } catch {
    return { questions: [], total: 0, totalPoints: 0, filters: { skills: [], jlptLevel: null, kinds: [] } };
  }
}

/**
 * Grades answers against the bank. Unknown ids are skipped rather than failing
 * the whole submission, so a stale client cannot block a learner.
 */
/** Gradeable shape shared by bank questions and lesson-exercise placements. */
export interface GradeableSecret {
  id: number;
  answerMode: "option" | "text";
  points: number;
  explanation: string | null;
  acceptedAnswers: string[];
  options: Array<{ id: number; isCorrect: boolean; feedback: string | null }>;
}

/**
 * THE grading decision. Every consumer (lesson exercises, quizzes, JLPT tests)
 * must call this rather than re-implementing correctness.
 */
export function gradeOne(
  secret: GradeableSecret,
  answer: { optionId?: number | null; value?: string | null },
): Omit<QuestionGrade, "questionId"> {
  const correctOption = secret.options.find((option) => option.isCorrect) ?? null;
  let correct = false;
  let feedback: string | null = null;

  if (secret.answerMode === "option") {
    const chosen = secret.options.find((option) => option.id === answer.optionId) ?? null;
    correct = Boolean(chosen?.isCorrect);
    feedback = chosen?.feedback ?? null;
  } else {
    const submitted = normalizeAnswer(answer.value ?? "");
    correct = submitted.length > 0 && secret.acceptedAnswers.includes(submitted);
  }

  return {
    correct,
    points: secret.points,
    awardedPoints: correct ? secret.points : 0,
    correctOptionId: correctOption?.id ?? null,
    correctAnswer: secret.answerMode === "text" ? secret.acceptedAnswers[0] ?? null : null,
    explanation: secret.explanation,
    feedback,
  };
}

export async function gradeQuestions(
  answers: QuestionAnswerInput[],
): Promise<QuestionGrade[]> {
  if (answers.length === 0) return [];
  const secrets = await getQuestionSecrets(answers.map((answer) => answer.questionId));

  const grades: QuestionGrade[] = [];
  for (const answer of answers) {
    const secret = secrets.get(answer.questionId);
    if (!secret) continue;
    grades.push({ questionId: secret.id, ...gradeOne(secret, answer) });
  }
  return grades;
}

/** Scores a graded set. */
export function scoreGrades(grades: QuestionGrade[]) {
  const score = grades.reduce((sum, grade) => sum + grade.awardedPoints, 0);
  const maxScore = grades.reduce((sum, grade) => sum + grade.points, 0);
  return {
    score,
    maxScore,
    correct: grades.filter((grade) => grade.correct).length,
    answered: grades.length,
    percent: maxScore === 0 ? 0 : Math.round((score / maxScore) * 100),
  };
}

/** Bridge for lesson exercises: exercise id -> bank question id. */
export async function resolveExerciseQuestions(
  exerciseIds: number[],
): Promise<Map<number, number>> {
  try {
    return await mapExercisesToQuestions(exerciseIds);
  } catch {
    return new Map();
  }
}

export async function getBankStats(): Promise<QuestionBankStats> {
  try {
    return await getQuestionBankStats();
  } catch {
    return { total: 0, active: 0, bySkill: [], byLevel: [], byOrigin: [] };
  }
}
