export const DICTIONARY_JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
export const DICTIONARY_SEARCH_FALLBACK_HREF = "/dictionary";

const RETURN_URL_BASE = "https://nihingobridge.invalid";

export type DictionaryJlptLevel = (typeof DICTIONARY_JLPT_LEVELS)[number];
export type DictionaryLevelFilter = DictionaryJlptLevel | "ALL";

export interface DictionarySearchState {
  query: string;
  level: DictionaryLevelFilter;
  commonOnly: boolean;
}

interface SearchParamsReader {
  get(name: string): string | null;
}

const KNOWN_LEVELS: ReadonlySet<string> = new Set(DICTIONARY_JLPT_LEVELS);

export function isDictionaryJlptLevel(value: string | null): value is DictionaryJlptLevel {
  return value !== null && KNOWN_LEVELS.has(value);
}

/** Parse only the learner-facing dictionary parameters supported by the page. */
export function parseDictionarySearchState(params: SearchParamsReader): DictionarySearchState {
  const level = params.get("level");

  return {
    query: params.get("q")?.trim() ?? "",
    level: isDictionaryJlptLevel(level) ? level : "ALL",
    commonOnly: params.get("common") === "true",
  };
}

/** Build a canonical, shareable URL while omitting default filter values. */
export function buildDictionarySearchHref(state: DictionarySearchState): string {
  const params = new URLSearchParams();
  const query = state.query.trim();

  if (query) params.set("q", query);
  if (isDictionaryJlptLevel(state.level)) params.set("level", state.level);
  if (state.commonOnly) params.set("common", "true");

  const queryString = params.toString();
  return queryString
    ? `${DICTIONARY_SEARCH_FALLBACK_HREF}?${queryString}`
    : DICTIONARY_SEARCH_FALLBACK_HREF;
}

/**
 * Validate an untrusted detail-page return value at the navigation boundary,
 * then rebuild it through the canonical dictionary search-state serializer.
 */
export function resolveDictionaryReturnHref(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return DICTIONARY_SEARCH_FALLBACK_HREF;
  }

  try {
    decodeURI(value);
  } catch {
    return DICTIONARY_SEARCH_FALLBACK_HREF;
  }

  let parsed: URL;
  try {
    parsed = new URL(value, RETURN_URL_BASE);
  } catch {
    return DICTIONARY_SEARCH_FALLBACK_HREF;
  }

  if (
    parsed.origin !== RETURN_URL_BASE ||
    parsed.pathname !== DICTIONARY_SEARCH_FALLBACK_HREF ||
    parsed.hash
  ) {
    return DICTIONARY_SEARCH_FALLBACK_HREF;
  }

  for (const parameter of ["q", "level", "common"] as const) {
    if (parsed.searchParams.getAll(parameter).length > 1) {
      return DICTIONARY_SEARCH_FALLBACK_HREF;
    }
  }

  const level = parsed.searchParams.get("level");
  if (level !== null && !isDictionaryJlptLevel(level)) {
    return DICTIONARY_SEARCH_FALLBACK_HREF;
  }

  const common = parsed.searchParams.get("common");
  if (common !== null && common !== "true") {
    return DICTIONARY_SEARCH_FALLBACK_HREF;
  }

  return buildDictionarySearchHref(parseDictionarySearchState(parsed.searchParams));
}

/** Build an encoded detail link with an optional, validated search return path. */
export function buildDictionaryEntryHref(entryId: string, returnTo?: string): string {
  const entryHref = `${DICTIONARY_SEARCH_FALLBACK_HREF}/${encodeURIComponent(entryId)}`;
  if (returnTo === undefined) return entryHref;

  const params = new URLSearchParams({
    returnTo: resolveDictionaryReturnHref(returnTo),
  });
  return `${entryHref}?${params.toString()}`;
}

export interface DictionarySearchUpdatePlan {
  state: DictionarySearchState;
  href: string;
  shouldNavigate: boolean;
  shouldRefresh: boolean;
}

/**
 * Keep URL canonicalization and request refresh decisions independent. A URL
 * can differ textually while representing the same committed search state.
 */
export function planDictionarySearchUpdate(
  currentHref: string,
  committedState: DictionarySearchState,
  nextState: DictionarySearchState,
  refreshIfUnchanged = false
): DictionarySearchUpdatePlan {
  const state = { ...nextState, query: nextState.query.trim() };
  const href = buildDictionarySearchHref(state);
  const stateIsUnchanged =
    state.query === committedState.query.trim() &&
    state.level === committedState.level &&
    state.commonOnly === committedState.commonOnly;

  return {
    state,
    href,
    shouldNavigate: href !== currentHref,
    shouldRefresh: refreshIfUnchanged && stateIsUnchanged,
  };
}
