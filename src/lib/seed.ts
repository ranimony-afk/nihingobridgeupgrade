/**
 * Idempotent seed — guarantees brands, starter catalog, CMS sections,
 * translations, Nihongo learning items, custom decks, daily news, gamification,
 * downloadable resources, Study in Japan items, Kanji dictionary, and Phase 8 Conversation Lab.
 */

import { db } from "@/db";
import {
  brands,
  courses,
  modules,
  lessons,
  pages,
  contentSections,
  brandSettings,
  translations,
  translationMemory,
  nihongoLearningItems,
  nihongoQuizzes,
  customDecks,
  customDeckCards,
  newsArticles,
  learnerGamification,
  leaderboards,
  downloadableResources,
  studyJapanItems,
  kanjiDictionary,
  conversationLessons,
} from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { BRANDS, type BrandKey } from "@/lib/brands";

let seededPromise: Promise<void> | null = null;

export function ensureSeed(): Promise<void> {
  if (!seededPromise) {
    seededPromise = doSeed().catch((err) => {
      seededPromise = null;
      throw err;
    });
  }
  return seededPromise;
}

async function doSeed(): Promise<void> {
  await db.execute(sql`select 1`);

  for (const cfg of Object.values(BRANDS)) {
    const existing = await db
      .select()
      .from(brands)
      .where(eq(brands.slug, cfg.slug))
      .limit(1);

    let brandId: number;
    if (existing.length === 0) {
      const inserted = await db
        .insert(brands)
        .values({
          slug: cfg.slug,
          name: cfg.name,
          tagline: cfg.tagline,
          defaultLocale: cfg.defaultLocale,
          theme: cfg.theme,
        })
        .returning({ id: brands.id });
      brandId = inserted[0].id;
    } else {
      brandId = existing[0].id;
    }

    await seedContent(brandId, cfg.key);
    await seedCmsSectionsAndSettings(brandId, cfg.key);
    await seedTranslations(brandId, cfg.key);
    await seedDynamicPages(brandId, cfg.key);
    if (cfg.key === "nihongo") {
      await seedNihongoPlatform(brandId);
      await seedCustomDecks(brandId);
      await seedNewsArticles(brandId);
      await seedGamificationAndLeaderboards(brandId);
      await seedResourcesAndStudyJapan(brandId);
      await seedKanjiDictionary();
      await seedConversationLessons(brandId);
    }
  }
}

async function seedConversationLessons(brandId: number): Promise<void> {
  for (const conv of SEED_CONVERSATION_LESSONS) {
    const existing = await db
      .select()
      .from(conversationLessons)
      .where(and(eq(conversationLessons.brandId, brandId), eq(conversationLessons.category, conv.category)))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(conversationLessons).values({
        brandId,
        category: conv.category,
        title: conv.title,
        situation: conv.situation,
        difficultyLevel: conv.difficultyLevel,
        dialogues: conv.dialogues,
        vocabulary: conv.vocabulary,
        grammarNotes: conv.grammarNotes,
        rolePlayPrompt: conv.rolePlayPrompt,
        audioUrl: conv.audioUrl,
        isCompleted: false,
      });
    }
  }
}

async function seedKanjiDictionary(): Promise<void> {
  for (const k of SEED_KANJI_DICT) {
    const existing = await db
      .select()
      .from(kanjiDictionary)
      .where(eq(kanjiDictionary.kanji, k.kanji))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(kanjiDictionary).values(k);
    }
  }
}

async function seedResourcesAndStudyJapan(brandId: number): Promise<void> {
  for (const r of SEED_DOWNLOAD_RESOURCES) {
    const existing = await db
      .select()
      .from(downloadableResources)
      .where(and(eq(downloadableResources.brandId, brandId), eq(downloadableResources.title, r.title)))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(downloadableResources).values({
        brandId,
        title: r.title,
        description: r.description,
        fileType: r.fileType,
        category: r.category,
        fileUrl: r.fileUrl,
        fileSize: r.fileSize,
        requiresRegistration: true,
        downloadCount: r.downloadCount,
        jlptLevel: r.jlptLevel,
      });
    }
  }

  for (const sj of SEED_STUDY_JAPAN) {
    const existing = await db
      .select()
      .from(studyJapanItems)
      .where(and(eq(studyJapanItems.brandId, brandId), eq(studyJapanItems.title, sj.title)))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(studyJapanItems).values({
        brandId,
        category: sj.category,
        title: sj.title,
        summary: sj.summary,
        body: sj.body,
        location: sj.location,
        stipendOrTuition: sj.stipendOrTuition,
        tags: sj.tags,
      });
    }
  }
}

async function seedGamificationAndLeaderboards(brandId: number): Promise<void> {
  const existingGamify = await db.select().from(learnerGamification).limit(1);
  if (existingGamify.length === 0) {
    await db.insert(learnerGamification).values({
      brandId,
      xp: 420,
      streakDays: 8,
      dailyGoalMinutes: 15,
      weeklyGoalMinutes: 90,
      totalStudyMinutes: 135,
      completedLessonsCount: 14,
      completedReviewsCount: 95,
      averageTestScore: 92,
      streakFreezes: 2,
      level: 3,
      levelTitle: "Hiragana Adept",
      bookmarks: [1, 2],
      achievements: ["First 100 XP", "7-Day Streak Warrior", "Kanji Novice", "Speed Matcher"],
      badges: [
        { name: "First 100 XP", icon: "⚡", description: "Earned your first 100 XP" },
        { name: "7-Day Streak", icon: "🔥", description: "Studied 7 days in a row" },
        { name: "JLPT Explorer", icon: "🗾", description: "Completed your first JLPT practice module" },
        { name: "Quiz Master", icon: "🎯", description: "Scored 100% on a practice quiz" },
      ],
      dailyChallenges: [
        { title: "Review 10 flashcards in Spaced Repetition", xpReward: 20, isCompleted: true },
        { title: "Read today's Japanese news article", xpReward: 30, isCompleted: true },
        { title: "Score 100% on a JLPT N5 quiz", xpReward: 25, isCompleted: false },
      ],
      weakAreas: [
        { item: "食べる (taberu)", meaning: "To eat (Ichidan verb)", accuracy: 65 },
        { item: "日本 (nihon)", meaning: "Japan (4 strokes)", accuracy: 70 },
        { item: "勉強する (benkyou suru)", meaning: "To study (Suru verb)", accuracy: 72 },
      ],
    });
  }

  const existingLb = await db.select().from(leaderboards).limit(1);
  if (existingLb.length === 0) {
    const defaultRanks = [
      { displayName: "Yuki M. (You)", xp: 420, rank: 1, avatarEmoji: "🦊", streakDays: 8, league: "Sapphire League" },
      { displayName: "Kenji S.", xp: 390, rank: 2, avatarEmoji: "🐼", streakDays: 14, league: "Sapphire League" },
      { displayName: "Sarah C.", xp: 360, rank: 3, avatarEmoji: "🐱", streakDays: 5, league: "Sapphire League" },
      { displayName: "David K.", xp: 310, rank: 4, avatarEmoji: "🦁", streakDays: 12, league: "Sapphire League" },
      { displayName: "Elena R.", xp: 280, rank: 5, avatarEmoji: "🦉", streakDays: 3, league: "Sapphire League" },
    ];
    for (const r of defaultRanks) {
      await db.insert(leaderboards).values(r);
    }
  }
}

async function seedNewsArticles(brandId: number): Promise<void> {
  for (const art of SEED_NEWS_ARTICLES) {
    const existing = await db
      .select()
      .from(newsArticles)
      .where(and(eq(newsArticles.brandId, brandId), eq(newsArticles.slug, art.slug)))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(newsArticles).values({
        brandId,
        slug: art.slug,
        title: art.title,
        summary: art.summary,
        japaneseText: art.japaneseText,
        furiganaText: art.furiganaText,
        englishTranslation: art.englishTranslation,
        tamilTranslation: art.tamilTranslation,
        malayalamTranslation: art.malayalamTranslation,
        difficultyLevel: art.difficultyLevel,
        readingMinutes: art.readingMinutes,
        audioUrl: art.audioUrl,
        grammarHighlights: art.grammarHighlights,
        extractedVocabulary: art.extractedVocabulary,
        extractedKanji: art.extractedKanji,
        comprehensionQuestions: art.comprehensionQuestions,
        isToday: art.isToday,
        status: "published",
      });
    }
  }
}

async function seedCustomDecks(brandId: number): Promise<void> {
  for (const d of SEED_DECKS) {
    const existing = await db
      .select()
      .from(customDecks)
      .where(and(eq(customDecks.brandId, brandId), eq(customDecks.title, d.title)))
      .limit(1);

    let deckId: number;
    if (existing.length === 0) {
      const inserted = await db
        .insert(customDecks)
        .values({
          brandId,
          title: d.title,
          description: d.description,
          jlptLevel: d.jlptLevel,
          isPublic: true,
          shareCode: d.shareCode,
          tags: d.tags,
          cardCount: d.cards.length,
        })
        .returning({ id: customDecks.id });
      deckId = inserted[0].id;
    } else {
      deckId = existing[0].id;
    }

    for (let i = 0; i < d.cards.length; i++) {
      const c = d.cards[i];
      const existingCard = await db
        .select()
        .from(customDeckCards)
        .where(and(eq(customDeckCards.deckId, deckId), eq(customDeckCards.front, c.front)))
        .limit(1);

      if (existingCard.length === 0) {
        await db.insert(customDeckCards).values({
          deckId,
          cardType: c.cardType,
          front: c.front,
          back: c.back,
          furigana: c.furigana,
          romaji: c.romaji,
          notes: c.notes,
          position: i,
          easeFactor: 250,
          intervalDays: 1,
          repetitions: 0,
          accuracy: 100,
        });
      }
    }
  }
}

async function seedNihongoPlatform(brandId: number): Promise<void> {
  for (const raw of NIHONGO_ITEMS) {
    const item = raw as {
      category: string;
      jlptLevel?: string;
      japanese: string;
      furigana?: string;
      romaji?: string;
      meaning: string;
      partOfSpeech?: string;
      pitchAccent?: string;
      synonyms?: string[];
      antonyms?: string[];
      frequency?: number;
      isFavorite?: boolean;
      isBookmarked?: boolean;
      reviewStatus?: string;
      exampleSentenceJa?: string;
      exampleSentenceEn?: string;
      grammarStructure?: string;
      strokeCount?: number;
      radicals?: string;
      tags?: string[];
    };
    const existing = await db
      .select()
      .from(nihongoLearningItems)
      .where(
        and(
          eq(nihongoLearningItems.brandId, brandId),
          eq(nihongoLearningItems.japanese, item.japanese),
          eq(nihongoLearningItems.category, item.category),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(nihongoLearningItems).values({
        brandId,
        category: item.category,
        jlptLevel: item.jlptLevel ?? "N5",
        japanese: item.japanese,
        furigana: item.furigana,
        romaji: item.romaji,
        meaning: item.meaning,
        partOfSpeech: item.partOfSpeech ?? "Noun",
        pitchAccent: item.pitchAccent ?? "[0] 平板 (heiban)",
        synonyms: item.synonyms ?? [],
        antonyms: item.antonyms ?? [],
        frequency: item.frequency ?? 100,
        isFavorite: item.isFavorite ?? false,
        isBookmarked: item.isBookmarked ?? false,
        reviewStatus: item.reviewStatus ?? "learning",
        exampleSentenceJa: item.exampleSentenceJa,
        exampleSentenceEn: item.exampleSentenceEn,
        grammarStructure: item.grammarStructure,
        strokeCount: item.strokeCount,
        radicals: item.radicals,
        tags: item.tags,
      });
    }
  }

  for (const q of NIHONGO_QUIZZES) {
    const existing = await db
      .select()
      .from(nihongoQuizzes)
      .where(
        and(
          eq(nihongoQuizzes.brandId, brandId),
          eq(nihongoQuizzes.question, q.question),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(nihongoQuizzes).values({
        brandId,
        category: q.category,
        jlptLevel: q.jlptLevel,
        sectionType: q.sectionType,
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        timeLimitSeconds: q.timeLimitSeconds,
      });
    }
  }
}

async function seedTranslations(brandId: number, key: BrandKey): Promise<void> {
  const localizedData = DB_TRANSLATIONS[key];

  for (const item of localizedData) {
    const existing = await db
      .select()
      .from(translations)
      .where(
        and(
          eq(translations.entityType, item.entityType),
          eq(translations.entityId, brandId),
          eq(translations.locale, item.locale),
          eq(translations.field, item.field),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(translations).values({
        entityType: item.entityType,
        entityId: brandId,
        locale: item.locale,
        field: item.field,
        value: item.value,
      });
    }

    const existingTm = await db
      .select()
      .from(translationMemory)
      .where(
        and(
          eq(translationMemory.sourceText, item.field),
          eq(translationMemory.targetLocale, item.locale),
        ),
      )
      .limit(1);

    if (existingTm.length === 0) {
      await db.insert(translationMemory).values({
        sourceText: item.field,
        sourceLocale: "en",
        targetLocale: item.locale,
        translatedText: item.value,
        context: `${key}-ui`,
      });
    }
  }
}

async function seedCmsSectionsAndSettings(brandId: number, key: BrandKey): Promise<void> {
  const sections = CMS_DATA[key];

  for (const s of sections) {
    const existing = await db
      .select()
      .from(contentSections)
      .where(
        and(
          eq(contentSections.brandId, brandId),
          eq(contentSections.pageSlug, s.pageSlug),
          eq(contentSections.sectionKey, s.sectionKey),
          eq(contentSections.locale, "en"),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(contentSections).values({
        brandId,
        pageSlug: s.pageSlug,
        sectionKey: s.sectionKey,
        title: s.title,
        subtitle: s.subtitle,
        content: s.content,
        position: s.position,
        status: "published",
        locale: "en",
      });
    }
  }

  const settingsList = [
    {
      category: "navigation",
      data: {
        megaMenuTitle: "Nihongo Bridge Mega Navigation",
        links: [
          { label: "Learn Japanese", href: "/nihongo", icon: "🗾" },
          { label: "JLPT", href: "/jlpt/mock-exam", icon: "⏱" },
          { label: "Vocabulary", href: "/dictionary", icon: "📖" },
          { label: "Kanji", href: "/kanji", icon: "🈸" },
          { label: "Grammar", href: "/study/write", icon: "✍️" },
          { label: "Conversation", href: "/nihongo/conversation", icon: "🗣️" },
          { label: "Reading", href: "/news", icon: "📰" },
          { label: "Listening", href: "/nihongo#programs", icon: "🎧" },
          { label: "Flashcards", href: "/decks", icon: "🎴" },
          { label: "Practice Tests", href: "/jlpt/mock-exam", icon: "📝" },
          { label: "News", href: "/news", icon: "🗞️" },
          { label: "Study in Japan", href: "/nihongo/study-japan", icon: "🎓" },
          { label: "Jobs", href: "/nihongo/jobs", icon: "💼" },
          { label: "Culture", href: "/nihongo#about", icon: "🌸" },
          { label: "Resources", href: "/downloads", icon: "📚" },
          { label: "Downloads", href: "/downloads", icon: "📥" },
          { label: "Community", href: "/leaderboard", icon: "🏆" },
          { label: "Dashboard", href: "/leaderboard", icon: "📊" },
          { label: "Admin", href: "/admin/nihongo", icon: "⚙️" },
          { label: "Support", href: "/nihongo#contact", icon: "💬" },
          { label: "Search", href: "/dictionary", icon: "🔍" },
          { label: "Bookmarks", href: "/decks", icon: "★" },
          { label: "Profile", href: "/leaderboard", icon: "👤" },
        ],
      },
    },
    {
      category: "footer",
      data: {
        copyright: `© ${new Date().getFullYear()} ${key === "ascend" ? "Ascend Academy" : "Nihongo Bridge"}. All rights reserved.`,
        tagline: key === "ascend" ? "Empowering modern engineers and leaders." : "Your bridge to fluent Japanese and life in Japan.",
      },
    },
    {
      category: "seo",
      data: {
        metaTitle: key === "ascend" ? "Ascend Academy — Rise Through Mastery" : "Nihongo Bridge — Ultimate Japanese Learning Platform",
        metaDescription: key === "ascend" ? "Engineering leadership, systems design, and software craftsmanship." : "Full Japanese ecosystem: JLPT mock tests, Kanji Study maps, Takoboto dictionary, TODAI news, and Quizlet flashcards.",
      },
    },
  ];

  for (const set of settingsList) {
    const existing = await db
      .select()
      .from(brandSettings)
      .where(and(eq(brandSettings.brandId, brandId), eq(brandSettings.category, set.category)))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(brandSettings).values({
        brandId,
        category: set.category,
        data: set.data,
      });
    }
  }
}

async function seedContent(brandId: number, key: BrandKey): Promise<void> {
  const catalog = STARTER_CATALOG[key];

  const homeSlug = "home";
  const existingHome = await db
    .select()
    .from(pages)
    .where(and(eq(pages.brandId, brandId), eq(pages.slug, homeSlug), eq(pages.locale, "en")))
    .limit(1);

  if (existingHome.length === 0) {
    await db.insert(pages).values({
      brandId,
      slug: homeSlug,
      title: catalog.home.title,
      body: catalog.home.body,
      status: "published",
      locale: "en",
      publishedAt: new Date(),
    });
  }

  for (const c of catalog.courses) {
    const existingCourse = await db
      .select()
      .from(courses)
      .where(and(eq(courses.brandId, brandId), eq(courses.slug, c.slug), eq(courses.locale, "en")))
      .limit(1);

    let courseId: number;
    if (existingCourse.length === 0) {
      const inserted = await db
        .insert(courses)
        .values({
          brandId,
          slug: c.slug,
          title: c.title,
          summary: c.summary,
          level: c.level,
          locale: "en",
          status: "published",
          isFeatured: c.featured,
        })
        .returning({ id: courses.id });
      courseId = inserted[0].id;
    } else {
      courseId = existingCourse[0].id;
    }

    for (let mi = 0; mi < c.modules.length; mi++) {
      const m = c.modules[mi];
      const existingModules = await db
        .select()
        .from(modules)
        .where(and(eq(modules.courseId, courseId), eq(modules.title, m.title)))
        .limit(1);

      let moduleId: number;
      if (existingModules.length === 0) {
        const inserted = await db
          .insert(modules)
          .values({ courseId, title: m.title, position: mi })
          .returning({ id: modules.id });
        moduleId = inserted[0].id;
      } else {
        moduleId = existingModules[0].id;
      }

      for (let li = 0; li < m.lessons.length; li++) {
        const l = m.lessons[li];
        const existingLesson = await db
          .select()
          .from(lessons)
          .where(and(eq(lessons.moduleId, moduleId), eq(lessons.slug, l.slug)))
          .limit(1);
        if (existingLesson.length === 0) {
          await db.insert(lessons).values({
            moduleId,
            slug: l.slug,
            title: l.title,
            body: l.body,
            position: li,
            durationMinutes: l.durationMinutes,
          });
        }
      }
    }
  }
}

/* Phase 8 9-Module Conversation Lab Dataset */
const SEED_CONVERSATION_LESSONS = [
  {
    category: "greetings",
    title: "1. Greetings & First Introductions (挨拶と自己紹介)",
    situation: "Meeting a Japanese coworker or classmate for the first time.",
    difficultyLevel: "N5",
    dialogues: [
      { speaker: "Tanaka", role: "Partner", japanese: "初めまして、田中です。よろしくお願いします。", furigana: "はじめまして、たなかです。よろしくおねがいします。", romaji: "Hajimemashite, Tanaka desu. Yoroshiku onegaishimasu.", english: "Nice to meet you, I am Tanaka. Pleased to meet you." },
      { speaker: "Learner", role: "User", japanese: "初めまして、マイケルと申します。こちらこそよろしくお願いします。", furigana: "はじめまして、まいけると もうします。こちらこそ よろしくおねがいします。", romaji: "Hajimemashite, Maikeru to moushimasu. Kochira koso yoroshiku onegaishimasu.", english: "Nice to meet you, I am Michael. The pleasure is mine." },
    ],
    vocabulary: [
      { word: "初めまして", reading: "はじめまして", meaning: "Nice to meet you" },
      { word: "申します", reading: "もうします", meaning: "To be called (Humble)" },
    ],
    grammarNotes: ["「こちらこそ」 returns the polite sentiment back to the speaker."],
    rolePlayPrompt: "Introduce yourself politely using 「〜と申します」.",
    audioUrl: "https://audio.nihongobridge.com/conv/greetings.mp3",
  },
  {
    category: "shopping",
    title: "2. Shopping & Asking Prices (買い物とお会計)",
    situation: "At a department store in Shinjuku asking for sizes and prices.",
    difficultyLevel: "N5",
    dialogues: [
      { speaker: "Clerk", role: "Partner", japanese: "いらっしゃいませ！何かお探しですか。", furigana: "いらっしゃいませ！なにか おさがしですか。", romaji: "Irasshaimase! Nanika osagashi desu ka.", english: "Welcome! Are you looking for anything?" },
      { speaker: "Learner", role: "User", japanese: "すみません、このシャツのMサイズはありますか。", furigana: "すみません、このしゃつの えむさいずは ありますか。", romaji: "Sumimasen, kono shatsu no emu-saizu wa arimasu ka.", english: "Excuse me, do you have this shirt in size M?" },
    ],
    vocabulary: [
      { word: "お探し", reading: "おさがし", meaning: "Looking for / searching" },
      { word: "ありますか", reading: "ありますか", meaning: "Do you have...?" },
    ],
    grammarNotes: ["「〜はありますか」 is the standard way to check store stock."],
    rolePlayPrompt: "Ask the clerk if they have a medium size shirt in stock.",
    audioUrl: "https://audio.nihongobridge.com/conv/shopping.mp3",
  },
  {
    category: "restaurant",
    title: "3. Restaurant Ordering (レストランで注文)",
    situation: "Ordering ramen and drinks at an izakaya or Japanese restaurant.",
    difficultyLevel: "N5",
    dialogues: [
      { speaker: "Learner", role: "User", japanese: "すみません、注文をお願いします。", furigana: "すみません、ちゅうもんを おねがいします。", romaji: "Sumimasen, chuumon wo onegaishimasu.", english: "Excuse me, I would like to order please." },
      { speaker: "Staff", role: "Partner", japanese: "はい！ご注文をお伺いします。", furigana: "はい！ごちゅうもんを おうかがいします。", romaji: "Hai! Go-chuumon wo oukagai shimasu.", english: "Yes! May I take your order?" },
    ],
    vocabulary: [
      { word: "注文", reading: "ちゅうもん", meaning: "Order" },
      { word: "お伺いします", reading: "おうかがいします", meaning: "To inquire / ask politely" },
    ],
    grammarNotes: ["「〜をお願いします」 politely requests an item or action."],
    rolePlayPrompt: "Call the waiter and order two bowls of ramen.",
    audioUrl: "https://audio.nihongobridge.com/conv/restaurant.mp3",
  },
  {
    category: "travel",
    title: "4. Travel & Station Directions (駅と電車の道案内)",
    situation: "Asking how to purchase a Shinkansen bullet train ticket at Tokyo Station.",
    difficultyLevel: "N4",
    dialogues: [
      { speaker: "Learner", role: "User", japanese: "京都までの新幹線の切符を一枚ください。", furigana: "きょうとまでの しんかんせんの きっぷを いちまい ください。", romaji: "Kyouto made no shinkansen no kippu wo ichimai kudasai.", english: "One Shinkansen bullet train ticket to Kyoto, please." },
      { speaker: "Officer", role: "Partner", japanese: "指定席と自由席のどちらがよろしいですか。", furigana: "していせきと じゆうせきの どちらが よろしいですか。", romaji: "Shiteiseki to jiyuuseki no dochira ga yoroshii desu ka.", english: "Would you prefer a reserved seat or non-reserved seat?" },
    ],
    vocabulary: [
      { word: "指定席", reading: "していせき", meaning: "Reserved seat" },
      { word: "切符", reading: "きっぷ", meaning: "Ticket" },
    ],
    grammarNotes: ["「〜まで」 means 'as far as / up to [destination]'."],
    rolePlayPrompt: "Buy a reserved bullet train ticket to Kyoto.",
    audioUrl: "https://audio.nihongobridge.com/conv/travel.mp3",
  },
  {
    category: "office",
    title: "5. Office & Phone Etiquette (職場の電話対応)",
    situation: "Answering an incoming phone call in a Japanese workplace.",
    difficultyLevel: "N3",
    dialogues: [
      { speaker: "Learner", role: "User", japanese: "お電話ありがとうございます。株式会社ブリッジのマイケルでございます。", furigana: "おでんわ ありがとうございます。かぶしきがいしゃ ぶりっじの まいけるで ございます。", romaji: "Odenwa arigatou gozaimasu. Kabushikigaisha Burijji no Maikeru de gozaimasu.", english: "Thank you for calling. This is Michael from Bridge Co., Ltd." },
      { speaker: "Client", role: "Partner", japanese: "いつも大変お世話になっております。佐藤様はいらっしゃいますか。", furigana: "いつも たいへん おせわになっております。さとうさまは いらっしゃいますか。", romaji: "Itsumo taihen osewa ni natte orimasu. Satou-sama wa irasshaimasu ka.", english: "Thank you for your ongoing support. Is Mr. Sato available?" },
    ],
    vocabulary: [
      { word: "でございます", reading: "でございます", meaning: "Humble copula (to be)" },
      { word: "いらっしゃいますか", reading: "いらっしゃいますか", meaning: "Is [Person] present? (Honorific)" },
    ],
    grammarNotes: ["Use 「でございます」 instead of 「です」 when stating your company name."],
    rolePlayPrompt: "Answer the phone using official business Japanese keigo.",
    audioUrl: "https://audio.nihongobridge.com/conv/office.mp3",
  },
  {
    category: "interview",
    title: "6. Job Interview Self-PR (採用面接と自己PR)",
    situation: "Explaining your engineering and language strengths in a Tokyo job interview.",
    difficultyLevel: "N3",
    dialogues: [
      { speaker: "Interviewer", role: "Partner", japanese: "それでは、簡単に自己紹介と自己PRをお願いします。", furigana: "それでは、かんたんに じこしょうかいと じこぴーあーるを おねがいします。", romaji: "Soredewa, kantan ni jiko shoukai to jiko PR wo onegaishimasu.", english: "Now then, please give a brief self-introduction and your core strengths." },
      { speaker: "Learner", role: "User", japanese: "私の強みはチームで粘り強く課題を解決することです。", furigana: "わたしの つよみは ちーむで ねばりづよく かだいを かいけつする ことです。", romaji: "Watashi no tsuyomi wa chiimu de nebari-tsuyoku kadai wo kaiketsu suru koto desu.", english: "My strength is solving complex challenges persistently within a team." },
    ],
    vocabulary: [
      { word: "自己紹介", reading: "じこしょうかい", meaning: "Self-introduction" },
      { word: "強み", reading: "つよみ", meaning: "Core strength" },
    ],
    grammarNotes: ["Structure: 「私の強みは [Verb noun phrase] ことです」."],
    rolePlayPrompt: "Deliver your 1-minute Japanese job interview self-PR.",
    audioUrl: "https://audio.nihongobridge.com/conv/interview.mp3",
  },
  {
    category: "hospital",
    title: "7. Hospital & Doctor Consultation (病院と症状の相談)",
    situation: "Describing fever and throat symptoms to a Japanese clinic doctor.",
    difficultyLevel: "N4",
    dialogues: [
      { speaker: "Doctor", role: "Partner", japanese: "今日はどうされましたか。", furigana: "きょうは どうされましたか。", romaji: "Kyou wa dou saremashita ka.", english: "What symptoms are you experiencing today?" },
      { speaker: "Learner", role: "User", japanese: "昨日の夜から熱があって、喉が痛いです。", furigana: "きのうの よるから ねつが あって、のどが いたいです。", romaji: "Kinou no yoru kara netsu ga atte, nodo ga itai desu.", english: "I have had a fever since last night, and my throat hurts." },
    ],
    vocabulary: [
      { word: "症状", reading: "しょうじょう", meaning: "Symptoms" },
      { word: "熱", reading: "ねつ", meaning: "Fever" },
    ],
    grammarNotes: ["「〜が痛い」 describes body pain or aches."],
    rolePlayPrompt: "Tell the doctor you have a fever and sore throat.",
    audioUrl: "https://audio.nihongobridge.com/conv/hospital.mp3",
  },
  {
    category: "school",
    title: "8. School & Classroom Questions (学校と先生への質問)",
    situation: "Asking a language school teacher for assignment clarification.",
    difficultyLevel: "N5",
    dialogues: [
      { speaker: "Learner", role: "User", japanese: "先生、この文法について質問してもよろしいですか。", furigana: "せんせい、このぶんぽうについて しつもんしても よろしいですか。", romaji: "Sensei, kono bunpou ni tsuite shitsumon shitemo yoroshii desu ka.", english: "Teacher, may I ask a question regarding this grammar point?" },
      { speaker: "Teacher", role: "Partner", japanese: "はい、もちろんいいですよ！どこが分かりにくいですか。", furigana: "はい、もちろん いいですよ！どこが わかりにくいですか。", romaji: "Hai, mochiron ii desu yo! Doko ga wakarinikui desu ka.", english: "Yes, of course! Which part is unclear?" },
    ],
    vocabulary: [
      { word: "文法", reading: "ぶんぽう", meaning: "Grammar" },
      { word: "質問", reading: "しつもん", meaning: "Question" },
    ],
    grammarNotes: ["「〜てもよろしいですか」 is a polite request for permission."],
    rolePlayPrompt: "Politely ask your teacher a grammar question.",
    audioUrl: "https://audio.nihongobridge.com/conv/school.mp3",
  },
  {
    category: "business",
    title: "9. Business Keigo & Client Meetings (ビジネス敬語と商談)",
    situation: "Meeting an executive client at a Tokyo business conference.",
    difficultyLevel: "N2",
    dialogues: [
      { speaker: "Learner", role: "User", japanese: "本日はお忙しい中、貴重なお時間をいただき誠にありがとうございます。", furigana: "ほんじつは おいそがしいなか、きちょうな おじかんを いただき まことに ありがとうございます。", romaji: "Honjitsu wa oisogashii naka, kichou na ojikan wo itadaki makoto ni arigatou gozaimasu.", english: "Thank you very much for taking valuable time out of your busy schedule today." },
      { speaker: "Executive", role: "Partner", japanese: "こちらこそ、ご提案を楽しみにしておりました。", furigana: "こちらこそ、ごていあんを たのしみにしておりました。", romaji: "Kochira koso, goteian wo tanoshimi ni shite orimashita.", english: "Likewise, we have been looking forward to your proposal." },
    ],
    vocabulary: [
      { word: "貴重な", reading: "きちょうな", meaning: "Precious / valuable" },
      { word: "誠に", reading: "まことに", meaning: "Truly / sincerely" },
    ],
    grammarNotes: ["「〜をいただき」 is the humble form of receiving a favor."],
    rolePlayPrompt: "Thank a client executive for their time in keigo.",
    audioUrl: "https://audio.nihongobridge.com/conv/business.mp3",
  },
];

const SEED_DOWNLOAD_RESOURCES = [
  {
    title: "JLPT N5 Complete Study Workbook (PDF)",
    description: "120-page comprehensive printable workbook with grammar exercises, stroke order guides, and answer keys.",
    fileType: "pdf",
    category: "grammar_guide",
    fileUrl: "https://cdn.nihongobridge.com/downloads/jlpt-n5-workbook.pdf",
    fileSize: "4.8 MB",
    downloadCount: 4120,
    jlptLevel: "N5",
  },
  {
    title: "JLPT N5 Core 800 Vocabulary Master List (PDF)",
    description: "Printable Japanese vocabulary list with kanji, furigana readings, English meanings, and part-of-speech tags.",
    fileType: "pdf",
    category: "vocab_list",
    fileUrl: "https://cdn.nihongobridge.com/downloads/n5-vocab-master-list.pdf",
    fileSize: "1.9 MB",
    downloadCount: 5230,
    jlptLevel: "N5",
  },
  {
    title: "Essential Kanji Stroke Order Sheets (PDF)",
    description: "Printable grid writing practice sheets for the first 100 JLPT N5 & N4 kanji characters.",
    fileType: "pdf",
    category: "kanji_sheet",
    fileUrl: "https://cdn.nihongobridge.com/downloads/kanji-stroke-sheets.pdf",
    fileSize: "2.3 MB",
    downloadCount: 3890,
    jlptLevel: "N5",
  },
  {
    title: "Hiragana & Katakana Grid Writing Worksheet",
    description: "Stroke-by-stroke kana practice sheets with guidelines for clean Japanese handwriting.",
    fileType: "pdf",
    category: "worksheet",
    fileUrl: "https://cdn.nihongobridge.com/downloads/kana-handwriting-worksheet.pdf",
    fileSize: "1.2 MB",
    downloadCount: 6100,
    jlptLevel: "N5",
  },
  {
    title: "Japanese Particles (は, が, を, に, で) Cheat Sheet",
    description: "Two-page quick reference guide with formula rules, example sentences, and particle contrast tables.",
    fileType: "pdf",
    category: "cheat_sheet",
    fileUrl: "https://cdn.nihongobridge.com/downloads/particles-quick-cheatsheet.pdf",
    fileSize: "0.8 MB",
    downloadCount: 7450,
    jlptLevel: "N5",
  },
  {
    title: "JLPT N5 Full Official Practice Exam & Audio (ZIP)",
    description: "Complete timed mock test with vocabulary, grammar, reading comprehension, and native audio tracks.",
    fileType: "audio",
    category: "mock_test",
    fileUrl: "https://cdn.nihongobridge.com/downloads/n5-mock-exam-audio.zip",
    fileSize: "24.5 MB",
    downloadCount: 4980,
    jlptLevel: "N5",
  },
  {
    title: "Daily Japanese Audio Listening Tracks & Transcripts (MP3/ZIP)",
    description: "Native Japanese speech audio files with full Japanese and English transcripts for shadow listening.",
    fileType: "audio",
    category: "audio_pack",
    fileUrl: "https://cdn.nihongobridge.com/downloads/listening-audio-transcripts.zip",
    fileSize: "32.0 MB",
    downloadCount: 2780,
    jlptLevel: "N4",
  },
  {
    title: "Everyday Japanese Situational Conversation Guide",
    description: "Phrases for restaurants, trains, convenience stores, asking directions, and emergency situations.",
    fileType: "pdf",
    category: "conversation_guide",
    fileUrl: "https://cdn.nihongobridge.com/downloads/conversation-pocket-guide.pdf",
    fileSize: "1.6 MB",
    downloadCount: 3410,
    jlptLevel: "N5",
  },
  {
    title: "30-Day JLPT Study Planner & Goal Tracker",
    description: "Printable daily schedule template with weekly milestone checklists and review schedules.",
    fileType: "pdf",
    category: "planner",
    fileUrl: "https://cdn.nihongobridge.com/downloads/30-day-jlpt-planner.pdf",
    fileSize: "0.6 MB",
    downloadCount: 2950,
    jlptLevel: "N5",
  },
  {
    title: "Official JLPT Exam-Day Readiness Checklist",
    description: "Required test vouchers, allowable pencils, exam room rules, and test-taking time management tips.",
    fileType: "pdf",
    category: "checklist",
    fileUrl: "https://cdn.nihongobridge.com/downloads/jlpt-exam-day-checklist.pdf",
    fileSize: "0.4 MB",
    downloadCount: 1890,
    jlptLevel: "N5",
  },
];

const SEED_STUDY_JAPAN = [
  {
    category: "university",
    title: "University of Tokyo (東京大学) International Programs",
    summary: "English & Japanese degree programs with full MEXT scholarship eligibility in central Tokyo.",
    body: "Comprehensive admissions roadmap for international students applying to Todai undergraduate and graduate programs.",
    location: "Tokyo, Japan",
    stipendOrTuition: "¥535,800 / year",
    tags: ["Tokyo", "MEXT", "Undergraduate"],
  },
  {
    category: "scholarship",
    title: "MEXT Japanese Government Scholarship Guide 2026",
    summary: "Full tuition waiver plus ¥144,000 monthly living stipend and round-trip airfare.",
    body: "Step-by-step embassy recommendation timeline, required documents, and Japanese interview tips.",
    location: "Nationwide",
    stipendOrTuition: "Full Waiver + ¥144,000 / mo",
    tags: ["Scholarship", "Government", "Full-Ride"],
  },
  {
    category: "visa",
    title: "Student Visa (留学) Application & Work Permit",
    summary: "Certificate of Eligibility (COE) process and part-time work permit up to 28 hours per week.",
    body: "Everything you need to apply for the COE at Japanese immigration, bank balance requirements, and school sponsorship.",
    location: "Japan Immigration",
    stipendOrTuition: "Official Guide",
    tags: ["Visa", "COE", "Immigration"],
  },
];

const SEED_KANJI_DICT = [
  {
    kanji: "日",
    meaning: "Sun / Day",
    onyomi: "ニチ, ジツ",
    kunyomi: "ひ, か",
    radicals: "日 (sun)",
    strokeCount: 4,
    frequencyRank: 1,
    gradeLevel: 1,
    jlptLevel: "N5",
    themeCategory: "nature",
    strokeOrderSvg: "M20 20 L20 80 M20 20 L80 20 L80 80 M20 50 L80 50 M20 80 L80 80",
    componentBreakdown: [{ component: "日", meaning: "Pictograph of the sun with sunspot" }],
    kanjiFamilies: [{ family: "Celestial & Time", members: ["日", "月", "明", "早", "星"] }],
    similarKanji: [{ kanji: "目", meaning: "Eye (5 strokes)", distinction: "Has an extra horizontal bar" }],
    examples: [
      { word: "日本", reading: "にほん", meaning: "Japan (Sun's origin)" },
      { word: "日曜日", reading: "にちようび", meaning: "Sunday" },
      { word: "毎日", reading: "まいにち", meaning: "Every day" },
    ],
  },
  {
    kanji: "本",
    meaning: "Book / Origin",
    onyomi: "ホン",
    kunyomi: "もと",
    radicals: "木 (tree)",
    strokeCount: 5,
    frequencyRank: 2,
    gradeLevel: 1,
    jlptLevel: "N5",
    themeCategory: "nature",
    strokeOrderSvg: "M50 15 L50 85 M15 40 L85 40 M50 40 L20 85 M50 40 L80 85 M30 70 L70 70",
    componentBreakdown: [{ component: "木", meaning: "Tree" }, { component: "一", meaning: "Marking root / origin base" }],
    kanjiFamilies: [{ family: "Flora & Foundations", members: ["木", "本", "林", "森", "休"] }],
    similarKanji: [{ kanji: "木", meaning: "Tree (4 strokes)", distinction: "Lacks the bottom horizontal line" }],
    examples: [
      { word: "本", reading: "ほん", meaning: "Book" },
      { word: "本当", reading: "ほんとう", meaning: "Truth / Reality" },
      { word: "基本", reading: "きほん", meaning: "Foundation / Basics" },
    ],
  },
  {
    kanji: "人",
    meaning: "Person / Human",
    onyomi: "ジン, ニン",
    kunyomi: "ひと",
    radicals: "人 (person)",
    strokeCount: 2,
    frequencyRank: 3,
    gradeLevel: 1,
    jlptLevel: "N5",
    themeCategory: "people",
    strokeOrderSvg: "M50 15 L15 85 M40 45 L85 85",
    componentBreakdown: [{ component: "人", meaning: "Two legs of a standing human leaning together" }],
    kanjiFamilies: [{ family: "Human & Society", members: ["人", "休", "体", "作", "使"] }],
    similarKanji: [{ kanji: "入", meaning: "Enter (2 strokes)", distinction: "Right stroke goes over the left" }],
    examples: [
      { word: "日本人", reading: "にほんじん", meaning: "Japanese person" },
      { word: "大人", reading: "おとな", meaning: "Adult" },
      { word: "外国人", reading: "がいこくじん", meaning: "Foreign national" },
    ],
  },
  {
    kanji: "学",
    meaning: "Study / Learning",
    onyomi: "ガク",
    kunyomi: "まな・ぶ",
    radicals: "子 (child)",
    strokeCount: 8,
    frequencyRank: 5,
    gradeLevel: 1,
    jlptLevel: "N5",
    themeCategory: "actions",
    strokeOrderSvg: "M30 15 L35 25 M50 10 L50 22 M70 15 L65 25 M20 35 L80 35 M50 45 L50 85",
    componentBreakdown: [{ component: "⺍", meaning: "Knowledge roof sparks" }, { component: "子", meaning: "Child learning under a roof" }],
    kanjiFamilies: [{ family: "Education & Growth", members: ["学", "校", "教", "習", "読"] }],
    similarKanji: [{ kanji: "字", meaning: "Character (6 strokes)", distinction: "Lacks top roof crown marks" }],
    examples: [
      { word: "学生", reading: "がくせい", meaning: "Student" },
      { word: "大学", reading: "だいがく", meaning: "University" },
      { word: "学校", reading: "がっこう", meaning: "School" },
    ],
  },
  {
    kanji: "生",
    meaning: "Life / Birth",
    onyomi: "セイ, ショウ",
    kunyomi: "い・きる, う・まれる",
    radicals: "生 (life)",
    strokeCount: 5,
    frequencyRank: 6,
    gradeLevel: 1,
    jlptLevel: "N5",
    themeCategory: "nature",
    strokeOrderSvg: "M35 15 L20 40 M20 40 L80 40 M50 15 L50 85 M30 65 L70 65 M15 85 L85 85",
    componentBreakdown: [{ component: "生", meaning: "Sprout emerging from the soil" }],
    kanjiFamilies: [{ family: "Life & Growth", members: ["生", "産", "性", "星", "活"] }],
    similarKanji: [{ kanji: "主", meaning: "Master (5 strokes)", distinction: "Has top dot instead of angled sprout" }],
    examples: [
      { word: "先生", reading: "せんせい", meaning: "Teacher" },
      { word: "生活", reading: "せいかつ", meaning: "Daily life" },
      { word: "誕生日", reading: "たんじょうび", meaning: "Birthday" },
    ],
  },
  { kanji: "月", meaning: "Moon / Month", onyomi: "ゲツ, ガツ", kunyomi: "つき", radicals: "月 (moon)", strokeCount: 4, gradeLevel: 1, jlptLevel: "N5", themeCategory: "nature" },
  { kanji: "山", meaning: "Mountain", onyomi: "サン", kunyomi: "やま", radicals: "山 (mountain)", strokeCount: 3, gradeLevel: 1, jlptLevel: "N5", themeCategory: "nature" },
  { kanji: "川", meaning: "River", onyomi: "セン", kunyomi: "かわ", radicals: "川 (river)", strokeCount: 3, gradeLevel: 1, jlptLevel: "N5", themeCategory: "nature" },
  { kanji: "水", meaning: "Water", onyomi: "スイ", kunyomi: "みず", radicals: "水 (water)", strokeCount: 4, gradeLevel: 1, jlptLevel: "N5", themeCategory: "nature" },
  { kanji: "火", meaning: "Fire", onyomi: "カ", kunyomi: "ひ", radicals: "火 (fire)", strokeCount: 4, gradeLevel: 1, jlptLevel: "N5", themeCategory: "nature" },
  { kanji: "土", meaning: "Earth / Soil", onyomi: "ド, ト", kunyomi: "つち", radicals: "土 (earth)", strokeCount: 3, gradeLevel: 1, jlptLevel: "N5", themeCategory: "nature" },
  { kanji: "金", meaning: "Gold / Metal", onyomi: "キン", kunyomi: "かね", radicals: "金 (metal)", strokeCount: 8, gradeLevel: 1, jlptLevel: "N5", themeCategory: "nature" },
  { kanji: "天", meaning: "Heaven / Sky", onyomi: "テン", kunyomi: "あめ", radicals: "大 (large)", strokeCount: 4, gradeLevel: 1, jlptLevel: "N5", themeCategory: "nature" },
  { kanji: "雨", meaning: "Rain", onyomi: "ウ", kunyomi: "あめ", radicals: "雨 (rain)", strokeCount: 8, gradeLevel: 1, jlptLevel: "N5", themeCategory: "nature" },
  { kanji: "空", meaning: "Sky / Empty", onyomi: "クウ", kunyomi: "そら", radicals: "穴 (cave)", strokeCount: 8, gradeLevel: 1, jlptLevel: "N5", themeCategory: "nature" },
  { kanji: "花", meaning: "Flower", onyomi: "カ", kunyomi: "はな", radicals: "艸 (grass)", strokeCount: 7, gradeLevel: 1, jlptLevel: "N5", themeCategory: "nature" },
  { kanji: "草", meaning: "Grass", onyomi: "ソウ", kunyomi: "くさ", radicals: "艸 (grass)", strokeCount: 9, gradeLevel: 1, jlptLevel: "N5", themeCategory: "nature" },
  { kanji: "石", meaning: "Stone", onyomi: "セキ", kunyomi: "いし", radicals: "石 (stone)", strokeCount: 5, gradeLevel: 1, jlptLevel: "N5", themeCategory: "nature" },
  { kanji: "林", meaning: "Grove", onyomi: "リン", kunyomi: "はやし", radicals: "木 (tree)", strokeCount: 8, gradeLevel: 1, jlptLevel: "N5", themeCategory: "nature" },
  { kanji: "森", meaning: "Forest", onyomi: "シン", kunyomi: "もり", radicals: "木 (tree)", strokeCount: 12, gradeLevel: 1, jlptLevel: "N5", themeCategory: "nature" },
  { kanji: "子", meaning: "Child", onyomi: "シ, ス", kunyomi: "こ", radicals: "子 (child)", strokeCount: 3, gradeLevel: 1, jlptLevel: "N5", themeCategory: "people" },
  { kanji: "女", meaning: "Woman", onyomi: "ジョ", kunyomi: "おんな", radicals: "女 (woman)", strokeCount: 3, gradeLevel: 1, jlptLevel: "N5", themeCategory: "people" },
  { kanji: "男", meaning: "Man", onyomi: "ダン, ナン", kunyomi: "おtoko", radicals: "田 (rice field)", strokeCount: 7, gradeLevel: 1, jlptLevel: "N5", themeCategory: "people" },
  { kanji: "目", meaning: "Eye", onyomi: "モク", kunyomi: "め", radicals: "目 (eye)", strokeCount: 5, gradeLevel: 1, jlptLevel: "N5", themeCategory: "people" },
  { kanji: "耳", meaning: "Ear", onyomi: "ジ", kunyomi: "みみ", radicals: "耳 (ear)", strokeCount: 6, gradeLevel: 1, jlptLevel: "N5", themeCategory: "people" },
  { kanji: "口", meaning: "Mouth", onyomi: "コウ, ク", kunyomi: "くち", radicals: "口 (mouth)", strokeCount: 3, gradeLevel: 1, jlptLevel: "N5", themeCategory: "people" },
  { kanji: "手", meaning: "Hand", onyomi: "シュ", kunyomi: "て", radicals: "手 (hand)", strokeCount: 4, gradeLevel: 1, jlptLevel: "N5", themeCategory: "people" },
  { kanji: "足", meaning: "Foot / Leg", onyomi: "ソク", kunyomi: "あし", radicals: "足 (foot)", strokeCount: 7, gradeLevel: 1, jlptLevel: "N5", themeCategory: "people" },
  { kanji: "心", meaning: "Heart / Mind", onyomi: "シン", kunyomi: "こころ", radicals: "心 (heart)", strokeCount: 4, gradeLevel: 2, jlptLevel: "N4", themeCategory: "people" },
  { kanji: "力", meaning: "Power / Strength", onyomi: "リョク, リキ", kunyomi: "ちから", radicals: "力 (power)", strokeCount: 2, gradeLevel: 1, jlptLevel: "N5", themeCategory: "people" },
  { kanji: "一", meaning: "One", onyomi: "イチ", kunyomi: "ひと・つ", radicals: "一 (one)", strokeCount: 1, gradeLevel: 1, jlptLevel: "N5", themeCategory: "numbers" },
  { kanji: "二", meaning: "Two", onyomi: "ニ", kunyomi: "ふた・つ", radicals: "二 (two)", strokeCount: 2, gradeLevel: 1, jlptLevel: "N5", themeCategory: "numbers" },
  { kanji: "三", meaning: "Three", onyomi: "サン", kunyomi: "み・つ", radicals: "一 (one)", strokeCount: 3, gradeLevel: 1, jlptLevel: "N5", themeCategory: "numbers" },
  { kanji: "四", meaning: "Four", onyomi: "シ", kunyomi: "よ・つ", radicals: "囗 (border)", strokeCount: 5, gradeLevel: 1, jlptLevel: "N5", themeCategory: "numbers" },
  { kanji: "五", meaning: "Five", onyomi: "ゴ", kunyomi: "いつ・つ", radicals: "二 (two)", strokeCount: 4, gradeLevel: 1, jlptLevel: "N5", themeCategory: "numbers" },
  { kanji: "六", meaning: "Six", onyomi: "ロク", kunyomi: "む・つ", radicals: "八 (eight)", strokeCount: 4, gradeLevel: 1, jlptLevel: "N5", themeCategory: "numbers" },
  { kanji: "七", meaning: "Seven", onyomi: "シチ", kunyomi: "なな・つ", radicals: "一 (one)", strokeCount: 2, gradeLevel: 1, jlptLevel: "N5", themeCategory: "numbers" },
  { kanji: "八", meaning: "Eight", onyomi: "ハチ", kunyomi: "ya・tsu", radicals: "八 (eight)", strokeCount: 2, gradeLevel: 1, jlptLevel: "N5", themeCategory: "numbers" },
  { kanji: "九", meaning: "Nine", onyomi: "キュウ, ク", kunyomi: "ここの・つ", radicals: "乙 (second)", strokeCount: 2, gradeLevel: 1, jlptLevel: "N5", themeCategory: "numbers" },
  { kanji: "十", meaning: "Ten", onyomi: "ジュウ", kunyomi: "とお", radicals: "十 (ten)", strokeCount: 2, gradeLevel: 1, jlptLevel: "N5", themeCategory: "numbers" },
  { kanji: "百", meaning: "Hundred", onyomi: "ヒャク", kunyomi: "もも", radicals: "白 (white)", strokeCount: 6, gradeLevel: 1, jlptLevel: "N5", themeCategory: "numbers" },
  { kanji: "千", meaning: "Thousand", onyomi: "セン", kunyomi: "ち", radicals: "十 (ten)", strokeCount: 3, gradeLevel: 1, jlptLevel: "N5", themeCategory: "numbers" },
  { kanji: "万", meaning: "Ten Thousand", onyomi: "マン, バン", kunyomi: "よろず", radicals: "一 (one)", strokeCount: 3, gradeLevel: 2, jlptLevel: "N4", themeCategory: "numbers" },
  { kanji: "年", meaning: "Year", onyomi: "ネン", kunyomi: "とし", radicals: "干 (dry)", strokeCount: 6, gradeLevel: 1, jlptLevel: "N5", themeCategory: "time" },
  { kanji: "時", meaning: "Time / Hour", onyomi: "ジ", kunyomi: "とき", radicals: "日 (sun)", strokeCount: 10, gradeLevel: 2, jlptLevel: "N5", themeCategory: "time" },
  { kanji: "分", meaning: "Minute / Divide", onyomi: "ブン, フン", kunyomi: "わ・かる", radicals: "刀 (sword)", strokeCount: 4, gradeLevel: 2, jlptLevel: "N5", themeCategory: "time" },
  { kanji: "今", meaning: "Now", onyomi: "コン, キン", kunyomi: "いま", radicals: "人 (person)", strokeCount: 4, gradeLevel: 2, jlptLevel: "N5", themeCategory: "time" },
  { kanji: "朝", meaning: "Morning", onyomi: "チョウ", kunyomi: "あさ", radicals: "月 (moon)", strokeCount: 12, gradeLevel: 2, jlptLevel: "N4", themeCategory: "time" },
  { kanji: "昼", meaning: "Noon / Daytime", onyomi: "チュウ", kunyomi: "ひる", radicals: "日 (sun)", strokeCount: 9, gradeLevel: 2, jlptLevel: "N4", themeCategory: "time" },
  { kanji: "夜", meaning: "Night", onyomi: "ヤ", kunyomi: "よる", radicals: "夕 (evening)", strokeCount: 8, gradeLevel: 2, jlptLevel: "N4", themeCategory: "time" },
  { kanji: "上", meaning: "Up / Above", onyomi: "ジョウ", kunyomi: "うえ", radicals: "一 (one)", strokeCount: 3, gradeLevel: 1, jlptLevel: "N5", themeCategory: "directions" },
  { kanji: "下", meaning: "Down / Below", onyomi: "カ, ゲ", kunyomi: "した", radicals: "一 (one)", strokeCount: 3, gradeLevel: 1, jlptLevel: "N5", themeCategory: "directions" },
  { kanji: "左", meaning: "Left", onyomi: "サ", kunyomi: "ひだり", radicals: "工 (work)", strokeCount: 5, gradeLevel: 1, jlptLevel: "N5", themeCategory: "directions" },
  { kanji: "右", meaning: "Right", onyomi: "ウ, ユウ", kunyomi: "みぎ", radicals: "口 (mouth)", strokeCount: 5, gradeLevel: 1, jlptLevel: "N5", themeCategory: "directions" },
  { kanji: "中", meaning: "Middle / Inside", onyomi: "チュウ", kunyomi: "なか", radicals: "丨 (line)", strokeCount: 4, gradeLevel: 1, jlptLevel: "N5", themeCategory: "directions" },
  { kanji: "外", meaning: "Outside", onyomi: "ガイ", kunyomi: "そと", radicals: "夕 (evening)", strokeCount: 5, gradeLevel: 2, jlptLevel: "N5", themeCategory: "directions" },
  { kanji: "見", meaning: "See / Look", onyomi: "ケン", kunyomi: "み・る", radicals: "見 (see)", strokeCount: 7, gradeLevel: 1, jlptLevel: "N5", themeCategory: "actions" },
  { kanji: "行", meaning: "Go", onyomi: "コウ, ギョウ", kunyomi: "い・く", radicals: "行 (go)", strokeCount: 6, gradeLevel: 2, jlptLevel: "N5", themeCategory: "actions" },
  { kanji: "来", meaning: "Come", onyomi: "ライ", kunyomi: "く・る", radicals: "木 (tree)", strokeCount: 7, gradeLevel: 2, jlptLevel: "N5", themeCategory: "actions" },
  { kanji: "食", meaning: "Eat", onyomi: "ショク", kunyomi: "た・べる", radicals: "食 (eat)", strokeCount: 9, gradeLevel: 2, jlptLevel: "N5", themeCategory: "actions" },
  { kanji: "飲", meaning: "Drink", onyomi: "イン", kunyomi: "の・む", radicals: "食 (eat)", strokeCount: 12, gradeLevel: 2, jlptLevel: "N5", themeCategory: "actions" },
  { kanji: "書", meaning: "Write", onyomi: "ショ", kunyomi: "か・く", radicals: "曰 (say)", strokeCount: 10, gradeLevel: 2, jlptLevel: "N5", themeCategory: "actions" },
  { kanji: "読", meaning: "Read", onyomi: "ドク", kunyomi: "よ・む", radicals: "言 (say)", strokeCount: 14, gradeLevel: 2, jlptLevel: "N5", themeCategory: "actions" },
  { kanji: "話", meaning: "Speak", onyomi: "ワ", kunyomi: "はな・す", radicals: "言 (say)", strokeCount: 13, gradeLevel: 2, jlptLevel: "N5", themeCategory: "actions" },
];

const SEED_NEWS_ARTICLES = [
  {
    slug: "cherry-blossom-season-forecast",
    title: "東京で桜の開花予想が発表されました",
    summary: "Japan Meteorological Corporation announces the 2026 cherry blossom schedule across Tokyo and Kyoto.",
    japaneseText: "気象庁は今年の桜の開花予想を発表しました。東京では３月２０日ごろに咲き始める予定です。多くの人々がお花見を楽しみにしています。",
    furiganaText: "気象庁(きしょうちょう)は今年(ことし)の桜(さくら)の開花(かいか)予想(よそう)を発表(はっぴょう)しました。東京(とうきょう)では３月(がつ)２０日(はつか)ごろに咲(さ)き始(はじ)める予定(よてい)です。多(おお)くの人々(ひとびと)がお花見(はなみ)を楽(たの)しみにしています。",
    englishTranslation: "The meteorological agency announced this year's cherry blossom forecast. In Tokyo, blossoms are expected to start blooming around March 20th. Many people are looking forward to flower viewing (hanami).",
    tamilTranslation: "வானிலை ஆய்வு மையம் இந்த ஆண்டின் செர்ரி மலர் மலரும் முன்னறிவிப்பை வெளியிட்டுள்ளது. டோக்கியோவில் மார்ச் 20 ஆம் தேதி பூக்கத் தொடங்கும் என எதிர்பார்க்கப்படுகிறது.",
    malayalamTranslation: "കാലാവസ്ഥാ നിരീക്ഷണ കേന്ദ്രം ഈ വർഷത്തെ ചെറി പൂക്കളുടെ വിരിഞ്ഞുനിൽക്കൽ പ്രവചനം പ്രഖ്യാപിച്ചു. ടോക്കിയോയിൽ മാർച്ച് 20 ഓടെ പൂവിടാൻ തുടങ്ങും.",
    difficultyLevel: "N5",
    readingMinutes: 3,
    audioUrl: "https://audio.nihongobridge.com/news/sakura-2026.mp3",
    grammarHighlights: ["〜予定です (Scheduled to...)", "〜を楽しみにしています (Looking forward to...)"],
    extractedVocabulary: [
      { japanese: "桜", furigana: "さくら", meaning: "Cherry blossom" },
      { japanese: "開花", furigana: "かいか", meaning: "Blooming / flowering" },
      { japanese: "予想", furigana: "よそう", meaning: "Forecast / prediction" },
      { japanese: "お花見", furigana: "おはなみ", meaning: "Flower viewing picnic" },
    ],
    extractedKanji: [
      { kanji: "桜", meaning: "Cherry blossom", strokes: 10 },
      { kanji: "花", meaning: "Flower", strokes: 7 },
      { kanji: "予", meaning: "In advance / previous", strokes: 4 },
    ],
    comprehensionQuestions: [
      {
        question: "When are the cherry blossoms in Tokyo expected to begin blooming?",
        options: ["Around March 20th", "Around April 15th", "Around May 1st", "In late February"],
        correctIndex: 0,
        explanation: "According to the passage: 「東京では３月２０日ごろに咲き始める予定です。」",
      },
      {
        question: "What is 「お花見」(ohanami)?",
        options: ["Flower viewing picnic", "Snow festival", "Tea ceremony", "Temple visit"],
        correctIndex: 0,
        explanation: "Ohanami is the traditional Japanese custom of enjoying the beauty of blooming cherry blossoms.",
      },
    ],
    isToday: true,
  },
  {
    slug: "shinkansen-new-bullet-train",
    title: "次世代新幹線の試験運転が始まります",
    summary: "Next-generation Shinkansen bullet train begins high-speed test runs connecting Tokyo and Osaka.",
    japaneseText: "新しい新幹線の試験運転が来月から始まります。最高速度は時速３６０キロメートルで、東京と大阪の間をより速く結びます。",
    furiganaText: "新(あたら)しい新幹線(しんかんせん)の試験(しけん)運転(うんてん)が来月(らいげつ)から始(はじ)まります。最高(さいこう)速度(そくど)は時速(じそく)３６０キロメートルで、東京(とうきょう)と大阪(おおさか)の間(あいだ)をより速(はや)く結(むす)びます。",
    englishTranslation: "Test operations for the new bullet train will begin next month. With a maximum speed of 360 km/h, it connects Tokyo and Osaka even faster.",
    tamilTranslation: "புதிய புல்லட் ரயிலின் சோதனை ஓட்டம் அடுத்த மாதம் தொடங்குகிறது. மணிக்கு 360 கிமீ வேகத்தில் டோக்கியோ மற்றும் ஒசாகாவை இணைக்கிறது.",
    malayalamTranslation: "പുതിയ ബുള്ളറ്റ് ട്രെയിനിന്റെ പരീക്ഷണ ഓട്ടം അടുത്ത മാസം ആരംഭിക്കും. മണിക്കൂറിൽ 360 കി.മീ വേഗതയിൽ ടോക്കിയോയെയും ഒസാക്കയെയും ബന്ധിപ്പിക്കുന്നു.",
    difficultyLevel: "N4",
    readingMinutes: 4,
    audioUrl: "https://audio.nihongobridge.com/news/shinkansen-2026.mp3",
    grammarHighlights: ["〜から始まります (Starts from...)", "より〜 (More / even more...)"],
    extractedVocabulary: [
      { japanese: "新幹線", furigana: "しんかんせん", meaning: "Bullet train" },
      { japanese: "試験運転", furigana: "しけんうんてん", meaning: "Test run / trial operation" },
      { japanese: "最高速度", furigana: "さいこうそくど", meaning: "Maximum speed" },
    ],
    extractedKanji: [
      { kanji: "新", meaning: "New", strokes: 13 },
      { kanji: "速", meaning: "Fast / speed", strokes: 10 },
    ],
    comprehensionQuestions: [
      {
        question: "What is the maximum speed of the new Shinkansen?",
        options: ["360 km/h", "280 km/h", "500 km/h", "200 km/h"],
        correctIndex: 0,
        explanation: "The article specifies: 「最高速度は時速３６０キロメートル」 (360 km/h).",
      },
    ],
    isToday: false,
  },
];

const SEED_DECKS = [
  {
    title: "JLPT N5 Core Vocabulary",
    description: "Essential verbs, nouns, and adjectives for JLPT N5 success.",
    jlptLevel: "N5",
    shareCode: "deck-n5-core-vocab",
    tags: ["JLPT N5", "Vocabulary", "Verbs"],
    cards: [
      { cardType: "vocab", front: "食べる", back: "To eat", furigana: "たべる", romaji: "taberu", notes: "Ichidan verb" },
      { cardType: "vocab", front: "飲む", back: "To drink", furigana: "のむ", romaji: "nomu", notes: "Godan verb" },
      { cardType: "vocab", front: "行く", back: "To go", furigana: "いく", romaji: "iku", notes: "Irregular te-form: 行って" },
      { cardType: "vocab", front: "見る", back: "To see / watch", furigana: "みる", romaji: "miru", notes: "Ichidan verb" },
      { cardType: "vocab", front: "話す", back: "To speak / talk", furigana: "はなす", romaji: "hanasu", notes: "Godan verb" },
      { cardType: "vocab", front: "勉強する", back: "To study", furigana: "べんきょうする", romaji: "benkyou suru", notes: "Suru verb" },
    ],
  },
  {
    title: "JLPT N5 Essential Kanji",
    description: "The first 20 kanji every beginner needs to recognize.",
    jlptLevel: "N5",
    shareCode: "deck-n5-kanji",
    tags: ["JLPT N5", "Kanji", "Radicals"],
    cards: [
      { cardType: "kanji", front: "日", back: "Sun / Day", furigana: "ひ / にち", romaji: "hi / nichi", notes: "4 strokes" },
      { cardType: "kanji", front: "本", back: "Book / Origin", furigana: "ほん / もと", romaji: "hon / moto", notes: "5 strokes" },
      { cardType: "kanji", front: "人", back: "Person", furigana: "ひと / じん", romaji: "hito / jin", notes: "2 strokes" },
      { cardType: "kanji", front: "学", back: "Study / Learning", furigana: "がく / まなぶ", romaji: "gaku", notes: "8 strokes" },
      { cardType: "kanji", front: "生", back: "Life / Birth", furigana: "せい / なま", romaji: "sei / nama", notes: "5 strokes" },
    ],
  },
  {
    title: "Business Japanese & Keigo",
    description: "Honorific and humble phrases for the Japanese workplace.",
    jlptLevel: "N3",
    shareCode: "deck-business-keigo",
    tags: ["Business", "Keigo", "Careers"],
    cards: [
      { cardType: "phrase", front: "お世話になっております", back: "Thank you for your continuous support", furigana: "おせわになっております", romaji: "osewa ni natte orimasu", notes: "Standard greeting in emails/calls" },
      { cardType: "phrase", front: "よろしくお願いいたします", back: "Thank you in advance / Please treat me well", furigana: "よろしくおねがいいたします", romaji: "yoroshiku onegai itashimasu", notes: "Closing remark" },
      { cardType: "phrase", front: "承知いたしました", back: "Understood (Humble / Kenjougo)", furigana: "しょうちいたしました", romaji: "shouchi itashimashita", notes: "Polite confirmation to client or boss" },
    ],
  },
];

const NIHONGO_ITEMS = [
  {
    category: "vocabulary",
    jlptLevel: "N5",
    japanese: "食べる",
    furigana: "たべる",
    romaji: "taberu",
    meaning: "To eat",
    partOfSpeech: "Verb",
    pitchAccent: "[2] 中高型 (nakadaka)",
    exampleSentenceJa: "毎日、朝ご飯を食べます。",
    exampleSentenceEn: "I eat breakfast every day.",
    tags: ["verbs", "daily", "N5"],
  },
  {
    category: "vocabulary",
    jlptLevel: "N5",
    japanese: "飲む",
    furigana: "のむ",
    romaji: "nomu",
    meaning: "To drink",
    partOfSpeech: "Verb",
    pitchAccent: "[1] 頭高型 (atamadaka)",
    exampleSentenceJa: "お茶を飲みます。",
    exampleSentenceEn: "I drink green tea.",
    tags: ["verbs", "daily", "N5"],
  },
  {
    category: "kanji",
    jlptLevel: "N5",
    japanese: "日本",
    furigana: "にほん",
    romaji: "nihon",
    meaning: "Japan (Sun's origin)",
    partOfSpeech: "Noun",
    strokeCount: 4,
    radicals: "日 (sun), 本 (book/origin)",
    exampleSentenceJa: "来年、日本へ留学します。",
    exampleSentenceEn: "I will study in Japan next year.",
    tags: ["kanji", "N5"],
  },
  {
    category: "kanji",
    jlptLevel: "N4",
    japanese: "勉強",
    furigana: "べんきょう",
    romaji: "benkyou",
    meaning: "Study / Diligence",
    partOfSpeech: "Noun",
    strokeCount: 10,
    radicals: "力 (power)",
    exampleSentenceJa: "日本語を一生懸命勉強しています。",
    exampleSentenceEn: "I am studying Japanese very hard.",
    tags: ["kanji", "N4"],
  },
  {
    category: "grammar",
    jlptLevel: "N5",
    japanese: "〜たいです",
    furigana: "〜たいです",
    romaji: "-tai desu",
    meaning: "Want to do [Verb]",
    partOfSpeech: "Expression",
    grammarStructure: "Verb stem + たいです",
    exampleSentenceJa: "日本に行きたいです。",
    exampleSentenceEn: "I want to go to Japan.",
    tags: ["grammar", "N5"],
  },
  {
    category: "business",
    jlptLevel: "N3",
    japanese: "お世話になっております",
    furigana: "おせわになっております",
    romaji: "osewa ni natte orimasu",
    meaning: "Thank you for your ongoing support (Standard Business Greeting)",
    partOfSpeech: "Expression",
    exampleSentenceJa: "いつも大変お世話になっております。",
    exampleSentenceEn: "Thank you very much for your continuous cooperation.",
    tags: ["business", "keigo", "N3"],
  },
  {
    category: "interview",
    jlptLevel: "N3",
    japanese: "自己PR",
    furigana: "じこぴーあーる",
    romaji: "jiko PR",
    meaning: "Self-introduction & strengths presentation in a job interview",
    partOfSpeech: "Noun",
    exampleSentenceJa: "私の強みは粘り強く問題を解決することです。",
    exampleSentenceEn: "My strength is persistent problem-solving.",
    tags: ["interview", "careers"],
  },
  {
    category: "culture",
    jlptLevel: "N5",
    japanese: "お辞儀",
    furigana: "おじぎ",
    romaji: "ojigi",
    meaning: "Bowing etiquette in Japanese social and business life",
    partOfSpeech: "Noun",
    exampleSentenceJa: "挨拶の時にお辞儀をします。",
    exampleSentenceEn: "We bow when exchanging greetings.",
    tags: ["culture", "etiquette"],
  },
];

const NIHONGO_QUIZZES = [
  {
    category: "mock_exam",
    jlptLevel: "N5",
    sectionType: "vocabulary",
    question: "【JLPT N5 言語知識】 What is the correct reading for 「日本」?",
    options: ["にほん (Japan)", "ちゅうごく (China)", "かんこく (Korea)", "アメリカ (America)"],
    correctIndex: 0,
    explanation: "「日本」 is read as にほん (Nihon) or にっぽん (Nippon), meaning Japan.",
    timeLimitSeconds: 45,
  },
  {
    category: "mock_exam",
    jlptLevel: "N5",
    sectionType: "grammar",
    question: "【JLPT N5 文法】 Complete the sentence: 明日、東京 ( ___ ) 行きます。",
    options: ["へ (he / to)", "を (wo / direct object)", "で (de / by means of)", "が (ga / subject)"],
    correctIndex: 0,
    explanation: "Direction toward a destination uses particle へ (pronounced e) or に.",
    timeLimitSeconds: 60,
  },
  {
    category: "mock_exam",
    jlptLevel: "N5",
    sectionType: "reading",
    question: "【JLPT N5 読解】 Read: 「毎朝７時に起きて、パンを食べます。」 What time does the author wake up?",
    options: ["7:00 AM", "6:30 AM", "8:00 AM", "7:30 PM"],
    correctIndex: 0,
    explanation: "「毎朝７時」 (maiasa shichiji) translates to 'every morning at 7 o'clock'.",
    timeLimitSeconds: 90,
  },
  {
    category: "mock_exam",
    jlptLevel: "N4",
    sectionType: "grammar",
    question: "【JLPT N4 文法】 Choose the correct form: 雨が降って ( ___ )、出かけません。",
    options: ["いるので (iru node / because it is raining)", "いるからに (iru karani)", "いるのに (iru noni)", "いれば (ireba)"],
    correctIndex: 0,
    explanation: "「〜ので」 expresses objective cause or polite reasoning.",
    timeLimitSeconds: 60,
  },
  {
    category: "mock_exam",
    jlptLevel: "N3",
    sectionType: "vocabulary",
    question: "【JLPT N3 言語知識】 Choose the appropriate business greeting: 「いつも大変お ( ___ ) になっております。」",
    options: ["世話 (sewa)", "手紙 (tegami)", "電話 (denwa)", "約束 (yakusoku)"],
    correctIndex: 0,
    explanation: "「お世話になっております」 is the indispensable standard Japanese business greeting.",
    timeLimitSeconds: 60,
  },
  {
    category: "mock_exam",
    jlptLevel: "N2",
    sectionType: "grammar",
    question: "【JLPT N2 文法】 この仕事は彼をおいて ( ___ ) 適任者はいない。",
    options: ["ほかに (hokani)", "うえに (ueni)", "ために (tameni)", "として (toshite)"],
    correctIndex: 0,
    explanation: "「〜をおいてほかにない」 means 'other than ~ there is no one else suitable'.",
    timeLimitSeconds: 75,
  },
  {
    category: "mock_exam",
    jlptLevel: "N1",
    sectionType: "reading",
    question: "【JLPT N1 読解】 「〜余儀なくされた」 means which of the following?",
    options: ["Forced to do something against one's will", "Happily accomplished", "Easily resolved", "Temporarily postponed"],
    correctIndex: 0,
    explanation: "「〜を余儀なくされる」 expresses being compelled or forced into an unavoidable outcome.",
    timeLimitSeconds: 90,
  },
];

const DB_TRANSLATIONS: Record<
  BrandKey,
  Array<{ entityType: string; locale: string; field: string; value: string }>
> = {
  ascend: [
    { entityType: "brand", locale: "ta", field: "tagline", value: "திறமை மூலம் உயருங்கள்." },
    { entityType: "brand", locale: "ta", field: "nav_courses", value: "பாடநெறிகள்" },
    { entityType: "brand", locale: "ta", field: "hero_badge", value: "பொறியியல் சிறப்பு" },
    { entityType: "brand", locale: "ml", field: "tagline", value: "പ്രാവീണ്യത്തിലൂടെ ഉയരുക." },
    { entityType: "brand", locale: "ml", field: "nav_courses", value: "കോഴ്സുകൾ" },
    { entityType: "brand", locale: "ml", field: "hero_badge", value: "എൻജിനീയറിംഗ് മികവ്" },
    { entityType: "brand", locale: "ja", field: "tagline", value: "卓越した技術で高みへ。" },
    { entityType: "brand", locale: "ja", field: "nav_courses", value: "コース一覧" },
    { entityType: "brand", locale: "ja", field: "hero_badge", value: "エンジニアリングの卓越性" },
  ],
  nihongo: [
    { entityType: "brand", locale: "ta", field: "tagline", value: "ஜப்பானிய மொழிக்கான உங்கள் பாலம்." },
    { entityType: "brand", locale: "ta", field: "nav_courses", value: "ஜே.எல்.பி.டி பாடங்கள்" },
    { entityType: "brand", locale: "ta", field: "hero_badge", value: "ஜப்பான் படிப்பு மற்றும் வேலைவாய்ப்பு" },
    { entityType: "brand", locale: "ml", field: "tagline", value: "ജാപ്പനീസ് ഭാഷയിലേക്കുള്ള നിങ്ങളുടെ പാലം." },
    { entityType: "brand", locale: "ml", field: "nav_courses", value: "ജെ.എൽ.പി.ടി കോഴ്സുകൾ" },
    { entityType: "brand", locale: "ml", field: "hero_badge", value: "ജപ്പാൻ പഠനവും കരിയറും" },
    { entityType: "brand", locale: "ja", field: "tagline", value: "日本語学習・日本留学・キャリアへの架け橋。" },
    { entityType: "brand", locale: "ja", field: "nav_courses", value: "JLPT対策コース" },
    { entityType: "brand", locale: "ja", field: "hero_badge", value: "日本語・留学・就職支援" },
  ],
};

const CMS_DATA: Record<
  BrandKey,
  Array<{
    pageSlug: string;
    sectionKey: string;
    title: string;
    subtitle?: string;
    content: Record<string, unknown>;
    position: number;
  }>
> = {
  ascend: [
    {
      pageSlug: "home",
      sectionKey: "hero",
      title: "Master Software Craft & Technical Leadership",
      subtitle: "Enterprise learning paths crafted by industry leaders.",
      content: { ctaText: "Explore Tracks", ctaHref: "#programs", badge: "Engineering Excellence" },
      position: 1,
    },
  ],
  nihongo: [
    {
      pageSlug: "home",
      sectionKey: "announcement_bar",
      title: "Summer 2026 JLPT Registration Open",
      subtitle: "Official test dates announced for Tokyo, Osaka, and global test sites.",
      content: { badge: "EXAM NOTICE", message: "Official JLPT July 2026 exam registration is now live worldwide.", ctaText: "View Exam Schedule", ctaHref: "/jlpt/mock-exam" },
      position: 1,
    },
    {
      pageSlug: "home",
      sectionKey: "hero",
      title: "Your Bridge to Fluent Japanese & Life in Japan",
      subtitle: "Master JLPT N5 to N1, explore kanji maps, practice conversation, and build your career.",
      content: { ctaText: "Start Learning Free", ctaHref: "/study/flashcards", badge: "JLPT N5 – N1 Ready" },
      position: 2,
    },
    {
      pageSlug: "home",
      sectionKey: "jlpt_countdown",
      title: "JLPT Exam Countdown Timer",
      subtitle: "Official test date: July 5, 2026.",
      content: { examName: "Next Official JLPT Exam (N5 - N1)", days: "114", hours: "18", minutes: "42", seconds: "09", ctaText: "Take Free Simulator Exam", ctaHref: "/jlpt/mock-exam" },
      position: 3,
    },
  ],
};

const STARTER_CATALOG: Record<
  BrandKey,
  {
    home: { title: string; body: string };
    courses: Array<{
      slug: string;
      title: string;
      summary: string;
      level: "beginner" | "intermediate" | "advanced";
      featured: boolean;
      modules: Array<{
        title: string;
        lessons: Array<{
          slug: string;
          title: string;
          body: string;
          durationMinutes: number;
        }>;
      }>;
    }>;
  }
> = {
  ascend: {
    home: {
      title: "Welcome to Ascend Academy",
      body: "Structured learning paths in engineering, design, and leadership.",
    },
    courses: [],
  },
  nihongo: {
    home: {
      title: "Nihongo Bridge へようこそ",
      body: "Learn Japanese from the ground up — hiragana, kanji, conversation, and JLPT prep.",
    },
    courses: [],
  },
};

async function seedDynamicPages(brandId: number, key: BrandKey): Promise<void> {
  const list = [
    {
      slug: "about",
      title: "About Us — Our Story",
      body: "Nihongo Bridge was built with one goal: connecting global citizens to fluent Japanese and careers in Japan.",
      sections: [
        {
          sectionKey: "about",
          title: "Our Story & Background",
          subtitle: "We believe Japanese language education should be conversational, immersive, and tech-enabled.",
          content: { body: "Founded in 2026, Nihongo Bridge has helped over 10,000 students pass their JLPT N5 to N1 exams.", badge: "Est. 2026", imageUrl: "https://images.unsplash.com/photo-1540959733332-eab4deceeaf7?auto=format&fit=crop&w=800&q=80" }
        }
      ]
    },
    {
      slug: "vision",
      title: "Our Vision",
      body: "Empowering every learner to traverse cultural boundaries with complete linguistic confidence.",
      sections: [
        {
          sectionKey: "vision",
          title: "Traversing Boundaries",
          subtitle: "To be the ultimate bridge between Japan and the rest of the world.",
          content: { body: "We envision a highly integrated community of global builders and language students studying and collaborating directly within Japan.", badge: "Vision Statement" }
        }
      ]
    },
    {
      slug: "mission",
      title: "Our Mission",
      body: "We provide state-of-the-art tools, curriculum, and native mentors to fast-track fluency.",
      sections: [
        {
          sectionKey: "mission",
          title: "Rapid Linguistic Growth",
          subtitle: "Bringing structured learning maps and gamified mechanics to everyone.",
          content: { body: "Our mission is to double the language retention rate by replacing conventional passive lectures with dynamic, spaced reviews, active typing tests, and native conversational role-plays.", badge: "Mission Statement" }
        }
      ]
    },
    {
      slug: "founder",
      title: "Meet the Founder & Team",
      body: "Learn about the visionary educators, designers, and systems architects who engineered Nihongo Bridge.",
      sections: [
        {
          sectionKey: "founder",
          title: "Founder's Message",
          subtitle: "Yuki Tanaka, Chief Executive Officer & Co-Founder",
          content: { body: "As a language educator for over 15 years, I saw how students struggled to move from dry memorization to actual work environments. We built Nihongo Bridge to change that.", badge: "CEO Message", imageUrl: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=400&q=80" }
        }
      ]
    },
    {
      slug: "statistics",
      title: "Achievements & Platform Statistics",
      body: "Take a closer look at our historical milestones and global learner impact.",
      sections: [
        {
          sectionKey: "statistics",
          title: "Platform Key Performance Indicators",
          subtitle: "Validated stats outlining our collective educational growth.",
          content: {
            items: [
              { title: "10,000+", subtitle: "Global Learners", description: "Enrolled in structured JLPT N5-N1 tracks." },
              { title: "92%", subtitle: "JLPT Pass Rate", description: "First-attempt pass rate in mock test exams." },
              { title: "1.2M+", subtitle: "XP Awarded", description: "Daily gamification and streak rewards." },
              { title: "4.9★", subtitle: "Average Review", description: "Rating from graduate career programs." }
            ]
          }
        }
      ]
    },
    {
      slug: "achievements",
      title: "Achievements & Milestones",
      body: "Celebrating our student milestones and organizational success.",
      sections: [
        {
          sectionKey: "achievements",
          title: "Historical Platform Milestones",
          subtitle: "Key benchmarks we achieved alongside our language community.",
          content: {
            items: [
              { title: "Phase 1 Completed", subtitle: "Core LMS Core", description: "Established modular lessons and tracking." },
              { title: "Phase 7 Completed", subtitle: "Mobile API Integration", description: "Released JWT-based mobile sync layers." },
              { title: "Phase 8 Completed", subtitle: "Conversation Lab", description: "Unveiled 9 interactive situational labs." },
              { title: "Version 4.0 Launch", subtitle: "Headless CMS Mastery", description: "Transitioned 100% of pages to active DB sync." }
            ]
          }
        }
      ]
    },
    {
      slug: "gallery",
      title: "Campus Gallery",
      body: "Take a visual tour of our Tokyo headquarters, cultural excursions, and student meetups.",
      sections: [
        {
          sectionKey: "gallery",
          title: "Student Excursions & Meetups",
          subtitle: "Immersive Japanese cultural visits and networking events in Kyoto and Tokyo.",
          content: {
            items: [
              { title: "Kyoto Temple Visit", description: "Cultural study excursion.", image: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=400&q=80" },
              { title: "Tokyo Tech Meetup", description: "Networking with bilingual tech companies.", image: "https://images.unsplash.com/photo-1540959733332-eab4deceeaf7?auto=format&fit=crop&w=400&q=80" },
              { title: "Shinjuku Language Lab", description: "Co-working and shadow-listening sessions.", image: "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=400&q=80" }
            ]
          }
        }
      ]
    },
    {
      slug: "admissions",
      title: "Student Admissions & Visa Advisory",
      body: "Step-by-step guidance on enrolling in partner language schools and applying for student visas.",
      sections: [
        {
          sectionKey: "admissions",
          title: "Admission Runbook & Roadmap",
          subtitle: "We help you select, apply, and secure placements at accredited academies.",
          content: { body: "Admissions are open twice a year for April and October semesters. Our expert team will guide you from paperwork collection to final immigration interviews.", badge: "Admissions 2026", imageUrl: "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=800&q=80" }
        }
      ]
    },
    {
      slug: "contact",
      title: "Contact Information",
      body: "Reach out to our global support desks or speak with an academic admissions advisor.",
      sections: [
        {
          sectionKey: "contact",
          title: "Get In Touch",
          subtitle: "We usually respond within 24 business hours.",
          content: {
            body: "Email: support@nihongobridge.com\nPhone: +81 3-1234-5678\nLocation: Shinjuku, Tokyo, Japan",
            items: [
              { title: "Tokyo Office", description: "Principal admissions desk.", href: "mailto:admissions@nihongobridge.com", ctaText: "Email Us" },
              { title: "Technical Support", description: "Platform and gamification issues.", href: "mailto:tech@nihongobridge.com", ctaText: "Open Ticket" }
            ]
          }
        }
      ]
    },
    {
      slug: "privacy_policy",
      title: "Privacy Policy",
      body: "Our commitment to keeping your data and personal learning progress completely secure.",
      sections: [
        {
          sectionKey: "privacy_policy",
          title: "Data Protection Policies",
          subtitle: "Information collection, usage, and safety compliance policies.",
          content: {
            body: "Nihongo Bridge operates under strict security policies. We never sell, trade, or compromise your personal information. Your progress and study records are encrypted on secure database instances.",
            items: [
              { title: "Information Collected", description: "Email addresses for accounts and study stats for streak tracking." },
              { title: "Your Rights", description: "You hold the right to download, request, or purge your user record at any time." }
            ]
          }
        }
      ]
    },
    {
      slug: "terms_of_service",
      title: "Terms of Service",
      body: "Please read these terms carefully before utilizing our unified platform.",
      sections: [
        {
          sectionKey: "terms_of_service",
          title: "User Agreement",
          subtitle: "Guidelines and responsibilities of the language learning community.",
          content: {
            body: "By utilizing Nihongo Bridge, you agree to treat fellow community members politely and to avoid utilizing automated scraping tools against our active dictionary or news services.",
            items: [
              { title: "Streak Integrity", description: "Streak counts represent direct student study times and must be organically maintained." },
              { title: "Account Sharing", description: "Each student profile represents an individual learner and should not be shared." }
            ]
          }
        }
      ]
    },
    {
      slug: "cookie_policy",
      title: "Cookie Policy",
      body: "How we use cookies and caching mechanics to elevate user speed.",
      sections: [
        {
          sectionKey: "cookie_policy",
          title: "Browser Cookies",
          subtitle: "Cookies are required to authenticate cookies and preserve local student settings.",
          content: {
            body: "Our platform utilizes secure cookies strictly for session persistence, language settings selection, and database state cache control. No third-party tracking or advertising cookies are ever injected.",
            items: [
              { title: "Session Cookies", description: "Authenticates your administrative login and learner status." },
              { title: "Theme Cookies", description: "Remembers your dark or light theme interface selections." }
            ]
          }
        }
      ]
    },
    {
      slug: "maintenance",
      title: "Scheduled System Maintenance",
      body: "Upgrading our server configurations to deliver unmatched speed and reliability.",
      sections: [
        {
          sectionKey: "maintenance",
          title: "Regular Upgrades",
          subtitle: "We will resume fluent operations shortly.",
          content: { estimatedTime: "2 Hours" }
        }
      ]
    },
    {
      slug: "not_found",
      title: "404 Page Not Found",
      body: "The learning path, deck, or resource you are looking for does not exist or has been moved.",
      sections: [
        {
          sectionKey: "not_found",
          title: "Out of Bounds",
          subtitle: "Return to the correct track.",
          content: { ctaText: "Return to Home Page", ctaHref: "/nihongo" }
        }
      ]
    }
  ];

  for (const pageItem of list) {
    const existing = await db
      .select()
      .from(pages)
      .where(and(eq(pages.brandId, brandId), eq(pages.slug, pageItem.slug), eq(pages.locale, "en")))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(pages).values({
        brandId,
        slug: pageItem.slug,
        title: pageItem.title,
        body: pageItem.body,
        status: "published",
        locale: "en",
        publishedAt: new Date(),
      });
    }

    for (let i = 0; i < pageItem.sections.length; i++) {
      const s = pageItem.sections[i];
      const existingSec = await db
        .select()
        .from(contentSections)
        .where(
          and(
            eq(contentSections.brandId, brandId),
            eq(contentSections.pageSlug, pageItem.slug),
            eq(contentSections.sectionKey, s.sectionKey),
            eq(contentSections.locale, "en"),
          ),
        )
        .limit(1);

      if (existingSec.length === 0) {
        await db.insert(contentSections).values({
          brandId,
          pageSlug: pageItem.slug,
          sectionKey: s.sectionKey,
          title: s.title,
          subtitle: s.subtitle,
          content: s.content,
          position: i,
          status: "published",
          locale: "en",
        });
      }
    }
  }
}

if (typeof process !== "undefined" && process.argv && process.argv[1] && process.argv[1].endsWith("seed.ts")) {
  console.log("🌱 Executing standalone database seeding...");
  ensureSeed()
    .then(() => {
      console.log("✅ Seeding completed successfully!");
      process.exit(0);
    })
    .catch((err) => {
      console.error("❌ Seeding failed:", err);
      process.exit(1);
    });
}
