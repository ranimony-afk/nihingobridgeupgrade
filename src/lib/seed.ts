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
import { ensureBillingSeed } from "@/lib/billing/seed";
import { ensureIdentitySeed } from "@/lib/identity/seed";
import { ensureInfraSeed } from "@/lib/infra/seed";
import { ensureKgSeed } from "@/lib/kg/seed";
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
  await ensureBillingSeed();
  await ensureKgSeed();
}

/**
 * Cached entrypoint used by pages and routes.
 *
 * `ensureSeed()` is idempotent but not free: the per-domain `ensure*Seed`
 * helpers each re-query their marker rows, which measured at 77 queries and
 * ~250ms **on every request** once the database was warm. The work only needs
 * to happen once per process, so the promise is memoised.
 *
 * A failed attempt is not cached, otherwise a transient database blip during
 * boot would permanently wedge the process into an unseeded state.
 */
const globalSeedOnce = globalThis as typeof globalThis & {
  __nbSeedPromise?: Promise<boolean>;
};

export async function seedReady() {
  if (globalSeedOnce.__nbSeedPromise) return globalSeedOnce.__nbSeedPromise;

  const attempt = (async () => {
    try {
      await ensureSeed();
      return true;
    } catch (error) {
      console.error("Seed failed", error);
      // Drop the cache so the next request can retry.
      globalSeedOnce.__nbSeedPromise = undefined;
      return false;
    }
  })();

  globalSeedOnce.__nbSeedPromise = attempt;
  return attempt;
}

/** Test hook: forces the next seedReady() to re-run the full chain. */
export function resetSeedCache() {
  globalSeedOnce.__nbSeedPromise = undefined;
  globalSeed.__nbSeeded = false;
}

export async function hasCurriculum() {
  const rows = await db.select({ id: units.id }).from(units).where(eq(units.id, "unit-hiragana"));
  return rows.length > 0;
}
