import { listPosts } from "@/lib/cms/service";
import { SITE, absoluteImage, canonical } from "@/lib/seo/config";
import { cdata, excerptFrom, rfc822, xmlText } from "@/lib/seo/xml";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

/** RSS 2.0 with Atom self-link and Dublin Core, which most readers expect. */
export async function GET() {
  await seedReady();
  const posts = await listPosts(true);
  const feedUrl = canonical("/feed.xml");
  const latest = posts[0]?.updatedAt ?? new Date();

  const items = posts
    .slice(0, 50)
    .map((post) => {
      const url = canonical(`/blog/${post.slug}`);
      const summary = post.excerpt || excerptFrom(post.body, 200);
      return `    <item>
      <title>${xmlText(post.title)}</title>
      <link>${xmlText(url)}</link>
      <guid isPermaLink="true">${xmlText(url)}</guid>
      <pubDate>${rfc822(post.updatedAt)}</pubDate>
      <dc:creator>${xmlText(SITE.name)}</dc:creator>
      <description>${cdata(summary)}</description>
      <content:encoded>${cdata(post.body)}</content:encoded>
${post.tags
  .split(",")
  .map((tag) => tag.trim())
  .filter(Boolean)
  .map((tag) => `      <category>${xmlText(tag)}</category>`)
  .join("\n")}
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${xmlText(`${SITE.name} — ${SITE.tagline}`)}</title>
    <link>${xmlText(canonical("/blog"))}</link>
    <description>${xmlText(SITE.description)}</description>
    <language>en</language>
    <lastBuildDate>${rfc822(latest)}</lastBuildDate>
    <image>
      <url>${xmlText(absoluteImage(SITE.logo))}</url>
      <title>${xmlText(SITE.name)}</title>
      <link>${xmlText(canonical("/blog"))}</link>
    </image>
    <atom:link href="${xmlText(feedUrl)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=600, stale-while-revalidate=3600",
    },
  });
}
