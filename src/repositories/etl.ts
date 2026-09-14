import "server-only";

import { sql } from "drizzle-orm";

import { getDb } from "@/db";

type Row = Record<string, unknown>;

function toRows<T extends Row>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] })?.rows ?? []) as T[];
}

const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Read-only ETL control surface: sources, recent runs and graph size. */
export async function getEtlStatus() {
  const empty = {
    runs: [],
    stats: {
      kanji: 0,
      radicals: 0,
      components: 0,
      componentLinks: 0,
      radicalLinks: 0,
      vocabulary: 0,
      vocabularyLinks: 0,
    },
    sources: [],
  } as const;

  let runs: unknown;
  let stats: unknown;
  let sources: unknown;
  try {
    [runs, stats, sources] = await Promise.all([
    getDb().execute(sql`
      SELECT id, pipeline, status, started_at, finished_at, records_read, records_written, message
      FROM etl_runs
      ORDER BY started_at DESC
      LIMIT 10
    `),
    getDb().execute(sql`
      SELECT
        (SELECT count(*)::int FROM kanji) AS kanji,
        (SELECT count(*)::int FROM radicals) AS radicals,
        (SELECT count(*)::int FROM components) AS components,
        (SELECT count(*)::int FROM kanji_components) AS component_links,
        (SELECT count(*)::int FROM kanji_radicals) AS radical_links,
        (SELECT count(*)::int FROM vocabulary) AS vocabulary,
        (SELECT count(*)::int FROM kanji_vocabulary) AS vocabulary_links
    `),
    getDb().execute(sql`
      SELECT code, name, version, license, source_url, retrieved_at, checksum
      FROM sources ORDER BY code
    `),
]);
  } catch {
    return {
      runs: [],
      stats: { ...empty.stats },
      sources: [],
    };
  }

  const statRow = toRows<Row>(stats)[0] ?? {};

  return {
    runs: toRows<Row>(runs).map((row) => ({
      id: num(row.id),
      pipeline: String(row.pipeline ?? ""),
      status: String(row.status ?? ""),
      startedAt: row.started_at ? String(row.started_at) : null,
      finishedAt: row.finished_at ? String(row.finished_at) : null,
      recordsRead: num(row.records_read),
      recordsWritten: num(row.records_written),
      message: row.message ? String(row.message) : null,
    })),
    stats: {
      kanji: num(statRow.kanji),
      radicals: num(statRow.radicals),
      components: num(statRow.components),
      componentLinks: num(statRow.component_links),
      radicalLinks: num(statRow.radical_links),
      vocabulary: num(statRow.vocabulary),
      vocabularyLinks: num(statRow.vocabulary_links),
    },
    sources: toRows<Row>(sources).map((row) => ({
      code: String(row.code ?? ""),
      name: String(row.name ?? ""),
      version: row.version ? String(row.version) : null,
      license: String(row.license ?? ""),
      sourceUrl: row.source_url ? String(row.source_url) : null,
      retrievedAt: row.retrieved_at ? String(row.retrieved_at) : null,
      checksum: row.checksum ? String(row.checksum).slice(0, 12) : null,
    })),
  };
}
