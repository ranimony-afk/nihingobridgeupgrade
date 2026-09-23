/**
 * JMdict XML Entry Parser — Phase 14.2.
 *
 * Lightweight, zero-dependency streaming XML parser tailored specifically
 * for JMdict <entry> structures.
 *
 * Designed to parse XML chunks or full documents with bounded memory usage,
 * extracting ent_seq, kanji elements, reading elements, and senses.
 */

import type {
  RawJMdictGloss,
  RawJMdictKanji,
  RawJMdictReading,
  RawJMdictSense,
  RawJMdictSourceRecord,
} from "./types";
import { Readable } from "stream";

/**
 * Extracts inner text of an XML tag, unescaping XML entities.
 */
function extractTagContent(xml: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}(?:\\s+[^>]*)?>([\\s\\S]*?)</${tagName}>`, "i");
  const match = xml.match(regex);
  if (!match) return null;
  return unescapeXml(match[1]);
}

/**
 * Extracts all matching tag occurrences within an XML snippet.
 */
function extractAllTags(xml: string, tagName: string): string[] {
  const regex = new RegExp(`<${tagName}(?:\\s+[^>]*)?>([\\s\\S]*?)</${tagName}>`, "gi");
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    results.push(unescapeXml(match[1]));
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
 * Unescapes standard XML entities and JMdict DTD entity codes.
 */
function unescapeXml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

/**
 * Parses a single `<entry>...</entry>` XML block into a RawJMdictSourceRecord.
 */
export function parseJMdictEntryXml(entryXml: string): RawJMdictSourceRecord {
  // 1. ent_seq
  const entSeq = extractTagContent(entryXml, "ent_seq") || "";

  // 2. k_ele blocks
  const kBlocks = extractTagBlocks(entryXml, "k_ele");
  const kanji: RawJMdictKanji[] = [];
  for (const kXml of kBlocks) {
    const keb = extractTagContent(kXml, "keb");
    if (!keb) continue;
    const keInf = extractAllTags(kXml, "ke_inf");
    const kePri = extractAllTags(kXml, "ke_pri");
    kanji.push({
      keb,
      keInf: keInf.length > 0 ? keInf : undefined,
      kePri: kePri.length > 0 ? kePri : undefined,
    });
  }

  // 3. r_ele blocks
  const rBlocks = extractTagBlocks(entryXml, "r_ele");
  const readings: RawJMdictReading[] = [];
  for (const rXml of rBlocks) {
    const reb = extractTagContent(rXml, "reb");
    if (!reb) continue;
    const reNoKanji = /<re_nokanji\s*\/?>/i.test(rXml);
    const reRestr = extractAllTags(rXml, "re_restr");
    const reInf = extractAllTags(rXml, "re_inf");
    const rePri = extractAllTags(rXml, "re_pri");
    readings.push({
      reb,
      reNoKanji: reNoKanji ? true : undefined,
      reRestr: reRestr.length > 0 ? reRestr : undefined,
      reInf: reInf.length > 0 ? reInf : undefined,
      rePri: rePri.length > 0 ? rePri : undefined,
    });
  }

  // 4. sense blocks
  const sBlocks = extractTagBlocks(entryXml, "sense");
  const senses: RawJMdictSense[] = sBlocks.map((sXml) => {
    // Extract POS entities (e.g. &n; or text within <pos>)
    const pos = extractAllTags(sXml, "pos").map((p) =>
      p.replace(/^&|;$/g, "").trim()
    );

    const misc = extractAllTags(sXml, "misc").map((m) =>
      m.replace(/^&|;$/g, "").trim()
    );
    const dial = extractAllTags(sXml, "dial").map((d) =>
      d.replace(/^&|;$/g, "").trim()
    );
    const field = extractAllTags(sXml, "field").map((f) =>
      f.replace(/^&|;$/g, "").trim()
    );
    const sInf = extractTagContent(sXml, "s_inf");
    const stagk = extractAllTags(sXml, "stagk");
    const stagr = extractAllTags(sXml, "stagr");

    // Glosses: capture text and optional xml:lang attribute
    const glossRegex = /<gloss(?:\s+xml:lang="([^"]+)")?[^>]*>([\s\S]*?)<\/gloss>/gi;
    const glosses: RawJMdictGloss[] = [];
    let gMatch: RegExpExecArray | null;
    while ((gMatch = glossRegex.exec(sXml)) !== null) {
      const lang = gMatch[1] || "eng";
      const text = unescapeXml(gMatch[2]);
      if (text) {
        glosses.push({ lang, text });
      }
    }

    return {
      pos,
      misc: misc.length > 0 ? misc : undefined,
      dial: dial.length > 0 ? dial : undefined,
      field: field.length > 0 ? field : undefined,
      sInf: sInf || undefined,
      stagk: stagk.length > 0 ? stagk : undefined,
      stagr: stagr.length > 0 ? stagr : undefined,
      glosses,
    };
  });

  return {
    entSeq,
    kanji,
    readings,
    senses,
  };
}

/**
 * Extracts and parses all `<entry>` blocks from an XML string.
 * Supports streaming or batch execution up to a limit.
 */
export function parseJMdictXmlString(
  xmlContent: string,
  limit?: number
): RawJMdictSourceRecord[] {
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
  const entries: RawJMdictSourceRecord[] = [];
  let match: RegExpExecArray | null;

  while ((match = entryRegex.exec(xmlContent)) !== null) {
    const raw = parseJMdictEntryXml(match[0]);
    entries.push(raw);
    if (limit && entries.length >= limit) {
      break;
    }
  }

  return entries;
}

/**
 * Streams RawJMdictSourceRecord items one by one from a readable XML stream.
 * Maintains bounded memory buffer without loading full XML into RAM.
 */
export async function* streamJMdictEntries(
  stream: Readable,
  limit?: number
): AsyncGenerator<RawJMdictSourceRecord, void, unknown> {
  let buffer = "";
  let emitted = 0;
  for await (const chunk of stream) {
    buffer += typeof chunk === "string" ? chunk : chunk.toString("utf-8");
    let entryStart = buffer.indexOf("<entry>");
    while (entryStart !== -1) {
      const entryEnd = buffer.indexOf("</entry>", entryStart);
      if (entryEnd === -1) {
        break;
      }
      const entryXml = buffer.slice(entryStart, entryEnd + 8);
      buffer = buffer.slice(entryEnd + 8);
      yield parseJMdictEntryXml(entryXml);
      emitted++;
      if (limit && emitted >= limit) {
        return;
      }
      entryStart = buffer.indexOf("<entry>");
    }
    if (entryStart > 0) {
      buffer = buffer.slice(entryStart);
    }
  }
}
