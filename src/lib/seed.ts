import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  achievements,
  chests,
  dailyXp,
  exercises,
  learners,
  lessons,
  shopItems,
  stories,
  units,
} from "@/db/schema";
import { ensureAuditSeed } from "@/lib/audit/repo";
import { ensureIdentitySeed } from "@/lib/identity/seed";
import { ensureInfraSeed } from "@/lib/infra/seed";
import {
  ACHIEVEMENTS,
  BOTS,
  CHESTS,
  LESSONS,
  SHOP,
  STORIES,
  UNITS,
  buildExercises,
} from "@/lib/curriculum";
import { todayKey, uid, weekStartKey } from "@/lib/utils";

const globalSeed = globalThis as typeof globalThis & { __nbSeeded?: boolean };

export async function ensureSeed() {
  if (!globalSeed.__nbSeeded) {
    const existing = await db.select({ id: units.id }).from(units).limit(1);
    if (existing.length === 0) {
      await db.insert(units).values(UNITS);
      await db.insert(lessons).values(
        LESSONS.map((lesson) => ({
          id: lesson.id,
          unitId: lesson.unitId,
          slug: lesson.slug,
          title: lesson.title,
          summary: lesson.summary,
          sortOrder: lesson.sortOrder,
          xpReward: lesson.xpReward,
          kind: lesson.kind,
        })),
      );

      const allExercises = LESSONS.flatMap((lesson) => buildExercises(lesson));
      await db.insert(exercises).values(allExercises);
      await db.insert(achievements).values(ACHIEVEMENTS);
      await db.insert(shopItems).values(SHOP);
      await db.insert(chests).values(CHESTS);
      await db.insert(stories).values(STORIES);

      const monday = weekStartKey();
      for (const bot of BOTS) {
        await db.insert(learners).values({
          id: bot.id,
          name: bot.name,
          avatar: bot.avatar,
          xp: bot.xp,
          gems: 80,
          hearts: 5,
          streak: 4,
          longestStreak: 12,
          lastStudyDate: todayKey(),
          dailyGoalXp: 20,
          isBot: true,
        });
        await db.insert(dailyXp).values({
          id: uid("dxp"),
          learnerId: bot.id,
          date: monday,
          xp: bot.weekly,
          lessonsCompleted: Math.max(1, Math.round(bot.weekly / 20)),
        });
      }
    }
    globalSeed.__nbSeeded = true;
  }

  await ensureAuditSeed();
  await ensureInfraSeed();
  await ensureIdentitySeed();
}

export async function seedReady() {
  try {
    await ensureSeed();
    return true;
  } catch (error) {
    console.error("Seed failed", error);
    return false;
  }
}

export async function hasCurriculum() {
  const rows = await db.select({ id: units.id }).from(units).where(eq(units.id, "unit-hiragana"));
  return rows.length > 0;
}
