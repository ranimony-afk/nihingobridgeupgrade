/**
 * XML helpers for RSS and sitemaps.
 *
 * Escaping is not cosmetic here: a single raw `&` or `<` in a title makes the
 * whole document malformed, and feed readers reject the entire file rather
 * than skipping the bad item. Japanese content also carries quotes and
 * ampersands often, so this runs on every field.
 */

const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

export function escapeXml(value: string | null | undefined) {
  if (value == null) return "";
  return String(value).replace(/[&<>"']/g, (char) => ENTITIES[char] ?? char);
}

/**
 * Strips control characters that are illegal in XML 1.0 even when escaped.
 * Tab, newline and carriage return are legal and preserved.
 */
export function stripInvalidXmlChars(value: string) {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

export function xmlText(value: string | null | undefined) {
  return escapeXml(stripInvalidXmlChars(String(value ?? "")));
}

/**
 * CDATA still has one escape hatch: the literal sequence `]]>` terminates the
 * block early, so it must be split across two sections.
 */
export function cdata(value: string | null | undefined) {
  const safe = stripInvalidXmlChars(String(value ?? "")).replace(/]]>/g, "]]]]><![CDATA[>");
  return `<![CDATA[${safe}]]>`;
}

export function rfc822(date: Date | string) {
  const value = typeof date === "string" ? new Date(date) : date;
  return Number.isNaN(value.getTime()) ? new Date().toUTCString() : value.toUTCString();
}

export function w3cDate(date: Date | string) {
  const value = typeof date === "string" ? new Date(date) : date;
  return (Number.isNaN(value.getTime()) ? new Date() : value).toISOString();
}

/** Collapses HTML/markdown into a plain-text summary of at most `max` chars. */
export function excerptFrom(body: string, max = 200) {
  const text = body
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*_`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}
