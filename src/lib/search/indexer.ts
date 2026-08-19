import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  cmsCourses,
  cmsPosts,
  kgCollocations,
  kgFrequency,
  kgGlosses,
  kgGrammar,
  kgGrammarMeta,
  kgIdioms,
  kgKanji,
  kgKanjiReadings,
  kgLexemes,
  kgSenses,
  kgSentences,
  searchIndex,
  searchTerms,
} from "@/db/schema";
import { normalizeQuery, type SearchKind } from "./query";
import { romajiVariants } from "./romaji";

type IndexRow = {
  id: string;
  kind: SearchKind;
  refId: string;
  href: string;
  title: string;
  titleNorm: string;
  subtitle: string;
  body: string;
  jlpt: string | null;
  pos: string | null;
  difficulty: number | null;
  boost: number;
};

/** Rank 1 is the most common word; map it to a 0..1 boost. */
function frequencyBoost(rank: number | null | undefined) {
  if (!rank || rank <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - Math.log10(rank) / 4));
}

function row(partial: Omit<IndexRow, "titleNorm">): IndexRow {
  return { ...partial, titleNorm: normalizeQuery(partial.title) };
}

async function collectRows(): Promise<IndexRow[]> {
  const [
    lexemes,
    senses,
    glosses,
    freq,
    kanji,
    readings,
    sentences,
    grammar,
    grammarMeta,
    idioms,
    collocations,
    posts,
    courses,
  ] = await Promise.all([
    db.select().from(kgLexemes),
    db.select().from(kgSenses),
    db.select().from(kgGlosses),
    db.select().from(kgFrequency),
    db.select().from(kgKanji),
    db.select().from(kgKanjiReadings),
    db.select().from(kgSentences),
    db.select().from(kgGrammar),
    db.select().from(kgGrammarMeta),
    db.select().from(kgIdioms),
    db.select().from(kgCollocations),
    db.select().from(cmsPosts),
    db.select().from(cmsCourses),
  ]);

  const sensesByLexeme = new Map<string, string[]>();
  const senseToLexeme = new Map(senses.map((s) => [s.id, s.lexemeId]));
  for (const gloss of glosses) {
    const lexemeId = senseToLexeme.get(gloss.senseId);
    if (!lexemeId) continue;
    sensesByLexeme.set(lexemeId, [...(sensesByLexeme.get(lexemeId) ?? []), gloss.text]);
  }
  const rankByTarget = new Map(freq.map((f) => [f.targetId, f.rank]));
  const readingsByKanji = new Map<string, string[]>();
  for (const reading of readings) {
    readingsByKanji.set(reading.kanjiId, [...(readingsByKanji.get(reading.kanjiId) ?? []), reading.reading]);
  }
  const metaByGrammar = new Map(grammarMeta.map((m) => [m.grammarId, m]));

  const rows: IndexRow[] = [];

  for (const item of lexemes) {
    const meanings = sensesByLexeme.get(item.id) ?? [];
    rows.push(
      row({
        id: `si-lexeme-${item.id}`,
        kind: "lexeme",
        refId: item.id,
        href: `/dictionary/${item.id}`,
        title: item.lemma,
        subtitle: item.reading,
        body: [item.reading, ...romajiVariants(item.reading), ...meanings, item.pos, item.jlpt]
          .filter(Boolean)
          .join(" "),
        jlpt: item.jlpt,
        pos: item.pos,
        difficulty: null,
        boost: frequencyBoost(rankByTarget.get(item.id)),
      }),
    );
  }

  for (const item of kanji) {
    const kanjiReadings = readingsByKanji.get(item.id) ?? [];
    rows.push(
      row({
        id: `si-kanji-${item.id}`,
        kind: "kanji",
        refId: item.character,
        href: `/kanji/${encodeURIComponent(item.character)}`,
        title: item.character,
        subtitle: item.heisig ?? "",
        body: [
          item.searchDocument,
          ...kanjiReadings,
          ...kanjiReadings.flatMap((reading) => romajiVariants(reading)),
          item.radical,
        ]
          .filter(Boolean)
          .join(" "),
        jlpt: item.jlpt,
        pos: null,
        difficulty: item.strokes,
        boost: frequencyBoost(item.freq),
      }),
    );
  }

  for (const item of sentences) {
    rows.push(
      row({
        id: `si-sentence-${item.id}`,
        kind: "sentence",
        refId: item.id,
        href: `/dictionary?q=${encodeURIComponent(item.ja)}`,
        title: item.ja,
        subtitle: item.en,
        body: `${item.ja} ${item.en}`,
        jlpt: item.level,
        pos: null,
        difficulty: null,
        boost: 0.2,
      }),
    );
  }

  for (const item of grammar) {
    const meta = metaByGrammar.get(item.id);
    rows.push(
      row({
        id: `si-grammar-${item.id}`,
        kind: "grammar",
        refId: item.slug,
        href: `/grammar/${item.slug}`,
        title: item.title,
        subtitle: item.structure,
        body: [item.explanation, meta?.formation, meta?.nuance].filter(Boolean).join(" "),
        jlpt: item.level,
        pos: null,
        difficulty: meta?.difficulty ?? null,
        boost: 0.35,
      }),
    );
  }

  for (const item of idioms) {
    rows.push(
      row({
        id: `si-idiom-${item.id}`,
        kind: "idiom",
        refId: item.id,
        href: "/grammar",
        title: item.ja,
        subtitle: item.reading,
        body: `${item.reading} ${item.en}`,
        jlpt: null,
        pos: null,
        difficulty: null,
        boost: 0.15,
      }),
    );
  }

  for (const item of collocations) {
    rows.push(
      row({
        id: `si-colloc-${item.id}`,
        kind: "collocation",
        refId: item.id,
        href: "/grammar",
        title: `${item.leftJa}${item.rightJa}`,
        subtitle: item.en,
        body: `${item.leftJa} ${item.rightJa} ${item.en}`,
        jlpt: null,
        pos: null,
        difficulty: null,
        boost: 0.1,
      }),
    );
  }

  for (const item of posts) {
    if (item.status !== "published") continue;
    rows.push(
      row({
        id: `si-post-${item.id}`,
        kind: "post",
        refId: item.slug,
        href: `/blog/${item.slug}`,
        title: item.title,
        subtitle: item.excerpt,
        body: `${item.excerpt} ${item.body} ${item.tags}`,
        jlpt: null,
        pos: null,
        difficulty: null,
        boost: 0.25,
      }),
    );
  }

  for (const item of courses) {
    rows.push(
      row({
        id: `si-course-${item.id}`,
        kind: "course",
        refId: item.slug,
        href: `/billing`,
        title: item.title,
        subtitle: item.summary,
        body: `${item.summary} ${item.level}`,
        jlpt: item.level,
        pos: null,
        difficulty: null,
        boost: 0.3,
      }),
    );
  }

  return rows;
}

/**
 * Rebuilds the unified index, then recomputes weighted tsvectors in one pass.
 * Safe to run repeatedly — rows upsert on (kind, ref_id).
 */
export async function reindexSearch() {
  const started = Date.now();
  const rows = await collectRows();

  for (let offset = 0; offset < rows.length; offset += 200) {
    const chunk = rows.slice(offset, offset + 200);
    if (chunk.length === 0) continue;
    await db
      .insert(searchIndex)
      .values(chunk)
      .onConflictDoUpdate({
        target: [searchIndex.kind, searchIndex.refId],
        set: {
          href: sql`excluded.href`,
          title: sql`excluded.title`,
          titleNorm: sql`excluded.title_norm`,
          subtitle: sql`excluded.subtitle`,
          body: sql`excluded.body`,
          jlpt: sql`excluded.jlpt`,
          pos: sql`excluded.pos`,
          difficulty: sql`excluded.difficulty`,
          boost: sql`excluded.boost`,
          updatedAt: new Date(),
        },
      });
  }

  await db.execute(sql`
    UPDATE search_index SET tsv =
      setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(subtitle, '')), 'B') ||
      setweight(to_tsvector('simple', coalesce(body, '')), 'C')
  `);

  await rebuildSuggestionTerms(rows);
  return { indexed: rows.length, tookMs: Date.now() - started };
}

/**
 * Suggestions need Latin words too — a Japanese title alone can never fix an
 * English typo like "watre". We collect titles plus gloss words here.
 */
async function rebuildSuggestionTerms(rows: IndexRow[]) {
  const terms = new Map<string, { display: string; weight: number }>();
  const add = (display: string) => {
    const term = normalizeQuery(display);
    if (term.length < 2 || term.length > 40) return;
    const existing = terms.get(term);
    terms.set(term, { display, weight: (existing?.weight ?? 0) + 1 });
  };

  for (const item of rows) {
    add(item.title);
    for (const word of `${item.subtitle} ${item.body}`.split(/[\s,、。]+/)) {
      if (/^[a-zA-Z][a-zA-Z-]{1,}$/.test(word)) add(word.toLowerCase());
    }
  }

  const values = [...terms.entries()].map(([term, meta]) => ({
    term,
    display: meta.display,
    weight: meta.weight,
  }));

  for (let offset = 0; offset < values.length; offset += 300) {
    const chunk = values.slice(offset, offset + 300);
    if (chunk.length === 0) continue;
    await db
      .insert(searchTerms)
      .values(chunk)
      .onConflictDoUpdate({
        target: searchTerms.term,
        set: { display: sql`excluded.display`, weight: sql`excluded.weight` },
      });
  }
}

export async function searchIndexSize() {
  const result = await db.execute<{ kind: string; n: string }>(
    sql`SELECT kind, count(*)::text AS n FROM search_index GROUP BY kind ORDER BY kind`,
  );
  const byKind: Record<string, number> = {};
  let total = 0;
  for (const item of result.rows) {
    byKind[item.kind] = Number(item.n);
    total += Number(item.n);
  }
  return { total, byKind };
}
