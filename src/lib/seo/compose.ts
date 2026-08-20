import { excerptFrom } from "./xml";

/**
 * Pure daily-post composition. No database imports, so the content rules are
 * unit testable on their own — matching the pattern used for grammar/pure,
 * billing/commission and analytics/metrics.
 */

export type GeneratedPost = {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  tags: string;
  seoTitle: string;
  seoDescription: string;
};

export type PostSource = {
  lexemes: { id: string; lemma: string; reading: string; gloss: string; jlpt: string | null }[];
  kanji: { character: string; meaning: string; strokes: number; jlpt: string | null }[];
  grammar: { title: string; structure: string; explanation: string; slug: string; level: string }[];
};

export const TOPICS = [
  { key: "vocab", label: "Vocabulary" },
  { key: "kanji", label: "Kanji" },
  { key: "grammar", label: "Grammar" },
] as const;

export function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Stable per-day pick, so re-running on the same date is deterministic. */
export function topicForDate(date: Date) {
  const dayNumber = Math.floor(date.getTime() / 86400000);
  return TOPICS[dayNumber % TOPICS.length]!;
}

export function slugForDate(date: Date, topic: string) {
  return `daily-${topic}-${isoDay(date)}`;
}

/**
 * Builds the post. Returns null when there is not enough source material —
 * a thin auto-generated page is worse for search than no page at all.
 */
export function composePost(date: Date, source: PostSource): GeneratedPost | null {
  const topic = topicForDate(date);
  const pretty = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  let title = "";
  let body = "";
  let tags = "";

  if (topic.key === "vocab") {
    if (source.lexemes.length < 3) return null;
    title = `${source.lexemes.length} Japanese words to learn on ${pretty}`;
    tags = "vocabulary,jlpt,daily";
    body = [
      "Today's vocabulary set from the Nihongo Bridge dictionary. Each word links to its full entry with pitch accent, audio, and example sentences.",
      "",
      ...source.lexemes.map(
        (row) =>
          `**${row.lemma}**（${row.reading}）— ${row.gloss || "see entry"}${row.jlpt ? ` · ${row.jlpt}` : ""}\n\nOpen the entry: [/dictionary/${row.id}](/dictionary/${row.id})`,
      ),
      "",
      "Practise these on the [learning path](/learn), or look anything else up in the [dictionary](/dictionary).",
    ].join("\n\n");
  }

  if (topic.key === "kanji") {
    if (source.kanji.length < 3) return null;
    title = `Kanji study list for ${pretty}`;
    tags = "kanji,jlpt,daily";
    body = [
      "Kanji worth drilling today, ordered by how often they appear in real Japanese text.",
      "",
      ...source.kanji.map(
        (row) =>
          `**${row.character}** — ${row.meaning || "see entry"} · ${row.strokes} strokes${row.jlpt ? ` · ${row.jlpt}` : ""}\n\nStroke order and compounds: [/kanji/${encodeURIComponent(row.character)}](/kanji/${encodeURIComponent(row.character)})`,
      ),
      "",
      "See how these connect in the [kanji mind map](/kanji/explore).",
    ].join("\n\n");
  }

  if (topic.key === "grammar") {
    if (source.grammar.length < 2) return null;
    title = `Japanese grammar points to review on ${pretty}`;
    tags = "grammar,jlpt,daily";
    body = [
      "Today's grammar review. Each point includes formation notes, examples with audio, and a sentence builder.",
      "",
      ...source.grammar.map(
        (row) =>
          `**${row.title}** — \`${row.structure}\` · ${row.level}\n\n${row.explanation}\n\nFull explanation: [/grammar/${row.slug}](/grammar/${row.slug})`,
      ),
      "",
      "Browse every pattern in the [grammar engine](/grammar).",
    ].join("\n\n");
  }

  if (!title) return null;

  const excerpt = excerptFrom(body, 180);
  return {
    slug: slugForDate(date, topic.key),
    title,
    excerpt,
    body,
    tags,
    seoTitle: title,
    seoDescription: excerpt,
  };
}
