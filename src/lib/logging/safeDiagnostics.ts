/**
 * Database-safe server diagnostics — Phase 22A.
 *
 * A caught database error must not be logged as an object. Drizzle/pg errors
 * carry the failing SQL, its bound parameters, the connection target, and a
 * `cause` chain of driver errors; `console.error(msg, error)` serializes all
 * of it into the server log.
 *
 * This module replaces that pattern with a closed-vocabulary diagnostic: the
 * caller supplies a stable operation identifier, and the thrown value is
 * reduced to one allowlisted category. Nothing derived from the exception's
 * text — message, name, stack, properties — is ever emitted.
 *
 * Deliberately NOT a logging framework:
 * - no levels beyond error/warn, no transports, no configuration;
 * - no dependency on `process.env` or `console` internals;
 * - no correlation IDs (the application has no trusted request id source yet).
 *
 * Total and non-throwing by construction: classification is wrapped so a
 * hostile throw value (a Proxy with a throwing `get`, a poisoned getter) can
 * never mask the original failure or crash the logging call itself.
 */

/** Closed set of operations permitted to emit a diagnostic. */
export type DiagnosticOperation =
  | "TestService.ensureSeeded"
  | "TestService.updateUserAnalytics"
  | "XpService.getSummary"
  | "AnalyticsService.getUserProgressSummary"
  | "XpService.award"
  | "XpService.revokeByDedupeKey"
  | "XpService.awardSafe"
  | "AnalyticsService.trackStudyEvent";

/**
 * Closed set of failure categories. Deliberately coarse: enough to triage
 * "database unreachable" vs "database rejected the statement" vs "unknown",
 * which is what an operator can act on, and no more.
 */
export type FailureCategory =
  | "database_unavailable"
  | "database_statement_rejected"
  | "unknown_failure";

/** Node/libpq-style connection failure codes. */
const UNAVAILABLE_CODES: ReadonlySet<string> = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
]);

/**
 * SQLSTATE classes that mean "the server answered and refused the statement":
 * 08 connection exception, 22 data exception, 23 integrity constraint,
 * 28 invalid authorization, 42 syntax/access rule.
 */
const SQLSTATE_REJECTED_CLASSES: ReadonlySet<string> = new Set([
  "08",
  "22",
  "23",
  "28",
  "42",
]);

/** SQLSTATE is exactly five alphanumerics (e.g. 23505, 42P01, 28P01). */
const SQLSTATE_SHAPE = /^[0-9A-Z]{5}$/;

/** Driver error codes accepted for classification. */
const MAX_CODE_LENGTH = 16;

/** Drizzle wraps driver errors; walk a bounded `cause` chain. */
const MAX_CAUSE_DEPTH = 3;

/**
 * Read `code` from a value without trusting it: guarded against throwing
 * getters/proxies, non-strings, and absurd lengths.
 */
function readCode(value: unknown): string | undefined {
  try {
    if (typeof value !== "object" || value === null) return undefined;
    const code = (value as { code?: unknown }).code;
    if (typeof code !== "string") return undefined;
    if (code.length === 0 || code.length > MAX_CODE_LENGTH) return undefined;
    return code;
  } catch {
    return undefined;
  }
}

/** Collect codes along the bounded `cause` chain, outermost first. */
function collectCodes(thrown: unknown): string[] {
  const codes: string[] = [];
  let current: unknown = thrown;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== "object" || current === null) break;
    const code = readCode(current);
    if (code !== undefined) codes.push(code);
    try {
      current = (current as { cause?: unknown }).cause;
    } catch {
      break;
    }
  }
  return codes;
}

/**
 * Classify a thrown value into the closed category set.
 *
 * Only the allowlisted `code` field is consulted — never `message`, `name`,
 * or any other property — so classification cannot leak, and an unknown code
 * degrades to `unknown_failure` rather than surfacing.
 */
export function classifyFailure(thrown: unknown): FailureCategory {
  try {
    for (const code of collectCodes(thrown)) {
      if (UNAVAILABLE_CODES.has(code)) return "database_unavailable";
      if (SQLSTATE_SHAPE.test(code)) {
        const sqlStateClass = code.slice(0, 2);
        if (SQLSTATE_REJECTED_CLASSES.has(sqlStateClass)) {
          return "database_statement_rejected";
        }
        // A recognizable SQLSTATE we do not model is still a database
        // failure, not an unknown one.
        return "database_statement_rejected";
      }
    }
  } catch {
    // fall through
  }
  return "unknown_failure";
}

/**
 * The complete log line. Stable, one-line, parseable, and free of any
 * exception content.
 *
 * Shape: `<operation> failed [category=<category>]`
 */
export function describeFailure(
  operation: DiagnosticOperation,
  thrown: unknown
): string {
  return `${operation} failed [category=${classifyFailure(thrown)}]`;
}

/**
 * Emit the safe diagnostic. The thrown value is used only for classification
 * and never logged.
 */
export function logOperationFailure(
  level: "error" | "warn",
  operation: DiagnosticOperation,
  thrown: unknown
): void {
  try {
    if (typeof console === "undefined") return;
    const line = describeFailure(operation, thrown);
    if (level === "error") console.error(line);
    else console.warn(line);
  } catch {
    // Logging must never mask or replace the original failure.
  }
}
