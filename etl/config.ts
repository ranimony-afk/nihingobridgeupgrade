/**
 * ETL configuration — environment driven, with safe defaults.
 * Mirrors the settings contract proven in the Repo B Python ETL so the two
 * remain conceptually portable (see reports/phase-04/ETL-ARCHITECTURE-COMPARISON.md).
 */

function envStr(key: string, fallback: string): string {
  const v = process.env[key];
  return v === undefined || v.trim() === "" ? fallback : v.trim();
}

function envInt(key: string, fallback: number, min: number, max: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) {
    throw new Error(`${key} must be an integer`);
  }
  if (n < min || n > max) {
    throw new Error(`${key} must be between ${min} and ${max}`);
  }
  return n;
}

function envBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

function envCsv(key: string): string[] {
  const raw = process.env[key];
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

const SHA256_RE = /^[0-9a-f]{64}$/;

function envSha256(key: string): string | null {
  const raw = process.env[key];
  if (!raw || raw.trim() === "") return null;
  const normalized = raw.trim().toLowerCase();
  if (!SHA256_RE.test(normalized)) {
    throw new Error(`${key} must be a 64-character hexadecimal SHA-256 digest`);
  }
  return normalized;
}

export type EnrichmentPolicyConfig = {
  /** Empty by default. URLs require documented licence + human source review. */
  approvedSupplementalSourceUrls: string[];
  /** Test-only. Never set this in a production environment. */
  allowFixtureProvenance: boolean;
};

export function getEnrichmentPolicyConfig(): EnrichmentPolicyConfig {
  return {
    approvedSupplementalSourceUrls: envCsv("ENRICHMENT_APPROVED_SOURCE_URLS"),
    allowFixtureProvenance: envBool("ETL_ALLOW_FIXTURE_PROVENANCE", false),
  };
}

function runtimeDefaults() {
  return {
    downloadRetries: envInt("ETL_DOWNLOAD_RETRIES", 3, 1, 8),
    downloadBackoffMs: envInt("ETL_DOWNLOAD_BACKOFF_MS", 500, 0, 30_000),
    resume: envBool("ETL_RESUME", true),
    // Deliberately not env-configurable. Tests inject it as an explicit
    // function override, so production deployments cannot crash themselves.
    failAfterCommittedBatches: null as number | null,
  };
}

export type EtlConfig = {
  source: string;
  /** Historical name retained for compatibility; URL of the current source. */
  jmdictUrl: string;
  /** Historical name retained for compatibility; trusted digest of the current source. */
  jmdictSha256: string | null;
  /** Distinct cache artifact name: prevents cross-pipeline source collisions. */
  downloadFilename: string;
  requireSourceChecksum: boolean;
  allowNetwork: boolean;
  fixturePath: string;
  batchSize: number;
  maxEntries: number;
  validationErrorSampleLimit: number;
  /** Bounded attempts for transient network source acquisition. */
  downloadRetries: number;
  /** Initial retry backoff; doubles each retry up to a hard cap. */
  downloadBackoffMs: number;
  /** Resume an incomplete run only when source checksum still matches. */
  resume: boolean;
  /** Test-only fault injection: throw after this many committed batches. */
  failAfterCommittedBatches: number | null;
  license: string;
  attribution: string;
  dryRun: boolean;
  httpTimeoutMs: number;
};

export type TatoebaConfig = EtlConfig & {
  /**
   * Comma-separated ISO 639-3 languages to ingest ("" = all).
   * Defaults to "jpn,eng": the English side must be ingested too, otherwise
   * every translation link dangles and sentences have no translation.
   */
  filterLang: string;
  /** Path to links.csv (translation pairs). Empty = skip link loading. */
  linksFixturePath: string;
  /** Reject jpn-tagged sentences that contain no Japanese script. */
  enforceScript: boolean;
};

export function getTatoebaConfig(
  overrides: Partial<TatoebaConfig> = {},
): TatoebaConfig {
  const base: TatoebaConfig = {
    source: "tatoeba",
    jmdictUrl: envStr(
      "TATOEBA_SENTENCES_URL",
      "https://downloads.tatoeba.org/exports/sentences_detailed.tar.bz2",
    ),
    jmdictSha256: envSha256("TATOEBA_SENTENCES_SHA256"),
    downloadFilename: "sentences_detailed.tar.bz2",
    requireSourceChecksum: envBool("REQUIRE_SOURCE_CHECKSUM", false),
    allowNetwork: envBool("ETL_ALLOW_NETWORK", false),
    fixturePath: envStr(
      "TATOEBA_FIXTURE_PATH",
      "etl/fixtures/tatoeba-sentences-sample.tsv",
    ),
    batchSize: envInt("BATCH_SIZE", 200, 1, 3000),
    maxEntries: envInt("ETL_MAX_ENTRIES", 1000, 1, 5_000_000),
    validationErrorSampleLimit: envInt("VALIDATION_ERROR_SAMPLE_LIMIT", 100, 1, 1000),
    // Verified: Tatoeba text is CC BY 2.0 FR and REQUIRES per-sentence
    // author attribution. See the Phase 04.4 verification report.
    license: envStr("TATOEBA_LICENSE", "CC BY 2.0 FR"),
    attribution: envStr(
      "TATOEBA_SOURCE_ATTRIBUTION",
      "Example sentences from Tatoeba (https://tatoeba.org), released under CC BY 2.0 FR. Individual sentences are attributed to their contributors.",
    ),
    dryRun: envBool("ETL_DRY_RUN", false),
    httpTimeoutMs: envInt("HTTP_TIMEOUT_MS", 120_000, 1000, 600_000),
    filterLang: envStr("TATOEBA_FILTER_LANG", "jpn,eng"),
    linksFixturePath: envStr(
      "TATOEBA_LINKS_FIXTURE_PATH",
      "etl/fixtures/tatoeba-links-sample.tsv",
    ),
    enforceScript: envBool("TATOEBA_ENFORCE_SCRIPT", true),
    ...runtimeDefaults(),
  };
  return { ...base, ...overrides };
}

export function getKradfileConfig(overrides: Partial<EtlConfig> = {}): EtlConfig {
  const base: EtlConfig = {
    source: "kradfile",
    // The production artifact is distributed in EDRDG's kradzip archive. The
    // fixture path is intentionally the default in this implementation phase.
    jmdictUrl: envStr("KRADFILE_URL", "https://ftp.edrdg.org/pub/Nihongo/kradzip.zip"),
    jmdictSha256: envSha256("KRADFILE_SHA256"),
    downloadFilename: "kradzip.zip",
    requireSourceChecksum: envBool("REQUIRE_SOURCE_CHECKSUM", false),
    allowNetwork: envBool("ETL_ALLOW_NETWORK", false),
    fixturePath: envStr("KRADFILE_FIXTURE_PATH", "etl/fixtures/kradfile-sample.txt"),
    batchSize: envInt("BATCH_SIZE", 200, 1, 3000),
    maxEntries: envInt("ETL_MAX_ENTRIES", 1000, 1, 5_000_000),
    validationErrorSampleLimit: envInt("VALIDATION_ERROR_SAMPLE_LIMIT", 100, 1, 1000),
    license: envStr("KRADFILE_LICENSE", "CC BY-SA 4.0"),
    attribution: envStr(
      "KRADFILE_SOURCE_ATTRIBUTION",
      "KRADFILE/RADKFILE — Electronic Dictionary Research and Development Group (EDRDG), CC BY-SA 4.0",
    ),
    dryRun: envBool("ETL_DRY_RUN", false),
    httpTimeoutMs: envInt("HTTP_TIMEOUT_MS", 120_000, 1000, 600_000),
    ...runtimeDefaults(),
  };
  return { ...base, ...overrides };
}

export function getKanjidicConfig(overrides: Partial<EtlConfig> = {}): EtlConfig {
  const base: EtlConfig = {
    source: "kanjidic2",
    jmdictUrl: envStr(
      "KANJIDIC2_URL",
      "http://www.edrdg.org/kanjidic/kanjidic2.xml.gz",
    ),
    jmdictSha256: envSha256("KANJIDIC2_SHA256"),
    downloadFilename: "kanjidic2.xml.gz",
    requireSourceChecksum: envBool("REQUIRE_SOURCE_CHECKSUM", false),
    allowNetwork: envBool("ETL_ALLOW_NETWORK", false),
    fixturePath: envStr("KANJIDIC2_FIXTURE_PATH", "etl/fixtures/kanjidic2-sample.xml"),
    batchSize: envInt("BATCH_SIZE", 200, 1, 3000),
    maxEntries: envInt("ETL_MAX_ENTRIES", 1000, 1, 5_000_000),
    validationErrorSampleLimit: envInt("VALIDATION_ERROR_SAMPLE_LIMIT", 100, 1, 1000),
    license: envStr("KANJIDIC2_LICENSE", "CC BY-SA 4.0"),
    attribution: envStr(
      "KANJIDIC2_SOURCE_ATTRIBUTION",
      "KANJIDIC2 — Electronic Dictionary Research and Development Group (EDRDG), CC BY-SA 4.0",
    ),
    dryRun: envBool("ETL_DRY_RUN", false),
    httpTimeoutMs: envInt("HTTP_TIMEOUT_MS", 120_000, 1000, 600_000),
    ...runtimeDefaults(),
  };
  return { ...base, ...overrides };
}

export function getEtlConfig(overrides: Partial<EtlConfig> = {}): EtlConfig {
  const base: EtlConfig = {
    source: "jmdict",
    jmdictUrl: envStr("JMDICT_URL", "https://www.edrdg.org/pub/Nihongo/JMdict_e.gz"),
    jmdictSha256: envSha256("JMDICT_SHA256"),
    downloadFilename: "JMdict_e.xml.gz",
    // When true, refuse to ingest unless a trusted digest is available.
    requireSourceChecksum: envBool("REQUIRE_SOURCE_CHECKSUM", false),
    // Network downloads are OFF by default: Phase 04.2 loads a fixture only.
    allowNetwork: envBool("ETL_ALLOW_NETWORK", false),
    fixturePath: envStr("JMDICT_FIXTURE_PATH", "etl/fixtures/jmdict-sample.xml"),
    batchSize: envInt("BATCH_SIZE", 200, 1, 3000),
    maxEntries: envInt("ETL_MAX_ENTRIES", 1000, 1, 5_000_000),
    validationErrorSampleLimit: envInt("VALIDATION_ERROR_SAMPLE_LIMIT", 100, 1, 1000),
    license: envStr("JMDICT_LICENSE", "CC BY-SA 4.0"),
    attribution: envStr(
      "JMDICT_SOURCE_ATTRIBUTION",
      "JMdict/EDICT — Electronic Dictionary Research and Development Group (EDRDG), CC BY-SA 4.0",
    ),
    dryRun: envBool("ETL_DRY_RUN", false),
    httpTimeoutMs: envInt("HTTP_TIMEOUT_MS", 120_000, 1000, 600_000),
    ...runtimeDefaults(),
  };
  return { ...base, ...overrides };
}
