import "server-only";

import { sql } from "drizzle-orm";

import { getDb } from "@/db";

type Row = Record<string, unknown>;
function rows<T extends Row>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] })?.rows ?? []) as T[];
}
const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const text = (value: unknown) => (value === null || value === undefined ? null : String(value));
const strArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export interface LessonProgressRow {
  lessonId: number;
  lessonSlug: string;
  lessonTitle: string;
  courseId: number;
  courseSlug: string;
  status: string;
  completedSections: string[];
  sectionsTotal: number;
  bestScore: number;
  bestPercent: number;
  attempts: number;
  completedAt: string | null;
  updatedAt: string | null;
}

/** Resolves a lesson slug to its ids and canonical section count. */
export async function resolveLesson(slug: string) {
  const result = await getDb().execute(sql`
    SELECT l.id, l.slug, l.title, l.course_id, c.slug AS course_slug,
           (SELECT count(*)::int FROM lesson_sections s
             WHERE s.lesson_id = l.id AND s.published) AS sections_total
      FROM lessons l JOIN courses c ON c.id = l.course_id
     WHERE l.published = true AND c.published = true AND l.slug = ${slug}
     LIMIT 1
  `);
  const [row] = rows<Row>(result);
  if (!row) return null;
  return {
    id: num(row.id),
    slug: String(row.slug),
    title: String(row.title),
    courseId: num(row.course_id),
    courseSlug: String(row.course_slug),
    sectionsTotal: num(row.sections_total),
  };
}

/** Marks a section complete and recomputes lesson status. */
export async function upsertSectionProgress(
  userId: number,
  lesson: { id: number; courseId: number; sectionsTotal: number },
  sectionKey: string,
): Promise<void> {
  await getDb().execute(sql`
    INSERT INTO user_lesson_progress
      (user_id, lesson_id, course_id, status, completed_sections, sections_total)
    VALUES (${userId}, ${lesson.id}, ${lesson.courseId}, 'in_progress',
            ${JSON.stringify([sectionKey])}::jsonb, ${lesson.sectionsTotal})
    ON CONFLICT (user_id, lesson_id) DO UPDATE SET
      completed_sections = (
        SELECT coalesce(jsonb_agg(DISTINCT value), '[]'::jsonb)
          FROM jsonb_array_elements_text(
            user_lesson_progress.completed_sections || ${JSON.stringify([sectionKey])}::jsonb
          ) AS value
      ),
      sections_total = ${lesson.sectionsTotal},
      updated_at = now()
  `);

  await getDb().execute(sql`
    UPDATE user_lesson_progress
       SET status = CASE
             WHEN sections_total > 0
              AND jsonb_array_length(completed_sections) >= sections_total THEN 'completed'
             ELSE 'in_progress' END,
           completed_at = CASE
             WHEN sections_total > 0
              AND jsonb_array_length(completed_sections) >= sections_total
             THEN coalesce(completed_at, now()) ELSE completed_at END
     WHERE user_id = ${userId} AND lesson_id = ${lesson.id}
  `);
}

/** Records graded attempts and keeps the best score for the lesson. */
export async function recordAttempts(
  userId: number,
  lesson: { id: number; courseId: number; sectionsTotal: number },
  attempts: Array<{ exerciseId: number; correct: boolean; awardedPoints: number; submitted: string | null }>,
  score: { score: number; percent: number },
): Promise<void> {
  if (attempts.length > 0) {
    const values = attempts.map(
      (attempt) =>
        sql`(${userId}, ${attempt.exerciseId}, ${lesson.id}, ${attempt.correct}, ${attempt.awardedPoints}, ${attempt.submitted})`,
    );
    await getDb().execute(sql`
      INSERT INTO user_exercise_attempts
        (user_id, exercise_id, lesson_id, correct, awarded_points, submitted)
      VALUES ${sql.join(values, sql`, `)}
    `);
  }

  await getDb().execute(sql`
    INSERT INTO user_lesson_progress
      (user_id, lesson_id, course_id, status, completed_sections, sections_total,
       best_score, best_percent, attempts)
    VALUES (${userId}, ${lesson.id}, ${lesson.courseId}, 'in_progress', '[]'::jsonb,
            ${lesson.sectionsTotal}, ${score.score}, ${score.percent}, 1)
    ON CONFLICT (user_id, lesson_id) DO UPDATE SET
      best_score = greatest(user_lesson_progress.best_score, ${score.score}),
      best_percent = greatest(user_lesson_progress.best_percent, ${score.percent}),
      attempts = user_lesson_progress.attempts + 1,
      sections_total = ${lesson.sectionsTotal},
      updated_at = now()
  `);
}

/** Recomputes the course rollup from lesson progress. */
export async function refreshCourseProgress(userId: number, courseId: number): Promise<void> {
  await getDb().execute(sql`
    INSERT INTO user_course_progress
      (user_id, course_id, lessons_completed, lessons_total, percent, status)
    SELECT ${userId}, ${courseId},
           count(*) FILTER (WHERE p.status = 'completed')::int,
           (SELECT count(*)::int FROM lessons l WHERE l.course_id = ${courseId} AND l.published),
           CASE WHEN (SELECT count(*) FROM lessons l WHERE l.course_id = ${courseId} AND l.published) = 0
                THEN 0
                ELSE round(100.0 * count(*) FILTER (WHERE p.status = 'completed')
                     / (SELECT count(*) FROM lessons l WHERE l.course_id = ${courseId} AND l.published))::int
           END,
           CASE WHEN count(*) FILTER (WHERE p.status = 'completed') >=
                     (SELECT count(*) FROM lessons l WHERE l.course_id = ${courseId} AND l.published)
                 AND (SELECT count(*) FROM lessons l WHERE l.course_id = ${courseId} AND l.published) > 0
                THEN 'completed' ELSE 'in_progress' END
      FROM user_lesson_progress p
     WHERE p.user_id = ${userId} AND p.course_id = ${courseId}
    ON CONFLICT (user_id, course_id) DO UPDATE SET
      lessons_completed = EXCLUDED.lessons_completed,
      lessons_total = EXCLUDED.lessons_total,
      percent = EXCLUDED.percent,
      status = EXCLUDED.status,
      updated_at = now()
  `);
}

export async function getLessonProgressRow(
  userId: number,
  lessonId: number,
): Promise<LessonProgressRow | null> {
  const result = await getDb().execute(sql`
    SELECT p.lesson_id, l.slug AS lesson_slug, l.title AS lesson_title,
           p.course_id, c.slug AS course_slug, p.status, p.completed_sections,
           p.sections_total, p.best_score, p.best_percent, p.attempts,
           p.completed_at, p.updated_at
      FROM user_lesson_progress p
      JOIN lessons l ON l.id = p.lesson_id
      JOIN courses c ON c.id = p.course_id
     WHERE p.user_id = ${userId} AND p.lesson_id = ${lessonId}
     LIMIT 1
  `);
  const [row] = rows<Row>(result);
  if (!row) return null;
  return {
    lessonId: num(row.lesson_id),
    lessonSlug: String(row.lesson_slug),
    lessonTitle: String(row.lesson_title),
    courseId: num(row.course_id),
    courseSlug: String(row.course_slug),
    status: String(row.status),
    completedSections: strArray(row.completed_sections),
    sectionsTotal: num(row.sections_total),
    bestScore: num(row.best_score),
    bestPercent: num(row.best_percent),
    attempts: num(row.attempts),
    completedAt: text(row.completed_at),
    updatedAt: text(row.updated_at),
  };
}

export async function getCourseProgressRow(userId: number, courseSlug: string) {
  const result = await getDb().execute(sql`
    SELECT c.slug, c.title, p.lessons_completed, p.lessons_total, p.percent, p.status,
           p.updated_at
      FROM user_course_progress p JOIN courses c ON c.id = p.course_id
     WHERE p.user_id = ${userId} AND c.slug = ${courseSlug}
     LIMIT 1
  `);
  const [row] = rows<Row>(result);
  if (!row) return null;
  return {
    courseSlug: String(row.slug),
    courseTitle: String(row.title),
    lessonsCompleted: num(row.lessons_completed),
    lessonsTotal: num(row.lessons_total),
    percent: num(row.percent),
    status: String(row.status),
    updatedAt: text(row.updated_at),
  };
}

/** Full learner dashboard. */
export async function getDashboardRows(userId: number) {
  const [courses, lessons, totals] = await Promise.all([
    getDb().execute(sql`
      SELECT c.slug, c.title, p.lessons_completed, p.lessons_total, p.percent, p.status
        FROM user_course_progress p JOIN courses c ON c.id = p.course_id
       WHERE p.user_id = ${userId} ORDER BY p.updated_at DESC
    `),
    getDb().execute(sql`
      SELECT l.slug, l.title, c.slug AS course_slug, c.title AS course_title,
             p.status, p.best_percent, p.attempts,
             jsonb_array_length(p.completed_sections) AS done, p.sections_total,
             p.updated_at
        FROM user_lesson_progress p
        JOIN lessons l ON l.id = p.lesson_id
        JOIN courses c ON c.id = p.course_id
       WHERE p.user_id = ${userId} ORDER BY p.updated_at DESC LIMIT 20
    `),
    getDb().execute(sql`
      SELECT
        (SELECT count(*)::int FROM user_lesson_progress WHERE user_id = ${userId}) AS lessons_started,
        (SELECT count(*)::int FROM user_lesson_progress WHERE user_id = ${userId} AND status='completed') AS lessons_completed,
        (SELECT count(*)::int FROM user_exercise_attempts WHERE user_id = ${userId}) AS attempts,
        (SELECT count(*)::int FROM user_exercise_attempts WHERE user_id = ${userId} AND correct) AS correct,
        (SELECT coalesce(sum(awarded_points),0)::int FROM user_exercise_attempts WHERE user_id = ${userId}) AS points
    `),
  ]);
  const totalRow = rows<Row>(totals)[0] ?? {};
  return {
    courses: rows<Row>(courses).map((row) => ({
      courseSlug: String(row.slug),
      courseTitle: String(row.title),
      lessonsCompleted: num(row.lessons_completed),
      lessonsTotal: num(row.lessons_total),
      percent: num(row.percent),
      status: String(row.status),
    })),
    lessons: rows<Row>(lessons).map((row) => ({
      lessonSlug: String(row.slug),
      lessonTitle: String(row.title),
      courseSlug: String(row.course_slug),
      courseTitle: String(row.course_title),
      status: String(row.status),
      bestPercent: num(row.best_percent),
      attempts: num(row.attempts),
      sectionsDone: num(row.done),
      sectionsTotal: num(row.sections_total),
    })),
    totals: {
      lessonsStarted: num(totalRow.lessons_started),
      lessonsCompleted: num(totalRow.lessons_completed),
      attempts: num(totalRow.attempts),
      correct: num(totalRow.correct),
      points: num(totalRow.points),
      accuracy:
        num(totalRow.attempts) === 0
          ? 0
          : Math.round((num(totalRow.correct) / num(totalRow.attempts)) * 100),
    },
  };
}
