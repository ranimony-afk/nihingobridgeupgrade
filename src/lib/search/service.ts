import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { searchQueries, searchSynonyms } from "@/db/schema";
import { uid } from "@/lib/utils";
import {
  bestSuggestion,
  combineScore,
  normalizeQuery,
  parseQuery,
  similarityThreshold,
  toTsQuery,
  wordSimilarityThreshold,
  type ParsedQuery,
  type SearchFilters,
} from "./query";

export type SearchHit = {
  id: string;
  kind: string;
  refId: string;
  href: string;
  title: string;
  subtitle: string;
  jlpt: string | null;
  pos: string | null;
  difficulty: number | null;
  score: number;
  rank: number;
  similarity: number;
  exact: boolean;
};

export type SearchResponse = {
  query: string;
  parsed: ParsedQuery;
  total: number;
  tookMs: number;
  hits: SearchHit[];
  facets: { kind: Record<string, number>; jlpt: Record<string, number> };
  suggestion: string | null;
  didYouMean: boolean;
};

type RawHit = {
  id: string;
  kind: string;
  ref_id: string;
  href: string;
  title: string;
  subtitle: string;
  jlpt: string | null;
  pos: string | null;
  difficulty: number | null;
  boost: number;
  rank: number;
  sim: number;
  exact: boolean;
  prefix: boolean;
  total: string;
};

/** Expands a term through the curated synonym table (e.g. "eat" → 食べる). */
async function expandSynonyms(text: string) {
  const normalized = normalizeQuery(text);
  if (!normalized) return [] as string[];
  const rows = await db
    .select()
    .from(searchSynonyms)
    .where(sql`${searchSynonyms.term} = ${normalized}`);
  return rows.map((row) => row.expandsTo);
}

function filterConditions(filters: SearchFilters, negations: string[]) {
  const parts: SQL[] = [];
  if (filters.kinds.length > 0) {
    parts.push(sql`s.kind = ANY(${sql.param(filters.kinds)}::text[])`);
  }
  if (filters.jlpt) parts.push(sql`s.jlpt = ${filters.jlpt}`);
  if (filters.pos) parts.push(sql`lower(coalesce(s.pos, '')) = ${filters.pos}`);
  if (typeof filters.maxDifficulty === "number") {
    parts.push(sql`coalesce(s.difficulty, 0) <= ${filters.maxDifficulty}`);
  }
  for (const term of negations) {
    parts.push(sql`(s.title || ' ' || s.body) NOT ILIKE ${`%${term}%`}`);
  }
  return parts;
}

export async function search(
  input: string,
  options: { limit?: number; offset?: number; filters?: Partial<SearchFilters>; log?: boolean } = {},
): Promise<SearchResponse> {
  const started = Date.now();
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);
  const parsed = parseQuery(input, options.filters);

  const synonyms = await expandSynonyms(parsed.text);
  const haystack = [parsed.text, ...synonyms].filter(Boolean).join(" ");
  const tsq = toTsQuery(haystack);
  const threshold = similarityThreshold(parsed.text);
  const wordThreshold = wordSimilarityThreshold(parsed.text);
  const like = `%${parsed.text}%`;
  const conditions = filterConditions(parsed.filters, parsed.negations);

  const matchClause = parsed.text
    ? sql`AND (
        (${tsq} <> '' AND s.tsv @@ to_tsquery('simple', ${tsq}))
        OR similarity(s.title_norm, ${parsed.normalized}) >= ${threshold}
        OR word_similarity(${parsed.normalized}, s.title_norm || ' ' || lower(s.subtitle) || ' ' || lower(s.body)) >= ${wordThreshold}
        OR s.title ILIKE ${like}
        OR s.subtitle ILIKE ${like}
        OR s.body ILIKE ${like}
      )`
    : sql``;

  const whereExtra = conditions.length > 0 ? sql` AND ${sql.join(conditions, sql` AND `)}` : sql``;

  const rows = await db.execute<RawHit>(sql`
    WITH matched AS (
      SELECT
        s.*,
        CASE WHEN ${tsq} = '' THEN 0
             ELSE ts_rank_cd(s.tsv, to_tsquery('simple', ${tsq})) END AS rank,
        CASE WHEN ${parsed.normalized} = '' THEN 0
             ELSE GREATEST(
               similarity(s.title_norm, ${parsed.normalized}),
               word_similarity(${parsed.normalized}, s.title_norm || ' ' || lower(s.subtitle) || ' ' || lower(s.body))
             ) END AS sim,
        (s.title_norm = ${parsed.normalized}) AS exact,
        (${parsed.normalized} <> '' AND s.title_norm LIKE ${`${parsed.normalized}%`}) AS prefix
      FROM search_index s
      WHERE 1 = 1 ${matchClause} ${whereExtra}
    ), counted AS (
      SELECT *, count(*) OVER ()::text AS total FROM matched
    )
    SELECT * FROM counted
    ORDER BY
      (rank * 4 + sim * 3 + (CASE WHEN exact THEN 5 ELSE 0 END)
        + (CASE WHEN prefix THEN 1.5 ELSE 0 END) + boost * 2) DESC,
      boost DESC,
      title ASC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const hits: SearchHit[] = rows.rows.map((item) => ({
    id: item.id,
    kind: item.kind,
    refId: item.ref_id,
    href: item.href,
    title: item.title,
    subtitle: item.subtitle,
    jlpt: item.jlpt,
    pos: item.pos,
    difficulty: item.difficulty,
    rank: Number(item.rank ?? 0),
    similarity: Number(item.sim ?? 0),
    exact: Boolean(item.exact),
    score: combineScore({
      rank: Number(item.rank ?? 0),
      similarity: Number(item.sim ?? 0),
      exact: Boolean(item.exact),
      prefix: Boolean(item.prefix),
      boost: Number(item.boost ?? 0),
    }),
  }));

  const total = Number(rows.rows[0]?.total ?? 0);
  const facets = await facetCounts(parsed, tsq, threshold, wordThreshold, like);
  const suggestion = total === 0 && parsed.text ? await suggest(parsed.text) : null;
  const tookMs = Date.now() - started;

  if (options.log !== false && parsed.text) {
    try {
      await db.insert(searchQueries).values({
        id: uid("sq"),
        query: parsed.raw.slice(0, 200),
        normalized: parsed.normalized.slice(0, 200),
        hits: total,
        tookMs,
        filters: JSON.stringify(parsed.filters).slice(0, 400),
      });
    } catch {
      // Analytics must never break a search response.
    }
  }

  return {
    query: parsed.raw,
    parsed,
    total,
    tookMs,
    hits,
    facets,
    suggestion,
    didYouMean: total === 0 && Boolean(suggestion),
  };
}

async function facetCounts(
  parsed: ParsedQuery,
  tsq: string,
  threshold: number,
  wordThreshold: number,
  like: string,
) {
  const matchClause = parsed.text
    ? sql`AND (
        (${tsq} <> '' AND s.tsv @@ to_tsquery('simple', ${tsq}))
        OR similarity(s.title_norm, ${parsed.normalized}) >= ${threshold}
        OR word_similarity(${parsed.normalized}, s.title_norm || ' ' || lower(s.subtitle) || ' ' || lower(s.body)) >= ${wordThreshold}
        OR s.title ILIKE ${like}
        OR s.subtitle ILIKE ${like}
        OR s.body ILIKE ${like}
      )`
    : sql``;

  const rows = await db.execute<{ facet: string; value: string; n: string }>(sql`
    SELECT 'kind' AS facet, s.kind AS value, count(*)::text AS n
    FROM search_index s WHERE 1 = 1 ${matchClause} GROUP BY s.kind
    UNION ALL
    SELECT 'jlpt' AS facet, coalesce(s.jlpt, 'none') AS value, count(*)::text AS n
    FROM search_index s WHERE 1 = 1 ${matchClause} GROUP BY coalesce(s.jlpt, 'none')
  `);

  const kind: Record<string, number> = {};
  const jlpt: Record<string, number> = {};
  for (const item of rows.rows) {
    if (item.facet === "kind") kind[item.value] = Number(item.n);
    else jlpt[item.value] = Number(item.n);
  }
  return { kind, jlpt };
}

/** Prefix + trigram autocomplete for the search box. */
export async function autocomplete(input: string, limit = 8) {
  const parsed = parseQuery(input);
  if (!parsed.text) return [] as { title: string; kind: string; href: string; subtitle: string }[];
  const prefixTs = toTsQuery(parsed.text, { prefix: true });
  const rows = await db.execute<{
    title: string;
    kind: string;
    href: string;
    subtitle: string;
  }>(sql`
    SELECT s.title, s.kind, s.href, s.subtitle
    FROM search_index s
    WHERE s.title_norm LIKE ${`${parsed.normalized}%`}
       OR s.title ILIKE ${`${parsed.text}%`}
       OR (${prefixTs} <> '' AND s.tsv @@ to_tsquery('simple', ${prefixTs}))
       OR similarity(s.title_norm, ${parsed.normalized}) >= ${similarityThreshold(parsed.text)}
    ORDER BY
      (CASE WHEN s.title_norm LIKE ${`${parsed.normalized}%`} THEN 1 ELSE 0 END) DESC,
      similarity(s.title_norm, ${parsed.normalized}) DESC,
      s.boost DESC
    LIMIT ${Math.min(Math.max(limit, 1), 20)}
  `);
  return rows.rows;
}

/** "Did you mean" — trigram nearest neighbour over indexed titles and gloss words. */
export async function suggest(input: string) {
  const normalized = normalizeQuery(input);
  if (!normalized) return null;
  const rows = await db.execute<{ title: string; sim: number }>(sql`
    SELECT t.display AS title, similarity(t.term, ${normalized}) AS sim
    FROM search_terms t
    WHERE similarity(t.term, ${normalized}) > 0.25
    UNION ALL
    SELECT s.title, similarity(s.title_norm, ${normalized}) AS sim
    FROM search_index s
    WHERE similarity(s.title_norm, ${normalized}) > 0.25
    ORDER BY sim DESC
    LIMIT 5
  `);
  return bestSuggestion(
    input,
    rows.rows.map((row) => ({ title: row.title, similarity: Number(row.sim) })),
    0.2,
  );
}

export async function popularQueries(limit = 10) {
  const rows = await db.execute<{ normalized: string; n: string; avg_hits: string }>(sql`
    SELECT normalized, count(*)::text AS n, round(avg(hits))::text AS avg_hits
    FROM search_queries
    WHERE normalized <> ''
    GROUP BY normalized
    ORDER BY count(*) DESC
    LIMIT ${limit}
  `);
  return rows.rows.map((row) => ({
    query: row.normalized,
    count: Number(row.n),
    avgHits: Number(row.avg_hits ?? 0),
  }));
}

export async function zeroResultQueries(limit = 10) {
  const rows = await db.execute<{ normalized: string; n: string }>(sql`
    SELECT normalized, count(*)::text AS n
    FROM search_queries
    WHERE hits = 0 AND normalized <> ''
    GROUP BY normalized
    ORDER BY count(*) DESC
    LIMIT ${limit}
  `);
  return rows.rows.map((row) => ({ query: row.normalized, count: Number(row.n) }));
}
