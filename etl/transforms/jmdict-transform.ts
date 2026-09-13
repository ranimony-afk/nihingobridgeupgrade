/**
 * Normalization: raw JMdict shapes -> canonical dictionary records.
 */

import { createHash } from "node:crypto";
import type { RawEntry } from "../parsers/jmdict-parser";

export type NormalizedKanji = {
  text: string;
  common: boolean;
  priorityTags: string[];
  infoTags: string[];
  position: number;
};

export type NormalizedReading = {
  text: string;
  common: boolean;
  noKanji: boolean;
  priorityTags: string[];
  infoTags: string[];
  position: number;
};

export type NormalizedSense = {
  position: number;
  glosses: string[];
  partsOfSpeech: string[];
  fields: string[];
  misc: string[];
  dialects: string[];
  info: string;
};

export type NormalizedEntry = {
  source: string;
  sourceId: string;
  headword: string;
  primaryReading: string;
  isCommon: boolean;
  contentHash: string;
  kanji: NormalizedKanji[];
  readings: NormalizedReading[];
  senses: NormalizedSense[];
};

/** Collapse whitespace and trim. */
export function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cleanTagList(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const tag = normalizeText(raw).toLowerCase();
    if (tag.length === 0 || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

function cleanGlossList(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const gloss = normalizeText(raw);
    if (gloss.length === 0) continue;
    const key = gloss.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(gloss);
  }
  return out;
}

/**
 * JMdict marks frequency with priority codes. An entry is "common" when it
 * carries a top-tier code, or a news-frequency band of nf01..nf24.
 */
export function isCommonPriority(tags: string[]): boolean {
  for (const tag of tags) {
    const t = tag.toLowerCase();
    if (["ichi1", "news1", "spec1", "spec2", "gai1"].includes(t)) return true;
    const nf = /^nf(\d{2})$/.exec(t);
    if (nf && Number.parseInt(nf[1], 10) <= 24) return true;
  }
  return false;
}

export function computeContentHash(entry: {
  sourceId: string;
  kanji: { text: string }[];
  readings: { text: string }[];
  senses: { glosses: string[] }[];
}): string {
  const payload = JSON.stringify({
    id: entry.sourceId,
    k: entry.kanji.map((k) => k.text),
    r: entry.readings.map((r) => r.text),
    s: entry.senses.map((s) => s.glosses),
  });
  return createHash("sha256").update(payload).digest("hex");
}

export function normalizeEntry(raw: RawEntry, source = "jmdict"): NormalizedEntry {
  const kanji: NormalizedKanji[] = raw.kanji.map((k, i) => {
    const priorityTags = cleanTagList(k.kePri);
    return {
      text: normalizeText(k.keb),
      common: isCommonPriority(priorityTags),
      priorityTags,
      infoTags: cleanTagList(k.keInf),
      position: i,
    };
  });

  const readings: NormalizedReading[] = raw.readings.map((r, i) => {
    const priorityTags = cleanTagList(r.rePri);
    return {
      text: normalizeText(r.reb),
      common: isCommonPriority(priorityTags),
      noKanji: r.noKanji,
      priorityTags,
      infoTags: cleanTagList(r.reInf),
      position: i,
    };
  });

  const senses: NormalizedSense[] = raw.senses.map((s, i) => ({
    position: i,
    glosses: cleanGlossList(s.glosses),
    partsOfSpeech: cleanTagList(s.pos),
    fields: cleanTagList(s.field),
    misc: cleanTagList(s.misc),
    dialects: cleanTagList(s.dial),
    info: normalizeText(s.info.join("; ")),
  }));

  const primaryReading = readings[0]?.text ?? "";
  // Kana-only entries have no kanji form; the reading becomes the headword.
  const headword = kanji[0]?.text ?? primaryReading;

  const base = {
    source,
    sourceId: raw.entSeq,
    headword,
    primaryReading,
    isCommon:
      kanji.some((k) => k.common) || readings.some((r) => r.common),
    kanji,
    readings,
    senses,
  };

  return { ...base, contentHash: computeContentHash(base) };
}
