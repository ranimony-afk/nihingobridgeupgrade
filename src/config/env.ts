/**
 * Typed environment validation — the single place the application reads
 * `process.env` (DOMAIN_OWNERSHIP: configuration is owned here).
 *
 * Design rules:
 *   - `parseEnvironment` is PURE: it takes a plain record and returns a
 *     result. No globals, no throwing, no I/O. That makes every rule testable.
 *   - Every problem is collected, so a misconfigured deploy sees the whole
 *     list at once instead of fixing one variable per attempt.
 *   - The platform must boot with ONLY `DATABASE_URL` set
 *     (ARCHITECTURE_FREEZE §13). Everything else degrades safely.
 *   - Two severities:
 *       errors   → fatal. Build/boot must stop.
 *       warnings → running in a reduced mode (AI mocked, uploads disabled).
 *   - Secrets are never logged. Only variable NAMES appear in messages.
 *
 * Import discipline: value imports inside src/config must stay relative so
 * that Node can execute this module directly (scripts, tests) without a
 * bundler resolving the `@/` alias.
 */

// ─────────────────────────────────────────────
// Public shapes
// ─────────────────────────────────────────────

export type NodeEnvName = "development" | "test" | "production";
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface AppConfig {
  name: string;
  nodeEnv: NodeEnvName;
  isProduction: boolean;
  /** Absolute public origin, e.g. https://nihongobridge.app. Null when unset. */
  url: string | null;
  logLevel: LogLevel;
}

export interface DatabaseConfig {
  /** PostgreSQL connection string. The only hard requirement. */
  url: string;
  poolMax: number;
  /** Enable TLS. Defaults on for non-local hosts. */
  ssl: boolean;
}

export interface AuthConfig {
  /**
   * Session signing secret. Optional in development (an ephemeral key is
   * used, so restarts invalidate sessions); REQUIRED in production.
   */
  sessionSecret: string | null;
  /** True when a durable secret is configured. */
  configured: boolean;
  cookieName: string;
  sessionTtlSeconds: number;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
}

export type AiProvider = "openai" | "anthropic" | "mock";

export interface AiConfig {
  /** False when no provider key is configured — the mock provider answers. */
  enabled: boolean;
  provider: AiProvider;
  openaiApiKey: string | null;
  anthropicApiKey: string | null;
  model: string | null;
  requestTimeoutMs: number;
  maxOutputTokens: number;
}

export type StorageDriver = "none" | "local" | "s3";

export interface StorageConfig {
  /** "none" disables uploads and generated audio persistence. */
  driver: StorageDriver;
  /** Filesystem directory when driver is "local". */
  localDir: string | null;
  bucket: string | null;
  region: string | null;
  /** Custom endpoint for S3-compatible services. */
  endpoint: string | null;
  accessKeyId: string | null;
  secretAccessKey: string | null;
  /** Public base URL for serving stored objects. */
  publicUrl: string | null;
}

/** Search is PostgreSQL-only in v1 (ARCHITECTURE_FREEZE §6). */
export type SearchDriver = "postgres";

export interface SearchConfig {
  driver: SearchDriver;
  /** pg_trgm similarity cut-off for fuzzy matching (0–1). */
  trigramThreshold: number;
  maxResults: number;
  /** Whether to attempt CREATE EXTENSION pg_trgm during migration. */
  autoCreateExtensions: boolean;
}

export interface AppEnvironment {
  app: AppConfig;
  database: DatabaseConfig;
  auth: AuthConfig;
  ai: AiConfig;
  storage: StorageConfig;
  search: SearchConfig;
}

export interface EnvIssue {
  /** Variable name, never its value. */
  key: string;
  message: string;
}

export interface EnvParseResult {
  ok: boolean;
  /** Present only when `ok` is true. */
  config: AppEnvironment | null;
  errors: EnvIssue[];
  warnings: EnvIssue[];
}

type Source = Record<string, string | undefined>;

// ─────────────────────────────────────────────
// Banned configuration
// ─────────────────────────────────────────────

/** Authentication bypasses from Repository B. Never honoured (DEC-0011). */
export const BANNED_ENV_KEYS: readonly string[] = [
  "ALLOW_INSECURE_USER_HEADER",
  "ADMIN_DEMO_MODE",
];

/** Excluded by the architecture freeze; ignored with a warning if present. */
export const EXCLUDED_ENV_PREFIXES: readonly string[] = ["SUPABASE_", "MEILISEARCH_"];

const MIN_SESSION_SECRET_LENGTH = 32;
const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

// ─────────────────────────────────────────────
// Primitive readers
// ─────────────────────────────────────────────

function readString(source: Source, key: string): string | null {
  const raw = source[key];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readInt(
  source: Source,
  key: string,
  fallback: number,
  bounds: { min: number; max: number },
  errors: EnvIssue[],
): number {
  const raw = readString(source, key);
  if (raw === null) return fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    errors.push({ key, message: `${key} must be an integer` });
    return fallback;
  }
  if (parsed < bounds.min || parsed > bounds.max) {
    errors.push({
      key,
      message: `${key} must be between ${bounds.min} and ${bounds.max}`,
    });
    return fallback;
  }
  return parsed;
}

function readNumber(
  source: Source,
  key: string,
  fallback: number,
  bounds: { min: number; max: number },
  errors: EnvIssue[],
): number {
  const raw = readString(source, key);
  if (raw === null) return fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    errors.push({ key, message: `${key} must be a number` });
    return fallback;
  }
  if (parsed < bounds.min || parsed > bounds.max) {
    errors.push({
      key,
      message: `${key} must be between ${bounds.min} and ${bounds.max}`,
    });
    return fallback;
  }
  return parsed;
}

function readBool(
  source: Source,
  key: string,
  fallback: boolean,
  errors: EnvIssue[],
): boolean {
  const raw = readString(source, key);
  if (raw === null) return fallback;

  const normalized = raw.toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;

  errors.push({ key, message: `${key} must be a boolean (true/false)` });
  return fallback;
}

function readEnum<T extends string>(
  source: Source,
  key: string,
  allowed: readonly T[],
  fallback: T,
  errors: EnvIssue[],
): T {
  const raw = readString(source, key);
  if (raw === null) return fallback;

  const match = allowed.find((value) => value === raw.toLowerCase());
  if (!match) {
    errors.push({ key, message: `${key} must be one of: ${allowed.join(", ")}` });
    return fallback;
  }
  return match;
}

function readUrl(source: Source, key: string, errors: EnvIssue[]): string | null {
  const raw = readString(source, key);
  if (raw === null) return null;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      errors.push({ key, message: `${key} must use http:// or https://` });
      return null;
    }
    // Normalise away a trailing slash so callers can concatenate safely.
    return raw.replace(/\/+$/, "");
  } catch {
    errors.push({ key, message: `${key} must be a valid absolute URL` });
    return null;
  }
}

function isLocalHost(connectionString: string): boolean {
  return /@(localhost|127\.0\.0\.1|::1|host\.docker\.internal)[:/]/i.test(connectionString);
}

// ─────────────────────────────────────────────
// Section parsers
// ─────────────────────────────────────────────

function parseApp(source: Source, errors: EnvIssue[]): AppConfig {
  const rawNodeEnv = readString(source, "NODE_ENV");
  const nodeEnv: NodeEnvName =
    rawNodeEnv === "production" || rawNodeEnv === "test" ? rawNodeEnv : "development";

  return {
    name: readString(source, "APP_NAME") ?? "NihongoBridge",
    nodeEnv,
    isProduction: nodeEnv === "production",
    url: readUrl(source, "NEXT_PUBLIC_APP_URL", errors),
    logLevel: readEnum(source, "LOG_LEVEL", LOG_LEVELS, "info", errors),
  };
}

function parseDatabase(
  source: Source,
  errors: EnvIssue[],
): DatabaseConfig | null {
  const url = readString(source, "DATABASE_URL");

  // Tuning options are validated unconditionally: an operator fixing a
  // missing URL should see every other database problem in the same pass,
  // not discover them one build at a time.
  const poolMax = readInt(source, "DATABASE_POOL_MAX", 10, { min: 1, max: 100 }, errors);
  const ssl = readBool(source, "DATABASE_SSL", url !== null && !isLocalHost(url), errors);

  if (url === null) {
    errors.push({
      key: "DATABASE_URL",
      message:
        "DATABASE_URL is required. Copy .env.example to .env and set a PostgreSQL connection string.",
    });
    return null;
  }

  if (!/^postgres(ql)?:\/\//i.test(url)) {
    errors.push({
      key: "DATABASE_URL",
      message: "DATABASE_URL must be a postgresql:// connection string",
    });
    return null;
  }

  return { url, poolMax, ssl };
}

function parseAuth(source: Source, errors: EnvIssue[], warnings: EnvIssue[], isProduction: boolean): AuthConfig {
  const secret = readString(source, "AUTH_SESSION_SECRET");

  if (secret === null) {
    // Not fatal at build time: the freeze requires the platform to run with
    // only DATABASE_URL. Enforced at runtime by assertRuntimeReady().
    warnings.push({
      key: "AUTH_SESSION_SECRET",
      message: isProduction
        ? "AUTH_SESSION_SECRET is not set. The server will refuse to start in production."
        : "AUTH_SESSION_SECRET is not set. A temporary key is used; sessions end on restart.",
    });
  } else if (secret.length < MIN_SESSION_SECRET_LENGTH) {
    errors.push({
      key: "AUTH_SESSION_SECRET",
      message: `AUTH_SESSION_SECRET must be at least ${MIN_SESSION_SECRET_LENGTH} characters`,
    });
  }

  return {
    sessionSecret: secret,
    configured: secret !== null && secret.length >= MIN_SESSION_SECRET_LENGTH,
    cookieName: readString(source, "AUTH_COOKIE_NAME") ?? "nb_session",
    sessionTtlSeconds: readInt(
      source,
      "AUTH_SESSION_TTL_SECONDS",
      60 * 60 * 24 * 30,
      { min: 300, max: 60 * 60 * 24 * 365 },
      errors,
    ),
    accessTokenTtlSeconds: readInt(
      source,
      "AUTH_ACCESS_TOKEN_TTL_SECONDS",
      60 * 15,
      { min: 60, max: 60 * 60 * 24 },
      errors,
    ),
    refreshTokenTtlSeconds: readInt(
      source,
      "AUTH_REFRESH_TOKEN_TTL_SECONDS",
      60 * 60 * 24 * 60,
      { min: 3600, max: 60 * 60 * 24 * 365 },
      errors,
    ),
  };
}

function parseAi(source: Source, errors: EnvIssue[], warnings: EnvIssue[]): AiConfig {
  const openaiApiKey = readString(source, "OPENAI_API_KEY");
  const anthropicApiKey = readString(source, "ANTHROPIC_API_KEY");
  const requested = readEnum(
    source,
    "AI_PROVIDER",
    ["auto", "openai", "anthropic", "mock"] as const,
    "auto",
    errors,
  );

  let provider: AiProvider;
  if (requested === "mock") {
    provider = "mock";
  } else if (requested === "openai") {
    if (!openaiApiKey) {
      errors.push({
        key: "OPENAI_API_KEY",
        message: 'AI_PROVIDER="openai" requires OPENAI_API_KEY',
      });
    }
    provider = openaiApiKey ? "openai" : "mock";
  } else if (requested === "anthropic") {
    if (!anthropicApiKey) {
      errors.push({
        key: "ANTHROPIC_API_KEY",
        message: 'AI_PROVIDER="anthropic" requires ANTHROPIC_API_KEY',
      });
    }
    provider = anthropicApiKey ? "anthropic" : "mock";
  } else if (openaiApiKey) {
    provider = "openai";
  } else if (anthropicApiKey) {
    provider = "anthropic";
  } else {
    provider = "mock";
    warnings.push({
      key: "OPENAI_API_KEY",
      message:
        "No AI provider key configured. The tutor uses the deterministic mock provider.",
    });
  }

  return {
    enabled: provider !== "mock",
    provider,
    openaiApiKey,
    anthropicApiKey,
    model: readString(source, "AI_MODEL"),
    requestTimeoutMs: readInt(
      source,
      "AI_REQUEST_TIMEOUT_MS",
      30_000,
      { min: 1_000, max: 120_000 },
      errors,
    ),
    maxOutputTokens: readInt(
      source,
      "AI_MAX_OUTPUT_TOKENS",
      1_024,
      { min: 64, max: 8_192 },
      errors,
    ),
  };
}

function parseStorage(source: Source, errors: EnvIssue[]): StorageConfig {
  const driver = readEnum(
    source,
    "STORAGE_DRIVER",
    ["none", "local", "s3"] as const,
    "none",
    errors,
  );

  const bucket = readString(source, "STORAGE_BUCKET");
  const region = readString(source, "STORAGE_REGION");
  const accessKeyId = readString(source, "STORAGE_ACCESS_KEY_ID");
  const secretAccessKey = readString(source, "STORAGE_SECRET_ACCESS_KEY");
  const localDir = readString(source, "STORAGE_LOCAL_DIR") ?? (driver === "local" ? "./.storage" : null);

  // Only demand credentials for the driver actually selected.
  if (driver === "s3") {
    const missing: string[] = [];
    if (!bucket) missing.push("STORAGE_BUCKET");
    if (!region) missing.push("STORAGE_REGION");
    if (!accessKeyId) missing.push("STORAGE_ACCESS_KEY_ID");
    if (!secretAccessKey) missing.push("STORAGE_SECRET_ACCESS_KEY");
    for (const key of missing) {
      errors.push({ key, message: `${key} is required when STORAGE_DRIVER="s3"` });
    }
  }

  return {
    driver,
    localDir,
    bucket,
    region,
    endpoint: readUrl(source, "STORAGE_ENDPOINT", errors),
    accessKeyId,
    secretAccessKey,
    publicUrl: readUrl(source, "STORAGE_PUBLIC_URL", errors),
  };
}

function parseSearch(source: Source, errors: EnvIssue[]): SearchConfig {
  return {
    driver: "postgres",
    trigramThreshold: readNumber(
      source,
      "SEARCH_TRIGRAM_THRESHOLD",
      0.3,
      { min: 0.05, max: 1 },
      errors,
    ),
    maxResults: readInt(source, "SEARCH_MAX_RESULTS", 100, { min: 1, max: 1_000 }, errors),
    autoCreateExtensions: readBool(source, "SEARCH_AUTO_CREATE_EXTENSIONS", true, errors),
  };
}

function checkBannedKeys(source: Source, errors: EnvIssue[], warnings: EnvIssue[]): void {
  for (const key of BANNED_ENV_KEYS) {
    if (readString(source, key) !== null) {
      errors.push({
        key,
        message: `${key} is an authentication bypass and is not supported. Remove it.`,
      });
    }
  }

  for (const key of Object.keys(source)) {
    const prefix = EXCLUDED_ENV_PREFIXES.find((candidate) => key.startsWith(candidate));
    if (prefix && readString(source, key) !== null) {
      warnings.push({
        key,
        message: `${key} is ignored. ${prefix}* is excluded by the architecture freeze.`,
      });
    }
  }
}

// ─────────────────────────────────────────────
// Entry points
// ─────────────────────────────────────────────

/**
 * Validate a raw environment record. Pure — safe to call in tests with a
 * literal object. Collects every problem rather than failing fast.
 */
export function parseEnvironment(source: Source): EnvParseResult {
  const errors: EnvIssue[] = [];
  const warnings: EnvIssue[] = [];

  checkBannedKeys(source, errors, warnings);

  const app = parseApp(source, errors);
  const database = parseDatabase(source, errors);
  const auth = parseAuth(source, errors, warnings, app.isProduction);
  const ai = parseAi(source, errors, warnings);
  const storage = parseStorage(source, errors);
  const search = parseSearch(source, errors);

  if (errors.length > 0 || database === null) {
    return { ok: false, config: null, errors, warnings };
  }

  return {
    ok: true,
    config: { app, database, auth, ai, storage, search },
    errors,
    warnings,
  };
}

/** Render issues as an operator-readable, copy-pasteable block. */
export function formatIssues(title: string, issues: EnvIssue[]): string {
  if (issues.length === 0) return "";
  const lines = issues.map((issue) => `  - ${issue.key}: ${issue.message}`);
  return `${title}\n${lines.join("\n")}`;
}

let cached: AppEnvironment | null = null;

/**
 * Validated configuration for server code. Throws a clear, aggregated error
 * when the environment is unusable. Server-only — never import from a client
 * component.
 */
export function serverEnv(): AppEnvironment {
  if (cached) return cached;

  const result = parseEnvironment(process.env as Source);
  if (!result.ok || !result.config) {
    throw new Error(
      `Invalid environment configuration.\n${formatIssues("Errors:", result.errors)}\n` +
        `See .env.example for the full list of supported variables.`,
    );
  }

  cached = result.config;
  return cached;
}

/**
 * Extra guarantees required to serve production traffic, beyond what is
 * needed to build. Call this from server start-up.
 */
export function assertRuntimeReady(config: AppEnvironment): void {
  if (!config.app.isProduction) return;

  const missing: string[] = [];
  if (!config.auth.configured) missing.push("AUTH_SESSION_SECRET");

  if (missing.length > 0) {
    throw new Error(
      `Cannot start in production. Missing required configuration: ${missing.join(", ")}. ` +
        `See .env.example.`,
    );
  }
}

/** Test seam — clears the memoised configuration. */
export function resetEnvCache(): void {
  cached = null;
}
