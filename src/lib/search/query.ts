export const SEARCH_KINDS = [
  "lexeme",
  "kanji",
  "sentence",
  "grammar",
  "idiom",
  "collocation",
  "post",
  "course",
] as const;

export type SearchKind = (typeof SEARCH_KINDS)[number];

export type SearchFilters = {
  kinds: SearchKind[];
  jlpt?: string;
  pos?: string;
  maxDifficulty?: number;
};

export type ParsedQuery = {
  raw: string;
  /** Free text with `field:value` operators stripped out. */
  text: string;
  normalized: string;
  filters: SearchFilters;
  /** True when the query contains kana or kanji. */
  japanese: boolean;
  /** Terms the user explicitly negated with a leading `-`. */
  negations: string[];
};

const JAPANESE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;
const JLPT = /^n[1-5]$/i;

export function isJapanese(value: string) {
  return JAPANESE.test(value);
}

export function normalizeQuery(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[！-～]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[.,!?;:'"`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isKind(value: string): value is SearchKind {
  return (SEARCH_KINDS as readonly string[]).includes(value);
}

/**
 * Parses an Elastic-style query string.
 * Supports `type:kanji`, `jlpt:n5`, `pos:verb`, `difficulty:<=4`, and `-word` negation.
 */
export function parseQuery(input: string, base: Partial<SearchFilters> = {}): ParsedQuery {
  const raw = input ?? "";
  const filters: SearchFilters = {
    kinds: base.kinds ? [...base.kinds] : [],
    jlpt: base.jlpt,
    pos: base.pos,
    maxDifficulty: base.maxDifficulty,
  };
  const negations: string[] = [];
  const words: string[] = [];

  for (const token of raw.split(/\s+/).filter(Boolean)) {
    const [rawField, ...rest] = token.split(":");
    const field = (rawField ?? "").toLowerCase();
    const value = rest.join(":");

    if (value && (field === "type" || field === "types" || field === "kind" || field === "kinds")) {
      const kind = value.toLowerCase().replace(/s$/, "");
      if (isKind(kind) && !filters.kinds.includes(kind)) filters.kinds.push(kind);
      continue;
    }
    if (value && field === "jlpt" && JLPT.test(value)) {
      filters.jlpt = value.toUpperCase();
      continue;
    }
    if (value && field === "pos") {
      filters.pos = value.toLowerCase();
      continue;
    }
    if (value && (field === "difficulty" || field === "d")) {
      const parsed = Number(value.replace(/[<=>]/g, ""));
      if (Number.isFinite(parsed)) filters.maxDifficulty = parsed;
      continue;
    }
    if (token.startsWith("-") && token.length > 1) {
      negations.push(token.slice(1));
      continue;
    }
    words.push(token);
  }

  const text = words.join(" ").trim();
  return {
    raw,
    text,
    normalized: normalizeQuery(text),
    filters,
    japanese: isJapanese(text),
    negations,
  };
}

/**
 * Builds a websearch-compatible tsquery string.
 * Latin queries get prefix matching on the final token for autocomplete.
 */
export function toTsQuery(text: string, { prefix = false } = {}) {
  const terms = normalizeQuery(text)
    .split(" ")
    .filter(Boolean)
    .map((term) => term.replace(/[&|!():*<>]/g, ""))
    .filter(Boolean);
  if (terms.length === 0) return "";
  if (!prefix) return terms.join(" & ");
  const head = terms.slice(0, -1);
  const tail = terms[terms.length - 1];
  return [...head, `${tail}:*`].join(" & ");
}

/** Whole-string fuzzy threshold. Loosens with length, since similarity dilutes. */
export function similarityThreshold(text: string) {
  const length = normalizeQuery(text).length;
  if (length <= 2) return 0.6;
  if (length <= 4) return 0.35;
  if (length <= 8) return 0.25;
  return 0.2;
}

/**
 * Threshold for `word_similarity`, which scores the best matching extent inside
 * a document. It must stay strict — a long nonsense query can otherwise clip a
 * real word. Measured: "watre" vs "water" = 0.50, pure gibberish peaks at 0.24.
 */
export function wordSimilarityThreshold(text: string) {
  return normalizeQuery(text).length <= 3 ? 0.5 : 0.4;
}

export type ScoreParts = {
  rank: number;
  similarity: number;
  exact: boolean;
  prefix: boolean;
  boost: number;
};

/**
 * Blends full-text rank, trigram similarity, exact/prefix bonuses, and a
 * frequency boost into a single relevance score.
 */
export function combineScore(parts: ScoreParts) {
  const score =
    parts.rank * 4 +
    parts.similarity * 3 +
    (parts.exact ? 5 : 0) +
    (parts.prefix ? 1.5 : 0) +
    parts.boost * 2;
  return Math.round(score * 1000) / 1000;
}

/** Picks the closest indexed title as a "did you mean" candidate. */
export function bestSuggestion(
  query: string,
  candidates: { title: string; similarity: number }[],
  minimum = 0.3,
) {
  const normalized = normalizeQuery(query);
  const ranked = candidates
    .filter((row) => row.similarity >= minimum)
    .filter((row) => normalizeQuery(row.title) !== normalized)
    .sort((a, b) => b.similarity - a.similarity);
  return ranked[0]?.title ?? null;
}
