import { and, eq, gte, inArray } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import {
  achievements,
  chests,
  dailyXp,
  exercises,
  learnerAchievements,
  learnerChests,
  learners,
  lessonProgress,
  lessons,
  reviewCards,
  shopItems,
  stories,
  storyProgress,
  units,
  type ExercisePayload,
} from "@/db/schema";
import { avatarLooks } from "@/lib/media";
import { seedReady } from "@/lib/seed";
import {
  addDays,
  leagueFromWeeklyXp,
  levelFromXp,
  todayKey,
  uid,
  weekKeys,
  weekStartKey,
  xpIntoLevel,
  yesterdayKey,
} from "@/lib/utils";

export const LEARNER_COOKIE = "nb_learner";
const HEART_HOURS = 4;

export type PublicLearner = {
  id: string;
  name: string;
  avatar: string;
  avatarSrc: string;
  xp: number;
  gems: number;
  hearts: number;
  maxHearts: number;
  streak: number;
  longestStreak: number;
  lastStudyDate: string | null;
  streakFreezes: number;
  dailyGoalXp: number;
  levelHint: string;
  doubleXpUntil: string | null;
  level: number;
  xpIntoLevel: number;
  todayXp: number;
  weeklyXp: number;
  league: ReturnType<typeof leagueFromWeeklyXp>;
  lessonsCompleted: number;
  reviewsToday: number;
  storiesToday: number;
};

async function persistHearts(
  learner: typeof learners.$inferSelect,
  nextHearts: number,
  nextUpdated: Date,
) {
  await db
    .update(learners)
    .set({ hearts: nextHearts, heartsUpdatedAt: nextUpdated })
    .where(eq(learners.id, learner.id));
}

export async function applyHeartRegen(learner: typeof learners.$inferSelect) {
  if (learner.hearts >= learner.maxHearts) return learner;
  const elapsed = Date.now() - new Date(learner.heartsUpdatedAt).getTime();
  const gained = Math.floor(elapsed / (HEART_HOURS * 60 * 60 * 1000));
  if (gained <= 0) return learner;
  const nextHearts = Math.min(learner.maxHearts, learner.hearts + gained);
  const nextUpdated = addDays(new Date(learner.heartsUpdatedAt), 0);
  nextUpdated.setTime(new Date(learner.heartsUpdatedAt).getTime() + gained * HEART_HOURS * 60 * 60 * 1000);
  await persistHearts(learner, nextHearts, nextUpdated);
  return { ...learner, hearts: nextHearts, heartsUpdatedAt: nextUpdated };
}

export async function getLearnerId() {
  const jar = await cookies();
  const { readStaffToken } = await import("@/lib/audit/crypto");
  const signed = readStaffToken(jar.get("nb_learner_sig")?.value);
  if (signed) return signed;
  const raw = jar.get(LEARNER_COOKIE)?.value ?? null;
  if (raw) return raw;
  try {
    const { verifyJwt } = await import("@/lib/identity/jwt");
    const claims = verifyJwt(jar.get("nb_access")?.value);
    if (claims?.typ === "access" && claims.learnerId) return claims.learnerId;
  } catch {
    // Identity JWT is optional for guest learners.
  }
  return null;
}

export async function setLearnerCookie(id: string) {
  const jar = await cookies();
  const { signStaffToken } = await import("@/lib/audit/crypto");
  jar.set(LEARNER_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  jar.set("nb_learner_sig", signStaffToken(id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function loadLearnerRow() {
  await seedReady();
  const id = await getLearnerId();
  if (!id) return null;
  const [row] = await db.select().from(learners).where(eq(learners.id, id));
  if (!row || row.isBot) return null;
  return applyHeartRegen(row);
}

export async function getDaily(learnerId: string, date = todayKey()) {
  const [row] = await db
    .select()
    .from(dailyXp)
    .where(and(eq(dailyXp.learnerId, learnerId), eq(dailyXp.date, date)));
  return row ?? null;
}

export async function getWeeklyXp(learnerId: string) {
  const keys = weekKeys();
  const rows = await db
    .select()
    .from(dailyXp)
    .where(and(eq(dailyXp.learnerId, learnerId), gte(dailyXp.date, keys[0])));
  return rows.reduce((sum, row) => sum + row.xp, 0);
}

export async function toPublic(learner: typeof learners.$inferSelect): Promise<PublicLearner> {
  const today = await getDaily(learner.id);
  const weekly = await getWeeklyXp(learner.id);
  return {
    id: learner.id,
    name: learner.name,
    avatar: learner.avatar,
    avatarSrc: avatarLooks[learner.avatar]?.src ?? avatarLooks.mochi.src,
    xp: learner.xp,
    gems: learner.gems,
    hearts: learner.hearts,
    maxHearts: learner.maxHearts,
    streak: learner.streak,
    longestStreak: learner.longestStreak,
    lastStudyDate: learner.lastStudyDate,
    streakFreezes: learner.streakFreezes,
    dailyGoalXp: learner.dailyGoalXp,
    levelHint: learner.levelHint,
    doubleXpUntil: learner.doubleXpUntil ? learner.doubleXpUntil.toISOString() : null,
    level: levelFromXp(learner.xp),
    xpIntoLevel: xpIntoLevel(learner.xp),
    todayXp: today?.xp ?? 0,
    weeklyXp: weekly,
    league: leagueFromWeeklyXp(weekly),
    lessonsCompleted: today?.lessonsCompleted ?? 0,
    reviewsToday: today?.reviewsCompleted ?? 0,
    storiesToday: today?.storiesCompleted ?? 0,
  };
}

export async function getPublicLearner() {
  const row = await loadLearnerRow();
  if (!row) return null;
  return toPublic(row);
}

export async function upsertDaily(
  learnerId: string,
  patch: Partial<Pick<typeof dailyXp.$inferInsert, "xp" | "lessonsCompleted" | "reviewsCompleted" | "storiesCompleted">>,
) {
  const date = todayKey();
  const current = await getDaily(learnerId, date);
  if (!current) {
    await db.insert(dailyXp).values({
      id: uid("dxp"),
      learnerId,
      date,
      xp: patch.xp ?? 0,
      lessonsCompleted: patch.lessonsCompleted ?? 0,
      reviewsCompleted: patch.reviewsCompleted ?? 0,
      storiesCompleted: patch.storiesCompleted ?? 0,
    });
    return;
  }
  await db
    .update(dailyXp)
    .set({
      xp: current.xp + (patch.xp ?? 0),
      lessonsCompleted: current.lessonsCompleted + (patch.lessonsCompleted ?? 0),
      reviewsCompleted: current.reviewsCompleted + (patch.reviewsCompleted ?? 0),
      storiesCompleted: current.storiesCompleted + (patch.storiesCompleted ?? 0),
    })
    .where(eq(dailyXp.id, current.id));
}

export async function applyStudyStreak(learner: typeof learners.$inferSelect) {
  const today = todayKey();
  if (learner.lastStudyDate === today) {
    return learner;
  }

  let nextStreak = 1;
  let nextFreezes = learner.streakFreezes;
  if (learner.lastStudyDate === yesterdayKey()) {
    nextStreak = learner.streak + 1;
  } else if (learner.lastStudyDate) {
    if (nextFreezes > 0) {
      nextFreezes -= 1;
      nextStreak = learner.streak + 1;
    } else {
      nextStreak = 1;
    }
  }

  const longest = Math.max(learner.longestStreak, nextStreak);
  await db
    .update(learners)
    .set({
      streak: nextStreak,
      longestStreak: longest,
      lastStudyDate: today,
      streakFreezes: nextFreezes,
    })
    .where(eq(learners.id, learner.id));

  return {
    ...learner,
    streak: nextStreak,
    longestStreak: longest,
    lastStudyDate: today,
    streakFreezes: nextFreezes,
  };
}

export async function awardXp(learner: typeof learners.$inferSelect, baseXp: number) {
  const doubled = learner.doubleXpUntil && learner.doubleXpUntil.getTime() > Date.now();
  const gained = doubled ? baseXp * 2 : baseXp;
  const nextXp = learner.xp + gained;
  await db.update(learners).set({ xp: nextXp }).where(eq(learners.id, learner.id));
  await upsertDaily(learner.id, { xp: gained });
  return { learner: { ...learner, xp: nextXp }, gained, doubled: Boolean(doubled) };
}

export async function awardGems(learner: typeof learners.$inferSelect, amount: number) {
  const gems = learner.gems + amount;
  await db.update(learners).set({ gems }).where(eq(learners.id, learner.id));
  return { ...learner, gems };
}

export async function unlockAchievements(learnerId: string) {
  const [learner] = await db.select().from(learners).where(eq(learners.id, learnerId));
  if (!learner) return [] as string[];

  const progress = await db.select().from(lessonProgress).where(eq(lessonProgress.learnerId, learnerId));
  const storyRows = await db.select().from(storyProgress).where(eq(storyProgress.learnerId, learnerId));
  const owned = await db.select().from(learnerAchievements).where(eq(learnerAchievements.learnerId, learnerId));
  const ownedIds = new Set(owned.map((row) => row.achievementId));
  const allLessons = await db.select().from(lessons);
  const completedIds = new Set(progress.map((row) => row.lessonId));

  const hiraganaDone = allLessons
    .filter((lesson) => lesson.unitId === "unit-hiragana")
    .every((lesson) => completedIds.has(lesson.id));
  const foodDone = allLessons
    .filter((lesson) => lesson.unitId === "unit-food")
    .every((lesson) => completedIds.has(lesson.id));

  const checks: { id: string; ok: boolean }[] = [
    { id: "ach-first", ok: progress.length > 0 },
    { id: "ach-perfect", ok: progress.some((row) => row.lastAccuracy === 100) },
    { id: "ach-streak3", ok: learner.streak >= 3 },
    { id: "ach-streak7", ok: learner.streak >= 7 },
    { id: "ach-xp100", ok: learner.xp >= 100 },
    { id: "ach-xp500", ok: learner.xp >= 500 },
    { id: "ach-story", ok: storyRows.length > 0 },
    { id: "ach-kana", ok: hiraganaDone },
    { id: "ach-foodie", ok: foodDone },
  ];

  const unlocked: string[] = [];
  for (const check of checks) {
    if (check.ok && !ownedIds.has(check.id)) {
      await db.insert(learnerAchievements).values({
        id: uid("lach"),
        learnerId,
        achievementId: check.id,
      });
      unlocked.push(check.id);
    }
  }
  return unlocked;
}

export async function rememberMiss(learnerId: string, exerciseId: string, payload: ExercisePayload, type: string) {
  const existing = await db
    .select()
    .from(reviewCards)
    .where(and(eq(reviewCards.learnerId, learnerId), eq(reviewCards.exerciseId, exerciseId)));
  const answer = Array.isArray(payload.answer) ? payload.answer.join(" ") : payload.answer;
  const reviewType = ["select", "listen", "fill", "translate"].includes(type) ? type : "translate";
  if (existing[0]) {
    await db
      .update(reviewCards)
      .set({
        dueAt: new Date(),
        intervalDays: 0,
        lapses: existing[0].lapses + 1,
      })
      .where(eq(reviewCards.id, existing[0].id));
    return;
  }
  await db.insert(reviewCards).values({
    id: uid("rev"),
    learnerId,
    exerciseId,
    prompt: payload.prompt,
    speak: payload.speak ?? payload.promptJa ?? null,
    answer,
    options: payload.options ?? null,
    type: reviewType,
    dueAt: new Date(),
  });
}

export async function markReviewCorrect(cardId: string) {
  const [card] = await db.select().from(reviewCards).where(eq(reviewCards.id, cardId));
  if (!card) return;
  const nextInterval = card.intervalDays <= 0 ? 1 : card.intervalDays === 1 ? 3 : card.intervalDays * 2;
  await db
    .update(reviewCards)
    .set({
      intervalDays: nextInterval,
      reps: card.reps + 1,
      dueAt: addDays(new Date(), nextInterval),
    })
    .where(eq(reviewCards.id, cardId));
}

export async function getLearnPath(learnerId: string) {
  const unitRows = await db.select().from(units);
  const lessonRows = await db.select().from(lessons);
  const progressRows = await db.select().from(lessonProgress).where(eq(lessonProgress.learnerId, learnerId));
  const chestRows = await db.select().from(chests);
  const claimed = await db.select().from(learnerChests).where(eq(learnerChests.learnerId, learnerId));
  const progressByLesson = new Map(progressRows.map((row) => [row.lessonId, row]));
  const claimedSet = new Set(claimed.map((row) => row.chestId));

  const orderedLessons = [...lessonRows].sort((a, b) => a.sortOrder - b.sortOrder);
  let unlocked = true;
  const path = orderedLessons.map((lesson) => {
    const progress = progressByLesson.get(lesson.id);
    const item = {
      ...lesson,
      locked: !unlocked,
      crowns: progress?.crowns ?? 0,
      accuracy: progress?.lastAccuracy ?? 0,
      completed: Boolean(progress),
    };
    if (!progress) unlocked = false;
    return item;
  });

  const unitsWithLessons = [...unitRows]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((unit) => ({
      ...unit,
      lessons: path.filter((lesson) => lesson.unitId === unit.id),
    }));

  return {
    units: unitsWithLessons,
    lessons: path,
    chests: chestRows
      .sort((a, b) => a.afterIndex - b.afterIndex)
      .map((chest) => ({
        ...chest,
        claimed: claimedSet.has(chest.id),
        unlocked: path.filter((lesson) => lesson.completed && lesson.sortOrder <= chest.afterIndex).length >=
          path.filter((lesson) => lesson.sortOrder <= chest.afterIndex).length,
      })),
  };
}

export async function getLessonBundle(slug: string) {
  const [lesson] = await db.select().from(lessons).where(eq(lessons.slug, slug));
  if (!lesson) return null;
  const [unit] = await db.select().from(units).where(eq(units.id, lesson.unitId));
  const items = await db.select().from(exercises).where(eq(exercises.lessonId, lesson.id));
  return {
    lesson,
    unit,
    exercises: items.sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

export async function getLeaderboard() {
  const people = await db.select().from(learners);
  const start = weekStartKey();
  const xpRows = await db.select().from(dailyXp).where(gte(dailyXp.date, start));
  const weekly = new Map<string, number>();
  for (const row of xpRows) {
    weekly.set(row.learnerId, (weekly.get(row.learnerId) ?? 0) + row.xp);
  }
  return people
    .map((person) => ({
      id: person.id,
      name: person.name,
      avatar: person.avatar,
      avatarSrc: avatarLooks[person.avatar]?.src ?? avatarLooks.mochi.src,
      xp: person.xp,
      weeklyXp: weekly.get(person.id) ?? 0,
      streak: person.streak,
      isBot: person.isBot,
    }))
    .sort((a, b) => b.weeklyXp - a.weeklyXp || b.xp - a.xp);
}

export async function getProfileExtras(learnerId: string) {
  const [allAchievements, unlocked, allShop, week] = await Promise.all([
    db.select().from(achievements),
    db.select().from(learnerAchievements).where(eq(learnerAchievements.learnerId, learnerId)),
    db.select().from(shopItems),
    db.select().from(dailyXp).where(and(eq(dailyXp.learnerId, learnerId), gte(dailyXp.date, weekStartKey()))),
  ]);
  const unlockedSet = new Set(unlocked.map((row) => row.achievementId));
  const weekMap = new Map(week.map((row) => [row.date, row.xp]));
  return {
    achievements: allAchievements.map((item) => ({
      ...item,
      unlocked: unlockedSet.has(item.id),
    })),
    shop: allShop,
    week: weekKeys().map((date) => ({ date, xp: weekMap.get(date) ?? 0 })),
  };
}

export async function getPracticeDeck(learnerId: string) {
  const due = await db
    .select()
    .from(reviewCards)
    .where(eq(reviewCards.learnerId, learnerId))
    .orderBy(reviewCards.dueAt);
  const ready = due.filter((card) => new Date(card.dueAt).getTime() <= Date.now()).slice(0, 8);
  if (ready.length > 0) return ready;

  const progress = await db.select().from(lessonProgress).where(eq(lessonProgress.learnerId, learnerId));
  if (progress.length === 0) {
    const firstLesson = await db.select().from(lessons).orderBy(lessons.sortOrder).limit(1);
    if (!firstLesson[0]) return [];
    return db.select().from(exercises).where(eq(exercises.lessonId, firstLesson[0].id));
  }
  const ids = progress.map((row) => row.lessonId);
  const pool = await db.select().from(exercises).where(inArray(exercises.lessonId, ids));
  return pool.slice(0, 8);
}

export async function getStoriesFor(learnerId: string) {
  const [allStories, done] = await Promise.all([
    db.select().from(stories),
    db.select().from(storyProgress).where(eq(storyProgress.learnerId, learnerId)),
  ]);
  const doneMap = new Map(done.map((row) => [row.storyId, row]));
  return allStories.map((story) => ({
    ...story,
    completed: Boolean(doneMap.get(story.id)),
    score: doneMap.get(story.id)?.score ?? 0,
  }));
}


