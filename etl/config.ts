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

export type EtlConfig = {
  source: string;
  jmdictUrl: string;
  jmdictSha256: string | null;
  requireSourceChecksum: boolean;
  allowNetwork: boolean;
  fixturePath: string;
  batchSize: number;
  maxEntries: number;
  validationErrorSampleLimit: number;
  license: string;
  attribution: string;
  dryRun: boolean;
  httpTimeoutMs: number;
};

export function getEtlConfig(overrides: Partial<EtlConfig> = {}): EtlConfig {
  const base: EtlConfig = {
    source: "jmdict",
    jmdictUrl: envStr("JMDICT_URL", "https://www.edrdg.org/pub/Nihongo/JMdict_e.gz"),
    jmdictSha256: envSha256("JMDICT_SHA256"),
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
  };
  return { ...base, ...overrides };
}
