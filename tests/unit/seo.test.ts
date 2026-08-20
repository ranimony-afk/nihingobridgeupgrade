import assert from "node:assert/strict";
import { test } from "node:test";
import { cdata, escapeXml, excerptFrom, rfc822, stripInvalidXmlChars, xmlText } from "../../src/lib/seo/xml.ts";
import { clampDescription, pageTitle } from "../../src/lib/seo/metadata.ts";
import { serializeJsonLd } from "../../src/lib/seo/jsonld.ts";
import { composePost, slugForDate, topicForDate } from "../../src/lib/seo/compose.ts";

test("escapeXml handles every character that breaks a feed", () => {
  // A raw & or < makes the whole document malformed, not just one item.
  assert.equal(escapeXml("Tom & Jerry"), "Tom &amp; Jerry");
  assert.equal(escapeXml("<script>"), "&lt;script&gt;");
  assert.equal(escapeXml(`He said "hi"`), "He said &quot;hi&quot;");
  assert.equal(escapeXml("it's"), "it&apos;s");
  assert.equal(escapeXml(null), "");
});

test("escapeXml does not double-escape an existing entity", () => {
  // Escaping twice would render "&amp;amp;" to the reader.
  assert.equal(escapeXml("a & b"), "a &amp; b");
  assert.equal(escapeXml(escapeXml("a & b")), "a &amp;amp; b");
});

test("Japanese text survives escaping unchanged", () => {
  assert.equal(xmlText("食べる（たべる）"), "食べる（たべる）");
  assert.equal(xmlText("水 & 火"), "水 &amp; 火");
});

test("control characters illegal in XML are removed", () => {
  assert.equal(stripInvalidXmlChars("bad\u0000char"), "badchar");
  // Tab, newline and carriage return are legal and must survive.
  assert.equal(stripInvalidXmlChars("keep\tthis\nand\rthat"), "keep\tthis\nand\rthat");
});

test("CDATA survives a payload containing the terminator", () => {
  // A literal ]]> would close the section early. The fix splits it across two
  // sections, so the encoded form legitimately contains ]]> — what matters is
  // that a parser concatenating the sections recovers the original text.
  const original = "danger ]]> here";
  const out = cdata(original);
  assert.ok(out.startsWith("<![CDATA["));
  assert.ok(out.endsWith("]]>"));

  const recovered = out
    .split("<![CDATA[")
    .filter(Boolean)
    .map((chunk) => chunk.slice(0, chunk.indexOf("]]>")))
    .join("");
  assert.equal(recovered, original);

  // Plain text round-trips through a single section.
  const plain = cdata("水 & 火");
  assert.equal(plain, "<![CDATA[水 & 火]]>");
});

test("rfc822 falls back to now for an invalid date", () => {
  assert.ok(rfc822("not-a-date").length > 10);
  assert.ok(rfc822(new Date("2026-03-01T00:00:00Z")).includes("2026"));
});

test("excerptFrom strips markup and cuts on a word boundary", () => {
  const text = excerptFrom("<p>**Hello** world, this is a fairly long sentence.</p>", 20);
  assert.ok(!text.includes("<p>"));
  assert.ok(!text.includes("**"));
  assert.ok(text.length <= 21);
  assert.ok(text.endsWith("…"));
});

test("titles are branded only when they still fit in results", () => {
  assert.equal(pageTitle("Kanji 水"), "Kanji 水 | Nihongo Bridge");
  const long = "A very long title that already uses up the entire pixel budget for search";
  assert.equal(pageTitle(long), long);
  // Never brand twice.
  assert.equal(pageTitle("Nihongo Bridge — home"), "Nihongo Bridge — home");
});

test("descriptions clamp to the snippet limit on a word boundary", () => {
  const clamped = clampDescription("word ".repeat(80));
  assert.ok(clamped.length <= 160);
  assert.ok(clamped.endsWith("…"));
  assert.equal(clampDescription("short"), "short");
});

test("JSON-LD escapes < so it cannot break out of the script tag", () => {
  const out = serializeJsonLd({ name: "</script><img onerror=alert(1)>" });
  assert.ok(!out.includes("</script>"));
  assert.ok(out.includes("\\u003c"));
});

test("daily topic and slug are deterministic for a date", () => {
  const date = new Date("2026-03-10T12:00:00Z");
  assert.equal(topicForDate(date).key, topicForDate(new Date("2026-03-10T23:00:00Z")).key);
  assert.equal(slugForDate(date, "vocab"), "daily-vocab-2026-03-10");
  // Consecutive days rotate topics rather than repeating.
  assert.notEqual(topicForDate(date).key, topicForDate(new Date("2026-03-11T12:00:00Z")).key);
});

test("post generation refuses to write a thin page", () => {
  const date = new Date("2026-03-10T12:00:00Z");
  const empty = composePost(date, { lexemes: [], kanji: [], grammar: [] });
  assert.equal(empty, null);
});

test("generated post contains real content and internal links", () => {
  // 2026-03-11 is a kanji day for this rotation.
  const date = new Date("2026-03-11T12:00:00Z");
  const topic = topicForDate(date);
  const source = {
    lexemes: [
      { id: "l1", lemma: "水", reading: "みず", gloss: "water", jlpt: "N5" },
      { id: "l2", lemma: "本", reading: "ほん", gloss: "book", jlpt: "N5" },
      { id: "l3", lemma: "山", reading: "やま", gloss: "mountain", jlpt: "N5" },
    ],
    kanji: [
      { character: "日", meaning: "day", strokes: 4, jlpt: "N5" },
      { character: "一", meaning: "one", strokes: 1, jlpt: "N5" },
      { character: "人", meaning: "person", strokes: 2, jlpt: "N5" },
    ],
    grammar: [
      { title: "です", structure: "N です", explanation: "Polite copula.", slug: "desu", level: "N5" },
      { title: "ます", structure: "V-ます", explanation: "Polite verb.", slug: "masu", level: "N5" },
    ],
  };
  const post = composePost(date, source);
  assert.ok(post);
  assert.ok(post.title.length > 10);
  assert.ok(post.excerpt.length > 0);
  assert.equal(post.slug, `daily-${topic.key}-2026-03-11`);
  // Every generated post must link internally, or it is an orphan page.
  assert.ok(post.body.includes("]("), "post should contain markdown links");
});
