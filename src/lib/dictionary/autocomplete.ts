export const DICTIONARY_AUTOCOMPLETE_LIMIT = 6;

export interface DictionaryAutocompleteSuggestion {
  id: string;
  headword: string;
  reading: string;
  romaji: string | null;
  jlptLevel: string | null;
  gloss: string;
}

export interface DictionaryAutocompleteSuccess {
  ok: true;
  suggestions: DictionaryAutocompleteSuggestion[];
}

export type DictionaryAutocompleteFailureReason =
  | "network"
  | "http"
  | "invalid"
  | "aborted";

export interface DictionaryAutocompleteFailure {
  ok: false;
  reason: DictionaryAutocompleteFailureReason;
}

export type DictionaryAutocompleteOutcome =
  | DictionaryAutocompleteSuccess
  | DictionaryAutocompleteFailure;

export interface DictionaryAutocompleteCompletion {
  isCurrent: boolean;
  outcome: DictionaryAutocompleteOutcome;
}

export interface DictionaryAutocompleteKeyState {
  isOpen: boolean;
  activeIndex: number;
  suggestionCount: number;
}

export interface DictionaryAutocompleteKeyPlan {
  handled: boolean;
  nextActiveIndex?: number;
  selectedIndex?: number;
  shouldDismiss?: boolean;
}

type FetchImplementation = typeof globalThis.fetch;

interface RequestOptions {
  fetchImpl?: FetchImplementation;
  signal?: AbortSignal;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAutocompleteSuggestion(value: unknown): value is DictionaryAutocompleteSuggestion {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.headword === "string" &&
    typeof value.reading === "string" &&
    (value.romaji === null || typeof value.romaji === "string") &&
    (value.jlptLevel === null || typeof value.jlptLevel === "string") &&
    typeof value.gloss === "string"
  );
}

function parseAutocompletePayload(payload: unknown): DictionaryAutocompleteSuccess | null {
  if (!isRecord(payload) || payload.success !== true || !Array.isArray(payload.data)) {
    return null;
  }
  if (!payload.data.every(isAutocompleteSuggestion)) return null;

  return {
    ok: true,
    suggestions: payload.data.slice(0, DICTIONARY_AUTOCOMPLETE_LIMIT),
  };
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === "AbortError";
}

export function buildDictionaryAutocompleteUrl(query: string): string {
  return `/api/dictionary?q=${encodeURIComponent(
    query
  )}&autocomplete=true&limit=${DICTIONARY_AUTOCOMPLETE_LIMIT}`;
}

export function getDictionaryAutocompleteOptionId(
  listboxId: string,
  index: number
): string {
  return `${listboxId}-option-${index}`;
}

export function planDictionaryAutocompleteKey(
  key: string,
  state: DictionaryAutocompleteKeyState
): DictionaryAutocompleteKeyPlan {
  const { isOpen, activeIndex, suggestionCount } = state;

  if (key === "Escape" && isOpen) {
    return { handled: true, shouldDismiss: true };
  }

  if (suggestionCount < 1) return { handled: false };

  if (key === "ArrowDown") {
    return {
      handled: true,
      nextActiveIndex: activeIndex < 0 ? 0 : (activeIndex + 1) % suggestionCount,
    };
  }

  if (key === "ArrowUp") {
    return {
      handled: true,
      nextActiveIndex:
        activeIndex < 0
          ? suggestionCount - 1
          : (activeIndex - 1 + suggestionCount) % suggestionCount,
    };
  }

  if (key === "Enter" && isOpen && activeIndex >= 0 && activeIndex < suggestionCount) {
    return { handled: true, selectedIndex: activeIndex };
  }

  return { handled: false };
}

export async function requestDictionaryAutocomplete(
  query: string,
  options: RequestOptions = {}
): Promise<DictionaryAutocompleteOutcome> {
  if (!query.trim()) return { ok: true, suggestions: [] };

  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

  try {
    const response = await fetchImpl(buildDictionaryAutocompleteUrl(query), {
      signal: options.signal,
    });

    if (!response.ok) return { ok: false, reason: "http" };

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { ok: false, reason: "invalid" };
    }

    return parseAutocompletePayload(payload) ?? { ok: false, reason: "invalid" };
  } catch (error) {
    if (options.signal?.aborted || isAbortError(error)) {
      return { ok: false, reason: "aborted" };
    }
    return { ok: false, reason: "network" };
  }
}

/**
 * Cancellation and identity are intentionally separate from result-search
 * requests so autocomplete activity cannot alter the main results lifecycle.
 */
export class DictionaryAutocompleteRequestManager {
  private activeController: AbortController | null = null;
  private requestVersion = 0;

  constructor(private readonly fetchImpl?: FetchImplementation) {}

  async search(query: string): Promise<DictionaryAutocompleteCompletion> {
    const requestVersion = ++this.requestVersion;
    this.activeController?.abort();
    this.activeController = null;

    if (!query.trim()) {
      return {
        isCurrent: true,
        outcome: { ok: true, suggestions: [] },
      };
    }

    const controller = new AbortController();
    this.activeController = controller;

    const outcome = await requestDictionaryAutocomplete(query, {
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
