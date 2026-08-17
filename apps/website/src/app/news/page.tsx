import Link from "next/link";
import { db } from "@/db";
import { newsArticles } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { ensureSeed } from "@/lib/seed";
import { BrandHeader } from "@/shared/components/BrandHeader";
import { getBrand } from "@/lib/brands";

export const dynamic = "force-dynamic";

export default async function NewsFeedPage({
  searchParams,
}: {
  searchParams: Promise<{ difficulty?: string }>;
}) {
  await ensureSeed();
  const { difficulty = "all" } = await searchParams;
  const cfg = getBrand("nihongo")!;

  const allArticles = await db.select().from(newsArticles).orderBy(desc(newsArticles.publishedAt));
  const filtered = difficulty === "all" ? allArticles : allArticles.filter((a) => a.difficultyLevel === difficulty);
  const todayArticle = allArticles.find((a) => a.isToday) ?? allArticles[0];

  return (
    <main
      className="min-h-screen px-6 py-12"
      style={{ background: cfg.theme.surface, color: cfg.theme.text }}
    >
      <div className="mx-auto max-w-5xl space-y-8">
        <BrandHeader brand={cfg} />

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: cfg.theme.primary }}>
              TODAI-Style Japanese News Reader 📰
            </h1>
            <p className="mt-1 text-sm opacity-80">
              Read real daily Japanese news with furigana, vocabulary extraction, audio playback, and multilingual translations (English, Tamil, Malayalam).
            </p>
          </div>

          <Link
            href="/news/today"
            className="rounded-xl px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90"
            style={{ background: cfg.theme.accent }}
          >
            ⚡ Read Today’s News
          </Link>
        </div>

        {/* Today's Featured Top Article Banner */}
        {todayArticle && (
          <div className="rounded-3xl bg-white p-8 shadow-sm border border-black/5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-rose-600 px-3 py-0.5 text-xs font-bold text-white uppercase tracking-wider">
                TODAY'S HIGHLIGHT
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700 uppercase">
                {todayArticle.difficultyLevel}
              </span>
              <span className="text-xs opacity-60">⏱ {todayArticle.readingMinutes} min read</span>
            </div>

            <h2 className="text-2xl font-bold text-slate-950">
              {todayArticle.title}
            </h2>
            <p className="text-sm opacity-80">{todayArticle.summary}</p>

            <Link
              href={`/news/${todayArticle.slug}`}
              className="inline-block rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-800 transition"
            >
              Read Article with Furigana →
            </Link>
          </div>
        )}

        {/* JLPT Difficulty Filters */}
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          {["all", "N5", "N4", "N3", "N2", "N1"].map((lvl) => (
            <Link
              key={lvl}
              href={`/news?difficulty=${lvl}`}
              className={`rounded-lg px-3 py-1.5 transition ${
                difficulty === lvl ? "bg-slate-900 text-white" : "bg-white/80 hover:bg-white text-slate-700 shadow-2xs"
              }`}
            >
              {lvl === "all" ? "All Levels" : `JLPT ${lvl}`}
            </Link>
          ))}
        </div>

        {/* News Feed Grid */}
        <div className="grid gap-6 sm:grid-cols-2">
          {filtered.map((article) => (
            <Link
              key={article.id}
              href={`/news/${article.slug}`}
              className="group flex flex-col justify-between rounded-2xl bg-white p-6 shadow-sm border border-black/5 transition hover:-translate-y-1 hover:shadow-md"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="rounded-full bg-rose-100 px-2.5 py-0.5 font-bold text-rose-800 uppercase">
                    {article.difficultyLevel}
                  </span>
                  <span className="opacity-50">⏱ {article.readingMinutes} min read</span>
                </div>

                <h3 className="text-lg font-semibold group-hover:text-rose-700 transition text-slate-950">
                  {article.title}
                </h3>
                <p className="text-xs opacity-75 line-clamp-2">{article.summary}</p>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-black/5 pt-3 text-xs font-medium">
                <span className="text-rose-600">Open Interactive Reader →</span>
                <span className="opacity-50">🔊 Audio ready</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
