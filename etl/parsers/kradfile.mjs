import { decodeFile } from "../lib/util.mjs";

/**
 * KRADFILE (EUC-JP) — one line per kanji:
 *
 *   亜 : ｜ 一 口
 *
 * The right-hand side is the ordered list of components the kanji is
 * decomposed into. Components are either kanji in their own right or EDRDG
 * radical variant glyphs (亻, 忄, ⺅ ...).
 */
export function parseKradfile(file, encoding = "euc-jp") {
  const text = decodeFile(file, encoding);
  const rows = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const literal = line.slice(0, separator).trim();
    const components = line
      .slice(separator + 1)
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (!literal || components.length === 0) continue;
    rows.push({ literal, components });
  }

  return rows;
}

/**
 * RADKFILE (EUC-JP) — radical groups:
 *
 *   $ 一 1
 *   丙丼享...
 *
 * `$ <glyph> <strokeCount>` starts a group, following lines list the kanji
 * that contain that radical glyph.
 */
export function parseRadkfile(file, encoding = "euc-jp") {
  const text = decodeFile(file, encoding);
  const groups = [];
  let current = null;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("$")) {
      const parts = line.slice(1).trim().split(/\s+/);
      current = {
        literal: parts[0],
        strokeCount: Number(parts[1]) || null,
        kanji: [],
      };
      groups.push(current);
      continue;
    }
    if (!current) continue;
    for (const char of line.replace(/\s+/g, "")) {
      current.kanji.push(char);
    }
  }

  return groups;
}
