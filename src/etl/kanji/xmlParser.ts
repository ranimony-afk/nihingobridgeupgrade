/**
 * KANJIDIC2 Streaming XML Parser — Phase 14.4B.
 *
 * High-performance, zero-dependency streaming parser for KANJIDIC2 XML.
 * Parses <character> elements with bounded memory usage using chunked streams.
 *
 * Extracts:
 * - literal (kanji character)
 * - codepoints (ucs hex, jis codes)
 * - radicals (classical Kangxi radical, Nelson radical)
 * - misc (grade, stroke counts, variants, frequency, JLPT, radical names)
 * - reading_meaning (On'yomi, Kun'yomi, foreign readings, meanings by lang, Nanori)
 */

import { Readable } from "stream";
import type {
  RawKanjidicCharacter,
  RawKanjidicCodepoint,
  RawKanjidicMeaning,
  RawKanjidicRadical,
  RawKanjidicReading,
  RawKanjidicVariant,
} from "./types";

/**
 * Unescapes standard XML entities.
 */
export function unescapeXml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

/**
 * Extracts inner text of a single XML tag.
 */
function extractTagContent(xml: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}(?:\\s+[^>]*)?>([\\s\\S]*?)</${tagName}>`, "i");
  const match = xml.match(regex);
  if (!match) return null;
  return unescapeXml(match[1].trim());
}

/**
 * Extracts all matching tag occurrences within an XML snippet.
 */
function extractAllTagContents(xml: string, tagName: string): string[] {
  const regex = new RegExp(`<${tagName}(?:\\s+[^>]*)?>([\\s\\S]*?)</${tagName}>`, "gi");
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    results.push(unescapeXml(match[1].trim()));
  }
  return results;
}

/**
 * Extracts raw blocks of a tag without unescaping inner XML.
 */
function extractTagBlocks(xml: string, tagName: string): string[] {
  const regex = new RegExp(`<${tagName}(?:\\s+[^>]*)?>([\\s\\S]*?)</${tagName}>`, "gi");
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    results.push(match[1]);
  }
  return results;
}

/**
 * Parses codepoint elements.
 */
function parseCodepoints(xml: string): RawKanjidicCodepoint[] {
  const results: RawKanjidicCodepoint[] = [];
  const regex = /<cp_value\s+cp_type="([^"]+)">([^<]+)<\/cp_value>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    results.push({
      type: match[1],
      value: match[2].trim(),
    });
  }
  return results;
}

/**
 * Parses radical elements.
 */
function parseRadicals(xml: string): RawKanjidicRadical[] {
  const results: RawKanjidicRadical[] = [];
  const regex = /<rad_value\s+rad_type="([^"]+)">([^<]+)<\/rad_value>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    const parsed = parseInt(match[2].trim(), 10);
    if (!isNaN(parsed)) {
      results.push({
        type: match[1],
        value: parsed,
      });
    }
  }
  return results;
}

/**
 * Parses misc variants.
 */
function parseVariants(xml: string): RawKanjidicVariant[] {
  const results: RawKanjidicVariant[] = [];
  const regex = /<variant\s+var_type="([^"]+)">([^<]+)<\/variant>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    results.push({
      type: match[1],
      value: match[2].trim(),
    });
  }
  return results;
}

/**
 * Parses dictionary references.
 */
function parseDicRefs(xml: string): Array<{ type: string; value: string }> {
  const results: Array<{ type: string; value: string }> = [];
  const regex = /<dic_ref\s+dr_type="([^"]+)">([^<]+)<\/dic_ref>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    results.push({
      type: match[1],
      value: match[2].trim(),
    });
  }
  return results;
}

/**
 * Parses query codes (e.g. SKIP codes).
 */
function parseQueryCodes(xml: string): Array<{ type: string; value: string }> {
  const results: Array<{ type: string; value: string }> = [];
  const regex = /<q_code\s+qc_type="([^"]+)">([^<]+)<\/q_code>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    results.push({
      type: match[1],
      value: match[2].trim(),
    });
  }
  return results;
}

/**
 * Parses readings and meanings from reading_meaning block.
 */
function parseReadingMeaning(xml: string): {
  readings: RawKanjidicReading[];
  meanings: RawKanjidicMeaning[];
  nanori: string[];
} {
  const readings: RawKanjidicReading[] = [];
  const meanings: RawKanjidicMeaning[] = [];
  const nanori: string[] = [];

  // Parse readings: <reading r_type="...">value</reading>
  const rRegex = /<reading\s+r_type="([^"]+)">([^<]+)<\/reading>/g;
  let rMatch: RegExpExecArray | null;
  while ((rMatch = rRegex.exec(xml)) !== null) {
    readings.push({
      type: rMatch[1] as RawKanjidicReading["type"],
      value: rMatch[2].trim(),
    });
  }

  // Parse meanings: <meaning>English</meaning> or <meaning m_lang="fr">French</meaning>
  const mRegex = /<meaning(?:\s+m_lang="([^"]+)")?>([^<]+)<\/meaning>/g;
  let mMatch: RegExpExecArray | null;
  while ((mMatch = mRegex.exec(xml)) !== null) {
    const lang = mMatch[1] ? mMatch[1].trim() : "en";
    meanings.push({
      lang,
      text: unescapeXml(mMatch[2].trim()),
    });
  }

  // Parse nanori: <nanori>value</nanori>
  const nanoriMatches = extractAllTagContents(xml, "nanori");
  for (const n of nanoriMatches) {
    if (n) nanori.push(n);
  }

  return { readings, meanings, nanori };
}

/**
 * Parses a single <character> XML block into a RawKanjidicCharacter.
 */
export function parseKanjidicCharacterXml(characterXml: string): RawKanjidicCharacter {
  const literal = extractTagContent(characterXml, "literal") || "";
  if (!literal) {
    throw new Error("Missing mandatory <literal> tag in <character>");
  }

  // Codepoints
  const codepointBlock = extractTagContent(characterXml, "codepoint") || "";
  const codepoints = parseCodepoints(characterXml);

  // Radicals
  const radicals = parseRadicals(characterXml);

  // Misc
  const miscBlocks = extractTagBlocks(characterXml, "misc");
  const miscXml = miscBlocks.length > 0 ? miscBlocks[0] : "";

  let grade: number | null = null;
  const gradeStr = extractTagContent(miscXml, "grade");
  if (gradeStr) {
    const parsed = parseInt(gradeStr, 10);
    if (!isNaN(parsed)) grade = parsed;
  }

  const strokeCounts: number[] = [];
  const strokeMatches = extractAllTagContents(miscXml, "stroke_count");
  for (const s of strokeMatches) {
    const sc = parseInt(s, 10);
    if (!isNaN(sc)) {
      strokeCounts.push(sc);
    }
  }

  const variants = parseVariants(miscXml);

  let frequency: number | null = null;
  const freqStr = extractTagContent(miscXml, "freq");
  if (freqStr) {
    const parsed = parseInt(freqStr, 10);
    if (!isNaN(parsed)) frequency = parsed;
  }

  const radicalNames = extractAllTagContents(miscXml, "rad_name");

  let jlptOld: number | null = null;
  const jlptStr = extractTagContent(miscXml, "jlpt");
  if (jlptStr) {
    const parsed = parseInt(jlptStr, 10);
    if (!isNaN(parsed)) jlptOld = parsed;
  }

  // Dic refs and Query codes
  const dicRefs = parseDicRefs(characterXml);
  const queryCodes = parseQueryCodes(characterXml);

  // Reading / Meaning
  const rmBlocks = extractTagBlocks(characterXml, "reading_meaning");
  const rmXml = rmBlocks.join("\n");
  const { readings, meanings, nanori } = parseReadingMeaning(rmXml);

  return {
    literal,
    codepoints,
    radicals,
    grade,
    strokeCounts,
    variants,
    frequency,
    radicalNames,
    jlptOld,
    dicRefs,
    queryCodes,
    readings,
    meanings,
    nanori,
  };
}

/**
 * Streams RawKanjidicCharacter entries from a readable XML stream.
 * Maintains bounded memory buffer and handles streaming splits.
 */
export async function* streamKanjidicCharacters(
  stream: Readable,
  limit?: number
): AsyncGenerator<RawKanjidicCharacter, void, unknown> {
  let buffer = "";
  let emitted = 0;

  for await (const chunk of stream) {
    buffer += typeof chunk === "string" ? chunk : chunk.toString("utf-8");

    let charStart = buffer.indexOf("<character>");
    while (charStart !== -1) {
      const charEnd = buffer.indexOf("</character>", charStart);
      if (charEnd === -1) {
        // Incomplete character element in buffer, wait for more chunks
        break;
      }

      const characterXml = buffer.slice(charStart, charEnd + 12);
      buffer = buffer.slice(charEnd + 12);

      try {
        const char = parseKanjidicCharacterXml(characterXml);
        yield char;
        emitted++;

        if (limit && emitted >= limit) {
          return;
        }
      } catch (err) {
        // Malformed record diagnostic: log or skip malformed block without crashing stream
        console.warn(
          `[KANJIDIC2 parser warning] Skipped malformed character at position: ${(err as Error).message}`
        );
      }

      charStart = buffer.indexOf("<character>");
    }

    // Shrink buffer if character start is ahead to keep memory bounded
    if (charStart > 0) {
      buffer = buffer.slice(charStart);
    }
  }
}
