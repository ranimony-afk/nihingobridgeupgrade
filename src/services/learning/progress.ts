import "server-only";

import {
  getCourseProgressRow,
  getDashboardRows,
  getLessonProgressRow,
  recordAttempts,
  refreshCourseProgress,
  resolveLesson,
  upsertSectionProgress,
} from "@/repositories/progress";
import { touchLearner } from "@/services/learning/session";

/**
 * Progress service.
 *
 * Every write is keyed by the canonical `users.id` resolved from the learner
 * session. Scores are always taken from server-side grading — a client can
 * never post a score directly.
 */

export async function markSectionComplete(
  userId: number,
  lessonSlug: string,
  sectionKey: string,
) {
  const lesson = await resolveLesson(lessonSlug);
  if (!lesson) return null;
  await upsertSectionProgress(userId, lesson, sectionKey);
  await refreshCourseProgress(userId, lesson.courseId);
  await touchLearner(userId);
  return getLessonProgressRow(userId, lesson.id);
}

export async function recordExerciseResult(
  userId: number,
  lessonSlug: string,
  grades: Array<{ exerciseId: number; correct: boolean; awardedPoints: number }>,
  answers: Array<{ exerciseId: number; optionId?: number | null; value?: string | null }>,
  score: { score: number; percent: number },
) {
  const lesson = await resolveLesson(lessonSlug);
  if (!lesson) return null;

  const submittedById = new Map(
    answers.map((answer) => [
      answer.exerciseId,
      answer.optionId != null ? `option:${answer.optionId}` : (answer.value ?? null),
    ]),
  );

  await recordAttempts(
    userId,
    lesson,
    grades.map((grade) => ({
      exerciseId: grade.exerciseId,
      correct: grade.correct,
      awardedPoints: grade.awardedPoints,
      submitted: submittedById.get(grade.exerciseId) ?? null,
    })),
    score,
  );
  await refreshCourseProgress(userId, lesson.courseId);
  await touchLearner(userId);
  return getLessonProgressRow(userId, lesson.id);
}

export async function getLessonProgress(userId: number, lessonSlug: string) {
  const lesson = await resolveLesson(lessonSlug);
  if (!lesson) return null;
  const row = await getLessonProgressRow(userId, lesson.id);
  return (
    row ?? {
      lessonId: lesson.id,
      lessonSlug: lesson.slug,
      lessonTitle: lesson.title,
      courseId: lesson.courseId,
      courseSlug: lesson.courseSlug,
      status: "not_started",
      completedSections: [],
      sectionsTotal: lesson.sectionsTotal,
      bestScore: 0,
      bestPercent: 0,
      attempts: 0,
      completedAt: null,
      updatedAt: null,
    }
  );
}

export async function getCourseProgress(userId: number, courseSlug: string) {
  return getCourseProgressRow(userId, courseSlug);
}

export async function getDashboard(userId: number) {
  try {
    return await getDashboardRows(userId);
  } catch {
    return {
      courses: [],
      lessons: [],
      totals: {
        lessonsStarted: 0,
        lessonsCompleted: 0,
        attempts: 0,
        correct: 0,
        points: 0,
        accuracy: 0,
      },
    };
  }
}
