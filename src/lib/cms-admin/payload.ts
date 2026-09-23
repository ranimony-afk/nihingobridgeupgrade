/**
 * Dictionary staged-payload shaping — Phase 13.5B.
 *
 * Pure client-safe mapping between the editorial form and the
 * `stagedPayload` object stored by the CMS. Field vocabulary mirrors the
 * canonical `dictionary_entries` row (headword, reading, romaji, JLPT
 * level, parts of speech, senses) so overlays stay structurally aligned.
 *
 * Senses text format (one sense per line):
 *   gloss one; gloss two // optional note
 * Glosses split on ";", the trailing "// …" is the sense note.
 */
import type { AdminCmsItem } from "./types";

export interface DictionarySense {
  glosses: string[];
  note?: string;
}

export interface DictionaryFormState {
  title: string;
  headword: string;
  reading: string;
  romaji: string;
  jlptLevel: string;
  isCommon: boolean;
  partsOfSpeech: string;
  sensesText: string;
  tags: string;
  editorialNotes: string;
  changeSummary: string;
}

export const EMPTY_DICTIONARY_FORM: DictionaryFormState = {
  title: "",
  headword: "",
  reading: "",
  romaji: "",
  jlptLevel: "",
  isCommon: true,
  partsOfSpeech: "",
  sensesText: "",
  tags: "",
  editorialNotes: "",
  changeSummary: "",
};

export const JLPT_LEVEL_OPTIONS = ["", "N5", "N4", "N3", "N2", "N1"] as const;

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

/** Tolerant read of a stored/foreign staged payload (never throws). */
export function parseStagedPayload(payload: unknown): {
  headword: string;
  reading: string;
  romaji: string;
  jlptLevel: string;
  isCommon: boolean;
  partsOfSpeech: string[];
  senses: DictionarySense[];
  tags: string[];
} {
  const record =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)
      : {};
  const rawSenses = Array.isArray(record.senses) ? record.senses : [];
  const senses: DictionarySense[] = rawSenses.flatMap((sense) => {
    if (typeof sense !== "object" || sense === null) return [];
    const s = sense as Record<string, unknown>;
    const glosses = asStringArray(s.glosses).filter((g) => g.trim() !== "");
    if (glosses.length === 0) return [];
    const note = asString(s.note).trim();
    return [{ glosses, ...(note !== "" ? { note } : {}) }];
  });
  return {
    headword: asString(record.headword),
    reading: asString(record.reading),
    romaji: asString(record.romaji),
    jlptLevel: asString(record.jlptLevel),
    isCommon:
      typeof record.isCommon === "boolean" ? record.isCommon : true,
    partsOfSpeech: asStringArray(record.partsOfSpeech),
    senses,
    tags: asStringArray(record.tags),
  };
}

/** One sense per line for the textarea. */
export function formatSensesText(senses: DictionarySense[]): string {
  return senses
    .map((s) =>
      s.note ? `${s.glosses.join("; ")} // ${s.note}` : s.glosses.join("; ")
    )
    .join("\n");
}

/** Parse the senses textarea back into senses (tolerant, never throws). */
export function parseSensesText(text: string): DictionarySense[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .flatMap((line) => {
      const [glossPart = "", ...noteParts] = line.split("//");
      const glosses = glossPart
        .split(";")
        .map((g) => g.trim())
        .filter((g) => g !== "");
      if (glosses.length === 0) return [];
      const note = noteParts.join("//").trim();
      return [{ glosses, ...(note !== "" ? { note } : {}) }];
    });
}

function splitCommaList(text: string): string[] {
  return text
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t !== "");
}

/** Kanji characters present in a headword (display + stored linkage). */
export function extractKanji(text: string): string[] {
  const found = text.match(/\p{Script=Han}/gu) ?? [];
  return [...new Set(found)];
}

export function formFromItem(item: AdminCmsItem): DictionaryFormState {
  const parsed = parseStagedPayload(item.stagedPayload);
  return {
    title: item.title,
    headword: parsed.headword,
    reading: parsed.reading,
    romaji: parsed.romaji,
    jlptLevel: parsed.jlptLevel,
    isCommon: parsed.isCommon,
    partsOfSpeech: parsed.partsOfSpeech.join(", "),
    sensesText: formatSensesText(parsed.senses),
    tags: parsed.tags.join(", "),
    editorialNotes: item.editorialNotes ?? "",
    changeSummary: "",
  };
}

/** Build the FULL-REPLACE staged payload the service persists. */
export function buildStagedPayload(
  form: DictionaryFormState
): Record<string, unknown> {
  return {
    headword: form.headword.trim(),
    reading: form.reading.trim(),
    romaji: form.romaji.trim(),
    jlptLevel: form.jlptLevel.trim(),
    isCommon: form.isCommon,
    partsOfSpeech: splitCommaList(form.partsOfSpeech),
    senses: parseSensesText(form.sensesText),
    kanjiCharacters: extractKanji(form.headword),
    tags: splitCommaList(form.tags),
  };
}

export type FormErrors = Partial<Record<keyof DictionaryFormState, string>>;

/**
 * Client-side form validation (fast feedback; the server re-validates
 * everything). Returns field errors; empty object = valid.
 */
export function validateDictionaryForm(
  form: DictionaryFormState,
  options: {
    isCreate: boolean;
    sourceRef?: string;
    provenanceType?: string;
  }
): FormErrors & { sourceRef?: string; provenanceType?: string } {
  const errors: FormErrors & { sourceRef?: string; provenanceType?: string } =
    {};
  if (form.title.trim() === "") errors.title = "Title is required.";
  else if (form.title.length > 500)
    errors.title = "Title must be 500 characters or fewer.";
  if (form.headword.trim() === "") errors.headword = "Headword is required.";
  if (form.reading.trim() === "") errors.reading = "Reading is required.";
  if (
    form.jlptLevel !== "" &&
    !["N5", "N4", "N3", "N2", "N1"].includes(form.jlptLevel)
  ) {
    errors.jlptLevel = "JLPT level must be N5–N1.";
  }
  if (parseSensesText(form.sensesText).length === 0) {
    errors.sensesText = "At least one sense with a gloss is required.";
  }
  if (options.isCreate) {
    if ((options.sourceRef ?? "").trim() === "") {
      errors.sourceRef = "Source reference is required.";
    }
    if (
      options.provenanceType !== "canonical_override" &&
      options.provenanceType !== "editorial_curated" &&
      options.provenanceType !== "community_verified"
    ) {
      errors.provenanceType = "Choose a provenance type.";
    }
  }
  return errors;
}
