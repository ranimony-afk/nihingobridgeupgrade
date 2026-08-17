import Link from "next/link";
import { notFound } from "next/navigation";
import { getBrand } from "@/lib/brands";
import { ensureSeed } from "@/lib/seed";
import { BrandService, CourseService, PageService, CmsService } from "@/shared/services";
import { BrandHeader, CourseCard } from "@/shared/components";
import { CmsSection } from "@/shared/components/CmsSection";
import { db } from "@/db";
import {
  translations,
  learnerGamification,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function BrandHome({
  params,
  searchParams,
}: {
  params: Promise<{ brand: string }>;
  searchParams: Promise<{ lang?: string; tab?: string; mode?: string }>;
}) {
  const { brand: brandSlug } = await params;
  const { lang = "en", mode = "all" } = await searchParams;
  const cfg = getBrand(brandSlug);
  if (!cfg) notFound();

  try {
    await ensureSeed();
  } catch (err) {
    // Branded Diagnostic Error Screen (Phase 20 / Prompt 20 Hardening)
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-900 text-white p-8">
        <div className="max-w-md w-full space-y-6 text-center">
          <span className="rounded-full bg-rose-500/20 text-rose-300 px-3 py-1 text-xs font-bold uppercase tracking-wider">
            🚨 Connection Outage
          </span>
          <h1 className="text-3xl font-black tracking-tight">Database Connectivity Outage</h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            The platform could not establish a connection to your PostgreSQL database. This is usually caused by missing or incorrect environment credentials on Vercel.
          </p>
          <div className="rounded-2xl bg-slate-950 p-4 border border-white/10 text-left font-mono text-[11px] text-slate-400 space-y-1">
            <p className="text-rose-400 font-bold">Error: {(err as Error).message}</p>
            <p className="pt-2"><b>Troubleshooting steps:</b></p>
            <p>1. Go to Vercel Project Dashboard &rarr; Settings &rarr; Environment Variables.</p>
            <p>2. Ensure <b>DATABASE_URL</b> is set to your Supabase Transaction Pooler connection string.</p>
            <p>3. Redeploy the branch on Vercel.</p>
          </div>
          <Link
            href={`/${brandSlug}`}
            className="inline-block rounded-xl bg-white text-slate-950 px-5 py-2.5 text-xs font-bold hover:bg-slate-100 transition"
          >
            🔄 Reload Page
          </Link>
        </div>
      </main>
    );
  }

  const brand = await BrandService.getBySlug(brandSlug);
  if (!brand) notFound();

  // Translations
  const dbTranslationRows = await db
    .select()
    .from(translations)
    .where(
      and(
        eq(translations.entityType, "brand"),
        eq(translations.entityId, brand.id),
        eq(translations.locale, lang),
      ),
    );

  const tMap = new Map(dbTranslationRows.map((r) => [r.field, r.value]));
  const localizedTagline = tMap.get("tagline") ?? cfg.tagline;
  const localizedBadge = tMap.get("hero_badge") ?? (cfg.key === "nihongo" ? "JLPT N5 – N1 • Japan Careers" : "Engineering & Leadership");
  const localizedNavCourses = tMap.get("nav_courses") ?? "Curriculum & JLPT Tracks";

  const home = await PageService.getPublished(brand.id, "home", "en");
  const publishedCourses = await CourseService.getPublished(brand.id, "en");
  const cmsSections = await CmsService.getSections(brand.id, "home", "en");
  const footerSettings = (await CmsService.getSettings(brand.id, "footer")) as { copyright?: string; tagline?: string } | null;
  const navSettings = (await CmsService.getSettings(brand.id, "navigation")) as { megaMenuTitle?: string; links?: Array<{ label: string; href: string; icon?: string; badge?: string; description?: string }> } | null;

  let customMegaMenuCategories = undefined;
  if (navSettings?.links && navSettings.links.length > 0) {
    customMegaMenuCategories = [
      {
        title: navSettings.megaMenuTitle || "CMS Navigation",
        items: navSettings.links.map((l) => ({
          label: l.label,
          href: l.href,
          icon: l.icon || "🔗",
          badge: l.badge,
          description: l.description || "Database synchronized link",
        })),
      },
    ];
  }

  const gamifyRows = cfg.key === "nihongo" ? await db.select().from(learnerGamification).limit(1) : [];
  const studentStats = gamifyRows[0] ?? {
    xp: 420,
    streakDays: 8,
    dailyGoalMinutes: 15,
    level: 3,
    levelTitle: "Hiragana Adept",
    streakFreezes: 2,
  };

  // Find announcement bar section if present
  const announcementSection = cmsSections.find((s) => s.sectionKey === "announcement_bar");
  const mainSections = cmsSections.filter((s) => s.sectionKey !== "announcement_bar");

  return (
    <main
      className="min-h-screen px-6 py-8"
      style={{ background: cfg.theme.surface, color: cfg.theme.text }}
    >
      <head>
        <link rel="alternate" hrefLang="en" href={`/${brandSlug}?lang=en`} />
        <link rel="alternate" hrefLang="ta" href={`/${brandSlug}?lang=ta`} />
        <link rel="alternate" hrefLang="ml" href={`/${brandSlug}?lang=ml`} />
        <link rel="alternate" hrefLang="ja" href={`/${brandSlug}?lang=ja`} />
        <link rel="alternate" hrefLang="x-default" href={`/${brandSlug}`} />
      </head>

      <div className="mx-auto max-w-5xl space-y-8">
        {/* 1. Announcement Bar (Top) */}
        {announcementSection && (
          <CmsSection key={announcementSection.id} section={announcementSection as never} brand={cfg} />
        )}

        <BrandHeader brand={cfg} currentLocale={lang} customMegaMenu={customMegaMenuCategories} />

        {/* 2. Platform Mode Controller Bar */}
        <div className="flex items-center justify-between rounded-2xl bg-white/70 p-3 shadow-2xs border border-black/5 text-xs font-semibold">
          <span className="text-slate-500">🌍 {cfg.name} Unified Learning Portal</span>
          <div className="flex items-center gap-2">
            <Link
              href={`/${brandSlug}?mode=student`}
              className={`rounded-xl px-3 py-1.5 transition ${
                mode === "student" ? "bg-slate-900 text-white shadow-xs" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              🎓 Student Dashboard View
            </Link>
            <Link
              href={`/${brandSlug}?mode=all`}
              className={`rounded-xl px-3 py-1.5 transition ${
                mode !== "student" ? "bg-slate-900 text-white shadow-xs" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              🌐 Public Platform
            </Link>
          </div>
        </div>

        {/* 3. Student Dashboard Hub (Shows Gamification, Goals, Weak Areas) */}
        {cfg.key === "nihongo" && (
          <section className="rounded-3xl bg-white p-6 sm:p-8 shadow-sm border border-black/5 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 pb-4">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-widest text-rose-700">Authenticated Learner Portal</span>
                <h2 className="text-xl font-bold text-slate-950">Student Dashboard &amp; Study Stats</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">
                  🧊 {studentStats.streakFreezes} Freezes
                </span>
                <Link href="/leaderboard" className="text-xs font-bold text-rose-600 hover:underline">
                  Sapphire League #1 →
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-2xl bg-amber-50/80 p-4 border border-amber-200/50">
                <p className="text-xs text-amber-800 font-bold uppercase">⚡ Total XP</p>
                <p className="text-2xl font-black text-amber-950 mt-1">{studentStats.xp} XP</p>
                <p className="text-[11px] text-amber-700 font-medium mt-1">Level {studentStats.level} • {studentStats.levelTitle}</p>
              </div>

              <div className="rounded-2xl bg-rose-50/80 p-4 border border-rose-200/50">
                <p className="text-xs text-rose-800 font-bold uppercase">🔥 Day Streak</p>
                <p className="text-2xl font-black text-rose-950 mt-1">{studentStats.streakDays} Days</p>
                <p className="text-[11px] text-rose-700 font-medium mt-1">Top 3% this week</p>
              </div>

              <div className="rounded-2xl bg-emerald-50/80 p-4 border border-emerald-200/50">
                <p className="text-xs text-emerald-800 font-bold uppercase">🎯 Today's Goal</p>
                <p className="text-2xl font-black text-emerald-950 mt-1">15 / 15m</p>
                <p className="text-[11px] text-emerald-700 font-medium mt-1">✓ Goal completed</p>
              </div>

              <div className="rounded-2xl bg-indigo-50/80 p-4 border border-indigo-200/50">
                <p className="text-xs text-indigo-800 font-bold uppercase">🏆 Certification</p>
                <p className="text-2xl font-black text-indigo-950 mt-1">N5 Ready</p>
                <p className="text-[11px] text-indigo-700 font-medium mt-1">Mock Exam 92%</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 pt-2">
              <Link
                href="/study/flashcards"
                className="rounded-2xl bg-slate-50 p-4 border border-black/5 hover:border-rose-300 transition block"
              >
                <p className="text-xs font-bold text-rose-700 uppercase">Flashcards</p>
                <p className="text-sm font-bold text-slate-900 mt-1">Spaced Repetition Review (SM-2)</p>
                <p className="text-xs text-slate-500 mt-1">Due today: 12 cards</p>
              </Link>
              <Link
                href="/study/write"
                className="rounded-2xl bg-slate-50 p-4 border border-black/5 hover:border-rose-300 transition block"
              >
                <p className="text-xs font-bold text-slate-700 uppercase">Typing &amp; Writing</p>
                <p className="text-sm font-bold text-slate-900 mt-1">Kana &amp; Kanji Spelling Challenge</p>
                <p className="text-xs text-slate-500 mt-1">Practice accuracy score</p>
              </Link>
              <Link
                href="/study/match"
                className="rounded-2xl bg-slate-50 p-4 border border-black/5 hover:border-rose-300 transition block"
              >
                <p className="text-xs font-bold text-emerald-700 uppercase">Match Tile Game</p>
                <p className="text-sm font-bold text-slate-900 mt-1">Speed Card Matching Challenge</p>
                <p className="text-xs text-slate-500 mt-1">Beat your 18s record</p>
              </Link>
            </div>
          </section>
        )}

        {/* 4. All 22 Editable CMS Sections Rendered in Sequence */}
        {mainSections.map((sec) => (
          <CmsSection key={sec.id} section={sec as never} brand={cfg} />
        ))}

        {/* 5. LMS Courses Section */}
        <section id="programs" className="space-y-4">
          <h2 className="text-2xl font-bold" style={{ color: cfg.theme.primary }}>
            {localizedNavCourses}
          </h2>
          {publishedCourses.length === 0 ? (
            <p className="text-sm opacity-70">No published courses yet.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {publishedCourses.map((c) => (
                <CourseCard
                  key={c.id}
                  brandSlug={brandSlug}
                  course={c}
                  brand={cfg}
                />
              ))}
            </div>
          )}
        </section>

        {/* 6. CMS-Managed Footer */}
        <footer className="mt-16 border-t border-black/10 pt-8 text-center text-xs opacity-60">
          <p>{footerSettings?.copyright ?? `© ${new Date().getFullYear()} ${cfg.name}. All rights reserved.`}</p>
          <p className="mt-1">{footerSettings?.tagline ?? cfg.tagline}</p>
        </footer>
      </div>
    </main>
  );
}
