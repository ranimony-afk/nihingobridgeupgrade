import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  chests,
  exercises,
  learnerAchievements,
  learnerChests,
  learners,
  lessonProgress,
  lessons,
  purchases,
  reviewCards,
  shopItems,
  stories,
  storyProgress,
} from "@/db/schema";
import {
  applyStudyStreak,
  awardGems,
  awardXp,
  loadLearnerRow,
  markReviewCorrect,
  rememberMiss,
  setLearnerCookie,
  toPublic,
  unlockAchievements,
  upsertDaily,
} from "@/lib/learner";
import { seedReady } from "@/lib/seed";
import { answersMatch, uid } from "@/lib/utils";

export type GameAction =
  | { action: "onboard"; name: string; dailyGoalXp: number; levelHint: string }
  | { action: "check"; exerciseId: string; answer: string | string[] }
  | { action: "completeLesson"; lessonId: string; correct: number; total: number }
  | { action: "buy"; itemSlug: string }
  | { action: "claimChest"; chestId: string }
  | { action: "completeStory"; storyId: string; score: number }
  | { action: "completePractice"; reviews: number; xp?: number }
  | { action: "reviewResult"; cardId: string; correct: boolean }
  | { action: "updateProfile"; name?: string; dailyGoalXp?: number };

function matchAnswer(expected: string | string[], given: string | string[]) {
  if (Array.isArray(expected) && Array.isArray(given)) {
    if (expected.length !== given.length) return false;
    return expected.every((item, index) => answersMatch(item, given[index] ?? ""));
  }
  if (Array.isArray(expected) && typeof given === "string") {
    return answersMatch(expected.join(" "), given) || expected.some((item) => answersMatch(item, given));
  }
  if (typeof expected === "string" && typeof given === "string") {
    return answersMatch(expected, given);
  }
  return false;
}

export async function handleGame(body: GameAction) {
  if (body.action === "onboard") {
    const name = body.name.trim().slice(0, 24) || "Traveler";
    const id = uid("lrn");
    await db.insert(learners).values({
      id,
      name,
      dailyGoalXp: [10, 20, 30, 50].includes(body.dailyGoalXp) ? body.dailyGoalXp : 20,
      levelHint: body.levelHint || "beginner",
      gems: 500,
      streakFreezes: 1,
    });
    await setLearnerCookie(id);
    const [row] = await db.select().from(learners).where(eq(learners.id, id));
    return { ok: true, learner: row ? await toPublic(row) : null };
  }

  const learner = await loadLearnerRow();
  if (!learner) {
    return { ok: false, error: "Sign in first", status: 401 };
  }

  if (body.action === "check") {
    const [exercise] = await db.select().from(exercises).where(eq(exercises.id, body.exerciseId));
    if (!exercise) return { ok: false, error: "Missing exercise", status: 404 };

    const correct = matchAnswer(exercise.payload.answer, body.answer);
    let hearts = learner.hearts;
    if (!correct) {
      hearts = Math.max(0, learner.hearts - 1);
      await db
        .update(learners)
        .set({
          hearts,
          heartsUpdatedAt: learner.hearts >= learner.maxHearts ? new Date() : learner.heartsUpdatedAt,
        })
        .where(eq(learners.id, learner.id));
      await rememberMiss(learner.id, exercise.id, exercise.payload, exercise.type);
    }

    return {
      ok: true,
      correct,
      hearts,
      answer: exercise.payload.answer,
      explanation: exercise.payload.explanation ?? null,
    };
  }

  if (body.action === "completeLesson") {
    if (body.total <= 0) return { ok: false, error: "Invalid lesson", status: 400 };
    const accuracy = Math.round((body.correct / body.total) * 100);
    const existing = await db
      .select()
      .from(lessonProgress)
      .where(and(eq(lessonProgress.learnerId, learner.id), eq(lessonProgress.lessonId, body.lessonId)));

    const nextCrowns = Math.min(3, (existing[0]?.crowns ?? 0) + 1);
    if (existing[0]) {
      await db
        .update(lessonProgress)
        .set({
          crowns: nextCrowns,
          bestScore: Math.max(existing[0].bestScore, accuracy),
          lastAccuracy: accuracy,
          completedAt: new Date(),
        })
        .where(eq(lessonProgress.id, existing[0].id));
    } else {
      await db.insert(lessonProgress).values({
        id: uid("prg"),
        learnerId: learner.id,
        lessonId: body.lessonId,
        crowns: 1,
        bestScore: accuracy,
        lastAccuracy: accuracy,
      });
    }

    const studied = await applyStudyStreak(learner);
    const perfect = accuracy === 100;
    const { learner: withXp, gained, doubled } = await awardXp(studied, perfect ? 15 : 10);
    const withGems = await awardGems(withXp, perfect ? 12 : 6);
    await upsertDaily(learner.id, { lessonsCompleted: 1 });
    const unlocked = await unlockAchievements(learner.id);
    return {
      ok: true,
      accuracy,
      xp: gained,
      doubled,
      gems: perfect ? 12 : 6,
      crowns: existing[0] ? nextCrowns : 1,
      unlocked,
      learner: await toPublic(withGems),
    };
  }

  if (body.action === "buy") {
    const [item] = await db.select().from(shopItems).where(eq(shopItems.slug, body.itemSlug));
    if (!item) return { ok: false, error: "Unknown item", status: 404 };
    if (learner.gems < item.cost) return { ok: false, error: "Not enough gems", status: 400 };

    const patch: Partial<typeof learners.$inferInsert> = { gems: learner.gems - item.cost };
    if (item.kind === "hearts") {
      patch.hearts = learner.maxHearts;
      patch.heartsUpdatedAt = new Date();
    }
    if (item.kind === "freeze") {
      patch.streakFreezes = learner.streakFreezes + 1;
    }
    if (item.kind === "double") {
      const base = learner.doubleXpUntil && learner.doubleXpUntil.getTime() > Date.now()
        ? learner.doubleXpUntil
        : new Date();
      patch.doubleXpUntil = new Date(base.getTime() + 15 * 60 * 1000);
    }
    if (item.kind === "outfit") {
      patch.avatar = item.value;
    }

    await db.update(learners).set(patch).where(eq(learners.id, learner.id));
    await db.insert(purchases).values({
      id: uid("buy"),
      learnerId: learner.id,
      itemId: item.id,
    });

    if (item.kind === "hearts" || item.kind === "freeze" || item.kind === "outfit" || item.kind === "double") {
      const owned = await db
        .select()
        .from(learnerAchievements)
        .where(and(eq(learnerAchievements.learnerId, learner.id), eq(learnerAchievements.achievementId, "ach-shop")));
      if (owned.length === 0) {
        await db.insert(learnerAchievements).values({
          id: uid("lach"),
          learnerId: learner.id,
          achievementId: "ach-shop",
        });
      }
    }

    const [fresh] = await db.select().from(learners).where(eq(learners.id, learner.id));
    return { ok: true, item, learner: fresh ? await toPublic(fresh) : null };
  }

  if (body.action === "claimChest") {
    const [chest] = await db.select().from(chests).where(eq(chests.id, body.chestId));
    if (!chest) return { ok: false, error: "No chest", status: 404 };
    const claimed = await db
      .select()
      .from(learnerChests)
      .where(and(eq(learnerChests.learnerId, learner.id), eq(learnerChests.chestId, chest.id)));
    if (claimed.length) return { ok: false, error: "Already claimed", status: 400 };

    const completed = await db.select().from(lessonProgress).where(eq(lessonProgress.learnerId, learner.id));
    const allLessons = await db.select().from(lessons);
    const needed = allLessons.filter((lesson) => lesson.sortOrder <= chest.afterIndex);
    const doneIds = new Set(completed.map((row) => row.lessonId));
    if (!needed.every((lesson) => doneIds.has(lesson.id))) {
      return { ok: false, error: "Chest is still locked", status: 400 };
    }

    await db.insert(learnerChests).values({
      id: uid("lch"),
      learnerId: learner.id,
      chestId: chest.id,
    });
    const withGems = await awardGems(learner, chest.gems);
    return { ok: true, gems: chest.gems, learner: await toPublic(withGems) };
  }

  if (body.action === "completeStory") {
    const [story] = await db.select().from(stories).where(eq(stories.id, body.storyId));
    if (!story) return { ok: false, error: "Missing story", status: 404 };
    const existing = await db
      .select()
      .from(storyProgress)
      .where(and(eq(storyProgress.learnerId, learner.id), eq(storyProgress.storyId, story.id)));
    if (existing[0]) {
      await db
        .update(storyProgress)
        .set({ score: Math.max(existing[0].score, body.score), completedAt: new Date() })
        .where(eq(storyProgress.id, existing[0].id));
    } else {
      await db.insert(storyProgress).values({
        id: uid("stp"),
        learnerId: learner.id,
        storyId: story.id,
        score: body.score,
      });
    }
    const studied = await applyStudyStreak(learner);
    const { learner: withXp, gained } = await awardXp(studied, 15);
    await upsertDaily(learner.id, { storiesCompleted: 1 });
    const unlocked = await unlockAchievements(learner.id);
    return { ok: true, xp: gained, unlocked, learner: await toPublic(withXp) };
  }

  if (body.action === "completePractice") {
    const studied = await applyStudyStreak(learner);
    const { learner: withXp, gained } = await awardXp(studied, body.xp ?? 8);
    await upsertDaily(learner.id, { reviewsCompleted: body.reviews });
    return { ok: true, xp: gained, learner: await toPublic(withXp) };
  }

  if (body.action === "reviewResult") {
    if (body.correct) {
      await markReviewCorrect(body.cardId);
    } else {
      const hearts = Math.max(0, learner.hearts - 1);
      await db
        .update(learners)
        .set({
          hearts,
          heartsUpdatedAt: learner.hearts >= learner.maxHearts ? new Date() : learner.heartsUpdatedAt,
        })
        .where(eq(learners.id, learner.id));
      await db.update(reviewCards).set({ dueAt: new Date(), intervalDays: 0 }).where(eq(reviewCards.id, body.cardId));
      const [fresh] = await db.select().from(learners).where(eq(learners.id, learner.id));
      return { ok: true, hearts: fresh?.hearts ?? hearts };
    }
    return { ok: true, hearts: learner.hearts };
  }

  if (body.action === "updateProfile") {
    const patch: Partial<typeof learners.$inferInsert> = {};
    if (body.name) patch.name = body.name.trim().slice(0, 24);
    if (body.dailyGoalXp && [10, 20, 30, 50].includes(body.dailyGoalXp)) {
      patch.dailyGoalXp = body.dailyGoalXp;
    }
    if (Object.keys(patch).length) {
      await db.update(learners).set(patch).where(eq(learners.id, learner.id));
    }
    const [fresh] = await db.select().from(learners).where(eq(learners.id, learner.id));
    return { ok: true, learner: fresh ? await toPublic(fresh) : null };
  }

  return { ok: false, error: "Unknown action", status: 400 };
}
