import "server-only";

import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import type { ExerciseKind, ExercisePublic } from "@/types/exercise";

type Row = Record<string, unknown>;

function rows<T extends Row>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] })?.rows ?? []) as T[];
}

const number = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const text = (value: unknown) => (value === null || value === undefined ? null : String(value));

/** Grading data — server-side only, never returned by a question endpoint. */
export interface ExerciseSecret {
  id: number;
  lessonId: number;
  lessonSlug: string;
  answerMode: "option" | "text";
  points: number;
  explanation: string | null;
  acceptedAnswers: string[];
  options: Array<{ id: number; label: string; isCorrect: boolean; feedback: string | null }>;
}

function mapReference(row: Row): ExercisePublic["reference"] {
  if (row.grammar_slug) {
    return {
      kind: "grammar",
      href: `/grammar/${encodeURIComponent(String(row.grammar_slug))}`,
      label: String(row.grammar_title ?? ""),
    };
  }
  if (row.kanji_literal) {
    return {
      kind: "kanji",
      href: `/kanji/${encodeURIComponent(String(row.kanji_literal))}`,
      label: String(row.kanji_literal),
    };
  }
  if (row.vocabulary_text) {
    return {
      kind: "vocabulary",
      href: `/dictionary?q=${encodeURIComponent(String(row.vocabulary_text))}`,
      label: String(row.vocabulary_text),
    };
  }
  if (row.sentence_id) {
    return {
      kind: "sentence",
      href: `/sentences/${number(row.sentence_id)}`,
      label: String(row.sentence_japanese ?? ""),
    };
  }
  return null;
}

/** Public exercise set for a lesson. Correct answers are excluded by design. */
export async function listExercisesForLesson(slug: string): Promise<{
  lesson: { id: number; slug: string; title: string };
  exercises: ExercisePublic[];
} | null> {
  const lessonResult = await getDb().execute(sql`
    SELECT l.id, l.slug, l.title
      FROM lessons l JOIN courses c ON c.id = l.course_id
     WHERE l.published = true AND c.published = true AND l.slug = ${slug}
     LIMIT 1
  `);
  const [lessonRow] = rows<Row>(lessonResult);
  if (!lessonRow) return null;
  const lessonId = number(lessonRow.id);

  const exerciseResult = await getDb().execute(sql`
    SELECT e.id, e.key, e.kind, e.answer_mode, e.prompt, e.prompt_ja, e.instructions,
           e.difficulty, e.position, e.points,
           gp.slug AS grammar_slug, gp.title AS grammar_title,
           k.literal AS kanji_literal,
           v.kanji_text AS vocabulary_text,
           s.id AS sentence_id, s.japanese AS sentence_japanese
      FROM exercises e
      LEFT JOIN grammar_points gp ON gp.id = e.grammar_point_id
      LEFT JOIN kanji k ON k.id = e.kanji_id
      LEFT JOIN vocabulary v ON v.id = e.vocabulary_id
      LEFT JOIN sentences s ON s.id = e.sentence_id
     WHERE e.lesson_id = ${lessonId}
     ORDER BY e.position
  `);
  const exerciseRows = rows<Row>(exerciseResult);
  if (exerciseRows.length === 0) {
    return {
      lesson: { id: lessonId, slug: String(lessonRow.slug), title: String(lessonRow.title) },
      exercises: [],
    };
  }

  const optionResult = await getDb().execute(sql`
    SELECT o.id, o.exercise_id, o.position, o.label, o.sub_label
      FROM exercise_options o
      JOIN exercises e ON e.id = o.exercise_id
     WHERE e.lesson_id = ${lessonId}
     ORDER BY o.exercise_id, o.position
  `);
  const optionsByExercise = new Map<number, ExercisePublic["options"]>();
  for (const option of rows<Row>(optionResult)) {
    const exerciseId = number(option.exercise_id);
    const bucket = optionsByExercise.get(exerciseId) ?? [];
    bucket.push({
      id: number(option.id),
      position: number(option.position),
      label: String(option.label ?? ""),
      subLabel: text(option.sub_label),
    });
    optionsByExercise.set(exerciseId, bucket);
  }

  return {
    lesson: { id: lessonId, slug: String(lessonRow.slug), title: String(lessonRow.title) },
    exercises: exerciseRows.map((row) => ({
      id: number(row.id),
      key: String(row.key ?? ""),
      kind: String(row.kind ?? "multiple_choice") as ExerciseKind,
      answerMode: row.answer_mode === "text" ? "text" : "option",
      prompt: String(row.prompt ?? ""),
      promptJa: text(row.prompt_ja),
      instructions: text(row.instructions),
      difficulty: number(row.difficulty),
      position: number(row.position),
      points: number(row.points),
      options: optionsByExercise.get(number(row.id)) ?? [],
      reference: mapReference(row),
    })),
  };
}

/** Loads grading data for specific exercises (server-side use only). */
export async function getExerciseSecrets(ids: number[]): Promise<Map<number, ExerciseSecret>> {
  const map = new Map<number, ExerciseSecret>();
  if (ids.length === 0) return map;
  const unique = Array.from(new Set(ids));

  const result = await getDb().execute(sql`
    SELECT e.id, e.lesson_id, e.answer_mode, e.points, e.explanation, e.accepted_answers,
           l.slug AS lesson_slug
      FROM exercises e JOIN lessons l ON l.id = e.lesson_id
     WHERE e.id IN (${sql.join(unique.map((id) => sql`${id}`), sql`, `)})
  `);
  for (const row of rows<Row>(result)) {
    map.set(number(row.id), {
      id: number(row.id),
      lessonId: number(row.lesson_id),
      lessonSlug: String(row.lesson_slug ?? ""),
      answerMode: row.answer_mode === "text" ? "text" : "option",
      points: number(row.points),
      explanation: text(row.explanation),
      acceptedAnswers: Array.isArray(row.accepted_answers)
        ? (row.accepted_answers as string[])
        : [],
      options: [],
    });
  }

  const optionResult = await getDb().execute(sql`
    SELECT id, exercise_id, label, is_correct, feedback
      FROM exercise_options
     WHERE exercise_id IN (${sql.join(unique.map((id) => sql`${id}`), sql`, `)})
     ORDER BY exercise_id, position
  `);
  for (const option of rows<Row>(optionResult)) {
    const secret = map.get(number(option.exercise_id));
    if (!secret) continue;
    secret.options.push({
      id: number(option.id),
      label: String(option.label ?? ""),
      isCorrect: Boolean(option.is_correct),
      feedback: text(option.feedback),
    });
  }

  return map;
}

export async function getExerciseStats() {
  const result = await getDb().execute(sql`
    SELECT
      (SELECT count(*)::int FROM exercises) AS exercises,
      (SELECT count(*)::int FROM exercise_options) AS options,
      (SELECT count(DISTINCT lesson_id)::int FROM exercises) AS lessons_with_exercises,
      (SELECT count(*)::int FROM lessons WHERE published) AS published_lessons
  `);
  const [row] = rows<Row>(result);
  return {
    exercises: number(row?.exercises),
    options: number(row?.options),
    lessonsWithExercises: number(row?.lessons_with_exercises),
    publishedLessons: number(row?.published_lessons),
  };
}
