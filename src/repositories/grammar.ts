import "server-only";

import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import type {
  GrammarExample,
  GrammarExampleMatch,
  GrammarMistake,
  GrammarNeighbour,
  GrammarPointDetail,
  GrammarPointSummary,
  GrammarPatternSummary,
  GrammarRelatedPoint,
  GrammarStats,
  GrammarStructure,
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

export type GrammarSort = "relevance" | "level" | "order" | "title" | "examples";

export async function listGrammarPoints(options: {
  query?: string;
  jlptLevel?: number | null;
  tag?: string | null;
  register?: string | null;
  sort?: GrammarSort;
  limit?: number;
  offset?: number;
}): Promise<GrammarPointSummary[]> {
  const limit = Math.min(options.limit ?? 48, 200);
  const offset = Math.max(options.offset ?? 0, 0);
  const query = options.query?.trim() ?? "";
  const like = `%${query}%`;
  const jlpt = options.jlptLevel ?? null;
  const tag = options.tag ?? null;
  const register = options.register ?? null;
  const hasQuery = query.length > 0;

  const orderBy = {
    relevance: sql`CASE WHEN gp.title ILIKE ${like} THEN 0 ELSE 1 END, gp.jlpt_level DESC NULLS LAST, gp.sort_order ASC`,
    level: sql`gp.jlpt_level DESC NULLS LAST, gp.sort_order ASC, gp.slug ASC`,
    order: sql`gp.sort_order ASC, gp.jlpt_level DESC NULLS LAST, gp.slug ASC`,
    title: sql`gp.title ASC`,
    examples: sql`gp.example_count DESC, gp.sort_order ASC`,
  }[hasQuery ? (options.sort === "relevance" ? "relevance" : options.sort ?? "relevance") : options.sort ?? "order"];

  const result = await getDb().execute(sql`
    SELECT ${POINT_FIELDS} ${POINT_FROM}
    WHERE (${jlpt}::int IS NULL OR gp.jlpt_level = ${jlpt}::int)
      AND (${register}::text IS NULL OR gp.register = ${register}::text)
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
    ORDER BY ${orderBy}
    LIMIT ${limit} OFFSET ${offset}
  `);
  return toRows<Row>(result).map(mapPoint);
}

export async function countGrammarPoints(options: {
  query?: string;
  jlptLevel?: number | null;
  tag?: string | null;
  register?: string | null;
}): Promise<number> {
  const query = options.query?.trim() ?? "";
  const like = `%${query}%`;
  const jlpt = options.jlptLevel ?? null;
  const tag = options.tag ?? null;
  const register = options.register ?? null;

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
      AND (${register}::text IS NULL OR gp.register = ${register}::text)
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

  const [
    patternRows,
    examples,
    matches,
    relationRows,
    kanjiRows,
    vocabRows,
    provenanceRows,
    structureRows,
    mistakeRows,
    neighbourRows,
  ] = await Promise.all([
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
        WHERE s.code IN ('grammar-seed', 'tanaka', 'grammar-structures', 'grammar-mistakes')
        ORDER BY s.code
      `),
      getDb().execute(sql`
        SELECT id, position, label, content, required, note
        FROM grammar_structures WHERE grammar_point_id = ${pointId}
        ORDER BY position
      `),
      getDb().execute(sql`
        SELECT id, position, incorrect, correction, explanation, severity
        FROM grammar_mistakes WHERE grammar_point_id = ${pointId}
        ORDER BY position
      `),
      getDb().execute(sql`
        WITH ranked AS (
          SELECT slug, title,
                 lag(slug)  OVER (ORDER BY sort_order, slug) AS prev_slug,
                 lag(title) OVER (ORDER BY sort_order, slug) AS prev_title,
                 lead(slug)  OVER (ORDER BY sort_order, slug) AS next_slug,
                 lead(title) OVER (ORDER BY sort_order, slug) AS next_title
          FROM grammar_points
          WHERE coalesce(jlpt_level, 0) = coalesce(
            (SELECT jlpt_level FROM grammar_points WHERE id = ${pointId}), 0
          )
        )
        SELECT prev_slug AS slug, prev_title AS title, 'previous' AS direction
        FROM ranked WHERE slug = ${point.slug} AND prev_slug IS NOT NULL
        UNION ALL
        SELECT next_slug AS slug, next_title AS title, 'next' AS direction
        FROM ranked WHERE slug = ${point.slug} AND next_slug IS NOT NULL
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
    depth: 1,
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

  const structures: GrammarStructure[] = toRows<Row>(structureRows).map((slot) => ({
    id: num(slot.id) ?? 0,
    position: num(slot.position) ?? 0,
    label: String(slot.label ?? ""),
    content: String(slot.content ?? ""),
    required: slot.required === null ? true : Boolean(slot.required),
    note: str(slot.note),
  }));

  const mistakes: GrammarMistake[] = toRows<Row>(mistakeRows).map((mistake) => ({
    id: num(mistake.id) ?? 0,
    position: num(mistake.position) ?? 0,
    incorrect: String(mistake.incorrect ?? ""),
    correction: String(mistake.correction ?? ""),
    explanation: String(mistake.explanation ?? ""),
    severity: (["common", "subtle", "critical"] as const).includes(
      String(mistake.severity ?? "common") as "common",
    )
      ? (String(mistake.severity ?? "common") as GrammarMistake["severity"])
      : "common",
  }));

  const neighbours: GrammarNeighbour[] = toRows<Row>(neighbourRows).map((neighbour) => ({
    slug: String(neighbour.slug ?? ""),
    title: String(neighbour.title ?? ""),
    direction: neighbour.direction === "previous" ? ("previous" as const) : ("next" as const),
  }));

  return {
    ...point,
    explanation: str(row.explanation),
    formation: str(row.formation),
    notes: str(row.notes),
    structures,
    mistakes,
    neighbours,
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

/* -------------------------------------------------------------------------- */
/* Examples (paginated)                                                       */
/* -------------------------------------------------------------------------- */

export interface ExampleFilters {
  limit?: number;
  offset?: number;
  maxLength?: number;
  minLength?: number;
  sort?: "length" | "id";
}

async function exampleMatchMap(pointId: number, exampleIds: number[]) {
  const map = new Map<number, GrammarExampleMatch[]>();
  if (exampleIds.length === 0) return map;
  const result = await getDb().execute(sql`
    SELECT m.example_id, m.matched_text, m.start_index, m.end_index
    FROM grammar_example_matches m
    WHERE m.example_id IN (${sql.join(
      exampleIds.map((id) => sql`${id}`),
      sql`, `,
    )})
    ORDER BY m.start_index
  `);
  for (const row of toRows<Row>(result)) {
    const id = num(row.example_id) ?? 0;
    const bucket = map.get(id) ?? [];
    bucket.push({
      matchedText: String(row.matched_text ?? ""),
      startIndex: num(row.start_index) ?? 0,
      endIndex: num(row.end_index) ?? 0,
    });
    map.set(id, bucket);
  }
  return map;
}

export async function listGrammarExamples(
  pointId: number,
  filters: ExampleFilters = {},
): Promise<GrammarExample[]> {
  const limit = Math.min(filters.limit ?? 20, 100);
  const offset = Math.max(filters.offset ?? 0, 0);
  const maxLength = filters.maxLength ?? null;
  const minLength = filters.minLength ?? null;
  const orderBy =
    filters.sort === "id" ? sql`e.id ASC` : sql`e.length ASC, e.id ASC`;

  const result = await getDb().execute(sql`
    SELECT e.id, e.japanese, e.english, e.external_id, e.length
    FROM grammar_examples e
    WHERE e.grammar_point_id = ${pointId}
      AND (${maxLength}::int IS NULL OR e.length <= ${maxLength}::int)
      AND (${minLength}::int IS NULL OR e.length >= ${minLength}::int)
    ORDER BY ${orderBy}
    LIMIT ${limit} OFFSET ${offset}
  `);

  const rows = toRows<Row>(result);
  const matches = await exampleMatchMap(pointId, rows.map((row) => num(row.id) ?? 0));
  return rows.map((row) => ({
    id: num(row.id) ?? 0,
    japanese: String(row.japanese ?? ""),
    english: String(row.english ?? ""),
    externalId: str(row.external_id),
    length: num(row.length) ?? 0,
    matches: matches.get(num(row.id) ?? 0) ?? [],
  }));
}

export async function countGrammarExamples(
  pointId: number,
  filters: Pick<ExampleFilters, "maxLength" | "minLength"> = {},
): Promise<number> {
  const maxLength = filters.maxLength ?? null;
  const minLength = filters.minLength ?? null;
  const result = await getDb().execute(sql`
    SELECT count(*)::int AS total
    FROM grammar_examples e
    WHERE e.grammar_point_id = ${pointId}
      AND (${maxLength}::int IS NULL OR e.length <= ${maxLength}::int)
      AND (${minLength}::int IS NULL OR e.length >= ${minLength}::int)
  `);
  return num(toRows<Row>(result)[0]?.total) ?? 0;
}

/* -------------------------------------------------------------------------- */
/* Relations / graph                                                          */
/* -------------------------------------------------------------------------- */

export interface GrammarGraph {
  nodes: Array<{ id: number; slug: string; title: string; jlptLevel: number | null; depth: number }>;
  edges: Array<{ from: string; to: string; relation: string }>;
}

/**
 * Breadth-first traversal of `grammar_relations` around a point.
 * Relations are undirected at traversal time; the `inbound` flag tells the
 * client on which side of the declaration the point was found.
 */
export async function getRelatedPoints(
  slug: string,
  options: { relation?: string; depth?: number; limit?: number } = {},
): Promise<{ root: string; related: GrammarRelatedPoint[] } | null> {
  const head = await getDb().execute(
    sql`SELECT id, slug FROM grammar_points WHERE slug = ${slug} LIMIT 1`,
  );
  const [rootRow] = toRows<Row>(head);
  if (!rootRow) return null;

  const rootId = num(rootRow.id) ?? 0;
  const maxDepth = Math.min(Math.max(options.depth ?? 1, 1), 2);
  const limit = Math.min(options.limit ?? 24, 100);

  const [relationsResult, pointsResult] = await Promise.all([
    getDb().execute(sql`
      SELECT from_point_id, to_point_id, relation, note
      FROM grammar_relations
    `),
    getDb().execute(sql`SELECT id, slug, title, title_en FROM grammar_points`),
  ]);

  type Edge = { from: number; to: number; relation: string; note: string | null };
  const edges: Edge[] = toRows<Row>(relationsResult).map((row) => ({
    from: num(row.from_point_id) ?? 0,
    to: num(row.to_point_id) ?? 0,
    relation: String(row.relation ?? "related"),
    note: str(row.note),
  }));

  const points = new Map<number, { slug: string; title: string; titleEn: string | null }>();
  for (const row of toRows<Row>(pointsResult)) {
    points.set(num(row.id) ?? 0, {
      slug: String(row.slug ?? ""),
      title: String(row.title ?? ""),
      titleEn: str(row.title_en),
    });
  }

  const adjacency = new Map<number, Edge[]>();
  for (const edge of edges) {
    for (const [key, other] of [
      [edge.from, edge.to],
      [edge.to, edge.from],
    ] as const) {
      const bucket = adjacency.get(key) ?? [];
      bucket.push({ ...edge, from: key, to: other });
      adjacency.set(key, bucket);
    }
  }

  const related: GrammarRelatedPoint[] = [];
  const visited = new Set<number>([rootId]);
  let frontier = [rootId];

  for (let depth = 1; depth <= maxDepth && related.length < limit; depth += 1) {
    const next: number[] = [];
    for (const current of frontier) {
      for (const edge of adjacency.get(current) ?? []) {
        if (options.relation && edge.relation !== options.relation) continue;
        if (visited.has(edge.to)) continue;
        visited.add(edge.to);
        const point = points.get(edge.to);
        related.push({
          id: edge.to,
          slug: point?.slug ?? "",
          title: point?.title ?? "",
          titleEn: point?.titleEn ?? null,
          relation: edge.relation as GrammarRelatedPoint["relation"],
          inbound: edge.from !== current,
          depth,
          note: edge.note,
        });
        next.push(edge.to);
        if (related.length >= limit) break;
      }
      if (related.length >= limit) break;
    }
    frontier = next;
  }

  return { root: slug, related };
}

/** Relation graph for a whole level / tag — powers the grammar map view. */
export async function getGrammarGraph(options: {
  jlptLevel?: number | null;
  tag?: string | null;
  relation?: string | null;
  limit?: number;
}): Promise<GrammarGraph> {
  const jlpt = options.jlptLevel ?? null;
  const tag = options.tag ?? null;
  const relation = options.relation ?? null;
  const limit = Math.min(options.limit ?? 200, 400);

  const points = await listGrammarPoints({
    jlptLevel: options.jlptLevel ?? null,
    tag: options.tag ?? null,
    limit,
  });
  const ids = points.map((point) => point.id);
  if (ids.length === 0) return { nodes: [], edges: [] };

  const edgesResult = await getDb().execute(sql`
    SELECT r.from_point_id, r.to_point_id, r.relation,
           f.slug AS from_slug, t.slug AS to_slug
    FROM grammar_relations r
    JOIN grammar_points f ON f.id = r.from_point_id
    JOIN grammar_points t ON t.id = r.to_point_id
    WHERE (f.id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
        OR t.id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}))
      AND (${relation}::text IS NULL OR r.relation = ${relation}::text)
    ORDER BY r.relation, f.slug
  `);

  const rows = toRows<Row>(edgesResult).map((row) => ({
    from: String(row.from_slug ?? ""),
    to: String(row.to_slug ?? ""),
    relation: String(row.relation ?? "related"),
  }));

  // Keep the graph closed: a relation may point outside the requested slice,
  // in which case the neighbour is added as a node too.
  const known = new Map(points.map((point) => [point.slug, point]));
  const missing = Array.from(
    new Set(
      rows.flatMap((edge) => [edge.from, edge.to]).filter((slug) => slug && !known.has(slug)),
    ),
  );

  let nodes = points.map((point) => ({
    id: point.id,
    slug: point.slug,
    title: point.title,
    jlptLevel: point.jlptLevel,
    depth: 0,
  }));

  if (missing.length > 0) {
    const neighbours = await listGrammarPointsBySlugs(missing);
    nodes = nodes.concat(
      neighbours.map((point) => ({
        id: point.id,
        slug: point.slug,
        title: point.title,
        jlptLevel: point.jlptLevel,
        depth: 1,
      })),
    );
  }

  return { nodes, edges: rows };
}

/* -------------------------------------------------------------------------- */
/* Levels & batch                                                             */
/* -------------------------------------------------------------------------- */

export interface GrammarLevelSummary {
  jlptLevel: number | null;
  total: number;
  examples: number;
}

export async function getGrammarLevels(): Promise<GrammarLevelSummary[]> {
  const result = await getDb().execute(sql`
    SELECT gp.jlpt_level,
           count(DISTINCT gp.id)::int AS total,
           coalesce(sum(gp.example_count), 0)::int AS examples
    FROM grammar_points gp
    GROUP BY gp.jlpt_level
    ORDER BY gp.jlpt_level DESC NULLS LAST
  `);
  return toRows<Row>(result).map((row) => ({
    jlptLevel: num(row.jlpt_level),
    total: num(row.total) ?? 0,
    examples: num(row.examples) ?? 0,
  }));
}

export async function listGrammarPointsBySlugs(slugs: string[]): Promise<GrammarPointSummary[]> {
  if (slugs.length === 0) return [];
  const unique = Array.from(new Set(slugs));
  const result = await getDb().execute(sql`
    SELECT ${POINT_FIELDS} ${POINT_FROM}
    WHERE gp.slug IN (${sql.join(
      unique.map((slug) => sql`${slug}`),
      sql`, `,
    )})
    ORDER BY gp.jlpt_level DESC NULLS LAST, gp.sort_order ASC
  `);
  return toRows<Row>(result).map(mapPoint);
}

export async function listGrammarStructures(pointId: number): Promise<GrammarStructure[]> {
  const result = await getDb().execute(sql`
    SELECT id, position, label, content, required, note
    FROM grammar_structures WHERE grammar_point_id = ${pointId}
    ORDER BY position
  `);
  return toRows<Row>(result).map((slot) => ({
    id: num(slot.id) ?? 0,
    position: num(slot.position) ?? 0,
    label: String(slot.label ?? ""),
    content: String(slot.content ?? ""),
    required: slot.required === null ? true : Boolean(slot.required),
    note: str(slot.note),
  }));
}

export async function listGrammarMistakes(pointId: number): Promise<GrammarMistake[]> {
  const result = await getDb().execute(sql`
    SELECT id, position, incorrect, correction, explanation, severity
    FROM grammar_mistakes WHERE grammar_point_id = ${pointId}
    ORDER BY position
  `);
  return toRows<Row>(result).map((mistake) => ({
    id: num(mistake.id) ?? 0,
    position: num(mistake.position) ?? 0,
    incorrect: String(mistake.incorrect ?? ""),
    correction: String(mistake.correction ?? ""),
    explanation: String(mistake.explanation ?? ""),
    severity: (String(mistake.severity ?? "common") as GrammarMistake["severity"]) ?? "common",
  }));
}

/** Scored search across title / gloss / summary / patterns. */
export async function searchGrammarPoints(
  query: string,
  limit = 24,
): Promise<Array<{ point: GrammarPointSummary; matchedOn: string; score: number }>> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const like = `%${trimmed}%`;
  const prefix = `${trimmed}%`;

  const result = await getDb().execute(sql`
    SELECT ${POINT_FIELDS},
      (
        CASE
          WHEN gp.title = ${trimmed} THEN 100
          WHEN gp.title ILIKE ${prefix} THEN 80
          WHEN EXISTS (SELECT 1 FROM grammar_patterns gpat
                       WHERE gpat.grammar_point_id = gp.id AND gpat.pattern ILIKE ${prefix}) THEN 70
          WHEN coalesce(gp.title_en, '') ILIKE ${prefix} THEN 60
          WHEN gp.title ILIKE ${like} THEN 40
          WHEN coalesce(gp.summary, '') ILIKE ${like} THEN 30
          WHEN coalesce(gp.explanation, '') ILIKE ${like} THEN 20
          WHEN EXISTS (SELECT 1 FROM grammar_patterns gpat
                       WHERE gpat.grammar_point_id = gp.id AND gpat.pattern ILIKE ${like}) THEN 15
          ELSE 5
        END
      ) AS score,
      (
        CASE
          WHEN gp.title ILIKE ${like} THEN 'title'
          WHEN EXISTS (SELECT 1 FROM grammar_patterns gpat
                       WHERE gpat.grammar_point_id = gp.id AND (gpat.pattern ILIKE ${like} OR gpat.match_text ILIKE ${like})) THEN 'pattern'
          WHEN coalesce(gp.title_en, '') ILIKE ${like} THEN 'gloss'
          ELSE 'explanation'
        END
      ) AS matched_on
    ${POINT_FROM}
    WHERE gp.title ILIKE ${like}
       OR coalesce(gp.title_en, '') ILIKE ${like}
       OR coalesce(gp.summary, '') ILIKE ${like}
       OR coalesce(gp.explanation, '') ILIKE ${like}
       OR EXISTS (SELECT 1 FROM grammar_patterns gpat
                  WHERE gpat.grammar_point_id = gp.id AND (gpat.pattern ILIKE ${like} OR gpat.match_text ILIKE ${like}))
    ORDER BY score DESC, gp.jlpt_level DESC NULLS LAST, gp.sort_order ASC
    LIMIT ${limit}
  `);

  return toRows<Row>(result).map((row) => ({
    point: mapPoint(row),
    matchedOn: String(row.matched_on ?? "title"),
    score: num(row.score) ?? 0,
  }));
}
