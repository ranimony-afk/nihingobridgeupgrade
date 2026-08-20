import type { MetadataRoute } from "next";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { PUBLIC_ROUTES, canonical, isPrivatePath } from "@/lib/seo/config";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * Sitemap across every public content type.
 *
 * Two rules matter here:
 *  1. A page marked `noindex` in the CMS is excluded. Submitting a noindex URL
 *     sends crawlers contradictory signals and wastes crawl budget.
 *  2. Private routes never appear, even if something links to them.
 *
 * Google caps a single sitemap at 50,000 URLs, so content types are capped.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];

  const push = (
    path: string,
    lastModified: Date,
    changeFrequency: "daily" | "weekly" | "monthly",
    priority: number,
  ) => {
    if (isPrivatePath(path)) return;
    entries.push({ url: canonical(path), lastModified, changeFrequency, priority });
  };

  try {
    await seedReady();

    const noindex = new Set(
      (
        await db.execute<{ path: string }>(sql`SELECT path FROM cms_seo WHERE noindex = true`)
      ).rows.map((row) => row.path),
    );

    for (const route of PUBLIC_ROUTES) {
      if (noindex.has(route.path)) continue;
      push(route.path, now, route.changeFrequency, route.priority);
    }

    const posts = await db.execute<{ slug: string; updated_at: string }>(
      sql`SELECT slug, updated_at::text FROM cms_posts WHERE status = 'published' ORDER BY updated_at DESC LIMIT 5000`,
    );
    for (const row of posts.rows) {
      push(`/blog/${row.slug}`, new Date(row.updated_at), "monthly", 0.7);
    }

    const lexemes = await db.execute<{ id: string }>(
      sql`SELECT id FROM kg_lexemes ORDER BY id LIMIT 20000`,
    );
    for (const row of lexemes.rows) push(`/dictionary/${row.id}`, now, "monthly", 0.6);

    const kanji = await db.execute<{ character: string }>(
      sql`SELECT character FROM kg_kanji ORDER BY COALESCE(freq, 9999) LIMIT 13000`,
    );
    for (const row of kanji.rows) {
      push(`/kanji/${encodeURIComponent(row.character)}`, now, "monthly", 0.6);
    }

    const grammar = await db.execute<{ slug: string }>(
      sql`SELECT slug FROM kg_grammar ORDER BY slug LIMIT 10000`,
    );
    for (const row of grammar.rows) push(`/grammar/${row.slug}`, now, "monthly", 0.6);

    const stories = await db.execute<{ slug: string }>(
      sql`SELECT slug FROM stories ORDER BY slug LIMIT 1000`,
    );
    for (const row of stories.rows) push(`/stories/${row.slug}`, now, "monthly", 0.5);
  } catch {
    // A database hiccup must still yield a valid sitemap of static routes.
    for (const route of PUBLIC_ROUTES) {
      push(route.path, now, route.changeFrequency, route.priority);
    }
  }

  return entries.slice(0, 50000);
}
