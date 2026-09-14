import { decodeEntities, streamLines } from "../lib/util.mjs";

const JLPT_LEGACY_TO_NEW = { 4: 5, 3: 4, 2: 2, 1: 1 };

function extract(block, regex) {
  const match = block.match(regex);
  return match ? match[1] : null;
}

/**
 * Streaming KANJIDIC2 parser.
 * Yields one plain object per <character> element.
 */
export async function* parseKanjidic2(file) {
  let buffer = null;

  for await (const line of streamLines(file)) {
    const trimmed = line.trim();
    if (!buffer && trimmed === "<character>") {
      buffer = [];
      continue;
    }
    if (buffer) {
      buffer.push(line);
      if (trimmed === "</character>") {
        const entry = toEntry(buffer.join("\n"));
        buffer = null;
        if (entry) yield entry;
      }
    }
  }
}

function toEntry(block) {
  const literal = extract(block, /<literal>([\s\S]*?)<\/literal>/);
  if (!literal || literal.length === 0) return null;

  const ucs = extract(block, /<cp_value cp_type="ucs">([0-9a-fA-F]+)<\/cp_value>/);
  const classical = extract(block, /<rad_value rad_type="classical">(\d+)<\/rad_value>/);
  const nelson = extract(block, /<rad_value rad_type="nelson_c">(\d+)<\/rad_value>/);
  const grade = extract(block, /<grade>(\d+)<\/grade>/);
  const strokeCount = extract(block, /<stroke_count>(\d+)<\/stroke_count>/);
  const frequency = extract(block, /<freq>(\d+)<\/freq>/);
  const jlptLegacy = extract(block, /<jlpt>(\d+)<\/jlpt>/);
  const heisig =
    extract(block, /<dic_ref dr_type="heisig6">(\d+)<\/dic_ref>/) ??
    extract(block, /<dic_ref dr_type="heisig">(\d+)<\/dic_ref>/);
  const skip = extract(block, /<q_code qc_type="skip">([^<]+)<\/q_code>/);

  const rmGroup = block.match(/<rmgroup>([\s\S]*?)<\/rmgroup>/);
  const groupText = rmGroup ? rmGroup[1] : "";

  const meanings = [];
  for (const match of groupText.matchAll(/<meaning(?:\s+m_lang="([a-z]{2})")?>([\s\S]*?)<\/meaning>/g)) {
    const lang = match[1] ?? "en";
    if (lang !== "en") continue;
    const meaning = decodeEntities(match[2]).trim();
    if (meaning) meanings.push(meaning);
  }

  const readings = { ja_on: [], ja_kun: [], nanori: [] };
  for (const match of groupText.matchAll(/<reading r_type="(ja_on|ja_kun)">([\s\S]*?)<\/reading>/g)) {
    readings[match[1]].push(decodeEntities(match[2]).trim());
  }
  for (const match of block.matchAll(/<nanori>([\s\S]*?)<\/nanori>/g)) {
    readings.nanori.push(decodeEntities(match[1]).trim());
  }

  return {
    literal,
    codepoint: ucs ? `U+${ucs.toUpperCase()}` : null,
    classicalRadical: classical ? Number(classical) : null,
    nelsonRadical: nelson ? Number(nelson) : null,
    grade: grade ? Number(grade) : null,
    strokeCount: strokeCount ? Number(strokeCount) : null,
    frequency: frequency ? Number(frequency) : null,
    jlptLegacyLevel: jlptLegacy ? Number(jlptLegacy) : null,
    jlptLevel: jlptLegacy ? JLPT_LEGACY_TO_NEW[Number(jlptLegacy)] ?? null : null,
    heisigIndex: heisig ? Number(heisig) : null,
    skipCode: skip ?? null,
    meanings,
    readings,
  };
}
