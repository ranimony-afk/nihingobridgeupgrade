/**
 * JMdict Entry Transformer & Normalizer — Phase 14.2.
 *
 * Transforms raw JMdict parsed records into canonical DictionaryEntry records.
 * Integrates Unicode NFKC normalization, Hepburn romanization, comprehensive
 * POS code mapping, structured diagnostics, and deterministic ID assignment.
 */

import { kanaToRomaji } from "./romaji";
import {
  extractKanjiCharacters,
  JMDICT_SOURCE_REF,
  normalizeJlpt,
  normalizePosWithDiagnostics,
  type CanonicalDictionaryEntry,
  type DictionarySenseData,
  type ETLDiagnostic,
  type RawJMdictSourceRecord,
  type TransformedDictionaryEntry,
} from "./types";

export interface ValidationIssue {
  field: string;
  message: string;
  value?: unknown;
}

export interface TransformResult {
  record: CanonicalDictionaryEntry | null;
  isValid: boolean;
  errors: ValidationIssue[];
  diagnostics: ETLDiagnostic[];
  transformed?: TransformedDictionaryEntry | null;
}

/**
 * Normalizes Unicode text using NFKC and trims whitespace.
 * Preserves semantic Japanese content while removing formatting inconsistencies.
 */
export function normalizeText(text: string | null | undefined): string {
  if (!text) return "";
  return text.normalize("NFKC").trim();
}

/**
 * Transforms a raw JMdict entry into a canonical DictionaryEntry record.
 * Handles single/multiple orthographies, multiple readings, kana-only vocabulary,
 * reading restrictions, multilingual senses, and unknown POS codes safely.
 */
export function transformJMdictEntry(
  raw: RawJMdictSourceRecord,
  sourceRef: string = JMDICT_SOURCE_REF
): TransformResult {
  const diagnostics: ETLDiagnostic[] = [];
  const errors: ValidationIssue[] = [];

  const entSeq = normalizeText(raw.entSeq);
  if (!entSeq) {
    errors.push({ field: "entSeq", message: "Missing or invalid entSeq" });
    diagnostics.push({
      entSeq: "",
      stage: "validate",
      severity: "error",
      field: "entSeq",
      code: "MISSING_ENT_SEQ",
      message: "Entry is missing entSeq.",
    });
  }

  // 1. Orthography handling (Kanji elements)
  const validKanji = (raw.kanji || [])
    .map((k) => ({
      keb: normalizeText(k.keb),
      keInf: k.keInf || [],
      kePri: k.kePri || [],
    }))
    .filter((k) => k.keb.length > 0);

  // 2. Reading handling (Kana elements)
  const validReadings = (raw.readings || [])
    .map((r) => ({
      reb: normalizeText(r.reb),
      reNoKanji: Boolean(r.reNoKanji),
      reRestr: (r.reRestr || []).map(normalizeText).filter(Boolean),
      reInf: r.reInf || [],
      rePri: r.rePri || [],
    }))
    .filter((r) => r.reb.length > 0);

  const isKanaOnly = validKanji.length === 0;

  // Primary headword: first kanji keb if available, otherwise first kana reb
  const primaryHeadword = validKanji.length > 0
    ? validKanji[0].keb
    : validReadings.length > 0
      ? validReadings[0].reb
      : "";

  if (!primaryHeadword) {
    errors.push({
      field: "headword",
      message: "Entry has no valid headword or reading",
    });
    diagnostics.push({
      entSeq,
      stage: "normalize",
      severity: "error",
      field: "headword",
      code: "MISSING_HEADWORD",
      message: "Entry has neither kanji headword nor kana reading.",
    });
  }

  // Primary reading: first kana reb
  const primaryReading = validReadings.length > 0 ? validReadings[0].reb : "";
  if (!primaryReading) {
    errors.push({ field: "reading", message: "Entry has no valid reading" });
    diagnostics.push({
      entSeq,
      stage: "normalize",
      severity: "error",
      field: "reading",
      code: "MISSING_READING",
      message: "Entry has no kana reading.",
    });
  }

  // Alternative orthographies & readings
  const alternativeHeadwords = validKanji.slice(1).map((k) => k.keb);
  const alternativeReadings = validReadings.slice(1).map((r) => r.reb);

  // 3. Romaji generation
  const romaji = kanaToRomaji(primaryReading);
  if (!romaji && primaryReading) {
    errors.push({
      field: "romaji",
      message: "Unable to generate romaji for reading",
      value: primaryReading,
    });
    diagnostics.push({
      entSeq,
      stage: "transform",
      severity: "error",
      field: "romaji",
      code: "ROMAJI_GENERATION_FAILED",
      message: `Failed to generate romaji for reading "${primaryReading}".`,
      value: primaryReading,
    });
  }

  // 4. Senses & Glosses
  if (!raw.senses || raw.senses.length === 0) {
    errors.push({ field: "senses", message: "Entry has no senses" });
    diagnostics.push({
      entSeq,
      stage: "validate",
      severity: "error",
      field: "senses",
      code: "EMPTY_SENSES",
      message: "Entry must contain at least one sense definition.",
    });
  }

  const rawPosList: string[] = [];
  const tagsSet = new Set<string>();

  // Add alternative headword & reading tags for search indexing
  for (const altKeb of alternativeHeadwords) {
    tagsSet.add(`alt:${altKeb}`);
  }
  for (const altReb of alternativeReadings) {
    tagsSet.add(`alt-reading:${altReb}`);
  }
  if (isKanaOnly) {
    tagsSet.add("kana-only");
  }

  // Capture reading restrictions
  for (const r of validReadings) {
    for (const restr of r.reRestr) {
      tagsSet.add(`restr:${r.reb}->${restr}`);
    }
  }

  const senses: DictionarySenseData[] = (raw.senses || []).map((s) => {
    if (s.pos) rawPosList.push(...s.pos);
    if (s.field) s.field.forEach((f) => tagsSet.add(`field:${normalizeText(f)}`));
    if (s.misc) s.misc.forEach((m) => tagsSet.add(`misc:${normalizeText(m)}`));
    if (s.dial) s.dial.forEach((d) => tagsSet.add(`dialect:${normalizeText(d)}`));

    // Filter English glosses
    const englishGlosses = (s.glosses || [])
      .filter((g) => !g.lang || g.lang === "eng")
      .map((g) => normalizeText(g.text))
      .filter(Boolean);

    // Multilingual glosses (e.g. non-English) preserved in notes or tags
    const otherLangGlosses = (s.glosses || [])
      .filter((g) => g.lang && g.lang !== "eng")
      .map((g) => `${g.lang}:${normalizeText(g.text)}`);

    for (const olg of otherLangGlosses) {
      tagsSet.add(`gloss:${olg}`);
    }

    const note = s.sInf ? normalizeText(s.sInf) : null;

    return {
      glosses:
        englishGlosses.length > 0 ? englishGlosses : ["(untranslated)"],
      note,
    };
  });

  // 5. Parts of speech mapping with diagnostics
  const { mapped: partsOfSpeech, diagnostics: posDiagnostics } =
    normalizePosWithDiagnostics(rawPosList, entSeq);
  diagnostics.push(...posDiagnostics);

  if (partsOfSpeech.length === 0) {
    partsOfSpeech.push("unspecified");
  }

  // 6. Commonality & Priority
  const allPri = [
    ...validKanji.flatMap((k) => k.kePri),
    ...validReadings.flatMap((r) => r.rePri),
  ];

  const isCommon =
    allPri.some((p) => /^nf\d{2}$/.test(p)) ||
    allPri.includes("ichi1") ||
    allPri.includes("news1") ||
    allPri.includes("spec1") ||
    allPri.includes("gai1");

  // Frequency rank
  let frequencyRank =
    typeof raw.frequencyRank === "number" ? raw.frequencyRank : null;

  if (frequencyRank === null) {
    const nfTag = allPri.find((p) => /^nf\d{2}$/.test(p));
    if (nfTag) {
      const nfNum = parseInt(nfTag.replace("nf", ""), 10);
      frequencyRank = nfNum * 500;
    }
  }

  // 7. JLPT level
  const jlptLevel = normalizeJlpt(raw.jlptLevel);
  if (jlptLevel && jlptLevel !== "NONE") {
    tagsSet.add(`jlpt:${jlptLevel.toLowerCase()}`);
  }
  if (isCommon) {
    tagsSet.add("common");
  }

  // 8. Kanji extraction across primary and alternative headwords
  const allHeadwordsText = [primaryHeadword, ...alternativeHeadwords].join("");
  const kanjiCharacters = extractKanjiCharacters(allHeadwordsText);

  // 9. Deterministic ID: de-jmdict-${entSeq}
  const id = `de-jmdict-${entSeq}`;

  const canonical: CanonicalDictionaryEntry = {
    id,
    headword: primaryHeadword,
    reading: primaryReading,
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

  const transformed: TransformedDictionaryEntry = {
    ...canonical,
    alternativeHeadwords,
    alternativeReadings,
  };

  const isValid = errors.length === 0;

  return {
    record: isValid ? canonical : null,
    isValid,
    errors,
    diagnostics,
    transformed: isValid ? transformed : null,
  };
}
