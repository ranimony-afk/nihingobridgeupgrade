import "server-only";

import { sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
import type {
  SearchEntityType,
  SearchFacets,
  SearchHit,
  SearchIndexStats,
  SearchMode,
} from "@/types/search";

type Row = Record<string, unknown>;

function toRows<T extends Row>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] })?.rows ?? []) as T[];
}

const number = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const nullableNumber = (value: unknown): number | null =>
  value === null || value === undefined ? null : number(value);

const textArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
};

export interface PostgresSearchOptions {
  query: string;
  mode?: SearchMode;
  types?: SearchEntityType[];
  jlptLevel?: number | null;
  limit?: number;
  offset?: number;
  fuzzyThreshold?: number;
}

export interface PostgresSearchRows {
  hits: SearchHit[];
  total: number;
  facets: SearchFacets;
}

/**
 * One ranked PostgreSQL query for all three modes.
 *
 * exact      lower(primary/secondary/alias) = lower(query)
 * full_text to_tsvector('simple', search_text) @@ plainto_tsquery('simple', query)
 * fuzzy     pg_trgm similarity / word_similarity
 * auto      exact + prefix + full-text + fuzzy, ranked in that order
 */
export async function searchPostgres(
  options: PostgresSearchOptions,
): Promise<PostgresSearchRows> {
  const query = options.query;
  const mode = options.mode ?? "auto";
  const limit = Math.min(Math.max(options.limit ?? 24, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);
  const threshold = Math.min(Math.max(options.fuzzyThreshold ?? 0.38, 0.1), 0.95);
  const jlpt = options.jlptLevel ?? null;
  const types = options.types?.length
    ? Array.from(new Set(options.types))
    : (["kanji", "dictionary", "grammar", "sentence", "course", "lesson"] as SearchEntityType[]);

  const typeFilter = sql`sd.entity_type IN (${sql.join(
    types.map((type) => sql`${type}`),
    sql`, `,
  )})`;

  const modeFilter: SQL = {
    exact: sql`is_exact`,
    full_text: sql`is_full_text`,
    fuzzy: sql`fuzzy_score >= ${threshold}`,
    auto: sql`is_exact OR is_prefix OR is_full_text OR fuzzy_score >= ${threshold}`,
  }[mode];

  // Filter with index-supported operators *before* calculating ranks. Without
  // this candidate stage, exact/auto search computes trigram scores across the
  // whole sentence corpus (~148k rows).
  const exactCandidate = sql`
    lower(sd.primary_text) = lower(${query})
    OR lower(coalesce(sd.secondary_text, '')) = lower(${query})
    OR sd.aliases @> jsonb_build_array(${query}::text)
    OR sd.aliases @> jsonb_build_array(lower(${query}::text))
  `;
  const fullTextCandidate = sql`
    to_tsvector('simple', sd.search_text) @@ plainto_tsquery('simple', ${query})
  `;
  const fuzzyCandidate = sql`
    sd.primary_text % ${query}
    OR coalesce(sd.secondary_text, '') % ${query}
    OR sd.search_text % ${query}
    OR ${query} <% sd.search_text
  `;
  const prefixCandidate = sql`
    sd.primary_text ILIKE ${`${query}%`}
    OR coalesce(sd.secondary_text, '') ILIKE ${`${query}%`}
  `;
  const candidateFilter: SQL = {
    exact: exactCandidate,
    full_text: fullTextCandidate,
    fuzzy: fuzzyCandidate,
    auto: sql`(${exactCandidate}) OR (${prefixCandidate}) OR (${fullTextCandidate}) OR (${fuzzyCandidate})`,
  }[mode];

  const result = await getDb().execute(sql`
    WITH candidates AS MATERIALIZED (
      SELECT sd.*
      FROM search_documents sd
      WHERE sd.active = true
        AND ${typeFilter}
        AND (${jlpt}::int IS NULL OR sd.jlpt_level = ${jlpt}::int)
        AND (${candidateFilter})
    ),
    scored AS (
      SELECT
        sd.id,
        sd.entity_type,
        sd.entity_id,
        sd.external_key,
        sd.route,
        sd.primary_text,
        sd.secondary_text,
        sd.description,
        sd.aliases,
        sd.jlpt_level,
        sd.priority,
        (
          lower(sd.primary_text) = lower(${query})
          OR lower(coalesce(sd.secondary_text, '')) = lower(${query})
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(sd.aliases) alias
            WHERE lower(alias) = lower(${query})
          )
        ) AS is_exact,
        (
          sd.primary_text ILIKE ${`${query}%`}
          OR coalesce(sd.secondary_text, '') ILIKE ${`${query}%`}
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(sd.aliases) alias
            WHERE alias ILIKE ${`${query}%`}
          )
        ) AS is_prefix,
        (
          to_tsvector('simple', sd.search_text)
          @@ plainto_tsquery('simple', ${query})
        ) AS is_full_text,
        ts_rank_cd(
          to_tsvector('simple', sd.search_text),
          plainto_tsquery('simple', ${query})
        ) AS fts_rank,
        greatest(
          similarity(lower(sd.primary_text), lower(${query})),
          similarity(lower(coalesce(sd.secondary_text, '')), lower(${query})),
          word_similarity(lower(${query}), lower(sd.search_text))
        ) AS fuzzy_score
      FROM candidates sd
    ),
    matched AS (
      SELECT *,
        CASE
          WHEN is_exact THEN 'exact'
          WHEN is_prefix THEN 'prefix'
          WHEN is_full_text THEN 'full_text'
          ELSE 'fuzzy'
        END AS matched_on,
        CASE
          WHEN is_exact THEN 1000.0
          WHEN is_prefix THEN 700.0
          WHEN is_full_text THEN 500.0 + fts_rank * 100.0
          ELSE 100.0 + fuzzy_score * 100.0
        END + (100000 - least(priority, 100000))::float / 100000.0 AS score
      FROM scored
      WHERE ${modeFilter}
    )
    SELECT *,
      count(*) OVER ()::int AS total_count,
      count(*) FILTER (WHERE entity_type = 'kanji') OVER ()::int AS facet_kanji,
      count(*) FILTER (WHERE entity_type = 'dictionary') OVER ()::int AS facet_dictionary,
      count(*) FILTER (WHERE entity_type = 'grammar') OVER ()::int AS facet_grammar,
      count(*) FILTER (WHERE entity_type = 'sentence') OVER ()::int AS facet_sentence,
      count(*) FILTER (WHERE entity_type = 'course') OVER ()::int AS facet_course,
      count(*) FILTER (WHERE entity_type = 'lesson') OVER ()::int AS facet_lesson
    FROM matched
    ORDER BY score DESC, priority ASC, primary_text ASC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const rows = toRows<Row>(result);
  const first = rows[0];

  return {
    hits: rows.map((row) => ({
      id: number(row.id),
      entityType: String(row.entity_type) as SearchEntityType,
      entityId: number(row.entity_id),
      externalKey: String(row.external_key ?? ""),
      route: String(row.route ?? ""),
      primaryText: String(row.primary_text ?? ""),
      secondaryText: row.secondary_text ? String(row.secondary_text) : null,
      description: row.description ? String(row.description) : null,
      aliases: textArray(row.aliases),
      jlptLevel: nullableNumber(row.jlpt_level),
      priority: number(row.priority),
      matchedOn: String(row.matched_on) as SearchHit["matchedOn"],
      score: Math.round(number(row.score) * 100) / 100,
      similarity: Math.round(number(row.fuzzy_score) * 1000) / 1000,
    })),
    total: number(first?.total_count),
    facets: {
      kanji: number(first?.facet_kanji),
      dictionary: number(first?.facet_dictionary),
      grammar: number(first?.facet_grammar),
      sentence: number(first?.facet_sentence),
      course: number(first?.facet_course),
      lesson: number(first?.facet_lesson),
    },
  };
}

/**
 * Prefix-first suggestions. Fuzzy fallback is included so kana/English typos
 * still produce useful navigation targets.
 */
export async function suggestPostgres(
  query: string,
  options: { types?: SearchEntityType[]; limit?: number } = {},
): Promise<SearchHit[]> {
  const result = await searchPostgres({
    query,
    mode: "auto",
    types: options.types,
    limit: Math.min(options.limit ?? 8, 20),
    fuzzyThreshold: query.length <= 2 ? 0.55 : 0.32,
  });
  return result.hits;
}

export async function getSearchIndexStats(): Promise<SearchIndexStats> {
  const [countsResult, extensionResult, indexResult] = await Promise.all([
    getDb().execute(sql`
      SELECT entity_type,
             count(*)::int AS total,
             count(*) FILTER (WHERE active)::int AS active,
             max(indexed_at) FILTER (WHERE active) AS last_indexed_at
      FROM search_documents
      WHERE entity_type IN ('dictionary', 'kanji', 'grammar', 'sentence', 'course', 'lesson')
      GROUP BY entity_type
      ORDER BY entity_type
    `),
    getDb().execute(sql`
      SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') AS pg_trgm
    `),
    getDb().execute(sql`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = current_schema() AND tablename = 'search_documents'
    `),
  ]);

  const rows = toRows<Row>(countsResult);
  const indexes = toRows<Row>(indexResult).map((row) => String(row.indexname ?? ""));
  const total = rows.reduce((sum, row) => sum + number(row.total), 0);
  const active = rows.reduce((sum, row) => sum + number(row.active), 0);
  const dates = rows
    .map((row) => (row.last_indexed_at ? new Date(String(row.last_indexed_at)) : null))
    .filter((date): date is Date => date !== null && !Number.isNaN(date.getTime()));

  return {
    total,
    active,
    inactive: total - active,
    byType: rows.map((row) => ({
      entityType: String(row.entity_type) as SearchEntityType,
      total: number(row.total),
      active: number(row.active),
      lastIndexedAt: row.last_indexed_at ? new Date(String(row.last_indexed_at)).toISOString() : null,
    })),
    pgTrgm: Boolean(toRows<Row>(extensionResult)[0]?.pg_trgm),
    fullTextIndex: indexes.includes("search_documents_fts_idx"),
    trigramIndexes: indexes.filter((name) => name.includes("trgm")).length,
    lastIndexedAt:
      dates.length > 0
        ? new Date(Math.max(...dates.map((date) => date.getTime()))).toISOString()
        : null,
  };
}
