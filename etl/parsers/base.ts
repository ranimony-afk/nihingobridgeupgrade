/**
 * Base parser interface — all format-specific parsers implement this.
 */

export interface Parser<TRaw> {
  /** Human-readable parser name for logging. */
  readonly name: string;

  /**
   * Parse a source file and yield raw records.
   * Uses an async generator for memory-efficient streaming of large files.
   */
  parse(filePath: string): AsyncGenerator<TRaw, void, undefined>;

  /**
   * Count the approximate number of records in the file (for progress reporting).
   * Returns null if count is not available without full parse.
   */
  estimateCount?(filePath: string): Promise<number | null>;
}
