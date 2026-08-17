import Link from "next/link";
import { notFound } from "next/navigation";
import { getBrand } from "@/lib/brands";
import { ensureSeed } from "@/lib/seed";
import { BrandService, CmsService } from "@/shared/services";
import { SECTION_TYPES, isCmsStatus } from "@/shared/cms";
import { AdminShell } from "../AdminShell";
import { db } from "@/db";
import {
  courses,
  modules,
  lessons,
  assets,
  nihongoLearningItems,
  kanjiDictionary,
  nihongoQuizzes,
  downloadableResources,
  users,
  auditLogs,
  newsArticles,
  translations,
  translationMemory,
  translationWorkflows,
  editorialCalendar,
  editorialTasks,
  editorialComments,
  editorialEvents,
  editorialNotifications,
} from "@/db/schema";
import { eq, and, like, or, desc, asc } from "drizzle-orm";
import {
  updateSection,
  setSectionStatus,
  moveSection,
  duplicateSection,
  createSection,
  saveTranslation,
  uploadCmsAsset,
} from "../actions";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-slate-200 text-slate-800",
  preview: "bg-indigo-100 text-indigo-800",
  published: "bg-emerald-100 text-emerald-800",
  archived: "bg-rose-100 text-rose-800",
};

const STATUS_ACTIONS = [
  { to: "draft", label: "Draft" },
  { to: "preview", label: "Preview" },
  { to: "published", label: "Publish" },
  { to: "archived", label: "Archive" },
] as const;

export default async function BrandCmsEditor({
  params,
  searchParams,
}: {
  params: Promise<{ brand: string }>;
  searchParams: Promise<{
    page?: string;
    tab?: string;
    notice?: string;
    theme?: string;
    q?: string;
  }>;
}) {
  await ensureSeed();
  const { brand: brandSlug } = await params;
  const {
    page = "home",
    tab = "analytics",
    notice,
    theme = "light",
    q = "",
  } = await searchParams;

  const cfg = getBrand(brandSlug);
  if (!cfg) notFound();

  const brand = await BrandService.getBySlug(brandSlug);
  if (!brand) notFound();

  const isDark = theme === "dark";
  const searchPattern = `%${q}%`;

  // Base Data Loading
  const pages = await CmsService.listPages(brand.id);
  const activePage = pages.includes(page) ? page : (pages[0] ?? "home");
  const sections = await CmsService.getAllSections(brand.id, activePage);
  const navSettings = (await CmsService.getSettings(brand.id, "navigation")) as {
    links?: Array<{ label: string; href: string }>;
  } | null;
  const seoSettings = (await CmsService.getSettings(brand.id, "seo")) as {
    metaTitle?: string;
    metaDescription?: string;
  } | null;
  const footerSettings = (await CmsService.getSettings(brand.id, "footer")) as {
    copyright?: string;
    tagline?: string;
  } | null;

  // Tab Specific Database Loads
  let auditLogsList: any[] = [];
  let assetsList: any[] = [];
  let coursesList: any[] = [];
  let articlesList: any[] = [];
  let learningItemsList: any[] = [];
  let kanjiItemsList: any[] = [];
  let quizzesList: any[] = [];
  let resourcesList: any[] = [];
  let usersList: any[] = [];
  let translationWorkflowsList: any[] = [];
  let translationMemoryList: any[] = [];
  let sideBySideList: any[] = [];
  let editorialCalendarList: any[] = [];
  let editorialTasksList: any[] = [];
  let editorialCommentsList: any[] = [];
  let editorialEventsList: any[] = [];

  if (tab === "logs") {
    auditLogsList = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(50);
  } else if (tab === "multilingual") {
    // Missing Translation Reports
    translationWorkflowsList = await db
      .select()
      .from(translationWorkflows)
      .where(eq(translationWorkflows.entityId, brand.id));

    // Translation Memory Lookup
    translationMemoryList = await db
      .select()
      .from(translationMemory)
      .limit(20);

    // Side-by-Side Editing Ingestion
    const targetLoc = q && ["ta", "ml", "ja"].includes(q) ? q : "ta";
    const fieldsToTranslate = [
      { field: "tagline", label: "Brand Tagline Message", sourceVal: cfg.tagline },
      { field: "hero_badge", label: "Hero Badge Highlight Banner", sourceVal: cfg.key === "nihongo" ? "JLPT N5 – N1 • Japan Careers" : "Engineering & Leadership" },
      { field: "nav_courses", label: "Navigation Courses Menu Title", sourceVal: "Curriculum & JLPT Tracks" }
    ];

    const dbTranslations = await db
      .select()
      .from(translations)
      .where(
        and(
          eq(translations.entityType, "brand"),
          eq(translations.entityId, brand.id),
          eq(translations.locale, targetLoc)
        )
      );

    const targetMap = new Map(dbTranslations.map((r) => [r.field, r.value]));
    sideBySideList = fieldsToTranslate.map((f) => ({
      field: f.field,
      label: f.label,
      sourceVal: f.sourceVal,
      targetVal: targetMap.get(f.field) ?? "",
      locale: targetLoc
    }));
  } else if (tab === "workflow") {
    editorialCalendarList = await db
      .select()
      .from(editorialCalendar)
      .where(eq(editorialCalendar.brandId, brand.id))
      .orderBy(asc(editorialCalendar.scheduledAt));

    editorialTasksList = await db
      .select()
      .from(editorialTasks)
      .limit(30);

    editorialCommentsList = await db
      .select()
      .from(editorialComments)
      .limit(30);

    editorialEventsList = await db
      .select()
      .from(editorialEvents)
      .orderBy(desc(editorialEvents.createdAt))
      .limit(30);
  } else if (tab === "media") {
    assetsList = q
      ? await db
          .select()
          .from(assets)
          .where(and(eq(assets.brandId, brand.id), like(assets.url, searchPattern)))
          .limit(50)
      : await db.select().from(assets).where(eq(assets.brandId, brand.id)).limit(50);
  } else if (tab === "courses") {
    coursesList = q
      ? await db
          .select()
          .from(courses)
          .where(and(eq(courses.brandId, brand.id), like(courses.title, searchPattern)))
      : await db.select().from(courses).where(eq(courses.brandId, brand.id));
  } else if (tab === "blog_news") {
    articlesList = q
      ? await db
          .select()
          .from(newsArticles)
          .where(and(eq(newsArticles.brandId, brand.id), like(newsArticles.title, searchPattern)))
      : await db.select().from(newsArticles).where(eq(newsArticles.brandId, brand.id));
  } else if (tab === "vocabulary") {
    learningItemsList = q
      ? await db
          .select()
          .from(nihongoLearningItems)
          .where(
            and(
              eq(nihongoLearningItems.brandId, brand.id),
              or(
                like(nihongoLearningItems.japanese, searchPattern),
                like(nihongoLearningItems.meaning, searchPattern)
              )
            )
          )
          .limit(50)
      : await db
          .select()
          .from(nihongoLearningItems)
          .where(eq(nihongoLearningItems.brandId, brand.id))
          .limit(50);

    kanjiItemsList = q
      ? await db
          .select()
          .from(kanjiDictionary)
          .where(
            or(
              like(kanjiDictionary.kanji, searchPattern),
              like(kanjiDictionary.meaning, searchPattern)
            )
          )
          .limit(50)
      : await db.select().from(kanjiDictionary).limit(50);
  } else if (tab === "quizzes") {
    quizzesList = q
      ? await db
          .select()
          .from(nihongoQuizzes)
          .where(and(eq(nihongoQuizzes.brandId, brand.id), like(nihongoQuizzes.question, searchPattern)))
          .limit(50)
      : await db.select().from(nihongoQuizzes).where(eq(nihongoQuizzes.brandId, brand.id)).limit(50);
  } else if (tab === "downloads") {
    resourcesList = q
      ? await db
          .select()
          .from(downloadableResources)
          .where(and(eq(downloadableResources.brandId, brand.id), like(downloadableResources.title, searchPattern)))
      : await db.select().from(downloadableResources).where(eq(downloadableResources.brandId, brand.id));
  } else if (tab === "users") {
    usersList = q
      ? await db
          .select()
          .from(users)
          .where(like(users.email, searchPattern))
          .limit(50)
      : await db.select().from(users).limit(50);
  }

  return (
    <div className={isDark ? "dark min-h-screen bg-slate-950 text-slate-100" : "min-h-screen bg-slate-50 text-slate-900"}>
      {/* Dynamic Header */}
      <header className={`border-b ${isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"} px-6 py-4`}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="font-extrabold tracking-tight text-slate-950 dark:text-white flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-600 text-white font-black shadow-xs">
                管
              </span>
              <span>{cfg.name} Workspace Portal</span>
            </Link>
          </div>
          <div className="flex items-center gap-3 text-xs font-semibold">
            {/* Dark Mode Toggle */}
            <Link
              href={`/admin/${brandSlug}?tab=${tab}&page=${page}&q=${encodeURIComponent(q)}&theme=${isDark ? "light" : "dark"}`}
              className={`rounded-xl px-3 py-1.5 border ${
                isDark
                  ? "border-slate-800 bg-slate-800 text-amber-400 hover:bg-slate-700"
                  : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
              } transition flex items-center gap-1.5`}
            >
              <span>{isDark ? "☀️ Light Mode" : "🌙 Dark Mode"}</span>
            </Link>
            <Link href="/" className={`hover:text-amber-500 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
              Brand Hub
            </Link>
            <Link href="/api/v1/swagger" className={`hover:text-amber-500 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
              API Docs
            </Link>
          </div>
        </div>
      </header>

      {/* Main Admin Console Layout */}
      <div className="mx-auto max-w-7xl px-6 py-8">
        {notice && (
          <div className="mb-6 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
            {notice}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-4">
          {/* Sidebar Navigation */}
          <aside className="space-y-1.5 md:col-span-1">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 px-3 mb-2">Portal Managers</p>
            {[
              { id: "analytics", label: "Dashboard Analytics", icon: "📊" },
              { id: "content", label: "Headless CMS Content", icon: "📝" },
              { id: "multilingual", label: "Multilingual Engine", icon: "🌐" },
              { id: "workflow", label: "Workflow Engine", icon: "🚀" },
              { id: "monetization", label: "Monetization & Checkout", icon: "💎" },
              { id: "media", label: "Digital Media (DAM)", icon: "📂" },
              { id: "courses", label: "LMS Course Manager", icon: "🎓" },
              { id: "blog_news", label: "Blog & Daily News", icon: "📰" },
              { id: "vocabulary", label: "Vocabulary & Kanji", icon: "📖" },
              { id: "quizzes", label: "Quiz & Practice Tests", icon: "⏱" },
              { id: "downloads", label: "Downloads Center", icon: "📥" },
              { id: "users", label: "User Accounts & Role", icon: "👤" },
              { id: "settings", label: "Site & SEO Settings", icon: "⚙️" },
              { id: "logs", label: "Audit Logging Trails", icon: "📜" },
            ].map((navItem) => {
              const isActive = tab === navItem.id;
              return (
                <Link
                  key={navItem.id}
                  href={`/admin/${brandSlug}?tab=${navItem.id}&page=${page}&theme=${theme}`}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                    isActive
                      ? "bg-amber-600 text-white shadow-sm"
                      : isDark
                        ? "text-slate-300 hover:bg-slate-900"
                        : "text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  <span className="text-sm">{navItem.icon}</span>
                  <span>{navItem.label}</span>
                </Link>
              );
            })}
          </aside>

          {/* Active Workspace Console */}
          <main className="md:col-span-3 space-y-6">
            {/* Top Workspace Header with Search */}
            <div className={`rounded-2xl p-5 shadow-xs border ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"} flex flex-wrap items-center justify-between gap-4`}>
              <div>
                <h1 className="text-xl font-extrabold tracking-tight">
                  {tab.replace(/_/g, " ").toUpperCase()} PANEL
                </h1>
                <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"} mt-0.5`}>
                  Manage administrative assets, system configurations, and direct lookups.
                </p>
              </div>

              {/* General Search Input if applicable */}
              {tab !== "analytics" && tab !== "settings" && (
                <form method="GET" action={`/admin/${brandSlug}`} className="flex items-center gap-2">
                  <input type="hidden" name="tab" value={tab} />
                  <input type="hidden" name="page" value={page} />
                  <input type="hidden" name="theme" value={theme} />
                  <input
                    type="text"
                    name="q"
                    defaultValue={q}
                    placeholder="🔍 Search (Enter to query)..."
                    className={`rounded-xl px-3 py-2 text-xs font-semibold border ${
                      isDark
                        ? "bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-500"
                        : "bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400"
                    } focus:outline-none focus:ring-1 focus:ring-amber-500 w-48 sm:w-60`}
                  />
                  {q && (
                    <Link
                      href={`/admin/${brandSlug}?tab=${tab}&page=${page}&theme=${theme}`}
                      className="text-xs font-bold text-rose-500 hover:underline"
                    >
                      Clear
                    </Link>
                  )}
                </form>
              )}
            </div>

            {/* Panel 1: Analytics Panel */}
            {tab === "analytics" && (
              <div className="space-y-6">
                <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
                  {[
                    { title: "Total Users Enrolled", val: "12,480", inc: "+8.3%", color: "text-emerald-500" },
                    { title: "XP Milestone Score", val: "1,245,690", inc: "+12.1%", color: "text-amber-500" },
                    { title: "Monthly Study Time", val: "158,400 min", inc: "+4.5%", color: "text-indigo-500" },
                    { title: "Avg Quiz Accuracy", val: "91.5%", inc: "+2.0%", color: "text-rose-500" },
                  ].map((stat, idx) => (
                    <div key={idx} className={`rounded-2xl p-5 border shadow-2xs ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
                      <p className={`text-[10px] font-extrabold uppercase tracking-widest ${isDark ? "text-slate-400" : "text-slate-500"}`}>{stat.title}</p>
                      <p className="text-2xl font-black mt-1.5">{stat.val}</p>
                      <p className={`text-[11px] font-bold mt-1 ${stat.color}`}>{stat.inc} vs last month</p>
                    </div>
                  ))}
                </div>

                {/* Analytical Charts */}
                <div className={`rounded-3xl p-6 border shadow-2xs space-y-4 ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Monthly Learning XP Progress</h3>
                  <div className="h-44 flex items-end gap-3 pt-6 pb-2 border-b border-black/10">
                    {[35, 45, 60, 50, 75, 90, 80, 95, 110, 100, 125, 135].map((h, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                        <div
                          className="w-full bg-amber-500 rounded-t-lg transition hover:bg-amber-400 cursor-pointer relative"
                          style={{ height: `${(h / 140) * 100}%` }}
                        >
                          <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-900 text-[9px] font-bold text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap">
                            {h}k XP
                          </span>
                        </div>
                        <span className="text-[9px] font-bold text-slate-400 uppercase">{["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"][i]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Panel 2: Headless CMS Editor */}
            {tab === "content" && (
              <div className="space-y-6">
                {/* Page selector tabs */}
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                  {pages.map((p) => (
                    <Link
                      key={p}
                      href={`/admin/${brandSlug}?tab=content&page=${encodeURIComponent(p)}&theme=${theme}`}
                      className={`rounded-xl px-3 py-1.5 ${
                        p === activePage
                          ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-sm"
                          : isDark
                            ? "bg-slate-900 text-slate-300 hover:bg-slate-800"
                            : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200"
                      }`}
                    >
                      {p}
                    </Link>
                  ))}
                  <Link
                    href={`/admin/${brandSlug}/preview?page=${encodeURIComponent(activePage)}`}
                    className="ml-auto rounded-xl bg-amber-600 px-3 py-1.5 text-white hover:bg-amber-500 shadow-xs"
                  >
                    👁 Preview page
                  </Link>
                  <Link
                    href={activePage === "home" ? `/${brandSlug}` : `/${brandSlug}/${activePage}`}
                    className={`rounded-xl px-3 py-1.5 border shadow-2xs ${
                      isDark ? "bg-slate-900 border-slate-800 hover:bg-slate-800" : "bg-white border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    ↗ View live
                  </Link>
                </div>

                {/* Sections list */}
                <div className="space-y-4">
                  {sections.map((sec, idx) => {
                    const typeDef = SECTION_TYPES.find((t) => t.key === sec.sectionKey);
                    return (
                      <article key={sec.id} className={`rounded-2xl p-5 border shadow-2xs ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
                        <header className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-lg px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wide ${isDark ? "bg-slate-850 text-slate-400" : "bg-slate-100 text-slate-700"}`}>
                            {sec.sectionKey}
                          </span>
                          <h3 className="font-semibold text-sm">{sec.title ?? "(untitled)"}</h3>
                          {typeDef && (
                            <span className="rounded-full bg-sky-100 dark:bg-sky-950 px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-widest text-sky-800 dark:text-sky-300">
                              {typeDef.label}
                            </span>
                          )}
                          <span className={`ml-auto rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest ${STATUS_STYLE[sec.status] ?? "bg-slate-100"}`}>
                            {sec.status}
                          </span>
                        </header>

                        {/* Status actions + reorder + duplicate + versions */}
                        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold">
                          {STATUS_ACTIONS.filter((a) => a.to !== sec.status).map((a) => (
                            <form key={a.to} action={setSectionStatus}>
                              <input type="hidden" name="sectionId" value={sec.id} />
                              <input type="hidden" name="brandSlug" value={brandSlug} />
                              <input type="hidden" name="pageSlug" value={activePage} />
                              <input type="hidden" name="status" value={a.to} />
                              <button
                                type="submit"
                                className={`rounded-lg px-3 py-1.5 transition ${
                                  a.to === "published"
                                    ? "bg-emerald-600 text-white hover:bg-emerald-500"
                                    : a.to === "archived"
                                      ? "bg-rose-100 text-rose-800 hover:bg-rose-200 dark:bg-rose-950/20 dark:text-rose-300"
                                      : isDark
                                        ? "bg-slate-800 hover:bg-slate-700 text-slate-200"
                                        : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                                }`}
                              >
                                {a.label}
                              </button>
                            </form>
                          ))}

                          <span className={`mx-1 h-4 w-px ${isDark ? "bg-slate-800" : "bg-slate-200"}`} />

                          <form action={moveSection}>
                            <input type="hidden" name="sectionId" value={sec.id} />
                            <input type="hidden" name="brandSlug" value={brandSlug} />
                            <input type="hidden" name="pageSlug" value={activePage} />
                            <input type="hidden" name="direction" value="up" />
                            <button type="submit" disabled={idx === 0} className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30">↑</button>
                          </form>
                          <form action={moveSection}>
                            <input type="hidden" name="sectionId" value={sec.id} />
                            <input type="hidden" name="brandSlug" value={brandSlug} />
                            <input type="hidden" name="pageSlug" value={activePage} />
                            <input type="hidden" name="direction" value="down" />
                            <button type="submit" disabled={idx === sections.length - 1} className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30">↓</button>
                          </form>

                          <form action={duplicateSection}>
                            <input type="hidden" name="sectionId" value={sec.id} />
                            <input type="hidden" name="brandSlug" value={brandSlug} />
                            <input type="hidden" name="pageSlug" value={activePage} />
                            <button type="submit" className="rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-1.5 hover:bg-slate-200 dark:hover:bg-slate-700">⧉ Duplicate</button>
                          </form>

                          <Link
                            href={`/admin/${brandSlug}/section/${sec.id}/versions?page=${encodeURIComponent(activePage)}`}
                            className="rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-1.5 hover:bg-slate-200 dark:hover:bg-slate-700"
                          >
                            🕘 Versions
                          </Link>
                        </div>

                        {/* Inline content editor */}
                        <details className={`mt-3 rounded-xl border ${isDark ? "border-slate-800 bg-slate-950/40" : "border-slate-200 bg-slate-50"}`}>
                          <summary className="cursor-pointer px-4 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
                            ✏️ Edit Section Properties
                          </summary>
                          <form action={updateSection} className="grid gap-3 p-4 text-xs">
                            <input type="hidden" name="sectionId" value={sec.id} />
                            <input type="hidden" name="brandSlug" value={brandSlug} />
                            <input type="hidden" name="pageSlug" value={activePage} />

                            <label className="grid gap-1">
                              <span className="font-semibold text-slate-500">Title</span>
                              <input name="title" defaultValue={sec.title ?? ""} className={`rounded-lg border px-3 py-2 ${isDark ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-300"}`} />
                            </label>
                            <label className="grid gap-1">
                              <span className="font-semibold text-slate-500">Subtitle</span>
                              <input name="subtitle" defaultValue={sec.subtitle ?? ""} className={`rounded-lg border px-3 py-2 ${isDark ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-300"}`} />
                            </label>
                            <label className="grid gap-1">
                              <span className="font-semibold text-slate-500">Status</span>
                              <select name="status" defaultValue={sec.status} className={`rounded-lg border px-3 py-2 ${isDark ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-300"}`}>
                                {STATUS_ACTIONS.map((s) => (
                                  <option key={s.to} value={s.to}>{s.label}</option>
                                ))}
                              </select>
                            </label>
                            <label className="grid gap-1">
                              <span className="font-semibold text-slate-500">Content (JSON)</span>
                              <textarea
                                name="contentJson"
                                rows={8}
                                defaultValue={JSON.stringify(sec.content ?? {}, null, 2)}
                                className={`rounded-lg border px-3 py-2 font-mono ${isDark ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-300"}`}
                              />
                            </label>
                            <button type="submit" className="w-fit rounded-lg bg-slate-900 dark:bg-amber-600 px-4 py-2 font-bold text-white hover:bg-slate-800 dark:hover:bg-amber-500">
                              Save changes
                            </button>
                          </form>
                        </details>
                      </article>
                    );
                  })}
                </div>

                {/* Create new section */}
                <div className={`rounded-2xl p-5 border shadow-2xs ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
                  <h3 className="text-sm font-bold">Add dynamic section to “{activePage}”</h3>
                  <form action={createSection} className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <input type="hidden" name="brandSlug" value={brandSlug} />
                    <input type="hidden" name="pageSlug" value={activePage} />
                    <select name="sectionKey" className={`rounded-lg border px-3 py-2 ${isDark ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-300"}`}>
                      {SECTION_TYPES.map((t) => (
                        <option key={t.key} value={t.key}>{t.label} ({t.key})</option>
                      ))}
                    </select>
                    <button type="submit" className="rounded-lg bg-amber-600 px-4 py-2 font-bold text-white hover:bg-amber-500">
                      + Create draft
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* Panel 2.5: Multilingual Platform Engine */}
            {tab === "multilingual" && (
              <div className="space-y-6">
                {/* Locale Selector for Translation Editor */}
                <div className={`rounded-2xl p-5 border shadow-2xs ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
                  <h3 className="text-sm font-bold">Select Active Target Locale</h3>
                  <div className="flex gap-2 mt-3">
                    {[
                      { code: "ta", label: "Tamil (தமிழ்)" },
                      { code: "ml", label: "Malayalam (മലയാളം)" },
                      { code: "ja", label: "Japanese (日本語)" }
                    ].map((loc) => {
                      const isActive = q === loc.code || (q === "" && loc.code === "ta");
                      return (
                        <Link
                          key={loc.code}
                          href={`/admin/${brandSlug}?tab=multilingual&page=${page}&q=${loc.code}&theme=${theme}`}
                          className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
                            isActive
                              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-sm"
                              : isDark
                                ? "bg-slate-850 hover:bg-slate-800 text-slate-300"
                                : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                          }`}
                        >
                          {loc.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>

                {/* Side-by-Side Translation Editor Form */}
                <div className={`rounded-2xl p-5 border shadow-2xs ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
                  <div className="flex justify-between items-center border-b border-black/5 pb-3">
                    <h3 className="text-sm font-bold">Side-by-Side Translation Editor</h3>
                    <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-800">
                      English (en) &rarr; {q && ["ta", "ml", "ja"].includes(q) ? q.toUpperCase() : "TA"}
                    </span>
                  </div>

                  <div className="space-y-6 mt-4">
                    {sideBySideList.map((item) => (
                      <form key={item.field} action={saveTranslation} className="grid md:grid-cols-2 gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                        <input type="hidden" name="brandSlug" value={brandSlug} />
                        <input type="hidden" name="entityType" value="brand" />
                        <input type="hidden" name="entityId" value={brand.id} />
                        <input type="hidden" name="locale" value={item.locale} />
                        <input type="hidden" name="field" value={item.field} />

                        {/* Source Field */}
                        <div className="text-xs space-y-1">
                          <p className="font-extrabold text-slate-400 uppercase tracking-widest text-[9px]">{item.label} ({item.field})</p>
                          <p className="font-bold text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-black/5">
                            {item.sourceVal}
                          </p>
                        </div>

                        {/* Target Field Input */}
                        <div className="text-xs flex flex-col justify-between">
                          <div>
                            <p className="font-extrabold text-slate-400 uppercase tracking-widest text-[9px]">Target Translation ({item.locale.toUpperCase()})</p>
                            <input
                              type="text"
                              name="value"
                              defaultValue={item.targetVal}
                              placeholder={`Enter translation in ${item.locale.toUpperCase()}...`}
                              className={`rounded-xl border px-3 py-2.5 font-semibold w-full mt-1 ${
                                isDark
                                  ? "bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-600"
                                  : "bg-white border-slate-300 text-slate-900 placeholder-slate-400"
                              }`}
                            />
                          </div>
                          <button
                            type="submit"
                            className="mt-2 w-fit rounded-lg bg-amber-600 px-4 py-2 font-bold text-white hover:bg-amber-500 self-end text-[11px]"
                          >
                            💾 Save {item.field}
                          </button>
                        </div>
                      </form>
                    ))}
                  </div>
                </div>

                {/* Missing Translations Report */}
                <div className={`rounded-2xl p-5 border shadow-2xs ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
                  <h3 className="text-sm font-bold mb-3">Audit Missing Translations Report</h3>
                  <div className="space-y-3">
                    {translationWorkflowsList.map((wf) => (
                      <div key={wf.id} className="rounded-xl bg-slate-50 dark:bg-slate-950/40 p-4 border border-black/5 text-xs space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-900 dark:text-white">Workflow for Locale: {wf.targetLocale.toUpperCase()}</span>
                          <span className={`rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                            wf.status === "approved" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                          }`}>
                            {wf.status}
                          </span>
                        </div>
                        <p className="text-slate-400 text-[10px]">Assigned Translator: {wf.assignedTranslator || "Unassigned"}</p>
                        {wf.missingKeys && (wf.missingKeys as string[]).length > 0 ? (
                          <div className="pt-2 border-t border-black/5">
                            <p className="font-bold text-rose-700 text-[10px] uppercase">🚨 Missing Translation Keys ({(wf.missingKeys as string[]).length}):</p>
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {(wf.missingKeys as string[]).map((key) => (
                                <span key={key} className="rounded-md bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900 px-2 py-0.5 text-[9px] font-mono font-bold text-rose-800 dark:text-rose-300">
                                  {key}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="text-emerald-600 dark:text-emerald-400 text-[11px] font-bold">✓ 100% complete — No missing keys detected!</p>
                        )}
                      </div>
                    ))}
                    {translationWorkflowsList.length === 0 && (
                      <p className="text-center text-xs text-slate-400 py-2">No missing translation logs currently recorded.</p>
                    )}
                  </div>
                </div>

                {/* Translation Memory Cache Suggestions */}
                <div className={`rounded-2xl p-5 border shadow-2xs ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
                  <h3 className="text-sm font-bold mb-3">Translation Memory Lookup</h3>
                  <div className="overflow-x-auto text-xs">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className={`border-b ${isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-500"} font-bold`}>
                          <th className="py-2.5">Source Key (en)</th>
                          <th className="py-2.5">Target Locale</th>
                          <th className="py-2.5">Translated Text</th>
                          <th className="py-2.5">Accuracy</th>
                        </tr>
                      </thead>
                      <tbody>
                        {translationMemoryList.map((tm) => (
                          <tr key={tm.id} className={`border-b ${isDark ? "border-slate-800 hover:bg-slate-850" : "border-slate-100 hover:bg-slate-50"}`}>
                            <td className="py-2.5 font-bold text-slate-900 dark:text-white font-mono">{tm.sourceText}</td>
                            <td className="py-2.5 font-bold uppercase text-slate-400 font-mono">{tm.targetLocale}</td>
                            <td className="py-2.5 text-slate-500 dark:text-slate-300 font-semibold">{tm.translatedText}</td>
                            <td className="py-2.5 text-emerald-600 dark:text-emerald-400 font-bold font-mono">{tm.qualityScore}% Match</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Panel 2.75: Editorial Workflow Engine */}
            {tab === "workflow" && (
              <div className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Editorial Calendar & Tasks */}
                  <div className="space-y-6">
                    {/* Calendar */}
                    <div className={`rounded-2xl p-5 border shadow-2xs ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
                      <h3 className="text-sm font-bold mb-3">📅 Editorial Content Calendar</h3>
                      <div className="space-y-2.5 text-xs">
                        {editorialCalendarList.map((item) => (
                          <div key={item.id} className="rounded-xl bg-slate-50 dark:bg-slate-950/40 p-3 border border-black/5 flex justify-between items-center">
                            <div>
                              <p className="font-bold text-slate-900 dark:text-white">{item.title}</p>
                              <p className="text-[10px] text-slate-400 font-mono mt-0.5">Type: {item.entityType} • ID: {item.entityId}</p>
                            </div>
                            <div className="text-right">
                              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[9px] font-bold text-indigo-800 uppercase">
                                {item.status}
                              </span>
                              <p className="text-[10px] text-slate-400 mt-1">{item.scheduledAt.toDateString()}</p>
                            </div>
                          </div>
                        ))}
                        {editorialCalendarList.length === 0 && (
                          <p className="text-center text-slate-400 py-2">No scheduled content in calendar.</p>
                        )}
                      </div>
                    </div>

                    {/* Tasks */}
                    <div className={`rounded-2xl p-5 border shadow-2xs ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
                      <h3 className="text-sm font-bold mb-3">🚀 Active Editorial Tasks</h3>
                      <div className="space-y-2.5 text-xs">
                        {editorialTasksList.map((task) => (
                          <div key={task.id} className="rounded-xl bg-slate-50 dark:bg-slate-950/40 p-3 border border-black/5 space-y-1.5">
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-slate-900 dark:text-white">{task.title}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                                task.status === "completed" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
                              }`}>
                                {task.status}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400">EntityType: {task.entityType} • Assignee ID: {task.assigneeId || "Unassigned"}</p>
                            {task.dueDate && <p className="text-[10px] text-rose-600 font-bold">📅 Due Date: {task.dueDate.toDateString()}</p>}
                          </div>
                        ))}
                        {editorialTasksList.length === 0 && (
                          <p className="text-center text-slate-400 py-2">No active tasks currently registered.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Comments & Publishing History */}
                  <div className="space-y-6">
                    {/* Comments */}
                    <div className={`rounded-2xl p-5 border shadow-2xs ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
                      <h3 className="text-sm font-bold mb-3">💬 Team Comments &amp; Mentions</h3>
                      <div className="space-y-2.5 text-xs">
                        {editorialCommentsList.map((comm) => (
                          <div key={comm.id} className="rounded-xl bg-slate-50 dark:bg-slate-950/40 p-3 border border-black/5 space-y-1.5">
                            <div className="flex justify-between text-[10px] font-bold text-slate-400">
                              <span>Author ID: {comm.authorId || "Anonymous"}</span>
                              <span>{comm.createdAt.toDateString()}</span>
                            </div>
                            <p className="text-slate-700 dark:text-slate-300 leading-relaxed font-semibold">{comm.body}</p>
                            {/* Mentions display */}
                            {comm.mentions && (comm.mentions as string[]).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {(comm.mentions as string[]).map((m) => (
                                  <span key={m} className="rounded bg-rose-50 text-rose-700 px-1.5 py-0.5 font-bold text-[9px]">
                                    @{m}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                        {editorialCommentsList.length === 0 && (
                          <p className="text-center text-slate-400 py-2">No editor comments available.</p>
                        )}
                      </div>
                    </div>

                    {/* State Transitions Timeline */}
                    <div className={`rounded-2xl p-5 border shadow-2xs ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
                      <h3 className="text-sm font-bold mb-3">📜 Workflow Transitions History</h3>
                      <div className="relative pl-4 border-l-2 border-slate-200 dark:border-slate-800 space-y-4 text-xs">
                        {editorialEventsList.map((ev) => (
                          <div key={ev.id} className="relative">
                            {/* Bullet dot */}
                            <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-4 ring-white dark:ring-slate-900" />
                            <div>
                              <p className="font-extrabold text-slate-900 dark:text-white uppercase tracking-wide text-[10px]">
                                page transition
                              </p>
                              <p className="text-slate-500 font-bold mt-0.5">
                                <span className="rounded bg-slate-100 dark:bg-slate-950 px-1.5 py-0.2">{ev.fromStatus || "START"}</span>
                                &rarr;
                                <span className="rounded bg-emerald-100 dark:bg-emerald-950/40 px-1.5 py-0.2 text-emerald-800 dark:text-emerald-300">{ev.toStatus}</span>
                              </p>
                              {ev.note && <p className="text-slate-400 italic text-[11px] mt-1">Note: "{ev.note}"</p>}
                              <p className="text-[10px] text-slate-400 font-mono mt-0.5">{ev.createdAt.toLocaleString()}</p>
                            </div>
                          </div>
                        ))}
                        {editorialEventsList.length === 0 && (
                          <p className="text-center text-slate-400 py-2">No workflow historical events registered.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Panel 2.85: Monetization & Coupon Engine */}
            {tab === "monetization" && (
              <div className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Coupon Engine */}
                  <div className={`rounded-2xl p-5 border shadow-2xs ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
                    <h3 className="text-sm font-bold mb-3">🎫 Dynamic Coupons &amp; Discount Codes</h3>
                    <div className="space-y-2.5 text-xs">
                      {[
                        { code: "SUMMER20", discount: "20% OFF", category: "Premium LMS Courses", status: "Active" },
                        { code: "JLPTFREE", discount: "100% OFF", category: "Mock Exams simulator", status: "Active" },
                        { code: "CAREER50", discount: "50% OFF", category: "Japan Career Placements", status: "Active" }
                      ].map((item) => (
                        <div key={item.code} className="rounded-xl bg-slate-50 dark:bg-slate-950/40 p-3 border border-black/5 flex justify-between items-center">
                          <div>
                            <p className="font-extrabold text-slate-900 dark:text-white font-mono text-sm tracking-widest">{item.code}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Class: {item.category}</p>
                          </div>
                          <div className="text-right">
                            <span className="rounded-md bg-rose-50 dark:bg-rose-950/20 px-2 py-0.5 font-bold text-rose-800 dark:text-rose-300">
                              {item.discount}
                            </span>
                            <p className="text-[10px] text-slate-400 mt-1">Status: {item.status}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Referral Engine */}
                  <div className={`rounded-2xl p-5 border shadow-2xs ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
                    <h3 className="text-sm font-bold mb-3">👥 Referral Program &amp; Affiliate Codes</h3>
                    <div className="space-y-2.5 text-xs">
                      {[
                        { code: "REFER-YUKI-42", referrer: "Yuki Tanaka", reward: "100 XP / $10 Cash", count: 3, status: "Active" },
                        { code: "REFER-KENJI-15", referrer: "Kenji Sato", reward: "100 XP / $10 Cash", count: 1, status: "Active" }
                      ].map((item) => (
                        <div key={item.code} className="rounded-xl bg-slate-50 dark:bg-slate-950/40 p-3 border border-black/5 space-y-1.5">
                          <div className="flex justify-between items-center">
                            <span className="font-extrabold font-mono text-slate-900 dark:text-white">{item.code}</span>
                            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[9px] font-bold text-indigo-800 uppercase">
                              {item.count} Signups
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500">Referrer: {item.referrer} • Reward: {item.reward}</p>
                          <p className="text-[10px] text-slate-400">Affiliate Status: {item.status}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Subscriptions & Gateways */}
                <div className="grid gap-6 md:grid-cols-3">
                  {/* Stripe Panel */}
                  <div className={`rounded-2xl p-5 border shadow-2xs ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"} md:col-span-1 space-y-3`}>
                    <div className="flex justify-between">
                      <h4 className="font-bold text-xs uppercase tracking-wider">💳 Stripe Gateway</h4>
                      <span className="rounded bg-sky-100 text-sky-800 px-1.5 py-0.2 text-[9px] font-bold">Future-Ready</span>
                    </div>
                    <p className="text-[11px] text-slate-400">Configure Stripe Webhook APIs for global credit card processing.</p>
                    <div className="space-y-1 font-mono text-[9px] text-slate-500 bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-black/5">
                      <p><b>ENDPOINT:</b> /api/v1/checkout/stripe</p>
                      <p><b>WEBHOOK:</b> pending_webhook_secret</p>
                    </div>
                  </div>

                  {/* Razorpay Panel */}
                  <div className={`rounded-2xl p-5 border shadow-2xs ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"} md:col-span-1 space-y-3`}>
                    <div className="flex justify-between">
                      <h4 className="font-bold text-xs uppercase tracking-wider">💳 Razorpay Gateway</h4>
                      <span className="rounded bg-sky-100 text-sky-800 px-1.5 py-0.2 text-[9px] font-bold">Future-Ready</span>
                    </div>
                    <p className="text-[11px] text-slate-400">Configure Razorpay checkout tokens for APAC &amp; India local payments.</p>
                    <div className="space-y-1 font-mono text-[9px] text-slate-500 bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-black/5">
                      <p><b>ENDPOINT:</b> /api/v1/checkout/razorpay</p>
                      <p><b>WEBHOOK:</b> pending_razorpay_secret</p>
                    </div>
                  </div>

                  {/* Sponsor & AdSense Panel */}
                  <div className={`rounded-2xl p-5 border shadow-2xs ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"} md:col-span-1 space-y-3`}>
                    <div className="flex justify-between">
                      <h4 className="font-bold text-xs uppercase tracking-wider">📣 Sponsor &amp; Ads</h4>
                      <span className="rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.2 text-[9px] font-bold">Active</span>
                    </div>
                    <p className="text-[11px] text-slate-400">Manage Google AdSense slot publishers and accredited language school sponsors.</p>
                    <div className="space-y-1 font-mono text-[9px] text-slate-500 bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-black/5">
                      <p><b>PUBLISHER_ID:</b> ca-pub-1234567890</p>
                      <p><b>SPONSORS:</b> 3 Partner Schools Active</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Panel 3: Digital Asset Manager (Media) */}
            {tab === "media" && (
              <div className="grid gap-6 md:grid-cols-3">
                {/* Left Area: Assets Library + Upload Form (Span 2) */}
                <div className="md:col-span-2 space-y-6">
                  {/* Library Table */}
                  <div className={`rounded-2xl p-5 border shadow-2xs ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
                    <h3 className="text-sm font-bold mb-4">Enterprise Media Files Library</h3>
                    <div className="overflow-x-auto text-xs">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className={`border-b ${isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-500"} font-bold`}>
                            <th className="py-2.5">Asset URL / Key</th>
                            <th className="py-2.5">Kind</th>
                            <th className="py-2.5">MimeType</th>
                            <th className="py-2.5">File Size</th>
                          </tr>
                        </thead>
                        <tbody>
                          {assetsList.map((a) => (
                            <tr key={a.id} className={`border-b ${isDark ? "border-slate-800 hover:bg-slate-850" : "border-slate-100 hover:bg-slate-50"}`}>
                              <td className="py-2.5">
                                <p className="font-bold text-slate-900 dark:text-white truncate max-w-xs" title={a.url}>{a.url}</p>
                                <p className="text-[10px] text-slate-400 font-mono truncate max-w-xs">{a.title || "—"}</p>
                              </td>
                              <td className="py-2.5 font-bold uppercase text-[10px] text-slate-400">{a.kind}</td>
                              <td className="py-2.5 font-mono text-slate-400">{a.mimeType || "—"}</td>
                              <td className="py-2.5 text-slate-400">{a.bytes ? `${(a.bytes / 1024).toFixed(1)} KB` : "—"}</td>
                            </tr>
                          ))}
                          {assetsList.length === 0 && (
                            <tr>
                              <td colSpan={4} className="py-4 text-center text-slate-400">No media assets found in database.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Register/Upload Form */}
                  <div className={`rounded-2xl p-5 border shadow-2xs ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
                    <h3 className="text-sm font-bold">Register / Upload New Media Asset</h3>
                    <form action={uploadCmsAsset} className="mt-4 grid gap-3 text-xs">
                      <input type="hidden" name="brandSlug" value={brandSlug} />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1">
                          <span className="font-semibold text-slate-500">Asset Kind</span>
                          <select name="kind" className={`rounded-lg border px-3 py-2 ${isDark ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-300"}`}>
                            <option value="image">Image 🖼️</option>
                            <option value="video">Video 🎥</option>
                            <option value="audio">Audio 🎧</option>
                            <option value="document">Document 📂</option>
                          </select>
                        </label>
                        <label className="grid gap-1">
                          <span className="font-semibold text-slate-500">File Size (Bytes)</span>
                          <input type="number" name="bytes" defaultValue={102400} className={`rounded-lg border px-3 py-2 ${isDark ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-300"}`} />
                        </label>
                      </div>

                      <label className="grid gap-1">
                        <span className="font-semibold text-slate-500">Media File URL (or local path)</span>
                        <input type="text" name="url" placeholder="e.g. /images/cherry_blossom.jpg" className={`rounded-lg border px-3 py-2 ${isDark ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-300"}`} required />
                      </label>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1">
                          <span className="font-semibold text-slate-500">Asset Title</span>
                          <input type="text" name="title" placeholder="e.g. Cherry Blossoms" className={`rounded-lg border px-3 py-2 ${isDark ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-300"}`} />
                        </label>
                        <label className="grid gap-1">
                          <span className="font-semibold text-slate-500">Alt Text (Accessibility)</span>
                          <input type="text" name="altText" placeholder="e.g. Cherry blossom blooming in Shinjuku" className={`rounded-lg border px-3 py-2 ${isDark ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-300"}`} />
                        </label>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1">
                          <span className="font-semibold text-slate-500">Copyright Banner</span>
                          <input type="text" name="copyright" defaultValue="© 2026 Organization" className={`rounded-lg border px-3 py-2 ${isDark ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-300"}`} />
                        </label>
                        <label className="grid gap-1">
                          <span className="font-semibold text-slate-500">Licensing Model</span>
                          <input type="text" name="licensing" defaultValue="Standard Enterprise License" className={`rounded-lg border px-3 py-2 ${isDark ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-300"}`} />
                        </label>
                      </div>

                      <button type="submit" className="w-fit rounded-lg bg-amber-600 px-5 py-2.5 font-bold text-white hover:bg-amber-500 mt-2">
                        📤 Upload / Register Asset
                      </button>
                    </form>
                  </div>
                </div>

                {/* Right Area: Asset Inspector (Span 1) */}
                <div className="md:col-span-1">
                  {assetsList.length > 0 ? (
                    (() => {
                      const activeAsset = assetsList[0];
                      return (
                        <div className={`rounded-2xl p-5 border shadow-2xs space-y-4 sticky top-6 ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
                          <div className="flex justify-between items-center border-b border-black/5 pb-3">
                            <h4 className="font-bold text-sm">Media File Inspector</h4>
                            <span className="rounded-full bg-amber-100 dark:bg-amber-950/40 px-2 py-0.5 text-[9px] font-bold text-amber-800 dark:text-amber-300 uppercase">
                              Active Item
                            </span>
                          </div>

                          {/* Render thumbnail of active asset if it is an image */}
                          {activeAsset.kind === "image" ? (
                            <div className="relative h-32 rounded-xl overflow-hidden shadow-2xs border border-slate-200 bg-slate-50 flex items-center justify-center">
                              <img src={activeAsset.url} alt={activeAsset.title || "Preview"} className="max-w-full max-h-full object-contain" />
                            </div>
                          ) : (
                            <div className="h-32 rounded-xl border border-slate-200 bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center text-center p-3 space-y-2">
                              <span className="text-3xl">📁</span>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{activeAsset.kind} asset</span>
                            </div>
                          )}

                          <div className="space-y-3 text-xs">
                            <div>
                              <p className="font-extrabold text-slate-400 uppercase tracking-widest text-[9px]">Title &amp; URL</p>
                              <p className="font-bold text-slate-900 dark:text-white mt-0.5">{activeAsset.title || "Untitled Asset"}</p>
                              <p className="text-[10px] font-mono text-slate-500 break-all mt-0.5">{activeAsset.url}</p>
                            </div>

                            <div>
                              <p className="font-extrabold text-slate-400 uppercase tracking-widest text-[9px]">Alt Text (A11y)</p>
                              <p className="text-slate-600 dark:text-slate-300 italic mt-0.5">{activeAsset.altText || "No Alt text configured."}</p>
                            </div>

                            <div>
                              <p className="font-extrabold text-slate-400 uppercase tracking-widest text-[9px]">Licensing &amp; Ownership</p>
                              <p className="text-slate-600 dark:text-slate-300 mt-0.5"><b>Owner:</b> {activeAsset.owner || "Organization"}</p>
                              <p className="text-slate-600 dark:text-slate-300 mt-0.5"><b>License:</b> {activeAsset.licensing || "CC-BY-NC"}</p>
                              <p className="text-slate-600 dark:text-slate-300 mt-0.5"><b>Copyright:</b> {activeAsset.copyright}</p>
                            </div>

                            <div>
                              <p className="font-extrabold text-slate-400 uppercase tracking-widest text-[9px]">Responsive Formats (srcset)</p>
                              {activeAsset.variants && Object.keys(activeAsset.variants).length > 0 ? (
                                <div className="space-y-1 mt-1 font-mono text-[10px] text-slate-400">
                                  {Object.entries(activeAsset.variants).map(([vName, vUrl]) => (
                                    <p key={vName} className="truncate"><b>{vName}:</b> {String(vUrl)}</p>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-slate-400 italic text-[11px] mt-0.5">No variants generated (Not an image kind).</p>
                              )}
                            </div>

                            <div className="pt-2 border-t border-black/5">
                              <p className="font-extrabold text-slate-400 uppercase tracking-widest text-[9px]">Duplicates Checksum (SHA-256)</p>
                              <p className="font-mono text-[9px] text-slate-500 break-all mt-0.5">{activeAsset.checksum || "—"}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div className={`rounded-2xl p-5 border text-center text-xs text-slate-400 ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
                      Select an asset from the list to inspect metadata and compliance details.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Panel 4: LMS Course Manager */}
            {tab === "courses" && (
              <div className={`rounded-2xl p-5 border shadow-2xs ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
                <h3 className="text-sm font-bold mb-4">LMS Course Catalog</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {coursesList.map((c) => (
                    <div key={c.id} className={`rounded-xl p-4 border ${isDark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
                      <div className="flex justify-between items-start">
                        <span className="rounded-md bg-amber-100 dark:bg-amber-950/40 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                          {c.level}
                        </span>
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-800">
                          {c.status}
                        </span>
                      </div>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white mt-2">{c.title}</h4>
                      <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{c.summary}</p>
                      <div className="mt-3 pt-3 border-t border-black/5 text-[10px] font-mono text-slate-400 flex justify-between">
                        <span>Slug: {c.slug}</span>
                        <span>Locale: {c.locale}</span>
                      </div>
                    </div>
                  ))}
                  {coursesList.length === 0 && (
                    <p className="text-center text-xs text-slate-400 col-span-full">No courses found in database.</p>
                  )}
                </div>
              </div>
            )}

            {/* Panel 5: Blog & Daily News Manager */}
            {tab === "blog_news" && (
              <div className={`rounded-2xl p-5 border shadow-2xs ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
                <h3 className="text-sm font-bold mb-4">Blog Articles &amp; Daily News Feed</h3>
                <div className="overflow-x-auto text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className={`border-b ${isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-500"} font-bold`}>
                        <th className="py-2.5">Title / Slug</th>
                        <th className="py-2.5">Level</th>
                        <th className="py-2.5">Reading Time</th>
                        <th className="py-2.5">Status</th>
                        <th className="py-2.5">Is Today's News</th>
                      </tr>
                    </thead>
                    <tbody>
                      {articlesList.map((art) => (
                        <tr key={art.id} className={`border-b ${isDark ? "border-slate-800 hover:bg-slate-850" : "border-slate-100 hover:bg-slate-50"}`}>
                          <td className="py-2.5">
                            <p className="font-bold text-slate-900 dark:text-white">{art.title}</p>
                            <p className="text-[10px] text-slate-400 font-mono">/{art.slug}</p>
                          </td>
                          <td className="py-2.5 text-slate-400 font-mono uppercase">{art.difficultyLevel}</td>
                          <td className="py-2.5 text-slate-400">{art.readingMinutes} mins</td>
                          <td className="py-2.5">
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-800 uppercase">
                              {art.status}
                            </span>
                          </td>
                          <td className="py-2.5 text-slate-400">{art.isToday ? "🔥 Yes" : "—"}</td>
                        </tr>
                      ))}
                      {articlesList.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-slate-400">No news articles found in database.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Panel 6: Vocabulary & Kanji Manager */}
            {tab === "vocabulary" && (
              <div className="space-y-6">
                {/* 6.1 Vocabulary Manager */}
                <div className={`rounded-2xl p-5 border shadow-2xs ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
                  <h3 className="text-sm font-bold mb-4">Vocabulary Lexicon</h3>
                  <div className="overflow-x-auto text-xs">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className={`border-b ${isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-500"} font-bold`}>
                          <th className="py-2.5">Spelling</th>
                          <th className="py-2.5">Readings</th>
                          <th className="py-2.5">English Meaning</th>
                          <th className="py-2.5">JLPT Level</th>
                          <th className="py-2.5">Category</th>
                        </tr>
                      </thead>
                      <tbody>
                        {learningItemsList.map((item) => (
                          <tr key={item.id} className={`border-b ${isDark ? "border-slate-800 hover:bg-slate-850" : "border-slate-100 hover:bg-slate-50"}`}>
                            <td className="py-2.5 font-bold text-base text-slate-900 dark:text-white">{item.japanese}</td>
                            <td className="py-2.5 text-slate-400">
                              <p>{item.furigana || "—"}</p>
                              <p className="text-[10px] text-slate-400 font-mono">{item.romaji}</p>
                            </td>
                            <td className="py-2.5 font-semibold text-slate-700 dark:text-slate-300">{item.meaning}</td>
                            <td className="py-2.5 font-bold font-mono uppercase text-slate-400">{item.jlptLevel || "—"}</td>
                            <td className="py-2.5 font-bold uppercase text-[9px] text-rose-700">{item.category}</td>
                          </tr>
                        ))}
                        {learningItemsList.length === 0 && (
                          <tr>
                            <td colSpan={5} className="py-4 text-center text-slate-400">No vocabulary items found in database.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 6.2 Kanji Dictionary Lookup */}
                <div className={`rounded-2xl p-5 border shadow-2xs ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
                  <h3 className="text-sm font-bold mb-4">Kanji Study Map Dictionary</h3>
                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                    {kanjiItemsList.map((k) => (
                      <div key={k.id} className={`rounded-xl p-4 border ${isDark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"} flex items-center gap-4`}>
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-950 text-2xl font-black shadow-sm">
                          {k.kanji}
                        </div>
                        <div className="text-xs">
                          <p className="font-bold text-slate-900 dark:text-white">{k.meaning}</p>
                          <p className="text-slate-400 text-[10px] mt-0.5">Onyomi: {k.onyomi || "—"}</p>
                          <p className="text-slate-400 text-[10px]">Kunyomi: {k.kunyomi || "—"}</p>
                        </div>
                      </div>
                    ))}
                    {kanjiItemsList.length === 0 && (
                      <p className="text-center text-xs text-slate-400 col-span-full">No kanji characters found in database.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Panel 7: Quiz Manager */}
            {tab === "quizzes" && (
              <div className={`rounded-2xl p-5 border shadow-2xs ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
                <h3 className="text-sm font-bold mb-4">Diagnostic Exam Quizzes</h3>
                <div className="space-y-4 text-xs">
                  {quizzesList.map((q) => (
                    <div key={q.id} className={`rounded-xl p-4 border ${isDark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"} space-y-2`}>
                      <div className="flex justify-between text-[10px] font-bold text-slate-400">
                        <span className="uppercase text-rose-700">{q.category}</span>
                        <span>Level: {q.jlptLevel}</span>
                      </div>
                      <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">{q.question}</h4>
                      <ol className="list-decimal pl-4 space-y-1 mt-2 text-slate-600 dark:text-slate-400">
                        {q.options.map((opt: string, oi: number) => (
                          <li key={oi} className={oi === q.correctIndex ? "font-bold text-emerald-600 dark:text-emerald-400" : ""}>
                            {opt} {oi === q.correctIndex ? "✓ Correct" : ""}
                          </li>
                        ))}
                      </ol>
                      {q.explanation && (
                        <p className="text-[11px] text-slate-400 italic pt-2 border-t border-black/5">
                          💡 Explanation: {q.explanation}
                        </p>
                      )}
                    </div>
                  ))}
                  {quizzesList.length === 0 && (
                    <p className="text-center text-xs text-slate-400 col-span-full">No quizzes found in database.</p>
                  )}
                </div>
              </div>
            )}

            {/* Panel 8: Downloads Manager */}
            {tab === "downloads" && (
              <div className={`rounded-2xl p-5 border shadow-2xs ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
                <h3 className="text-sm font-bold mb-4">Printable Guides &amp; Study Resources</h3>
                <div className="overflow-x-auto text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className={`border-b ${isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-500"} font-bold`}>
                        <th className="py-2.5">Title / File Name</th>
                        <th className="py-2.5">Format</th>
                        <th className="py-2.5">Category</th>
                        <th className="py-2.5">File Size</th>
                        <th className="py-2.5">Download Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resourcesList.map((res) => (
                        <tr key={res.id} className={`border-b ${isDark ? "border-slate-800 hover:bg-slate-850" : "border-slate-100 hover:bg-slate-50"}`}>
                          <td className="py-2.5 font-bold text-slate-900 dark:text-white">{res.title}</td>
                          <td className="py-2.5 text-slate-400 uppercase font-mono">{res.format || "PDF"}</td>
                          <td className="py-2.5 text-slate-400 font-bold uppercase text-[9px]">{res.category}</td>
                          <td className="py-2.5 text-slate-400 font-mono">{res.fileSize || "—"}</td>
                          <td className="py-2.5 font-extrabold text-slate-700 dark:text-slate-300">{res.downloadCount}</td>
                        </tr>
                      ))}
                      {resourcesList.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-slate-400">No resources found in database.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Panel 9: User Management */}
            {tab === "users" && (
              <div className={`rounded-2xl p-5 border shadow-2xs ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
                <h3 className="text-sm font-bold mb-4">User Accounts Registry</h3>
                <div className="overflow-x-auto text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className={`border-b ${isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-500"} font-bold`}>
                        <th className="py-2.5">Display Name</th>
                        <th className="py-2.5">Email</th>
                        <th className="py-2.5">System Role</th>
                        <th className="py-2.5">Date Enrolled</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersList.map((user) => (
                        <tr key={user.id} className={`border-b ${isDark ? "border-slate-800 hover:bg-slate-850" : "border-slate-100 hover:bg-slate-50"}`}>
                          <td className="py-2.5 font-bold text-slate-900 dark:text-white">{user.displayName || "—"}</td>
                          <td className="py-2.5 font-mono text-slate-400">{user.email}</td>
                          <td className="py-2.5">
                            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[9px] font-bold text-indigo-800 uppercase tracking-wide">
                              {user.role}
                            </span>
                          </td>
                          <td className="py-2.5 text-slate-400">{user.createdAt.toDateString()}</td>
                        </tr>
                      ))}
                      {usersList.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-4 text-center text-slate-400">No user records found in database.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Panel 10: Settings */}
            {tab === "settings" && (
              <div className="grid gap-6 sm:grid-cols-2">
                {/* Navigation Menu Links */}
                <div className={`rounded-2xl p-5 border shadow-2xs ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
                  <h4 className="font-bold text-sm mb-3">🧭 Header Mega Navigation Quick-Links</h4>
                  <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    {(navSettings?.links ?? []).map((l, i) => (
                      <li key={i} className="flex justify-between border-b border-black/5 py-1 font-mono text-slate-400">
                        <span className="font-sans font-bold text-slate-900 dark:text-white">{l.label}</span>
                        <span>{l.href}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* SEO Metadata Config */}
                <div className={`rounded-2xl p-5 border shadow-2xs ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
                  <h4 className="font-bold text-sm mb-3">🔍 Site SEO Configuration Parameters</h4>
                  <div className="space-y-3 text-xs">
                    <div>
                      <p className="font-bold text-slate-400 uppercase text-[10px]">Primary Title Meta</p>
                      <p className="font-bold mt-1 text-slate-900 dark:text-white">{seoSettings?.metaTitle || "—"}</p>
                    </div>
                    <div>
                      <p className="font-bold text-slate-400 uppercase text-[10px]">Description Snippet</p>
                      <p className="mt-1 text-slate-600 dark:text-slate-300 leading-relaxed">{seoSettings?.metaDescription || "—"}</p>
                    </div>
                    <div className="pt-2 border-t border-black/5">
                      <p className="font-bold text-slate-400 uppercase text-[10px]">Footer Tagline</p>
                      <p className="mt-1 text-slate-600 dark:text-slate-300">{footerSettings?.tagline || "—"}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Panel 11: Audit Logs */}
            {tab === "logs" && (
              <div className={`rounded-2xl p-5 border shadow-2xs ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
                <h3 className="text-sm font-bold mb-4">Historical Audit Trail</h3>
                <div className="overflow-x-auto text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className={`border-b ${isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-500"} font-bold`}>
                        <th className="py-2.5">Action executed</th>
                        <th className="py-2.5">Target entity</th>
                        <th className="py-2.5">Details</th>
                        <th className="py-2.5">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogsList.map((log) => (
                        <tr key={log.id} className={`border-b ${isDark ? "border-slate-800 hover:bg-slate-850" : "border-slate-100 hover:bg-slate-50"}`}>
                          <td className="py-2.5">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-700 uppercase tracking-wide">
                              {log.action}
                            </span>
                          </td>
                          <td className="py-2.5">
                            <p className="font-semibold text-slate-800 dark:text-white">{log.entityType}</p>
                            <p className="text-[10px] text-slate-400">ID: {log.entityId}</p>
                          </td>
                          <td className="py-2.5 font-mono text-[10px] text-slate-500 max-w-sm truncate" title={JSON.stringify(log.details)}>
                            {JSON.stringify(log.details)}
                          </td>
                          <td className="py-2.5 text-slate-400">{log.createdAt.toLocaleString()}</td>
                        </tr>
                      ))}
                      {auditLogsList.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-4 text-center text-slate-400">No logs found in database.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
