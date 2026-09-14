import "server-only";

import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import type {
  QuizRunPublic,
  QuizRunSection,
  QuizRunStats,
  QuizRunStatus,
  QuizRunKind,
} from "@/types/quiz";

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
const strArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const sectionsOf = (value: unknown): QuizRunSection[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item, index) => ({
      code: String(item.code ?? `section-${index + 1}`),
      title: String(item.title ?? ""),
      titleJa: text(item.titleJa),
      instructions: text(item.instructions),
      position: num(item.position ?? index),
      timeLimitSeconds: num(item.timeLimitSeconds ?? 0),
      questionCount: num(item.questionCount ?? 0),
      skills: strArray(item.skills),
      kinds: strArray(item.kinds),
      fromPosition: num(item.fromPosition ?? 0),
      toPosition: num(item.toPosition ?? 0),
    }));
};

const iso = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export interface NewRunItem {
  questionId: number;
  position: number;
  sectionCode: string | null;
  points: number;
}

export interface RunRow {
  id: number;
  publicId: string;
  userId: number;
  kind: QuizRunKind;
  status: QuizRunStatus;
  title: string;
  jlptTestId: number | null;
  jlptSlug: string | null;
  seed: number;
  jlptLevel: number | null;
  skills: string[];
  kinds: string[];
  sections: QuizRunSection[];
  questionCount: number;
  totalPoints: number;
  answeredCount: number;
  correctCount: number;
  score: number;
  percent: number;
  passed: boolean | null;
  timeLimitSeconds: number | null;
  startedAt: string;
  expiresAt: string | null;
  completedAt: string | null;
  durationSeconds: number | null;
  passingPercent: number | null;
  sectionMinimumPercent: number | null;
}

function mapRun(row: Row): RunRow {
  return {
    id: num(row.id),
    publicId: String(row.public_id ?? ""),
    userId: num(row.user_id),
    kind: row.kind === "jlpt" ? "jlpt" : "quiz",
    status:
      row.status === "completed" ? "completed" : row.status === "expired" ? "expired" : "in_progress",
    title: String(row.title ?? ""),
    jlptTestId: nullableNum(row.jlpt_test_id),
    jlptSlug: text(row.jlpt_slug),
    seed: num(row.seed),
    jlptLevel: nullableNum(row.jlpt_level),
    skills: strArray(row.skills),
    kinds: strArray(row.kinds),
    sections: sectionsOf(row.sections),
    questionCount: num(row.question_count),
    totalPoints: num(row.total_points),
    answeredCount: num(row.answered_count),
    correctCount: num(row.correct_count),
    score: num(row.score),
    percent: num(row.percent),
    passed: row.passed === null || row.passed === undefined ? null : Boolean(row.passed),
    timeLimitSeconds: nullableNum(row.time_limit_seconds),
    startedAt: iso(row.started_at) ?? new Date().toISOString(),
    expiresAt: iso(row.expires_at),
    completedAt: iso(row.completed_at),
    durationSeconds: nullableNum(row.duration_seconds),
    passingPercent: nullableNum(row.passing_percent),
    sectionMinimumPercent: nullableNum(row.section_minimum_percent),
  };
}

/** Public projection of a run (drops the internal id and the owner id). */
export function toRunPublic(run: RunRow): QuizRunPublic {
  return {
    publicId: run.publicId,
    kind: run.kind,
    status: run.status,
    title: run.title,
    jlptSlug: run.jlptSlug,
    jlptLevel: run.jlptLevel,
    seed: run.seed,
    skills: run.skills,
    kinds: run.kinds,
    questionCount: run.questionCount,
    answeredCount: run.answeredCount,
    correctCount: run.correctCount,
    totalPoints: run.totalPoints,
    score: run.score,
    percent: run.percent,
    passed: run.passed,
    timeLimitSeconds: run.timeLimitSeconds,
    sections: run.sections,
    startedAt: run.startedAt,
    expiresAt: run.expiresAt,
    completedAt: run.completedAt,
    durationSeconds: run.durationSeconds,
  };
}

/** Creates a run and its ordered items in one transaction. */
export async function createRun(input: {
  userId: number;
  kind: QuizRunKind;
  title: string;
  jlptTestId?: number | null;
  jlptSlug?: string | null;
  seed: number;
  jlptLevel: number | null;
  skills: string[];
  kinds: string[];
  sections: QuizRunSection[];
  timeLimitSeconds: number | null;
  items: NewRunItem[];
}): Promise<RunRow> {
  const totalPoints = input.items.reduce((sum, item) => sum + item.points, 0);
  const publicId = `${input.kind}-${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const sectionsJson = JSON.stringify(input.sections);

  return getDb().transaction(async (tx) => {
    const inserted = await tx.execute(sql`
      INSERT INTO quiz_runs
        (public_id, user_id, kind, status, title, jlpt_test_id, jlpt_slug, seed, jlpt_level,
         skills, kinds, sections, question_count, total_points, time_limit_seconds, expires_at)
      VALUES
        (${publicId}, ${input.userId}, ${input.kind}, 'in_progress', ${input.title},
         ${input.jlptTestId ?? null}, ${input.jlptSlug ?? null}, ${input.seed},
         ${input.jlptLevel}, ${JSON.stringify(input.skills)}::jsonb,
         ${JSON.stringify(input.kinds)}::jsonb, ${sectionsJson}::jsonb,
         ${input.items.length}, ${totalPoints}, ${input.timeLimitSeconds ?? null},
         ${input.timeLimitSeconds != null
           ? sql`now() + (${input.timeLimitSeconds} * interval '1 second')`
           : sql`NULL`})
      RETURNING quiz_runs.*, ${input.jlptTestId ?? null}::int AS _test
    `);
    const run = mapRun(rows<Row>(inserted)[0] ?? {});

    if (input.items.length > 0) {
      const values = input.items.map(
        (item) =>
          sql`(${run.id}, ${item.questionId}, ${item.position}, ${item.sectionCode ?? null}, ${item.points})`,
      );
      await tx.execute(sql`
        INSERT INTO quiz_run_items
          (run_id, question_id, position, section_code, points)
        VALUES ${sql.join(values, sql`, `)}
      `);
    }
    return run;
  });
}

/**
 * Loads one run, optionally scoped to its owner. Pass marks come from the
 * blueprint (JLPT) or the quiz defaults.
 */
export async function findRun(
  publicId: string,
  userId?: number,
): Promise<RunRow | null> {
  const result = await getDb().execute(sql`
    SELECT r.*,
           coalesce(t.passing_percent, 60) AS passing_percent,
           coalesce(t.section_minimum_percent, 0) AS section_minimum_percent
      FROM quiz_runs r
      LEFT JOIN jlpt_tests t ON t.id = r.jlpt_test_id
     WHERE r.public_id = ${publicId}
       AND (${userId ?? null}::int IS NULL OR r.user_id = ${userId ?? null}::int)
     LIMIT 1
  `);
  const [row] = rows<Row>(result);
  return row ? mapRun(row) : null;
}

export interface RunItemRow {
  id: number;
  runId: number;
  questionId: number;
  position: number;
  sectionCode: string | null;
  optionId: number | null;
  value: string | null;
  answered: boolean;
  correct: boolean | null;
  points: number;
  awardedPoints: number;
  correctAnswer: string | null;
  feedback: string | null;
  explanation: string | null;
  elapsedMs: number | null;
}

function mapItem(row: Row): RunItemRow {
  return {
    id: num(row.id),
    runId: num(row.run_id),
    questionId: num(row.question_id),
    position: num(row.position),
    sectionCode: text(row.section_code),
    optionId: nullableNum(row.option_id),
    value: text(row.value),
    answered: Boolean(row.answered),
    correct: row.correct === null || row.correct === undefined ? null : Boolean(row.correct),
    points: num(row.points),
    awardedPoints: num(row.awarded_points),
    correctAnswer: text(row.correct_answer),
    feedback: text(row.feedback),
    explanation: text(row.explanation),
    elapsedMs: nullableNum(row.elapsed_ms),
  };
}

export async function listRunItems(runId: number): Promise<RunItemRow[]> {
  const result = await getDb().execute(sql`
    SELECT * FROM quiz_run_items WHERE run_id = ${runId} ORDER BY position
  `);
  return rows<Row>(result).map(mapItem);
}

export async function findRunItem(
  runId: number,
  position: number,
): Promise<RunItemRow | null> {
  const result = await getDb().execute(sql`
    SELECT * FROM quiz_run_items
     WHERE run_id = ${runId} AND position = ${position}
     LIMIT 1
  `);
  const [row] = rows<Row>(result);
  return row ? mapItem(row) : null;
}

/**
 * Persists one graded answer. An item can only be answered once; a repeat
 * submission returns `alreadyAnswered` instead of double counting.
 */
export async function saveRunItemAnswer(input: {
  itemId: number;
  optionId: number | null;
  value: string | null;
  correct: boolean;
  awardedPoints: number;
  correctAnswer: string | null;
  feedback: string | null;
  explanation: string | null;
  elapsedMs: number | null;
}): Promise<{ applied: boolean }> {
  const result = await getDb().execute(sql`
    UPDATE quiz_run_items SET
      option_id = ${input.optionId},
      value = ${input.value},
      answered = true,
      correct = ${input.correct},
      awarded_points = ${input.awardedPoints},
      correct_answer = ${input.correctAnswer},
      feedback = ${input.feedback},
      explanation = ${input.explanation},
      elapsed_ms = ${input.elapsedMs ?? null},
      answered_at = now()
    WHERE id = ${input.itemId} AND answered = false
    RETURNING id
  `);
  return { applied: rows<Row>(result).length > 0 };
}

/** Recomputes run totals from the items (single source of truth). */
export async function recomputeRunTotals(runId: number): Promise<RunRow | null> {
  const result = await getDb().execute(sql`
    UPDATE quiz_runs r SET
      answered_count = totals.answered,
      correct_count = totals.correct,
      score = totals.score,
      percent = CASE WHEN totals.points = 0 THEN 0
                     ELSE round((totals.score::numeric / totals.points) * 100)::int END,
      updated_at = now()
    FROM (
      SELECT count(*) FILTER (WHERE answered)::int AS answered,
             count(*) FILTER (WHERE answered AND correct)::int AS correct,
             coalesce(sum(points), 0)::int AS points,
             coalesce(sum(points) FILTER (WHERE answered AND correct), 0)::int AS score
        FROM quiz_run_items WHERE run_id = ${runId}
    ) AS totals
    WHERE r.id = ${runId}
    RETURNING r.*, NULL::int AS passing_percent, NULL::int AS section_minimum_percent
  `);
  const [row] = rows<Row>(result);
  if (!row) return null;
  return mapRun(row);
}

/** Finalises a run: status, pass decision and duration. */
export async function completeRunRow(
  runId: number,
  outcome: {
    percent: number;
    passed: boolean | null;
    durationSeconds: number | null;
  },
): Promise<RunRow | null> {
  const result = await getDb().execute(sql`
    UPDATE quiz_runs SET
      status = 'completed',
      passed = ${outcome.passed},
      duration_seconds = ${outcome.durationSeconds},
      completed_at = now(),
      updated_at = now()
     WHERE id = ${runId}
    RETURNING quiz_runs.*, NULL::int AS passing_percent, NULL::int AS section_minimum_percent
  `);
  const [row] = rows<Row>(result);
  return row ? mapRun(row) : null;
}

/** Expires timed runs whose clock has run out. */
export async function expireOverdueRuns(userId?: number): Promise<number> {
  const result = await getDb().execute(sql`
    UPDATE quiz_runs SET status = 'expired', updated_at = now()
     WHERE status = 'in_progress'
       AND expires_at IS NOT NULL
       AND expires_at < now()
       AND (${userId ?? null}::int IS NULL OR user_id = ${userId ?? null}::int)
    RETURNING id
  `);
  return rows<Row>(result).length;
}

/** Item-level aggregates grouped by section code (JLPT section scoring). */
export async function sectionAggregates(runId: number): Promise<
  Array<{
    sectionCode: string | null;
    questionCount: number;
    answered: number;
    correct: number;
    score: number;
    totalPoints: number;
  }>
> {
  const result = await getDb().execute(sql`
    SELECT section_code,
           count(*)::int AS question_count,
           count(*) FILTER (WHERE answered)::int AS answered,
           count(*) FILTER (WHERE answered AND correct)::int AS correct,
           coalesce(sum(points), 0)::int AS total_points,
           coalesce(sum(points) FILTER (WHERE answered AND correct), 0)::int AS score
      FROM quiz_run_items
     WHERE run_id = ${runId}
     GROUP BY section_code
  `);
  return rows<Row>(result).map((row) => ({
    sectionCode: text(row.section_code),
    questionCount: num(row.question_count),
    answered: num(row.answered),
    correct: num(row.correct),
    score: num(row.score),
    totalPoints: num(row.total_points),
  }));
}

/** Item-level aggregates grouped by bank skill (weak-skill analytics). */
export async function skillAggregates(runId: number): Promise<
  Array<{ skill: string; questionCount: number; correct: number; percent: number }>
> {
  const result = await getDb().execute(sql`
    SELECT q.skill AS skill,
           count(*)::int AS question_count,
           count(*) FILTER (WHERE i.answered AND i.correct)::int AS correct,
           CASE WHEN count(*) FILTER (WHERE i.answered) = 0 THEN 0
                ELSE round((count(*) FILTER (WHERE i.answered AND i.correct)::numeric
                  / count(*) FILTER (WHERE i.answered)) * 100)::int END AS percent
      FROM quiz_run_items i
      JOIN questions q ON q.id = i.question_id
     WHERE i.run_id = ${runId}
     GROUP BY q.skill
     ORDER BY q.skill
  `);
  return rows<Row>(result).map((row) => ({
    skill: String(row.skill),
    questionCount: num(row.question_count),
    correct: num(row.correct),
    percent: num(row.percent),
  }));
}

/** History for one learner. */
export async function listRuns(
  userId: number,
  options: { kind?: QuizRunKind | null; limit?: number; offset?: number } = {},
): Promise<RunRow[]> {
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 50);
  const offset = Math.max(options.offset ?? 0, 0);
  const result = await getDb().execute(sql`
    SELECT r.*, NULL::int AS passing_percent, NULL::int AS section_minimum_percent
      FROM quiz_runs r
     WHERE r.user_id = ${userId}
       AND (${options.kind ?? null}::text IS NULL OR r.kind = ${options.kind ?? null}::text)
     ORDER BY r.started_at DESC
     LIMIT ${limit} OFFSET ${offset}
  `);
  return rows<Row>(result).map(mapRun);
}

/** Platform-wide run analytics. */
export async function runStats(): Promise<QuizRunStats> {
  const [totals, byKind, byLevel] = await Promise.all([
    getDb().execute(sql`
      SELECT count(*)::int AS runs,
             count(*) FILTER (WHERE status = 'completed')::int AS completed,
             count(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
             count(*) FILTER (WHERE status = 'expired')::int AS expired,
             coalesce(sum(answered_count), 0)::int AS answers,
             coalesce(sum(correct_count), 0)::int AS correct_answers,
             coalesce(round(avg(percent) FILTER (WHERE status = 'completed')), 0)::int AS average_percent
        FROM quiz_runs
    `),
    getDb().execute(sql`
      SELECT kind,
             count(*)::int AS total,
             count(*) FILTER (WHERE status = 'completed')::int AS completed,
             coalesce(round(avg(percent) FILTER (WHERE status = 'completed')), 0)::int AS average_percent
        FROM quiz_runs GROUP BY kind ORDER BY kind
    `),
    getDb().execute(sql`
      SELECT jlpt_level, count(*)::int AS total FROM quiz_runs
       GROUP BY jlpt_level ORDER BY jlpt_level DESC NULLS LAST
    `),
  ]);

  const totalRow = rows<Row>(totals)[0] ?? {};
  return {
    runs: num(totalRow.runs),
    completed: num(totalRow.completed),
    inProgress: num(totalRow.in_progress),
    expired: num(totalRow.expired),
    attempts: num(totalRow.runs),
    answers: num(totalRow.answers),
    correctAnswers: num(totalRow.correct_answers),
    averagePercent: num(totalRow.average_percent),
    byKind: rows<Row>(byKind).map((row) => ({
      kind: String(row.kind),
      total: num(row.total),
      completed: num(row.completed),
      averagePercent: num(row.average_percent),
    })),
    byLevel: rows<Row>(byLevel).map((row) => ({
      jlptLevel: nullableNum(row.jlpt_level),
      total: num(row.total),
    })),
  };
}

/** Counts attempts per blueprint, used on the JLPT pages. */
export async function attemptCountForTest(
  testId: number,
  userId?: number,
): Promise<number> {
  const result = await getDb().execute(sql`
    SELECT count(*)::int AS total FROM quiz_runs
     WHERE jlpt_test_id = ${testId}
       AND (${userId ?? null}::int IS NULL OR user_id = ${userId ?? null}::int)
  `);
  return num(rows<Row>(result)[0]?.total);
}
