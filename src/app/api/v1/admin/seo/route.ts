import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getStaffSession } from "@/lib/audit/auth";
import { backfillDailyPosts, generateDailyPost, topicForDate } from "@/lib/seo/blog";
import { canonical } from "@/lib/seo/config";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  await seedReady();
  const staff = await getStaffSession();
  if (!staff) return Response.json({ ok: false, error: "Staff login required" }, { status: 401 });

  const [counts] = (
    await db.execute<{
      published: string;
      drafts: string;
      generated: string;
      lexemes: string;
      kanji: string;
      grammar: string;
      noindex: string;
    }>(sql`
      SELECT
        (SELECT count(*) FROM cms_posts WHERE status = 'published')::text AS published,
        (SELECT count(*) FROM cms_posts WHERE status <> 'published')::text AS drafts,
        (SELECT count(*) FROM cms_posts WHERE slug LIKE 'daily-%')::text AS generated,
        (SELECT count(*) FROM kg_lexemes)::text AS lexemes,
        (SELECT count(*) FROM kg_kanji)::text AS kanji,
        (SELECT count(*) FROM kg_grammar)::text AS grammar,
        (SELECT count(*) FROM cms_seo WHERE noindex = true)::text AS noindex
    `)
  ).rows;

  const recent = await db.execute<{ slug: string; title: string; updated_at: string }>(
    sql`SELECT slug, title, updated_at::text FROM cms_posts WHERE slug LIKE 'daily-%'
        ORDER BY updated_at DESC LIMIT 10`,
  );

  const indexable =
    Number(counts?.published ?? 0) +
    Number(counts?.lexemes ?? 0) +
    Number(counts?.kanji ?? 0) +
    Number(counts?.grammar ?? 0);

  return Response.json({
    ok: true,
    data: {
      counts: {
        published: Number(counts?.published ?? 0),
        drafts: Number(counts?.drafts ?? 0),
        generated: Number(counts?.generated ?? 0),
        lexemes: Number(counts?.lexemes ?? 0),
        kanji: Number(counts?.kanji ?? 0),
        grammar: Number(counts?.grammar ?? 0),
        noindex: Number(counts?.noindex ?? 0),
        indexable,
      },
      todayTopic: topicForDate(new Date()).label,
      recent: recent.rows,
      urls: {
        sitemap: canonical("/sitemap.xml"),
        robots: canonical("/robots.txt"),
        feed: canonical("/feed.xml"),
      },
    },
  });
}

export async function POST(request: Request) {
  await seedReady();
  const staff = await getStaffSession();
  if (!staff) return Response.json({ ok: false, error: "Staff login required" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { action?: string; days?: number };
  if (body.action === "backfill") {
    const days = Math.min(Math.max(body.days ?? 7, 1), 30);
    return Response.json({ ok: true, data: await backfillDailyPosts(days) });
  }
  const result = await generateDailyPost(new Date(), true);
  if (!result.ok) return Response.json({ ok: false, error: result.reason }, { status: 400 });
  return Response.json({ ok: true, data: result });
}
