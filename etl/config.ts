/**
 * ETL configuration — environment-backed settings.
 * Mirrors Repo B's etl/config.py structure, adapted for Node.js.
 */

import path from "node:path";

export interface EtlConfig {
  /** PostgreSQL connection string */
  databaseUrl: string;

  /** Paths */
  dataDir: string;
  checkpointDir: string;
  reportDir: string;

  /** HTTP download settings */
  httpTimeoutMs: number;
  downloadRetries: number;
  downloadBackoffMs: number;
  userAgent: string;

  /** JMdict settings */
  jmdictUrl: string;
  jmdictFilename: string;
  batchSize: number;
  checkpointEveryBatches: number;

  /** KANJIDIC2 settings */
  kanjidic2Url: string;
  kanjidic2Filename: string;

  /** Tatoeba settings */
  tatoebaBaseUrl: string;

  /** Validation */
  validationErrorSampleLimit: number;

  /** Provenance */
  pipelineVersion: string;
}

export function loadConfig(): EtlConfig {
  const root = path.resolve(import.meta.dirname ?? __dirname, "..");

  return {
    databaseUrl:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:5432/app_db",

    dataDir: process.env.ETL_DATA_DIR ?? path.join(root, "etl", "data"),
    checkpointDir:
      process.env.ETL_CHECKPOINT_DIR ?? path.join(root, "etl", ".checkpoints"),
    reportDir: process.env.ETL_REPORT_DIR ?? path.join(root, "etl", "reports"),

    httpTimeoutMs: Number(process.env.ETL_HTTP_TIMEOUT_MS ?? 120_000),
    downloadRetries: Number(process.env.ETL_DOWNLOAD_RETRIES ?? 4),
    downloadBackoffMs: Number(process.env.ETL_DOWNLOAD_BACKOFF_MS ?? 1_000),
    userAgent: process.env.ETL_USER_AGENT ?? "NihongoBridge-ETL/1.0",

    jmdictUrl:
      process.env.ETL_JMDICT_URL ??
      "https://www.edrdg.org/pub/Nihongo/JMdict_e.gz",
    jmdictFilename: "JMdict_e.xml.gz",
    batchSize: Number(process.env.ETL_BATCH_SIZE ?? 750),
    checkpointEveryBatches: Number(
      process.env.ETL_CHECKPOINT_EVERY_BATCHES ?? 1,
    ),

    kanjidic2Url:
      process.env.ETL_KANJIDIC2_URL ??
      "https://www.edrdg.org/kanjidic/kanjidic2.xml.gz",
    kanjidic2Filename: "kanjidic2.xml.gz",

    tatoebaBaseUrl:
      process.env.ETL_TATOEBA_BASE_URL ??
      "https://downloads.tatoeba.org/exports",

    validationErrorSampleLimit: Number(
      process.env.ETL_VALIDATION_ERROR_SAMPLE_LIMIT ?? 100,
    ),

    pipelineVersion: process.env.ETL_PIPELINE_VERSION ?? "1.0.0",
  };
}
