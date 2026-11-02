/**
 * Trusted database executor gate for database-capable suites (R1S).
 *
 * The suites that call this helper can seed or mutate the canonical database
 * through application code paths (including the shared Kanji ETL loaders and
 * fixtures that delete canonical rows). Running them requires a PostgreSQL
 * instance that a trusted runner provisioned for this run, with an execution
 * adapter the runner controls.
 *
 * What is NOT proof of that (and is deliberately not accepted here):
 *   - a `DATABASE_URL` value, or a database name such as `app_db`;
 *   - a loopback host (`127.0.0.1`, `localhost`, `::1`);
 *   - environment markers such as `NIHONGO_DB_TARGET_CLASS=disposable` or
 *     `NIHONGO_DB_EXPECTED_DATABASE`, which the test process can set itself;
 *   - a caller-generated token, signature or approval object.
 *
 * Such values only describe what a caller *claims* about its target. They
 * cannot establish provenance of the executor, so they are not consulted.
 *
 * Status of this repository: no trusted runner-to-executor adapter exists.
 * `requireTrustedDatabaseExecutor()` therefore always throws, and the affected
 * suites fail closed BEFORE they open a connection, run fixture SQL, or seed
 * canonical rows. This is intentional, not an environment problem: do not add
 * an environment-variable escape hatch to make these suites run. A future
 * reviewed change may replace this helper with a real adapter-provided
 * attestation.
 */

/** Stable code so CI and operators can distinguish a blocked suite. */
export const TRUSTED_DATABASE_EXECUTOR_UNAVAILABLE =
  "TRUSTED_DATABASE_EXECUTOR_UNAVAILABLE" as const;

export class TrustedDatabaseExecutorUnavailableError extends Error {
  readonly code = TRUSTED_DATABASE_EXECUTOR_UNAVAILABLE;
  readonly suite: string;

  constructor(suite: string) {
    super(
      `[${TRUSTED_DATABASE_EXECUTOR_UNAVAILABLE}] ${suite} requires a trusted, runner-provisioned ` +
        "per-run PostgreSQL executor adapter. None is available in this repository, so the suite " +
        "fails closed before any database access. A DATABASE_URL, database name, loopback address, " +
        "environment marker or caller-generated token is not proof of a trusted executor.",
    );
    this.name = "TrustedDatabaseExecutorUnavailableError";
    this.suite = suite;
  }
}

/**
 * Refuse to continue unless a trusted executor adapter vouches for this run.
 *
 * No adapter is registered in this repository, so this function always throws.
 * It accepts only the suite label for diagnostics — never a credential or a
 * caller-supplied capability.
 */
export function requireTrustedDatabaseExecutor(suite: string): never {
  throw new TrustedDatabaseExecutorUnavailableError(suite);
}
