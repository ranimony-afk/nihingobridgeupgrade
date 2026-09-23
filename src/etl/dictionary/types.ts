/**
 * Schema types, mappings, and validation for Dictionary Ingestion Pipeline.
 */

export const JMDICT_SOURCE_REF = "jmdict:edrdg:2024-07";

export const JMDICT_KNOWLEDGE_SOURCE = {
  id: JMDICT_SOURCE_REF,
  name: "JMdict Japanese-Multilingual Dictionary",
  version: "2024-07",
  license: "CC-BY-SA-3.0",
  url: "https://www.edrdg.org/jmdict/j_jmdict.html",
  description:
    "Comprehensive Japanese-English dictionary with part-of-speech, readings, frequency markings, and glosses from the Electronic Dictionary Research and Development Group (EDRDG).",
  domain: "dictionary" as const,
};

export interface DictionarySenseData {
  glosses: string[];
  note?: string | null;
}

export interface CanonicalDictionaryEntry {
  id: string;
  headword: string;
  reading: string;
  romaji: string;
  jlptLevel: string;
  isCommon: boolean;
  frequencyRank: number | null;
  partsOfSpeech: string[];
  senses: DictionarySenseData[];
  kanjiCharacters: string[];
  tags: string[];
  sourceRef: string;
}

/**
 * Mapping JMdict part-of-speech entity abbreviations to standard descriptions.
 */
export const POS_CODE_MAP: Record<string, string> = {
  n: "noun",
  "n-adv": "adverbial noun",
  "n-pr": "proper noun",
  "n-pref": "noun prefix",
  "n-suf": "noun suffix",
  "n-t": "temporal noun",
  v1: "ichidan verb",
  v5k: "godan verb (ku)",
  "v5k-s": "godan verb (iku/yuku special)",
  v5s: "godan verb (su)",
  v5t: "godan verb (tsu)",
  v5n: "godan verb (nu)",
  v5m: "godan verb (mu)",
  v5r: "godan verb (ru)",
  v5b: "godan verb (bu)",
  v5g: "godan verb (gu)",
  v5u: "godan verb (u)",
  vi: "intransitive verb",
  vt: "transitive verb",
  vs: "suru verb",
  vk: "kuru verb",
  "adj-i": "i-adjective",
  "adj-na": "na-adjective",
  "adj-no": "no-adjective",
  "adj-pn": "pre-noun adjectival",
  adv: "adverb",
  "adv-to": "adverb taking to",
  exp: "expression",
  int: "interjection",
  prt: "particle",
  pn: "pronoun",
  num: "numeric",
  ctr: "counter",
  suf: "suffix",
  pref: "prefix",
  conj: "conjunction",
};

export function normalizePos(rawCodes: string[]): string[] {
  const set = new Set<string>();
  for (const code of rawCodes) {
    const mapped = POS_CODE_MAP[code];
    if (mapped) {
      set.add(mapped);
    } else {
      set.add(code);
    }
  }
  return [...set];
}

export const VALID_JLPT_LEVELS = new Set(["N5", "N4", "N3", "N2", "N1", "NONE"]);

export function normalizeJlpt(rawLevel: string | undefined | null): string {
  if (!rawLevel) return "NONE";
  const upper = rawLevel.trim().toUpperCase();
  if (VALID_JLPT_LEVELS.has(upper)) return upper;
  const match = upper.match(/N?[1-5]/);
  if (match) {
    const num = match[0].replace("N", "");
    return `N${num}`;
  }
  return "NONE";
}

/** CJK Unified Ideographs regex for extracting Kanji characters */
const KANJI_REGEX = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g;

export function extractKanjiCharacters(text: string): string[] {
  const matches = text.match(KANJI_REGEX);
  if (!matches) return [];
  return [...new Set(matches)];
}
