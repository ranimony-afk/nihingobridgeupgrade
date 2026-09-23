import { kanaToRomaji } from "./romaji";
import {
  extractKanjiCharacters,
  JMDICT_SOURCE_REF,
  normalizeJlpt,
  normalizePos,
  type CanonicalDictionaryEntry,
  type DictionarySenseData,
} from "./types";
import type { RawJMdictSourceRecord } from "./pilotData";

export interface ValidationIssue {
  field: string;
  message: string;
  value?: unknown;
}

export interface TransformResult {
  record: CanonicalDictionaryEntry | null;
  isValid: boolean;
  errors: ValidationIssue[];
}

/**
 * Normalizes Unicode text using NFKC and trims whitespace.
 */
export function normalizeText(text: string): string {
  if (!text) return "";
  return text.normalize("NFKC").trim();
}

/**
 * Transforms a raw JMdict entry into a canonical DictionaryEntry record.
 */
export function transformJMdictEntry(
  raw: RawJMdictSourceRecord,
  sourceRef: string = JMDICT_SOURCE_REF,
): TransformResult {
  const errors: ValidationIssue[] = [];

  if (!raw.entSeq || typeof raw.entSeq !== "string") {
    errors.push({ field: "entSeq", message: "Missing or invalid entSeq" });
  }

  // Headword: primary kanji if present, otherwise primary reading
  const rawHeadword = raw.kanji && raw.kanji.length > 0 && raw.kanji[0]?.keb
    ? raw.kanji[0].keb
    : raw.readings && raw.readings.length > 0 && raw.readings[0]?.reb
      ? raw.readings[0].reb
      : "";

  const headword = normalizeText(rawHeadword);
  if (!headword) {
    errors.push({ field: "headword", message: "Entry has no valid headword or reading" });
  }

  // Reading: primary kana reading
  const rawReading = raw.readings && raw.readings.length > 0 && raw.readings[0]?.reb
    ? raw.readings[0].reb
    : "";
  const reading = normalizeText(rawReading);
  if (!reading) {
    errors.push({ field: "reading", message: "Entry has no valid reading" });
  }

  // Romaji reading
  const romaji = kanaToRomaji(reading);
  if (!romaji) {
    errors.push({ field: "romaji", message: "Unable to generate romaji for reading", value: reading });
  }

  // Senses
  if (!raw.senses || raw.senses.length === 0) {
    errors.push({ field: "senses", message: "Entry has no senses" });
  }

  const rawPosList: string[] = [];
  const tagsSet = new Set<string>();

  const senses: DictionarySenseData[] = (raw.senses || []).map((s) => {
    if (s.pos) rawPosList.push(...s.pos);
    if (s.field) s.field.forEach((f) => tagsSet.add(`field:${f}`));
    if (s.misc) s.misc.forEach((m) => tagsSet.add(`misc:${m}`));
    if (s.dial) s.dial.forEach((d) => tagsSet.add(`dialect:${d}`));

    const glosses = (s.glosses || [])
      .filter((g) => g.lang === "eng" || !g.lang)
      .map((g) => normalizeText(g.text))
      .filter(Boolean);

    return {
      glosses: glosses.length > 0 ? glosses : ["(untranslated)"],
      note: s.sInf ? normalizeText(s.sInf) : null,
    };
  });

  const partsOfSpeech = normalizePos(rawPosList);
  if (partsOfSpeech.length === 0) {
    partsOfSpeech.push("unspecified");
  }

  // Commonness & Frequency
  const allPri = [
    ...(raw.kanji || []).flatMap((k) => k.kePri || []),
    ...(raw.readings || []).flatMap((r) => r.rePri || []),
  ];
  const isCommon =
    allPri.some((p) => /^nf\d{2}$/.test(p)) ||
    allPri.includes("ichi1") ||
    allPri.includes("news1") ||
    allPri.includes("spec1") ||
    allPri.includes("gai1");

  const frequencyRank = typeof raw.frequencyRank === "number" ? raw.frequencyRank : null;
  const jlptLevel = normalizeJlpt(raw.jlptLevel);

  // Kanji characters
  const kanjiCharacters = extractKanjiCharacters(headword);

  // Deterministic ID based on entSeq
  const id = `de-jmdict-${raw.entSeq}`;

  // Tags
  if (jlptLevel && jlptLevel !== "NONE") {
    tagsSet.add(`jlpt:${jlptLevel.toLowerCase()}`);
  }
  if (isCommon) {
    tagsSet.add("common");
  }

  const canonical: CanonicalDictionaryEntry = {
    id,
    headword,
    reading,
    romaji,
    jlptLevel,
    isCommon,
    frequencyRank,
    partsOfSpeech,
    senses,
    kanjiCharacters,
    tags: [...tagsSet],
    sourceRef,
  };

  return {
    record: errors.length === 0 ? canonical : null,
    isValid: errors.length === 0,
    errors,
  };
}
