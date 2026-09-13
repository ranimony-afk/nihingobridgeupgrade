/**
 * DictionarySearch owns query normalization and input constraints.
 *
 * It deliberately does not know Drizzle or SQL. This keeps query semantics
 * stable for the HTTP API and future mobile clients while repositories own
 * persistence details.
 */

import { isKana, toKana } from "wanakana";
import type { DictionarySearchQuery } from "@/types/dictionary";
import type { DictionaryV2SearchQuery, JlptLevel } from "@/types/dictionary-v2";

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

  /**
   * Parse a v2 request. A request can search by `q`, filter by `jlpt`, or do
   * both; a queryless unfiltered list endpoint is intentionally not exposed.
   */
  parseV2(
    rawQuery: string | null,
    rawLimit: string | null,
    rawJlpt: string | null,
  ): DictionaryV2SearchQuery {
    const normalizedQuery = rawQuery === null ? null : this.normalize(rawQuery);
    const jlptLevel = this.parseJlpt(rawJlpt);

    if ((!normalizedQuery || normalizedQuery.length === 0) && !jlptLevel) {
      throw new DictionarySearchError("Provide a dictionary query or a JLPT filter.");
    }
    if (normalizedQuery && Array.from(normalizedQuery).length > MAX_QUERY_LENGTH) {
      throw new DictionarySearchError(
        `Dictionary queries must be ${MAX_QUERY_LENGTH} characters or fewer.`,
      );
    }

    const termInfo = normalizedQuery
      ? this.searchTerms(normalizedQuery)
      : { terms: [], romajiKana: null };

    return {
      rawQuery,
      normalizedQuery: normalizedQuery || null,
      searchTerms: termInfo.terms,
      romajiKana: termInfo.romajiKana,
      limit: this.parseLimit(rawLimit),
      jlptLevel,
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

  private parseJlpt(rawJlpt: string | null): JlptLevel | null {
    if (rawJlpt === null || rawJlpt.trim() === "") return null;
    const normalized = rawJlpt.trim().toUpperCase();
    if (!/^N[1-5]$/.test(normalized)) {
      throw new DictionarySearchError("JLPT must be one of N1, N2, N3, N4, or N5.");
    }
    return normalized as JlptLevel;
  }

  private searchTerms(normalizedQuery: string): {
    terms: string[];
    romajiKana: string | null;
  } {
    const terms = new Set([normalizedQuery]);
    const kana = toKana(normalizedQuery);
    // WanaKana leaves unknown English sequences in Latin script. Only add the
    // conversion when it is wholly kana, while retaining the literal term for
    // English gloss matching in every case.
    const romajiKana = kana !== normalizedQuery && isKana(kana) ? kana : null;
    if (romajiKana) terms.add(romajiKana);
    return { terms: [...terms], romajiKana };
  }
}
