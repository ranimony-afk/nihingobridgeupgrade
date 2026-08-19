import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  cmsCourses,
  cmsMedia,
  cmsNotifications,
  cmsPosts,
  cmsSeo,
  identityUsers,
  billingInvoices,
  kgGrammar,
  kgKanji,
  kgLexemes,
  lessons,
  systemSettings,
} from "@/db/schema";
import { media } from "@/lib/media";
import { uid } from "@/lib/utils";

export async function ensureCmsSeed() {
  const marked = await db.select().from(systemSettings).where(eq(systemSettings.key, "phase10_cms"));
  if (marked.length > 0) return;

  await db.insert(cmsPosts).values([
    {
      id: "post-welcome",
      slug: "welcome-to-nihongo-bridge",
      title: "Welcome to Nihongo Bridge",
      excerpt: "A Duolingo-style path, a JMdict-scale graph, and an AI sensei in one platform.",
      body: "Nihongo Bridge blends a game-like lesson path with a normalized Japanese knowledge graph. Start on /learn, look words up in /dictionary, then practise speaking in /conversation.",
      status: "published",
      tags: "product,launch",
      seoTitle: "Welcome to Nihongo Bridge",
      seoDescription: "Learn Japanese with streaks, a full dictionary, and an AI tutor.",
    },
    {
      id: "post-jlpt",
      slug: "jlpt-n5-study-plan",
      title: "A four-week JLPT N5 plan",
      excerpt: "Kana, 300 words, 25 grammar points, and daily shadowing.",
      body: "Week 1 kana. Week 2 core vocabulary from the dictionary. Week 3 particles in the grammar engine. Week 4 mock drills plus conversation lab roleplay.",
      status: "published",
      tags: "jlpt,study",
      seoTitle: "JLPT N5 study plan",
      seoDescription: "Four week plan to pass JLPT N5 with NihongoBridge.",
    },
  ]).onConflictDoNothing();

  await db.insert(cmsCourses).values([
    {
      id: "course-n5",
      slug: "jlpt-n5-sprint",
      title: "JLPT N5 Sprint",
      summary: "Kana to particles in four guided weeks.",
      level: "N5",
      priceCents: 4900,
      status: "published",
      modules: [
        { title: "Kana", lessons: ["Vowel Tide", "Ka Current", "Sa Breeze"] },
        { title: "Core words", lessons: ["First Bites", "Station Signs"] },
        { title: "Particles", lessons: ["は", "を", "に"] },
      ],
    },
    {
      id: "course-keigo",
      slug: "business-keigo",
      title: "Business Keigo",
      summary: "Sonkeigo and kenjougo for the office.",
      level: "N3",
      priceCents: 9900,
      status: "draft",
      modules: [{ title: "Foundations", lessons: ["尊敬語", "謙譲語"] }],
    },
  ]).onConflictDoNothing();

  await db.insert(cmsMedia).values([
    { id: "media-mochi", name: "Mochi mascot", url: media.mochi, kind: "image", alt: "Mochi the tanuki", bytes: 0 },
    { id: "media-fuji", name: "Fuji hero", url: media.fuji, kind: "image", alt: "Mount Fuji", bytes: 0 },
    { id: "media-ramen", name: "Ramen", url: media.ramen, kind: "image", alt: "Ramen bowl", bytes: 0 },
  ]).onConflictDoNothing();

  await db.insert(cmsNotifications).values([
    { id: "notif-launch", title: "Streak reminder", body: "Your flame needs one lesson today.", audience: "all", status: "sent" },
  ]).onConflictDoNothing();

  await db.insert(cmsSeo).values([
    { path: "/", title: "Nihongo Bridge — Learn Japanese like play", description: "Duolingo-style Japanese with a full dictionary and AI tutor.", ogImage: media.fuji, noindex: false },
    { path: "/dictionary", title: "Japanese dictionary", description: "JMdict-scale lookup with pitch accent and audio.", ogImage: media.tokyoNight, noindex: false },
    { path: "/blog", title: "Nihongo Bridge blog", description: "Study plans and product notes.", ogImage: media.cherryPath, noindex: false },
  ]).onConflictDoNothing();

  await db.insert(systemSettings).values({ key: "phase10_cms", value: "1" });
}

export async function listPosts(onlyPublished = false) {
  const rows = await db.select().from(cmsPosts).orderBy(desc(cmsPosts.updatedAt));
  return onlyPublished ? rows.filter((row) => row.status === "published") : rows;
}

export async function getPost(slug: string) {
  const [row] = await db.select().from(cmsPosts).where(eq(cmsPosts.slug, slug));
  return row ?? null;
}

export async function cmsOverview() {
  const [posts, courses, mediaRows, notifications, seo, users, invoices, lessonRows, lexemes, kanji, grammar] =
    await Promise.all([
      listPosts(),
      db.select().from(cmsCourses),
      db.select().from(cmsMedia),
      db.select().from(cmsNotifications).orderBy(desc(cmsNotifications.createdAt)),
      db.select().from(cmsSeo),
      db.select().from(identityUsers),
      db.select().from(billingInvoices),
      db.select().from(lessons),
      db.select().from(kgLexemes),
      db.select().from(kgKanji),
      db.select().from(kgGrammar),
    ]);
  return {
    posts,
    courses,
    media: mediaRows,
    notifications,
    seo,
    counts: {
      users: users.length,
      invoices: invoices.length,
      lessons: lessonRows.length,
      lexemes: lexemes.length,
      kanji: kanji.length,
      grammar: grammar.length,
    },
  };
}

export async function upsertPost(input: { id?: string; slug: string; title: string; excerpt: string; body: string; status: string }) {
  const id = input.id ?? uid("post");
  const existing = await db.select().from(cmsPosts).where(eq(cmsPosts.slug, input.slug));
  if (existing[0]) {
    await db
      .update(cmsPosts)
      .set({ title: input.title, excerpt: input.excerpt, body: input.body, status: input.status, updatedAt: new Date() })
      .where(eq(cmsPosts.id, existing[0].id));
    return existing[0].id;
  }
  await db.insert(cmsPosts).values({ ...input, id, tags: "" });
  return id;
}

export async function queueNotification(input: { title: string; body: string; audience: string }) {
  const id = uid("notif");
  await db.insert(cmsNotifications).values({ ...input, id, status: "queued" });
  return id;
}

export async function upsertSeo(input: { path: string; title: string; description: string; noindex?: boolean }) {
  const existing = await db.select().from(cmsSeo).where(eq(cmsSeo.path, input.path));
  if (existing[0]) {
    await db
      .update(cmsSeo)
      .set({ title: input.title, description: input.description, noindex: input.noindex ?? false })
      .where(eq(cmsSeo.path, input.path));
    return;
  }
  await db.insert(cmsSeo).values({ ...input, noindex: input.noindex ?? false });
}

export async function seoFor(path: string) {
  const [row] = await db.select().from(cmsSeo).where(eq(cmsSeo.path, path));
  return row ?? null;
}
