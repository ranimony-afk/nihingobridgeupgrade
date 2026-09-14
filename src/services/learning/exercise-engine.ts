import "server-only";

import {
  getExerciseSecrets,
  getExerciseStats,
  listExercisesForLesson,
} from "@/repositories/exercise";
import { gradeOne, normalizeAnswer } from "@/services/questions/engine";
import type {
  ExerciseGrade,
  ExerciseSet,
  ExerciseSubmissionResult,
} from "@/types/exercise";

/** Pass mark for a lesson exercise set. */
export const PASS_PERCENT = 70;

/**
 * Answer normalisation is owned by the generic question engine (phase 10.1);
 * re-exported here so existing callers keep working without a second copy.
 */
export { normalizeAnswer };

export async function getLessonExercises(slug: string): Promise<ExerciseSet | null> {
  try {
    const result = await listExercisesForLesson(slug);
    if (!result) return null;
    return {
      lesson: result.lesson,
      exercises: result.exercises,
      totalPoints: result.exercises.reduce((sum, exercise) => sum + exercise.points, 0),
    };
  } catch {
    return null;
  }
}

export interface AnswerInput {
  exerciseId: number;
  /** Selected option id (option mode) */
  optionId?: number | null;
  /** Typed answer (text mode) */
  value?: string | null;
}

/**
 * Grades answers server-side.
 *
 * Unknown exercise ids are ignored rather than failing the whole submission, so
 * a stale client cannot block a learner from finishing a set.
 */
export async function gradeAnswers(answers: AnswerInput[]): Promise<ExerciseGrade[]> {
  if (answers.length === 0) return [];
  const secrets = await getExerciseSecrets(answers.map((answer) => answer.exerciseId));

  const grades: ExerciseGrade[] = [];
  for (const answer of answers) {
    const secret = secrets.get(answer.exerciseId);
    if (!secret) continue;

    // Single grading authority: the generic question engine decides correctness.
    const { questionId: _ignored, ...decision } = {
      questionId: secret.id,
      ...gradeOne(secret, answer),
    };
    grades.push({ exerciseId: secret.id, ...decision });
  }
  return grades;
}

/** Grades a whole lesson set and reports a score. */
export async function submitLessonExercises(
  slug: string,
  answers: AnswerInput[],
): Promise<ExerciseSubmissionResult | null> {
  const set = await getLessonExercises(slug);
  if (!set) return null;

  const validIds = new Set(set.exercises.map((exercise) => exercise.id));
  const scoped = answers.filter((answer) => validIds.has(answer.exerciseId));
  const grades = await gradeAnswers(scoped);

  const score = grades.reduce((sum, grade) => sum + grade.awardedPoints, 0);
  const maxScore = set.totalPoints;
  const percent = maxScore === 0 ? 0 : Math.round((score / maxScore) * 100);

  return {
    lessonSlug: set.lesson.slug,
    total: set.exercises.length,
    answered: grades.length,
    correct: grades.filter((grade) => grade.correct).length,
    score,
    maxScore,
    percent,
    passed: percent >= PASS_PERCENT,
    grades,
  };
}

export async function getExerciseOverview() {
  try {
    return await getExerciseStats();
  } catch {
    return { exercises: 0, options: 0, lessonsWithExercises: 0, publishedLessons: 0 };
  }
}
