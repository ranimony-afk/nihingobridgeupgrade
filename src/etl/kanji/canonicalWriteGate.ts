/**
 * Canonical Kanji ETL — fail-closed write denial.
 *
 * R1S scope: the five shared loader exports in `./loader.ts` and the non-dry-run
 * branch of `runKanjiETLPipeline` in `./pipeline.ts`.
 *
 * Why denial instead of an approval parameter:
 *   No authorization mechanism for canonical Kanji writes has been reviewed
 *   yet. Until one exists, every shared canonical write path must refuse
 *   unconditionally. This module therefore exposes NO approval input: no
 *   token, no environment override, no caller-supplied flag, no default that
 *   can be flipped permissively. `denyCanonicalKanjiWrite()` always throws.
 *
 * The denial happens at the top of each guarded entry point, before:
 *   - the database client is touched (no select / insert / update / delete),
 *   - any transaction is acquired,
 *   - the caller's input is traversed (iterated, indexed or read),
 *   - any observable mutation occurs (result counters stay untouched).
 *
 * Dry-run transformation and reporting remain available through
 * `runKanjiETLPipeline({ dryRun: true })`, which returns counts without
 * reaching any guarded loader.
 */

/** Stable machine-readable code for every canonical-write denial. */
export const CANONICAL_KANJI_WRITE_DENIED = "CANONICAL_KANJI_WRITE_DENIED" as const;

export type CanonicalKanjiWriteDeniedCode = typeof CANONICAL_KANJI_WRITE_DENIED;

/**
 * Raised by every guarded canonical Kanji write entry point.
 *
 * `operation` names the guarded export that refused, so a caller (and a test)
 * can tell the boundary that denied instead of having to parse the message.
 * It is a diagnostic label only — it is never treated as authorization.
 */
export class CanonicalKanjiWriteDeniedError extends Error {
  readonly code: CanonicalKanjiWriteDeniedCode = CANONICAL_KANJI_WRITE_DENIED;
  readonly operation: string;

  constructor(operation: string) {
    super(
      `Canonical Kanji ETL write denied (${operation}). ` +
        "No reviewed authorization mechanism exists for canonical Kanji writes, so the shared " +
        "loaders fail closed before any database access, transaction, input traversal or mutation. " +
        "Only an explicit dry run (dryRun: true) is permitted, and it performs no writes.",
    );
    this.name = "CanonicalKanjiWriteDeniedError";
    this.operation = operation;
  }
}

/**
 * Unconditionally refuses a canonical Kanji write. Never returns.
 *
 * Intentionally accepts only a diagnostic label: there is no argument,
 * environment variable or global that can make this return.
 *
 * The declared return type is `void` (not `never`) on purpose: TypeScript's
 * control-flow analysis would otherwise mark the remaining, now-unreachable
 * loader bodies as dead code and stop type-checking them, and those bodies are
 * deliberately retained so a future reviewed authorization change can
 * reinstate them against a still-checked implementation. The function still
 * always throws — tests assert the runtime behaviour.
 */
export function denyCanonicalKanjiWrite(operation: string): void {
  throw new CanonicalKanjiWriteDeniedError(operation);
}
