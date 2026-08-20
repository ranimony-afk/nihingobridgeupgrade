import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { AdminShell } from "@/components/AdminShell";
import { SeoTools } from "@/components/seo/SeoTools";
import { getStaffSession } from "@/lib/audit/auth";
import { canonical } from "@/lib/seo/config";
import { topicForDate } from "@/lib/seo/blog";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function AdminSeoPage() {
  await seedReady();
  const staff = await getStaffSession();
  if (!staff) redirect("/admin/login");

  const [counts] = (
    await db.execute<{
      published: string;
      generated: string;
      lexemes: string;
      kanji: string;
      grammar: string;
      noindex: string;
    }>(sql`
      SELECT
        (SELECT count(*) FROM cms_posts WHERE status = 'published')::text AS published,
        (SELECT count(*) FROM cms_posts WHERE slug LIKE 'daily-%')::text AS generated,
        (SELECT count(*) FROM kg_lexemes)::text AS lexemes,
        (SELECT count(*) FROM kg_kanji)::text AS kanji,
        (SELECT count(*) FROM kg_grammar)::text AS grammar,
        (SELECT count(*) FROM cms_seo WHERE noindex = true)::text AS noindex
    `)
  ).rows;

  const recent = await db.execute<{ slug: string; title: string; updated_at: string }>(
    sql`SELECT slug, title, updated_at::text FROM cms_posts WHERE slug LIKE 'daily-%'
        ORDER BY updated_at DESC LIMIT 8`,
  );

  const indexable =
    Number(counts?.published ?? 0) +
    Number(counts?.lexemes ?? 0) +
    Number(counts?.kanji ?? 0) +
    Number(counts?.grammar ?? 0);

  const stats = [
    { label: "Indexable URLs", value: indexable.toLocaleString(), tone: "#58cc02" },
    { label: "Published posts", value: Number(counts?.published ?? 0).toLocaleString(), tone: "#1cb0f6" },
    { label: "Auto-generated", value: Number(counts?.generated ?? 0).toLocaleString(), tone: "#ce82ff" },
    { label: "Noindex pages", value: Number(counts?.noindex ?? 0).toLocaleString(), tone: "#ff9600" },
  ];

  return (
    <AdminShell staff={staff}>
      <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#58cc02]">SEO</p>
      <h1 className="text-4xl font-black">Search presence</h1>
      <p className="mt-2 text-sm text-white/60">
        Canonical URLs, Schema.org, OpenGraph, RSS, and the daily blog generator.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <article key={stat.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-white/50">{stat.label}</p>
            <p className="mt-1 text-2xl font-black" style={{ color: stat.tone }}>
              {stat.value}
            </p>
          </article>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 p-5">
          <h2 className="text-xl font-black">Daily blog generator</h2>
          <p className="mt-1 text-xs text-white/50">
            Today&apos;s topic: <strong>{topicForDate(new Date()).label}</strong>. Posts are built from the
            knowledge graph and are idempotent per day.
          </p>
          <SeoTools />
          <ul className="mt-4 space-y-1 text-sm text-white/70">
            {recent.rows.map((row) => (
              <li key={row.slug}>
                <Link href={`/blog/${row.slug}`} className="font-bold text-white hover:text-[#58cc02]">
                  {row.title}
                </Link>
              </li>
            ))}
            {recent.rows.length === 0 ? <li>No generated posts yet.</li> : null}
          </ul>
        </section>

        <section className="rounded-2xl border border-white/10 p-5">
          <h2 className="text-xl font-black">Crawler endpoints</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {[
              { label: "Sitemap", href: "/sitemap.xml" },
              { label: "Robots", href: "/robots.txt" },
              { label: "RSS feed", href: "/feed.xml" },
            ].map((row) => (
              <li key={row.href} className="flex items-center justify-between gap-3">
                <span className="text-white/70">{row.label}</span>
                <a href={row.href} className="font-mono text-xs text-[#1cb0f6]" target="_blank" rel="noreferrer">
                  {canonical(row.href)}
                </a>
              </li>
            ))}
          </ul>
          <h3 className="mt-5 text-sm font-black">Structured data in use</h3>
          <ul className="mt-2 space-y-1 text-xs text-white/60">
            <li>Organization + WebSite (sitelinks search box)</li>
            <li>Article on blog posts</li>
            <li>DefinedTerm on dictionary entries</li>
            <li>LearningResource on kanji and grammar</li>
            <li>BreadcrumbList on every detail page</li>
          </ul>
        </section>
      </div>
    </AdminShell>
  );
}
