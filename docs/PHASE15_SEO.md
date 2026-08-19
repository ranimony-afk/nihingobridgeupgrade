# Phase 15 — SEO

Extends the sitemap/robots from Phase 10 and the `cms_seo` table, rather than
replacing them.

## Canonical URLs

One spelling per page. `canonical()` strips query strings and fragments and
normalises trailing slashes, so `/blog/x`, `/blog/x/` and `/blog/x?utm=twitter`
all resolve to the same canonical. Without this, crawlers treat them as three
competing URLs and split ranking signals.

## Schema.org

| Type | Where |
| --- | --- |
| Organization + WebSite | Every page (sitelinks search box) |
| Article | Blog posts |
| DefinedTerm | Dictionary entries |
| LearningResource | Kanji and grammar |
| BreadcrumbList | Every detail page |

`serializeJsonLd` escapes `<` so a value containing `</script>` cannot break out
of the tag.

## OpenGraph and Discover

Every page gets OG + Twitter card tags with an absolute image URL.
`max-image-preview:large` is set for Googlebot — without it Google will not
surface the page as a Discover image card, which is the entire surface.

## RSS

`/feed.xml` is RSS 2.0 with an Atom self-link, Dublin Core, and
`content:encoded`. Escaping matters more than it looks: one raw `&` makes the
whole document malformed and readers reject the **entire file**, not just the
bad item. `]]>` inside a payload is split across two CDATA sections.

## Sitemap

Covers posts, dictionary entries, kanji, grammar, and stories.

Two rules:
1. Pages marked `noindex` in the CMS are excluded — submitting a noindex URL
   sends contradictory signals and wastes crawl budget. The previous sitemap
   ignored that column entirely.
2. Private routes never appear, checked with a prefix guard that does not
   match `/administrivia` for `/admin`.

Capped at Google's 50,000-URL limit.

## Internal linking

Orphan pages get crawled rarely and rank poorly. The knowledge graph already
stores relationships, so links are contextual and real:

- Dictionary entry → its kanji, and same-JLPT neighbours
- Kanji → words containing it
- Grammar → prerequisites and what it unlocks
- Blog → posts sharing a tag

## Daily blog generator

Posts are assembled from the knowledge graph, so each contains real vocabulary,
kanji or grammar with internal links — not filler. Thin auto-generated pages are
a spam signal, so `composePost` returns `null` when there is not enough source
material.

The slug is date-derived (`daily-kanji-2026-03-11`), which makes regeneration
**idempotent** — re-running updates in place instead of creating a duplicate
that would compete with the original in search.

Topics rotate vocabulary → kanji → grammar so consecutive days differ.

`/admin/seo` has manual generate and 7-day backfill.
