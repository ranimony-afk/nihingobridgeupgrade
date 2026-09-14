import { decodeEntities, streamLines } from "../lib/util.mjs";

const PRIORITY_RANK = {
  news1: 1,
  ichi1: 1,
  spec1: 1,
  gai1: 1,
  news2: 2,
  ichi2: 2,
  spec2: 2,
  gai2: 2,
};

const SKIP_ORTHOGRAPHY = new Set(["iK", "ik", "oK", "ok", "sK", "sk"]);
const KANJI_RANGE = /[㐀-鿿豈-﫿]/u;

/**
 * Streaming JMdict parser. Only entries that
 *   - have a kanji element (k_ele) containing at least one kanji,
 *   - are not marked as irregular/outdated orthography, and
 *   - carry a frequency priority tag (priority <= maxPriority)
 * are yielded, which keeps the knowledge base small and learnable.
 */
export async function* parseJmdict(file, { maxPriority = 2 } = {}) {
  let buffer = null;

  for await (const line of streamLines(file)) {
    const trimmed = line.trim();
    if (!buffer && trimmed === "<entry>") {
      buffer = [];
      continue;
    }
    if (buffer) {
      buffer.push(line);
      if (trimmed === "</entry>") {
        const entry = toEntry(buffer.join("\n"), maxPriority);
        buffer = null;
        if (entry) yield entry;
      }
    }
  }
}

function priorityOf(tags) {
  let best = null;
  for (const tag of tags) {
    const rank = PRIORITY_RANK[tag];
    if (rank && (best === null || rank < best)) best = rank;
  }
  return best;
}

function toEntry(block, maxPriority) {
  const externalId = block.match(/<ent_seq>(\d+)<\/ent_seq>/)?.[1] ?? null;
  if (!externalId) return null;

  const kEleBlocks = Array.from(block.matchAll(/<k_ele>([\s\S]*?)<\/k_ele>/g)).map((m) => m[1]);
  const rEleBlocks = Array.from(block.matchAll(/<r_ele>([\s\S]*?)<\/r_ele>/g)).map((m) => m[1]);
  if (kEleBlocks.length === 0 || rEleBlocks.length === 0) return null;

  const primary = kEleBlocks[0];
  const keInf = Array.from(primary.matchAll(/<ke_inf>([^<]+)<\/ke_inf>/g)).map((m) => m[1]);
  if (keInf.some((tag) => SKIP_ORTHOGRAPHY.has(tag))) return null;

  const kanjiText = decodeEntities(primary.match(/<keb>([\s\S]*?)<\/keb>/)?.[1] ?? "").trim();
  if (!kanjiText || !KANJI_RANGE.test(kanjiText)) return null;

  const kanaText = decodeEntities(rEleBlocks[0].match(/<reb>([\s\S]*?)<\/reb>/)?.[1] ?? "").trim();
  if (!kanaText) return null;

  const priorityTags = [
    ...Array.from(primary.matchAll(/<ke_pri>([^<]+)<\/ke_pri>/g)).map((m) => m[1]),
    ...Array.from(rEleBlocks[0].matchAll(/<re_pri>([^<]+)<\/re_pri>/g)).map((m) => m[1]),
  ];
  const priority = priorityOf(priorityTags);
  if (priority === null || priority > maxPriority) return null;

  const meanings = [];
  const partsOfSpeech = [];
  for (const senseMatch of block.matchAll(/<sense>([\s\S]*?)<\/sense>/g)) {
    const sense = senseMatch[1];
    for (const posMatch of sense.matchAll(/<pos>([^<]+)<\/pos>/g)) {
      const pos = posMatch[1];
      if (!partsOfSpeech.includes(pos)) partsOfSpeech.push(pos);
    }
    for (const glossMatch of sense.matchAll(/<gloss(?:[^>]*)>([\s\S]*?)<\/gloss>/g)) {
      const gloss = decodeEntities(glossMatch[1]).trim();
      if (gloss && !meanings.includes(gloss)) meanings.push(gloss);
    }
  }
  if (meanings.length === 0) return null;

  return {
    externalId,
    kanjiText,
    kanaText,
    meanings: meanings.slice(0, 10),
    partsOfSpeech,
    priority,
  };
}
