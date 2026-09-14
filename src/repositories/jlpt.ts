import "server-only";

import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import type { JlptSectionDefinition, JlptTestPublic, JlptStats } from "@/types/jlpt";
import { jlptLevelLabel } from "@/types/jlpt";

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
const iso = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export interface JlptTestRecord {
  id: number;
  slug: string;
  sourceKey: string;
  level: number;
  title: string;
  titleJa: string | null;
  subtitle: string | null;
  description: string | null;
  instructions: string | null;
  timeLimitSeconds: number;
  questionCount: number;
  totalPoints: number;
  passingPercent: number;
  sectionMinimumPercent: number;
  available: boolean;
  published: boolean;
  metadata: Record<string, unknown> | null;
  sections: Array<{
    id: number;
    code: string;
    title: string;
    titleJa: string | null;
    instructions: string | null;
    position: number;
    timeLimitSeconds: number;
    questionCount: number;
    skills: string[];
    kinds: string[];
    available: number;
    satisfiable: boolean;
  }>;
}

/** Counts active bank questions matching a section's filters. */
async function sectionAvailability(
  level: number,
  skills: string[],
  kinds: string[],
): Promise<number> {
  const result = await getDb().execute(sql`
    SELECT count(*)::int AS total
      FROM questions
     WHERE active = true AND jlpt_level = ${level}
       AND (${skills.length} = 0 OR skill = ANY(${sql.raw(
         `ARRAY[${skills.map((skill) => `'${skill.replace(/'/g, "")}'`).join(",")}]::text[]`,
       )}))
       AND (${kinds.length} = 0 OR kind = ANY(${sql.raw(
         `ARRAY[${kinds.map((kind) => `'${kind.replace(/'/g, "")}'`).join(",")}]::text[]`,
       )}))
  `);
  return num(rows<Row>(result)[0]?.total);
}

function mapTest(row: Row, sections: JlptTestRecord["sections"]): JlptTestRecord {
  return {
    id: num(row.id),
    slug: String(row.slug),
    sourceKey: String(row.source_key ?? row.slug),
    level: num(row.level),
    title: String(row.title),
    titleJa: text(row.title_ja),
    subtitle: text(row.subtitle),
    description: text(row.description),
    instructions: text(row.instructions),
    timeLimitSeconds: num(row.time_limit_seconds),
    questionCount: num(row.question_count),
    totalPoints: num(row.total_points),
    passingPercent: num(row.passing_percent),
    sectionMinimumPercent: num(row.section_minimum_percent),
    available: Boolean(row.available),
    published: Boolean(row.published),
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    sections,
  };
}

async function loadSections(testIds: number[]): Promise<Map<number, JlptTestRecord["sections"]>> {
  const map = new Map<number, JlptTestRecord["sections"]>();
  if (testIds.length === 0) return map;
  const result = await getDb().execute(sql`
    SELECT * FROM jlpt_test_sections
     WHERE test_id IN (${sql.join(testIds.map((id) => sql`${id}`), sql`, `)})
     ORDER BY position, id
  `);
  for (const row of rows<Row>(result)) {
    const testId = num(row.test_id);
    const bucket = map.get(testId) ?? [];
    bucket.push({
      id: num(row.id),
      code: String(row.code),
      title: String(row.title),
      titleJa: text(row.title_ja),
      instructions: text(row.instructions),
      position: num(row.position),
      timeLimitSeconds: num(row.time_limit_seconds),
      questionCount: num(row.question_count),
      skills: strArray(row.skills),
      kinds: strArray(row.kinds),
      available: 0,
      satisfiable: false,
    });
    map.set(testId, bucket);
  }
  return map;
}

/** Loads blueprints, optionally with live bank availability per section. */
export async function listTests(options: { publishedOnly?: boolean } = {}): Promise<
  JlptTestRecord[]
> {
  const result = await getDb().execute(sql`
    SELECT * FROM jlpt_tests
     WHERE (${options.publishedOnly ? 1 : 0}::int = 0 OR published = true)
     ORDER BY level DESC, slug
  `);
  const tests = rows<Row>(result);
  const sections = await loadSections(tests.map((row) => num(row.id)));

  return Promise.all(
    tests.map(async (row) => {
      const id = num(row.id);
      const level = num(row.level);
      const list = sections.get(id) ?? [];
      const withAvailability = await Promise.all(
        list.map(async (section) => {
          const available = await sectionAvailability(level, section.skills, section.kinds);
          return {
            ...section,
            available,
            satisfiable: available >= section.questionCount,
          };
        }),
      );
      return mapTest(row, withAvailability);
    }),
  );
}

export async function findTestBySlug(slug: string): Promise<JlptTestRecord | null> {
  const result = await getDb().execute(sql`
    SELECT * FROM jlpt_tests WHERE slug = ${slug} LIMIT 1
  `);
  const [row] = rows<Row>(result);
  if (!row) return null;
  const sections = (await loadSections([num(row.id)])).get(num(row.id)) ?? [];
  const level = num(row.level);
  const withAvailability = await Promise.all(
    sections.map(async (section) => {
      const available = await sectionAvailability(level, section.skills, section.kinds);
      return { ...section, available, satisfiable: available >= section.questionCount };
    }),
  );
  return mapTest(row, withAvailability);
}

export function toTestPublic(test: JlptTestRecord): JlptTestPublic {
  return {
    slug: test.slug,
    level: test.level,
    levelLabel: jlptLevelLabel(test.level),
    title: test.title,
    titleJa: test.titleJa,
    subtitle: test.subtitle,
    description: test.description,
    instructions: test.instructions,
    timeLimitSeconds: test.timeLimitSeconds,
    questionCount: test.questionCount,
    totalPoints: test.totalPoints,
    passingPercent: test.passingPercent,
    sectionMinimumPercent: test.sectionMinimumPercent,
    available: test.available && test.sections.every((section) => section.satisfiable),
    published: test.published,
    sections: test.sections.map<JlptSectionDefinition>((section) => ({
      code: section.code,
      title: section.title,
      titleJa: section.titleJa,
      instructions: section.instructions,
      position: section.position,
      timeLimitSeconds: section.timeLimitSeconds,
      questionCount: section.questionCount,
      skills: section.skills,
      kinds: section.kinds,
      available: section.available,
      satisfiable: section.satisfiable,
    })),
  };
}

/** Platform-wide JLPT analytics built from canonical run rows. */
export async function jlptStats(): Promise<JlptStats> {
  const [tests, levels, sections, skills] = await Promise.all([
    getDb().execute(sql`
      SELECT count(*)::int AS tests,
             count(*) FILTER (WHERE published)::int AS published
        FROM jlpt_tests
    `),
    getDb().execute(sql`
      SELECT t.level AS level,
             count(*)::int AS attempts,
             count(*) FILTER (WHERE r.status = 'completed')::int AS completed,
             count(*) FILTER (WHERE r.status = 'completed' AND r.passed)::int AS passed,
             coalesce(round(avg(r.percent) FILTER (WHERE r.status = 'completed')), 0)::int AS average_percent
        FROM quiz_runs r JOIN jlpt_tests t ON t.id = r.jlpt_test_id
       WHERE r.kind = 'jlpt'
       GROUP BY t.level ORDER BY t.level DESC
    `),
    getDb().execute(sql`
      SELECT s.code AS code, s.title AS title,
             count(DISTINCT r.id)::int AS attempts,
             coalesce(round(avg(
               CASE WHEN agg.points = 0 THEN 0 ELSE (agg.score::numeric / agg.points) * 100 END
             )), 0)::int AS average_percent
        FROM jlpt_tests t
        JOIN jlpt_test_sections s ON s.test_id = t.id
        LEFT JOIN quiz_runs r
               ON r.jlpt_test_id = t.id AND r.kind = 'jlpt' AND r.status = 'completed'
        LEFT JOIN LATERAL (
          SELECT coalesce(sum(i.points), 0)::int AS points,
                 coalesce(sum(i.points) FILTER (WHERE i.correct), 0)::int AS score
            FROM quiz_run_items i
           WHERE i.run_id = r.id AND i.section_code = s.code
        ) AS agg ON true
       GROUP BY s.code, s.title
       ORDER BY s.code
    `),
    getDb().execute(sql`
      SELECT q.skill AS skill,
             count(*)::int AS answers,
             count(*) FILTER (WHERE i.correct)::int AS correct,
             CASE WHEN count(*) = 0 THEN 0
                  ELSE round((count(*) FILTER (WHERE i.correct)::numeric / count(*)) * 100)::int END AS percent
        FROM quiz_run_items i
        JOIN questions q ON q.id = i.question_id
        JOIN quiz_runs r ON r.id = i.run_id
       WHERE r.kind = 'jlpt' AND i.answered
       GROUP BY q.skill ORDER BY q.skill
    `),
  ]);

  const testRow = rows<Row>(tests)[0] ?? {};
  const levelRows = rows<Row>(levels);

  interface Totals {
    attempts: number;
    completed: number;
    passed: number;
    weightedPercent: number;
  }
  const totals = levelRows.reduce<Totals>(
    (accumulator, row) => ({
      attempts: accumulator.attempts + num(row.attempts),
      completed: accumulator.completed + num(row.completed),
      passed: accumulator.passed + num(row.passed),
      weightedPercent: accumulator.weightedPercent + num(row.average_percent) * num(row.completed),
    }),
    { attempts: 0, completed: 0, passed: 0, weightedPercent: 0 },
  );

  return {
    tests: num(testRow.tests),
    published: num(testRow.published),
    attempts: totals.attempts,
    completed: totals.completed,
    passed: totals.passed,
    passRate: totals.completed === 0 ? 0 : Math.round((totals.passed / totals.completed) * 100),
    averagePercent:
      totals.completed === 0 ? 0 : Math.round(totals.weightedPercent / totals.completed),
    bankQuestionsByLevel: [],
    byLevel: levelRows.map((row) => ({
      level: num(row.level),
      levelLabel: jlptLevelLabel(num(row.level)),
      attempts: num(row.attempts),
      completed: num(row.completed),
      passed: num(row.passed),
      passRate: num(row.completed) === 0 ? 0 : Math.round((num(row.passed) / num(row.completed)) * 100),
      averagePercent: num(row.average_percent),
    })),
    bySection: rows<Row>(sections).map((row) => ({
      code: String(row.code),
      title: String(row.title),
      attempts: num(row.attempts),
      averagePercent: 0,
    })),
    bySkill: rows<Row>(skills).map((row) => ({
      skill: String(row.skill),
      answers: num(row.answers),
      correct: num(row.correct),
      percent: num(row.percent),
    })),
  };
}

/** Bank coverage per level, so the UI can be honest about N4..N1 readiness. */
export async function bankCoverageByLevel(): Promise<Array<{ level: number; total: number }>> {
  const result = await getDb().execute(sql`
    SELECT jlpt_level AS level, count(*)::int AS total
      FROM questions
     WHERE active AND jlpt_level IS NOT NULL
     GROUP BY jlpt_level ORDER BY jlpt_level DESC
  `);
  return rows<Row>(result).map((row) => ({ level: num(row.level), total: num(row.total) }));
}

export { iso };
