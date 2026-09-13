/**
 * DictionarySearch owns query normalization and input constraints.
 *
 * It deliberately does not know Drizzle or SQL. This keeps query semantics
 * stable for the HTTP API and future mobile clients while repositories own
 * persistence details.
 */

import type { DictionarySearchQuery } from "@/types/dictionary";

export class DictionarySearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DictionarySearchError";
  }
}

const MAX_QUERY_LENGTH = 100;
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 25;

export class DictionarySearch {
  parse(rawQuery: string | null, rawLimit: string | null): DictionarySearchQuery {
    const normalizedQuery = this.normalize(rawQuery ?? "");
    if (normalizedQuery.length === 0) {
      throw new DictionarySearchError("A dictionary query is required.");
    }
    if (Array.from(normalizedQuery).length > MAX_QUERY_LENGTH) {
      throw new DictionarySearchError(
        `Dictionary queries must be ${MAX_QUERY_LENGTH} characters or fewer.`,
      );
    }

    return {
      query: rawQuery ?? "",
      normalizedQuery,
      limit: this.parseLimit(rawLimit),
    };
  }

  /** NFKC folds full-width Latin/kana variants and normalizes whitespace. */
  normalize(value: string): string {
    return value.normalize("NFKC").replace(/\s+/g, " ").trim();
  }

  private parseLimit(rawLimit: string | null): number {
    if (rawLimit === null || rawLimit.trim() === "") return DEFAULT_LIMIT;
    if (!/^\d+$/.test(rawLimit)) {
      throw new DictionarySearchError("The result limit must be a positive integer.");
    }
    const limit = Number.parseInt(rawLimit, 10);
    if (limit < 1 || limit > MAX_LIMIT) {
      throw new DictionarySearchError(`The result limit must be between 1 and ${MAX_LIMIT}.`);
    }
    return limit;
  }
}
