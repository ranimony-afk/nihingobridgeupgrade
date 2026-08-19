import { sql } from "drizzle-orm";
import { db } from "@/db";
import { cmsPosts } from "@/db/schema";
import { composePost, isoDay, slugForDate, topicForDate, type PostSource } from "./compose";

export { composePost, slugForDate, topicForDate };
export type { GeneratedPost, PostSource } from "./compose";

/**
 * Daily blog generator.
 *
 * Posts are assembled from the knowledge graph, so each one contains real
 * vocabulary, kanji and grammar rather than filler. Thin auto-generated pages
 * are a spam signal, so a post is only written when there is enough source
 * material to fill it.
 */

type Source = PostSource;

/** Rotates the slice by day so consecutive posts do not repeat the same rows. */
async function gatherSource(date: Date): Promise<Source> {
  const offset = Math.floor(date.getTime() / 86400000) % 7;

  const lexemes = await db.execute<{
    id: string;
    lemma: string;
    reading: string;
    gloss: string;
    jlpt: string | null;
  }>(sql`
    SELECT l.id, l.lemma, l.reading, l.jlpt,
      COALESCE((SELECT g.text FROM kg_senses s JOIN kg_glosses g ON g.sense_id = s.id
                WHERE s.lexeme_id = l.id AND g.lang = 'en' LIMIT 1), '') AS gloss
    FROM kg_lexemes l
    WHERE l.jlpt IS NOT NULL
    ORDER BY l.id
    LIMIT 5 OFFSET ${offset * 5}
  `);

  const kanji = await db.execute<{
    character: string;
    meaning: string;
    strokes: number;
    jlpt: string | null;
  }>(sql`
    SELECT character, COALESCE(heisig, '') AS meaning, strokes, jlpt
    FROM kg_kanji ORDER BY COALESCE(freq, 9999) LIMIT 5 OFFSET ${offset * 5}
  `);

  const grammar = await db.execute<{
    title: string;
    structure: string;
    explanation: string;
    slug: string;
    level: string;
  }>(sql`
    SELECT title, structure, explanation, slug, level
    FROM kg_grammar ORDER BY slug LIMIT 3 OFFSET ${offset * 3}
  `);

  return {
    lexemes: lexemes.rows,
    kanji: kanji.rows,
    grammar: grammar.rows,
  };
}

/**
 * Generates (or regenerates) the post for a given day.
 * Idempotent: the slug is date-derived, so re-running updates rather than
 * creating a duplicate — important because duplicates would compete in search.
 */
export async function generateDailyPost(date = new Date(), publish = true) {
  const source = await gatherSource(date);
  const post = composePost(date, source);
  if (!post) return { ok: false as const, reason: "not enough source content" };

  const existing = await db.execute<{ id: string }>(
    sql`SELECT id FROM cms_posts WHERE slug = ${post.slug} LIMIT 1`,
  );

  if (existing.rows.length > 0) {
    await db.execute(sql`
      UPDATE cms_posts SET title = ${post.title}, excerpt = ${post.excerpt}, body = ${post.body},
        tags = ${post.tags}, seo_title = ${post.seoTitle}, seo_description = ${post.seoDescription},
        updated_at = now()
      WHERE slug = ${post.slug}
    `);
    return { ok: true as const, slug: post.slug, created: false, title: post.title };
  }

  await db.insert(cmsPosts).values({
    id: `post-${post.slug}`,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    body: post.body,
    status: publish ? "published" : "draft",
    tags: post.tags,
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
  });
  return { ok: true as const, slug: post.slug, created: true, title: post.title };
}

/** Backfills the last N days, useful when first enabling the generator. */
export async function backfillDailyPosts(days = 7) {
  const results = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - offset);
    results.push(await generateDailyPost(date, true));
  }
  return {
    attempted: results.length,
    created: results.filter((row) => row.ok && row.created).length,
    updated: results.filter((row) => row.ok && !row.created).length,
  };
}
