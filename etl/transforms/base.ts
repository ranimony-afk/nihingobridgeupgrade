/**
 * Base transformer interface — converts raw parsed records
 * to canonical schema records with provenance.
 */

import type { ProvenanceFields, ValidationError } from "../types";

export interface TransformResult<TCanonical> {
  record: TCanonical | null;
  errors: ValidationError[];
}

export interface Transformer<TRaw, TCanonical extends ProvenanceFields> {
  /** Human-readable transformer name for logging. */
  readonly name: string;

  /**
   * Transform a single raw record to canonical form.
   * Returns null record if the raw record should be skipped (with errors explaining why).
   */
  transform(raw: TRaw, sourceVersion: string, importVersion: string): TransformResult<TCanonical>;
}
