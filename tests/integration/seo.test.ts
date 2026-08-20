import assert from "node:assert/strict";
import { test } from "node:test";
import "dotenv/config";
import { backfillDailyPosts, generateDailyPost } from "../../src/lib/seo/blog.ts";
import { canonical, isPrivatePath } from "../../src/lib/seo/config.ts";
import { linksForKanji, linksForLexeme, relatedPosts } from "../../src/lib/seo/links.ts";
import { listPosts } from "../../src/lib/cms/service.ts";
import { seedReady } from "../../src/lib/seed.ts";

test("canonical URLs are absolute and have one spelling", async () => {
  assert.ok(canonical("/blog").startsWith("http"));
  // Trailing slash, query and fragment must all collapse to the same URL.
  assert.equal(canonical("/blog/x/"), canonical("/blog/x"));
  assert.equal(canonical("/blog/x?utm_source=twitter"), canonical("/blog/x"));
  assert.equal(canonical("/blog/x#section"), canonical("/blog/x"));
  // Root keeps its slash.
  assert.ok(canonical("/").endsWith("/"));
});

test("private routes are recognised so they never reach the sitemap", () => {
  assert.equal(isPrivatePath("/admin"), true);
  assert.equal(isPrivatePath("/admin/seo"), true);
  assert.equal(isPrivatePath("/api/v1/search"), true);
  assert.equal(isPrivatePath("/billing"), true);
  assert.equal(isPrivatePath("/dictionary"), false);
  // Must not match a public path that merely starts with the same letters.
  assert.equal(isPrivatePath("/administrivia"), false);
});

test("daily post generation is idempotent for the same day", async () => {
  assert.equal(await seedReady(), true);
  const date = new Date();
  const first = await generateDailyPost(date, true);
  assert.equal(first.ok, true);
  if (!first.ok) return;

  const second = await generateDailyPost(date, true);
  assert.equal(second.ok, true);
  if (!second.ok) return;

  assert.equal(second.slug, first.slug);
  // Re-running must update, never create a competing duplicate.
  assert.equal(second.created, false);

  const posts = await listPosts(true);
  const matches = posts.filter((row) => row.slug === first.slug);
  assert.equal(matches.length, 1);
});

test("backfill produces one post per day", async () => {
  await seedReady();
  const result = await backfillDailyPosts(5);
  assert.equal(result.attempted, 5);
  const posts = await listPosts(true);
  const daily = posts.filter((row) => row.slug.startsWith("daily-"));
  const slugs = new Set(daily.map((row) => row.slug));
  assert.equal(slugs.size, daily.length, "generated slugs must be unique");
});

test("generated posts contain internal links, not orphan pages", async () => {
  await seedReady();
  const posts = (await listPosts(true)).filter((row) => row.slug.startsWith("daily-"));
  assert.ok(posts.length > 0);
  for (const post of posts) {
    assert.ok(post.body.includes("]("), `${post.slug} should link internally`);
    assert.ok(post.seoDescription, `${post.slug} needs a meta description`);
  }
});

test("internal link builders return real destinations", async () => {
  await seedReady();
  const kanjiLinks = await linksForKanji("水");
  for (const link of kanjiLinks) {
    assert.ok(link.href.startsWith("/"), "links must be site-relative");
    assert.ok(link.label.length > 0);
  }

  const posts = await listPosts(true);
  if (posts[0]) {
    const related = await relatedPosts(posts[0].slug, posts[0].tags);
    // A page must never link to itself as "related".
    assert.ok(related.every((row) => row.href !== `/blog/${posts[0]!.slug}`));
  }

  const lexemeLinks = await linksForLexeme("lex-1000006");
  assert.ok(Array.isArray(lexemeLinks));
});

test("RSS feed is well-formed and escapes content", async () => {
  await seedReady();
  const { GET } = await import("../../src/app/feed.xml/route.ts");
  const response = await GET();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/rss\+xml/);

  const xml = await response.text();
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes("<rss version=\"2.0\""));
  assert.ok(xml.includes("<atom:link"));
  assert.ok(xml.trimEnd().endsWith("</rss>"));

  // Tags must be balanced, or readers reject the document.
  const opens = (xml.match(/<item>/g) ?? []).length;
  const closes = (xml.match(/<\/item>/g) ?? []).length;
  assert.equal(opens, closes);
  assert.ok(opens > 0, "feed should contain items");

  // No raw ampersand outside an entity or CDATA.
  const withoutCdata = xml.replace(/<!\[CDATA\[[\s\S]*?]]>/g, "");
  const badAmp = withoutCdata.match(/&(?!(amp|lt|gt|quot|apos|#\d+);)/g);
  assert.equal(badAmp, null, `unescaped ampersand: ${badAmp?.join(", ")}`);
});

test("sitemap excludes private and noindex URLs", async () => {
  await seedReady();
  const { default: sitemap } = await import("../../src/app/sitemap.ts");
  const entries = await sitemap();
  assert.ok(entries.length > 10);

  for (const entry of entries) {
    assert.ok(entry.url.startsWith("http"), "sitemap URLs must be absolute");
    const path = new URL(entry.url).pathname;
    assert.equal(isPrivatePath(path), false, `${path} is private and must not be listed`);
  }

  // Google rejects sitemaps over 50k URLs.
  assert.ok(entries.length <= 50000);

  // Duplicate URLs waste crawl budget.
  const urls = entries.map((entry) => entry.url);
  assert.equal(new Set(urls).size, urls.length, "sitemap must not repeat URLs");

  // Content types beyond the blog should be present.
  assert.ok(urls.some((url) => url.includes("/dictionary/")));
  assert.ok(urls.some((url) => url.includes("/kanji/")));
});
