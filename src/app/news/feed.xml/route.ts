import { db } from "@/db";
import { newsArticles } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const articles = await db
    .select()
    .from(newsArticles)
    .orderBy(desc(newsArticles.publishedAt))
    .limit(20);

  const itemsXml = articles
    .map(
      (art) => `
    <item>
      <title><![CDATA[${art.title}]]></title>
      <link>https://nihongobridge.com/news/${art.slug}</link>
      <guid>https://nihongobridge.com/news/${art.slug}</guid>
      <pubDate>${new Date(art.publishedAt).toUTCString()}</pubDate>
      <description><![CDATA[${art.summary}]]></description>
    </item>
  `,
    )
    .join("");

  const rssXml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>Nihongo Bridge Daily Japanese News Feed</title>
  <link>https://nihongobridge.com/news</link>
  <description>Daily current events, Todaii shadowing transcripts, and NHK Easy Japanese readings.</description>
  <language>en-us</language>
  <pubDate>${new Date().toUTCString()}</pubDate>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
  ${itemsXml}
</channel>
</rss>`;

  return new Response(rssXml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
