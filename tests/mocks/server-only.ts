/**
 * Vitest shim for the `server-only` package.
 *
 * Next.js resolves `server-only` to a no-op for server bundles (RSC and
 * route handlers) at build time. Plain Node test runners resolve the
 * package's default export instead, which throws by design to poison
 * client bundles. Tests exercise server modules directly, so the poisoned
 * export is aliased to this no-op — the guard remains fully active in
 * Next.js build and runtime, which is where the boundary is enforced.
 */
export {};
