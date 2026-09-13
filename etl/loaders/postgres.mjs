import pg from "pg";

/** Hosted Postgres (Supabase / Neon / RDS) requires TLS; localhost does not. */
export function sslConfig(url) {
  if (/[?&]sslmode=disable/.test(url)) return undefined;
  const isLocal = /@(localhost|127\.0\.0\.1|::1)(:|\/|$)/.test(url);
  if (isLocal && !/[?&]sslmode=/.test(url)) return undefined;
  return { rejectUnauthorized: false };
}

/** Opens a single client used for the whole ETL run. */
export async function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required to run the ETL pipeline");
  const client = new pg.Client({ connectionString: url, ssl: sslConfig(url) });
  await client.connect();
  return client;
}

/** Chunked multi-row INSERT with optional ON CONFLICT clause. */
export async function insertBatch(client, table, columns, rows, options = {}) {
  const { conflict = null, update = null, chunkSize = 500 } = options;
  if (rows.length === 0) return 0;

  let written = 0;
  for (let start = 0; start < rows.length; start += chunkSize) {
    const slice = rows.slice(start, start + chunkSize);
    const values = [];
    const placeholders = [];
    let index = 0;
    for (const row of slice) {
      const rowPlaceholders = [];
      for (const column of columns) {
        values.push(row[column] ?? null);
        rowPlaceholders.push(`$${++index}`);
      }
      placeholders.push(`(${rowPlaceholders.join(", ")})`);
    }
    const columnList = columns.map((column) => `"${column}"`).join(", ");
    let sql = `INSERT INTO ${table} (${columnList}) VALUES ${placeholders.join(", ")}`;
    if (conflict) {
      sql += update
        ? ` ON CONFLICT (${conflict}) DO UPDATE SET ${update}`
        : ` ON CONFLICT (${conflict}) DO NOTHING`;
    }
    await client.query(sql, values);
    written += slice.length;
  }
  return written;
}

/** Registers (and refreshes) an upstream dataset; returns code -> id map. */
export async function upsertSources(client, sources) {
  const ids = new Map();
  for (const source of sources) {
    const result = await client.query(
      `INSERT INTO sources (code, name, version, license, license_url, source_url, retrieved_at, checksum, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, now(), $7, $8)
       ON CONFLICT (code, version) DO UPDATE SET
         name = EXCLUDED.name,
         license = EXCLUDED.license,
         license_url = EXCLUDED.license_url,
         source_url = EXCLUDED.source_url,
         retrieved_at = now(),
         checksum = EXCLUDED.checksum,
         metadata = EXCLUDED.metadata
       RETURNING id`,
      [
        source.code,
        source.name,
        source.version,
        source.license,
        source.licenseUrl,
        source.sourceUrl,
        source.checksum,
        JSON.stringify({ file: source.file, encoding: source.encoding ?? "utf-8" }),
      ],
    );
    ids.set(source.code, result.rows[0].id);
  }
  return ids;
}

export async function startRun(client, pipeline, metadata = {}) {
  const result = await client.query(
    `INSERT INTO etl_runs (pipeline, status, started_at, metadata) VALUES ($1, 'running', now(), $2) RETURNING id`,
    [pipeline, JSON.stringify(metadata)],
  );
  return result.rows[0].id;
}

export async function finishRun(client, runId, status, stats = {}) {
  await client.query(
    `UPDATE etl_runs
        SET status = $2, finished_at = now(), records_read = $3, records_written = $4, message = $5
      WHERE id = $1`,
    [runId, status, stats.recordsRead ?? 0, stats.recordsWritten ?? 0, stats.message ?? null],
  );
}

export async function fetchIdMap(client, table, keyColumn, idColumn = "id") {
  const result = await client.query(`SELECT ${idColumn}, ${keyColumn} FROM ${table}`);
  const map = new Map();
  for (const row of result.rows) map.set(row[keyColumn], row[idColumn]);
  return map;
}
