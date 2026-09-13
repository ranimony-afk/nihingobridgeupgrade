/**
 * Provenance bookkeeping for ETL import stages.
 *
 * Every importer should wrap its work in `startImportRun` / `finishImportRun`
 * so that the `etl_runs` table (visible at `/admin` and
 * `GET /api/admin/etl/status`) records what ran, when, and how much it wrote.
 *
 * The module is dependency-light on purpose: it talks to PostgreSQL through
 * `pg` directly so it can run under plain `node` (or `tsx`) outside Next.js.
 */
import { Client } from "pg";

export interface ImportRunOptions {
  /** Pipeline / importer name, e.g. `kangxi-radicals` */
  pipeline?: string;
  /** Source dataset code recorded in `sources`, e.g. `radkfile` */
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface ImportRun {
  id: number;
  pipeline: string;
  source: string;
  startedAt: Date;
}

export interface ImportRunResult {
  recordsRead?: number;
  recordsWritten?: number;
  message?: string;
  metadata?: Record<string, unknown>;
}

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required to record ETL import runs");
  }
  return url;
}

/** Hosted Postgres (Supabase / Neon / RDS) requires TLS. */
function sslConfig(url: string) {
  if (/[?&]sslmode=disable/.test(url)) return undefined;
  const isLocal = /@(localhost|127\.0\.0\.1)(:|\/|$)/.test(url);
  if (isLocal && !/[?&]sslmode=/.test(url)) return undefined;
  return { rejectUnauthorized: false } as const;
}

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const url = connectionString();
  const client = new Client({ connectionString: url, ssl: sslConfig(url) });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/**
 * Starts a run. Accepts either a pipeline name or an options object so
 * existing importers (`startImportRun("kanji")`) keep working.
 */
export async function startImportRun(
  input: string | ImportRunOptions = {},
  maybeOptions: ImportRunOptions = {},
): Promise<ImportRun> {
  const options: ImportRunOptions = typeof input === "string" ? { pipeline: input, ...maybeOptions } : input;
  const pipeline = options.pipeline ?? options.source ?? "unknown-importer";
  const source = options.source ?? pipeline;

  return withClient(async (client) => {
    const result = await client.query<{ id: number; started_at: Date }>(
      `INSERT INTO etl_runs (pipeline, status, started_at, metadata)
       VALUES ($1, 'running', now(), $2)
       RETURNING id, started_at`,
      [pipeline, JSON.stringify({ source, ...(options.metadata ?? {}) })],
    );
    return {
      id: result.rows[0].id,
      pipeline,
      source,
      startedAt: result.rows[0].started_at,
    };
  });
}

/** Marks a run as finished (status is derived when an error is passed). */
export async function finishImportRun(
  run: ImportRun | number,
  result: ImportRunResult | Error = {},
): Promise<void> {
  const id = typeof run === "number" ? run : run.id;
  const isError = result instanceof Error;
  const stats: ImportRunResult = isError ? { message: result.message } : result;

  await withClient((client) =>
    client.query(
      `UPDATE etl_runs
          SET status = $2,
              finished_at = now(),
              records_read = $3,
              records_written = $4,
              message = $5
        WHERE id = $1`,
      [
        id,
        isError ? "failed" : "success",
        stats.recordsRead ?? 0,
        stats.recordsWritten ?? 0,
        stats.message ?? null,
      ],
    ),
  );
}

/** Convenience wrapper: runs `fn` and records success/failure automatically. */
export async function withImportRun<T>(
  options: string | ImportRunOptions,
  fn: (run: ImportRun) => Promise<T>,
): Promise<T> {
  const run = await startImportRun(options);
  try {
    const value = await fn(run);
    await finishImportRun(run, { message: `${run.pipeline} completed` });
    return value;
  } catch (error) {
    await finishImportRun(run, error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}
