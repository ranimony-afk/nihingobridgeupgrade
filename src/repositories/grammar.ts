import "server-only";

import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import type {
  GrammarExample,
  GrammarExampleMatch,
  GrammarPointDetail,
  GrammarPointSummary,
  GrammarPatternSummary,
  GrammarRelatedPoint,
  GrammarStats,
} from "@/types/grammar";
import type { KanjiSummary, VocabularyEntry } from "@/types/knowledge";

type Row = Record<string, unknown>;

function toRows<T extends Row>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] })?.rows ?? []) as T[];
}

const num = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const str = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));

const strArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string") {
    const trimmed = value.replace(/^\{|\}$/g, "");
    return trimmed.length ? trimmed.split(",").map((part) => part.replace(/^"|"$/g, "")) : [];
  }
  return [];
};

const POINT_FIELDS = sql`
  gp.id,
  gp.slug,
  gp.title,
  gp.title_en,
  gp.summary,
  gp.jlpt_level,
  gp.register,
  gp.example_count,
  coalesce(t.tags, '{}'::text[]) AS tags,
  coalesce(p.patterns, '{}'::text[]) AS patterns
`;

const POINT_FROM = sql`
  FROM grammar_points gp
  LEFT JOIN (
    SELECT gpt.grammar_point_id, array_agg(t.slug ORDER BY t.slug) AS tags
    FROM grammar_point_tags gpt
    JOIN grammar_tags t ON t.id = gpt.tag_id
    GROUP BY gpt.grammar_point_id
  ) t ON t.grammar_point_id = gp.id
  LEFT JOIN (
    SELECT grammar_point_id, array_agg(pattern ORDER BY position) AS patterns
    FROM grammar_patterns
    GROUP BY grammar_point_id
  ) p ON p.grammar_point_id = gp.id
`;

function mapPoint(row: Row): GrammarPointSummary {
  return {
    id: num(row.id) ?? 0,
    slug: String(row.slug ?? ""),
    title: String(row.title ?? ""),
    titleEn: str(row.title_en),
    summary: str(row.summary),
    jlptLevel: num(row.jlpt_level),
    register: String(row.register ?? "neutral"),
    exampleCount: num(row.example_count) ?? 0,
    tags: strArray(row.tags),
    patterns: strArray(row.patterns),
  };
}

export async function listGrammarPoints(options: {
  query?: string;
  jlptLevel?: number | null;
  tag?: string | null;
  limit?: number;
  offset?: number;
}): Promise<GrammarPointSummary[]> {
  const limit = Math.min(options.limit ?? 48, 200);
  const offset = Math.max(options.offset ?? 0, 0);
  const query = options.query?.trim() ?? "";
  const like = `%${query}%`;
  const jlpt = options.jlptLevel ?? null;
  const tag = options.tag ?? null;

  const result = await getDb().execute(sql`
    SELECT ${POINT_FIELDS} ${POINT_FROM}
    WHERE (${jlpt}::int IS NULL OR gp.jlpt_level = ${jlpt}::int)
      AND (${tag}::text IS NULL OR ${tag}::text = ANY (coalesce(t.tags, '{}'::text[])))
      AND (
        ${query} = '' 
        OR gp.title ILIKE ${like}
        OR gp.title_en ILIKE ${like}
        OR gp.summary ILIKE ${like}
        OR gp.explanation ILIKE ${like}
        OR EXISTS (
          SELECT 1 FROM grammar_patterns gpat
          WHERE gpat.grammar_point_id = gp.id AND gpat.pattern ILIKE ${like}
        )
      )
    ORDER BY
      CASE WHEN ${query} <> '' AND gp.title ILIKE ${like} THEN 0 ELSE 1 END,
      gp.jlpt_level DESC NULLS LAST,
      gp.sort_order ASC,
      gp.slug ASC
    LIMIT ${limit} OFFSET ${offset}
  `);
  return toRows<Row>(result).map(mapPoint);
}

export async function countGrammarPoints(options: {
  query?: string;
  jlptLevel?: number | null;
  tag?: string | null;
}): Promise<number> {
  const query = options.query?.trim() ?? "";
  const like = `%${query}%`;
  const jlpt = options.jlptLevel ?? null;
  const tag = options.tag ?? null;

  const result = await getDb().execute(sql`
    SELECT count(*)::int AS total
    FROM grammar_points gp
    LEFT JOIN (
      SELECT gpt.grammar_point_id, array_agg(t.slug ORDER BY t.slug) AS tags
      FROM grammar_point_tags gpt
      JOIN grammar_tags t ON t.id = gpt.tag_id
      GROUP BY gpt.grammar_point_id
    ) t ON t.grammar_point_id = gp.id
    WHERE (${jlpt}::int IS NULL OR gp.jlpt_level = ${jlpt}::int)
      AND (${tag}::text IS NULL OR ${tag}::text = ANY (coalesce(t.tags, '{}'::text[])))
      AND (
        ${query} = ''
        OR gp.title ILIKE ${like}
        OR gp.title_en ILIKE ${like}
        OR gp.summary ILIKE ${like}
        OR gp.explanation ILIKE ${like}
      )
  `);
  return num(toRows<Row>(result)[0]?.total) ?? 0;
}

export async function getGrammarPointBySlug(slug: string): Promise<GrammarPointDetail | null> {
  const head = await getDb().execute(sql`
    SELECT ${POINT_FIELDS}, gp.explanation, gp.formation, gp.notes
    ${POINT_FROM}
    WHERE gp.slug = ${slug}
    LIMIT 1
  `);
  const [row] = toRows<Row>(head);
  if (!row) return null;

  const point = mapPoint(row);
  const pointId = point.id;

  const [patternRows, examples, matches, relationRows, kanjiRows, vocabRows, provenanceRows] =
    await Promise.all([
      getDb().execute(sql`
        SELECT id, pattern, match_text, is_core, note, position
        FROM grammar_patterns WHERE grammar_point_id = ${pointId}
        ORDER BY position
      `),
      getDb().execute(sql`
        SELECT id, japanese, english, external_id, length
        FROM grammar_examples WHERE grammar_point_id = ${pointId}
        ORDER BY length ASC, id ASC
      `),
      getDb().execute(sql`
        SELECT m.example_id, m.matched_text, m.start_index, m.end_index
        FROM grammar_example_matches m
        JOIN grammar_examples e ON e.id = m.example_id
        WHERE e.grammar_point_id = ${pointId}
        ORDER BY m.start_index
      `),
      getDb().execute(sql`
        SELECT r.relation, r.note, r.from_point_id,
               gp.id, gp.slug, gp.title, gp.title_en
        FROM grammar_relations r
        JOIN grammar_points gp
          ON gp.id = CASE WHEN r.from_point_id = ${pointId} THEN r.to_point_id ELSE r.from_point_id END
        WHERE r.from_point_id = ${pointId} OR r.to_point_id = ${pointId}
        ORDER BY r.relation, gp.slug
      `),
      getDb().execute(sql`
        SELECT k.id, k.literal, k.stroke_count, k.grade, k.frequency, k.jlpt_level, k.radical_number,
               coalesce(m.meanings, '{}'::text[]) AS meanings,
               coalesce(rd.on_readings, '{}'::text[]) AS on_readings,
               coalesce(rd.kun_readings, '{}'::text[]) AS kun_readings
        FROM grammar_point_kanji gpk
        JOIN kanji k ON k.id = gpk.kanji_id
        LEFT JOIN (
          SELECT kanji_id, array_agg(meaning ORDER BY position) AS meanings
          FROM kanji_meanings WHERE lang = 'en' GROUP BY kanji_id
        ) m ON m.kanji_id = k.id
        LEFT JOIN (
          SELECT kanji_id,
                 coalesce(array_agg(reading ORDER BY position) FILTER (WHERE reading_type = 'ja_on'), '{}') AS on_readings,
                 coalesce(array_agg(reading ORDER BY position) FILTER (WHERE reading_type = 'ja_kun'), '{}') AS kun_readings
          FROM kanji_readings GROUP BY kanji_id
        ) rd ON rd.kanji_id = k.id
        WHERE gpk.grammar_point_id = ${pointId}
        ORDER BY k.frequency ASC NULLS LAST
        LIMIT 24
      `),
      getDb().execute(sql`
        SELECT v.id, v.external_id, v.kanji_text, v.kana_text, v.meanings, v.parts_of_speech, v.priority
        FROM grammar_point_vocabulary gpv
        JOIN vocabulary v ON v.id = gpv.vocabulary_id
        WHERE gpv.grammar_point_id = ${pointId}
        ORDER BY v.priority ASC NULLS LAST, length(v.kanji_text) ASC
        LIMIT 12
      `),
      getDb().execute(sql`
        SELECT DISTINCT s.code, s.name, s.license
        FROM sources s
        WHERE s.code IN ('grammar-seed', 'tanaka')
        ORDER BY s.code
      `),
    ]);

  const matchesByExample = new Map<number, GrammarExampleMatch[]>();
  for (const match of toRows<Row>(matches)) {
    const exampleId = num(match.example_id) ?? 0;
    const bucket = matchesByExample.get(exampleId) ?? [];
    bucket.push({
      matchedText: String(match.matched_text ?? ""),
      startIndex: num(match.start_index) ?? 0,
      endIndex: num(match.end_index) ?? 0,
    });
    matchesByExample.set(exampleId, bucket);
  }

  const examplesWithMatches: GrammarExample[] = toRows<Row>(examples).map((example) => ({
    id: num(example.id) ?? 0,
    japanese: String(example.japanese ?? ""),
    english: String(example.english ?? ""),
    externalId: str(example.external_id),
    length: num(example.length) ?? 0,
    matches: matchesByExample.get(num(example.id) ?? 0) ?? [],
  }));

  const patterns: GrammarPatternSummary[] = toRows<Row>(patternRows).map((pattern) => ({
    id: num(pattern.id) ?? 0,
    pattern: String(pattern.pattern ?? ""),
    matchText: String(pattern.match_text ?? ""),
    isCore: Boolean(pattern.is_core),
    note: str(pattern.note),
  }));

  const related: GrammarRelatedPoint[] = toRows<Row>(relationRows).map((relation) => ({
    id: num(relation.id) ?? 0,
    slug: String(relation.slug ?? ""),
    title: String(relation.title ?? ""),
    titleEn: str(relation.title_en),
    relation: String(relation.relation ?? "related") as GrammarRelatedPoint["relation"],
    inbound: num(relation.from_point_id) !== pointId,
    note: str(relation.note),
  }));

  const kanji: KanjiSummary[] = toRows<Row>(kanjiRows).map((kanji) => ({
    id: num(kanji.id) ?? 0,
    literal: String(kanji.literal ?? ""),
    strokeCount: num(kanji.stroke_count),
    grade: num(kanji.grade),
    frequency: num(kanji.frequency),
    jlptLevel: num(kanji.jlpt_level),
    radicalNumber: num(kanji.radical_number),
    meanings: strArray(kanji.meanings),
    onReadings: strArray(kanji.on_readings),
    kunReadings: strArray(kanji.kun_readings),
  }));

  const vocabulary: VocabularyEntry[] = toRows<Row>(vocabRows).map((entry) => ({
    id: num(entry.id) ?? 0,
    externalId: str(entry.external_id),
    kanjiText: String(entry.kanji_text ?? ""),
    kanaText: str(entry.kana_text),
    meanings: strArray(entry.meanings),
    partsOfSpeech: strArray(entry.parts_of_speech),
    priority: num(entry.priority),
  }));

  return {
    ...point,
    explanation: str(row.explanation),
    formation: str(row.formation),
    notes: str(row.notes),
    patternDetails: patterns,
    examples: examplesWithMatches,
    related,
    kanji,
    vocabulary,
    provenance: toRows<Row>(provenanceRows).map((source) => ({
      code: String(source.code ?? ""),
      name: String(source.name ?? ""),
      license: String(source.license ?? ""),
    })),
  };
}

export async function listGrammarTags(): Promise<Array<{ slug: string; total: number }>> {
  const result = await getDb().execute(sql`
    SELECT t.slug, count(gpt.grammar_point_id)::int AS total
    FROM grammar_tags t
    LEFT JOIN grammar_point_tags gpt ON gpt.tag_id = t.id
    GROUP BY t.slug
    ORDER BY total DESC, t.slug ASC
  `);
  return toRows<Row>(result).map((row) => ({
    slug: String(row.slug ?? ""),
    total: num(row.total) ?? 0,
  }));
}

export async function getGrammarStats(): Promise<GrammarStats> {
  const [totals, levels] = await Promise.all([
    getDb().execute(sql`
      SELECT
        (SELECT count(*)::int FROM grammar_points) AS points,
        (SELECT count(*)::int FROM grammar_patterns) AS patterns,
        (SELECT count(*)::int FROM grammar_examples) AS examples,
        (SELECT count(*)::int FROM grammar_example_matches) AS matches,
        (SELECT count(*)::int FROM grammar_relations) AS relations,
        (SELECT count(DISTINCT source_id)::int FROM grammar_points WHERE source_id IS NOT NULL) AS sources
    `),
    getDb().execute(sql`
      SELECT jlpt_level, count(*)::int AS total
      FROM grammar_points
      GROUP BY jlpt_level
      ORDER BY jlpt_level DESC NULLS LAST
    `),
  ]);

  const row = toRows<Row>(totals)[0] ?? {};

  return {
    points: num(row.points) ?? 0,
    patterns: num(row.patterns) ?? 0,
    examples: num(row.examples) ?? 0,
    matches: num(row.matches) ?? 0,
    relations: num(row.relations) ?? 0,
    sources: num(row.sources) ?? 0,
    byLevel: toRows<Row>(levels).map((level) => ({
      jlptLevel: num(level.jlpt_level),
      total: num(level.total) ?? 0,
    })),
  };
}
