import {
  isDictionaryJlptLevel,
  type DictionarySearchState,
} from "@/lib/dictionary/searchState";

export const DICTIONARY_SEARCH_LIMIT = 40;

export interface DictionarySearchEntry {
  id: string;
  headword: string;
  reading: string;
  romaji: string | null;
  jlptLevel: string | null;
  isCommon: boolean;
  partsOfSpeech: string[];
  senses: Array<{ glosses: string[]; note?: string | null }>;
  tags: string[];
}

export interface DictionarySearchSuccess {
  ok: true;
  entries: DictionarySearchEntry[];
  total: number;
}

export type DictionarySearchFailureReason = "network" | "http" | "invalid" | "aborted";

export interface DictionarySearchFailure {
  ok: false;
  reason: DictionarySearchFailureReason;
}

export type DictionarySearchOutcome = DictionarySearchSuccess | DictionarySearchFailure;

export interface DictionarySearchCompletion {
  isCurrent: boolean;
  outcome: DictionarySearchOutcome;
}

type FetchImplementation = typeof globalThis.fetch;

interface RequestOptions {
  fetchImpl?: FetchImplementation;
  signal?: AbortSignal;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isDictionarySense(
  value: unknown
): value is { glosses: string[]; note?: string | null } {
  if (!isRecord(value) || !isStringArray(value.glosses)) return false;
  return value.note === undefined || value.note === null || typeof value.note === "string";
}

function isDictionarySearchEntry(value: unknown): value is DictionarySearchEntry {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.headword === "string" &&
    typeof value.reading === "string" &&
    (value.romaji === null || typeof value.romaji === "string") &&
    (value.jlptLevel === null || typeof value.jlptLevel === "string") &&
    typeof value.isCommon === "boolean" &&
    isStringArray(value.partsOfSpeech) &&
    Array.isArray(value.senses) &&
    value.senses.every(isDictionarySense) &&
    isStringArray(value.tags)
  );
}

function parseDictionarySearchPayload(payload: unknown): DictionarySearchSuccess | null {
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.data)) return null;

  const { entries, total } = payload.data;
  if (
    !Array.isArray(entries) ||
    !entries.every(isDictionarySearchEntry) ||
    typeof total !== "number" ||
    !Number.isInteger(total) ||
    total < 0
  ) {
    return null;
  }

  return { ok: true, entries, total };
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === "AbortError";
}

export function buildDictionarySearchRequestUrl(state: DictionarySearchState): string {
  const params = new URLSearchParams();
  const query = state.query.trim();

  if (query) params.set("q", query);
  if (isDictionaryJlptLevel(state.level)) params.set("level", state.level);
  if (state.commonOnly) params.set("common", "true");
  params.set("limit", String(DICTIONARY_SEARCH_LIMIT));

  return `/api/dictionary?${params.toString()}`;
}

export async function requestDictionarySearch(
  state: DictionarySearchState,
  options: RequestOptions = {}
): Promise<DictionarySearchOutcome> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

  try {
    const response = await fetchImpl(buildDictionarySearchRequestUrl(state), {
      signal: options.signal,
    });

    if (!response.ok) return { ok: false, reason: "http" };

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { ok: false, reason: "invalid" };
    }

    return parseDictionarySearchPayload(payload) ?? { ok: false, reason: "invalid" };
  } catch (error) {
    if (options.signal?.aborted || isAbortError(error)) {
      return { ok: false, reason: "aborted" };
    }
    return { ok: false, reason: "network" };
  }
}

/**
 * Owns cancellation and request identity for one dictionary-search consumer.
 * Abort is best-effort; the identity check also protects against fetch
 * implementations or intermediaries that complete after cancellation.
 */
export class DictionarySearchRequestManager {
  private activeController: AbortController | null = null;
  private requestVersion = 0;

  constructor(private readonly fetchImpl?: FetchImplementation) {}

  async search(state: DictionarySearchState): Promise<DictionarySearchCompletion> {
    const requestVersion = ++this.requestVersion;
    this.activeController?.abort();

    const controller = new AbortController();
    this.activeController = controller;

    const outcome = await requestDictionarySearch(state, {
      fetchImpl: this.fetchImpl,
      signal: controller.signal,
    });
    const isCurrent = requestVersion === this.requestVersion;

    if (isCurrent && this.activeController === controller) {
      this.activeController = null;
    }

    return { isCurrent, outcome };
  }

  cancel(): void {
    this.requestVersion += 1;
    this.activeController?.abort();
    this.activeController = null;
  }
}
