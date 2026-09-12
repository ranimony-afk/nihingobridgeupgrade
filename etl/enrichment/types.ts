/**
 * Shared types for all enrichment modules.
 */

/** Result of running an enrichment step. */
export interface EnrichmentResult {
  /** Name of the enricher */
  enricher: string;
  /** Number of records updated */
  enriched: number;
  /** Number of records skipped (already had value, or no match) */
  skipped: number;
  /** Number of errors encountered */
  errors: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Data source reliability assessment */
  reliability: "high" | "medium" | "low";
  /** Notes about the data source */
  sourceNote: string;
}

/** Standard signature for an enrichment function. */
export type EnricherFn = () => Promise<EnrichmentResult>;
