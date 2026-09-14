import "server-only";

import { sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
import type {
  QuestionBankStats,
  QuestionKind,
  QuestionPublic,
  QuestionQuery,
  QuestionSkill,
} from "@/types/question";

type Row = Record<string, unknown>;
function rows<T extends Row>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] })?.rows ?? []) as T[];
}
const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const nullableNum = (value: unknown) =>
  value === null || value === undefined ? null : num(value);
const text = (value: unknown) => (value === null || value === undefined ? null : String(value));

/** Grading data — server-side only, never returned by a question endpoint. */
export interface QuestionSecret {
  id: number;
  answerMode: "option" | "text";
  points: number;
  explanation: string | null;
  acceptedAnswers: string[];
  options: Array<{ id: number; isCorrect: boolean; feedback: string | null }>;
}

function mapReference(row: Row): QuestionPublic["reference"] {
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
      href: `/sentences/${num(row.sentence_id)}`,
      label: String(row.sentence_japanese ?? ""),
    };
  }
  return null;
}

const SELECT_PUBLIC = sql`
  q.id, q.source_key, q.skill, q.kind, q.answer_mode, q.prompt, q.prompt_ja,
  q.instructions, q.jlpt_level, q.difficulty, q.points,
  gp.slug AS grammar_slug, gp.title AS grammar_title,
  k.literal AS kanji_literal,
  v.kanji_text AS vocabulary_text,
  s.id AS sentence_id, s.japanese AS sentence_japanese
`;

const JOIN_PUBLIC = sql`
  FROM questions q
  LEFT JOIN grammar_points gp ON gp.id = q.grammar_point_id
  LEFT JOIN kanji k ON k.id = q.kanji_id
  LEFT JOIN vocabulary v ON v.id = q.vocabulary_id
  LEFT JOIN sentences s ON s.id = q.sentence_id
`;

function mapQuestion(row: Row, options: QuestionPublic["options"]): QuestionPublic {
  return {
    id: num(row.id),
    sourceKey: String(row.source_key ?? ""),
    skill: String(row.skill ?? "grammar") as QuestionSkill,
    kind: String(row.kind ?? "multiple_choice") as QuestionKind,
    answerMode: row.answer_mode === "text" ? "text" : "option",
    prompt: String(row.prompt ?? ""),
    promptJa: text(row.prompt_ja),
    instructions: text(row.instructions),
    jlptLevel: nullableNum(row.jlpt_level),
    difficulty: num(row.difficulty),
    points: num(row.points),
    options,
    reference: mapReference(row),
  };
}

async function attachOptions(questionRows: Row[]): Promise<QuestionPublic[]> {
  if (questionRows.length === 0) return [];
  const ids = questionRows.map((row) => num(row.id));
  const optionResult = await getDb().execute(sql`
    SELECT id, question_id, position, label, sub_label
      FROM question_options
     WHERE question_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
     ORDER BY question_id, position
  `);
  const byQuestion = new Map<number, QuestionPublic["options"]>();
  for (const option of rows<Row>(optionResult)) {
    const questionId = num(option.question_id);
    const bucket = byQuestion.get(questionId) ?? [];
    bucket.push({
      id: num(option.id),
      position: num(option.position),
      label: String(option.label ?? ""),
      subLabel: text(option.sub_label),
    });
    byQuestion.set(questionId, bucket);
  }
  return questionRows.map((row) => mapQuestion(row, byQuestion.get(num(row.id)) ?? []));
}

/** Queries the bank. Sampling is deterministic when a seed is supplied. */
export async function queryQuestions(query: QuestionQuery): Promise<{
  questions: QuestionPublic[];
  total: number;
}> {
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
  const level = query.jlptLevel ?? null;
  const skills = query.skills ?? [];
  const kinds = query.kinds ?? [];

  const skillFilter: SQL =
    skills.length > 0
      ? sql`AND q.skill IN (${sql.join(skills.map((s) => sql`${s}`), sql`, `)})`
      : sql``;
  const kindFilter: SQL =
    kinds.length > 0
      ? sql`AND q.kind IN (${sql.join(kinds.map((k) => sql`${k}`), sql`, `)})`
      : sql``;

  // Deterministic ordering when seeded, random otherwise. Hashing the seed with
  // the id keeps a seeded set stable across requests.
  const ordering: SQL =
    query.seed != null
      ? sql`ORDER BY md5(q.id::text || ${String(query.seed)})`
      : sql`ORDER BY random()`;

  const [countResult, pageResult] = await Promise.all([
    getDb().execute(sql`
      SELECT count(*)::int AS total FROM questions q
       WHERE q.active = true
         AND (${level}::int IS NULL OR q.jlpt_level = ${level}::int)
         ${skillFilter} ${kindFilter}
    `),
    getDb().execute(sql`
      SELECT ${SELECT_PUBLIC} ${JOIN_PUBLIC}
       WHERE q.active = true
         AND (${level}::int IS NULL OR q.jlpt_level = ${level}::int)
         ${skillFilter} ${kindFilter}
       ${ordering}
       LIMIT ${limit}
    `),
  ]);

  return {
    questions: await attachOptions(rows<Row>(pageResult)),
    total: num(rows<Row>(countResult)[0]?.total),
  };
}

export async function getQuestionsByIds(ids: number[]): Promise<QuestionPublic[]> {
  if (ids.length === 0) return [];
  const unique = Array.from(new Set(ids));
  const result = await getDb().execute(sql`
    SELECT ${SELECT_PUBLIC} ${JOIN_PUBLIC}
     WHERE q.id IN (${sql.join(unique.map((id) => sql`${id}`), sql`, `)})
  `);
  return attachOptions(rows<Row>(result));
}

/** Loads grading data (server-side use only). */
export async function getQuestionSecrets(ids: number[]): Promise<Map<number, QuestionSecret>> {
  const map = new Map<number, QuestionSecret>();
  if (ids.length === 0) return map;
  const unique = Array.from(new Set(ids));

  const result = await getDb().execute(sql`
    SELECT id, answer_mode, points, explanation, accepted_answers
      FROM questions
     WHERE id IN (${sql.join(unique.map((id) => sql`${id}`), sql`, `)})
  `);
  for (const row of rows<Row>(result)) {
    map.set(num(row.id), {
      id: num(row.id),
      answerMode: row.answer_mode === "text" ? "text" : "option",
      points: num(row.points),
      explanation: text(row.explanation),
      acceptedAnswers: Array.isArray(row.accepted_answers) ? (row.accepted_answers as string[]) : [],
      options: [],
    });
  }

  const optionResult = await getDb().execute(sql`
    SELECT id, question_id, is_correct, feedback FROM question_options
     WHERE question_id IN (${sql.join(unique.map((id) => sql`${id}`), sql`, `)})
     ORDER BY question_id, position
  `);
  for (const option of rows<Row>(optionResult)) {
    map.get(num(option.question_id))?.options.push({
      id: num(option.id),
      isCorrect: Boolean(option.is_correct),
      feedback: text(option.feedback),
    });
  }
  return map;
}

/** Maps lesson exercise ids to their canonical bank question ids. */
export async function mapExercisesToQuestions(
  exerciseIds: number[],
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (exerciseIds.length === 0) return map;
  const unique = Array.from(new Set(exerciseIds));
  const result = await getDb().execute(sql`
    SELECT id, question_id FROM exercises
     WHERE id IN (${sql.join(unique.map((id) => sql`${id}`), sql`, `)})
       AND question_id IS NOT NULL
  `);
  for (const row of rows<Row>(result)) map.set(num(row.id), num(row.question_id));
  return map;
}

export async function getQuestionBankStats(): Promise<QuestionBankStats> {
  const [totals, bySkill, byLevel, byOrigin] = await Promise.all([
    getDb().execute(sql`
      SELECT count(*)::int AS total, count(*) FILTER (WHERE active)::int AS active FROM questions
    `),
    getDb().execute(sql`
      SELECT skill, count(*)::int AS total FROM questions WHERE active GROUP BY skill ORDER BY skill
    `),
    getDb().execute(sql`
      SELECT jlpt_level, count(*)::int AS total FROM questions WHERE active
       GROUP BY jlpt_level ORDER BY jlpt_level DESC NULLS LAST
    `),
    getDb().execute(sql`
      SELECT origin, count(*)::int AS total FROM questions WHERE active GROUP BY origin ORDER BY origin
    `),
  ]);
  const totalRow = rows<Row>(totals)[0] ?? {};
  return {
    total: num(totalRow.total),
    active: num(totalRow.active),
    bySkill: rows<Row>(bySkill).map((row) => ({ skill: String(row.skill), total: num(row.total) })),
    byLevel: rows<Row>(byLevel).map((row) => ({
      jlptLevel: nullableNum(row.jlpt_level),
      total: num(row.total),
    })),
    byOrigin: rows<Row>(byOrigin).map((row) => ({
      origin: String(row.origin),
      total: num(row.total),
    })),
  };
}
