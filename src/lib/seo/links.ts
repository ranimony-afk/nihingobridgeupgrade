import { sql } from "drizzle-orm";
import { db } from "@/db";

export type InternalLink = { href: string; label: string; kind: string; reason: string };

/**
 * Internal linking.
 *
 * Orphan pages — indexed but linked from nowhere — get crawled rarely and rank
 * poorly. The knowledge graph already stores relationships, so we surface them
 * as real contextual links rather than a generic "related posts" block.
 */

/** Links out of a dictionary entry: its kanji, and neighbours by JLPT level. */
export async function linksForLexeme(lexemeId: string, limit = 6): Promise<InternalLink[]> {
  const rows = await db.execute<{
    href: string;
    label: string;
    kind: string;
    reason: string;
  }>(sql`
    WITH me AS (SELECT lemma, jlpt FROM kg_lexemes WHERE id = ${lexemeId})
    -- Kanji used inside this word
    SELECT '/kanji/' || k.character AS href, k.character AS label,
           'kanji' AS kind, 'Kanji in this word' AS reason
    FROM kg_kanji k, me
    WHERE position(k.character in me.lemma) > 0
    UNION ALL
    -- Same JLPT level, different word
    SELECT '/dictionary/' || l.id, l.lemma, 'lexeme', 'Same JLPT level'
    FROM kg_lexemes l, me
    WHERE l.jlpt = me.jlpt AND l.id <> ${lexemeId}
    LIMIT ${limit}
  `);
  return rows.rows;
}

/** Links out of a kanji page: words that contain it, plus its JLPT siblings. */
export async function linksForKanji(character: string, limit = 8): Promise<InternalLink[]> {
  const rows = await db.execute<{
    href: string;
    label: string;
    kind: string;
    reason: string;
  }>(sql`
    SELECT '/dictionary/' || l.id AS href, l.lemma AS label,
           'lexeme' AS kind, 'Uses this kanji' AS reason
    FROM kg_lexemes l
    WHERE position(${character} in l.lemma) > 0
    LIMIT ${limit}
  `);
  return rows.rows;
}

/** Links out of a grammar point: its prerequisites and what it unlocks. */
export async function linksForGrammar(grammarId: string, limit = 6): Promise<InternalLink[]> {
  const rows = await db.execute<{
    href: string;
    label: string;
    kind: string;
    reason: string;
  }>(sql`
    SELECT '/grammar/' || g.slug AS href, g.title AS label, 'grammar' AS kind,
           CASE WHEN e.to_id = ${grammarId} THEN 'Learn this first' ELSE 'Unlocks next' END AS reason
    FROM kg_grammar_edges e
    JOIN kg_grammar g ON g.id = CASE WHEN e.to_id = ${grammarId} THEN e.from_id ELSE e.to_id END
    WHERE e.from_id = ${grammarId} OR e.to_id = ${grammarId}
    LIMIT ${limit}
  `);
  return rows.rows;
}

/** Related published posts, matched on shared tags then recency. */
export async function relatedPosts(slug: string, tags: string, limit = 3): Promise<InternalLink[]> {
  const first = (tags.split(",")[0] ?? "").trim();
  const rows = await db.execute<{ href: string; label: string; kind: string; reason: string }>(sql`
    SELECT '/blog/' || slug AS href, title AS label, 'post' AS kind,
           CASE WHEN ${first} <> '' AND tags ILIKE ${`%${first}%`}
                THEN 'Related topic' ELSE 'Recently published' END AS reason
    FROM cms_posts
    WHERE status = 'published' AND slug <> ${slug}
    ORDER BY (${first} <> '' AND tags ILIKE ${`%${first}%`}) DESC, updated_at DESC
    LIMIT ${limit}
  `);
  return rows.rows;
}
