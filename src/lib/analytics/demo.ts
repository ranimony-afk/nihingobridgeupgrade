import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  analyticsEvents,
  billingCheckouts,
  billingInvoices,
  billingSubscriptions,
  dailyXp,
  learners,
  lessonProgress,
  lessons,
  searchQueries,
  systemSettings,
  tutorSessions,
} from "@/db/schema";
import { isoDay } from "./metrics";
import { uid } from "@/lib/utils";

/**
 * Demo activity so the dashboard is explorable before real traffic exists.
 *
 * This is clearly synthetic and is only written when there is no meaningful
 * activity already present — it will never overwrite or inflate real data.
 * Every learner it creates is flagged `is_bot = true`.
 */

/** Deterministic PRNG so repeated seeds produce a stable, reviewable dataset. */
function rng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

export async function hasRealActivity() {
  const [row] = (
    await db.execute<{ n: string }>(sql`
      SELECT (
        (SELECT count(*) FROM daily_xp) +
        (SELECT count(*) FROM lesson_progress) +
        (SELECT count(*) FROM billing_invoices)
      )::text AS n
    `)
  ).rows;
  // The base seed creates 8 bot learners with one daily_xp row each.
  return Number(row?.n ?? 0) > 12;
}

export async function seedDemoAnalytics(force = false) {
  if (!force && (await hasRealActivity())) {
    return { skipped: true as const, reason: "activity already present" };
  }

  const random = rng(20260818);
  const lessonRows = await db.select({ id: lessons.id }).from(lessons);
  if (lessonRows.length === 0) return { skipped: true as const, reason: "no lessons" };

  const days = 30;
  const learnerCount = 60;
  const created: string[] = [];

  for (let index = 0; index < learnerCount; index += 1) {
    const id = `demo-lrn-${index}`;
    created.push(id);
    // Spread joins across the window so weekly cohorts are populated.
    const joinedDaysAgo = Math.floor(random() * days);
    await db
      .insert(learners)
      .values({
        id,
        name: `Demo Learner ${index + 1}`,
        xp: Math.floor(random() * 900),
        streak: Math.floor(random() * 9),
        longestStreak: Math.floor(random() * 21),
        isBot: true,
      })
      .onConflictDoNothing();

    // Retention decays with age — later days are less likely to be active.
    for (let offset = joinedDaysAgo; offset >= 0; offset -= 1) {
      const age = joinedDaysAgo - offset;
      const returnChance = Math.exp(-age / 9);
      if (age > 0 && random() > returnChance) continue;

      const day = new Date();
      day.setUTCDate(day.getUTCDate() - offset);
      const xp = 10 + Math.floor(random() * 60);
      const lessonsDone = 1 + Math.floor(random() * 3);

      await db
        .insert(dailyXp)
        .values({
          id: uid("dxp"),
          learnerId: id,
          date: isoDay(day),
          xp,
          lessonsCompleted: lessonsDone,
          reviewsCompleted: Math.floor(random() * 5),
          storiesCompleted: random() > 0.7 ? 1 : 0,
        })
        .onConflictDoNothing();
    }

    // Roughly half complete lessons, with a spread of accuracy.
    if (random() > 0.45) {
      const lesson = lessonRows[Math.floor(random() * lessonRows.length)]!;
      await db
        .insert(lessonProgress)
        .values({
          id: uid("prg"),
          learnerId: id,
          lessonId: lesson.id,
          crowns: 1,
          bestScore: 50 + Math.floor(random() * 50),
          lastAccuracy: 45 + Math.floor(random() * 55),
        })
        .onConflictDoNothing();
    }
  }

  // Product telemetry.
  const eventNames = ["game_action", "lesson_start", "dictionary_search", "tutor_open", "billing_view"];
  for (let index = 0; index < 220; index += 1) {
    await db.insert(analyticsEvents).values({
      id: uid("anl"),
      name: eventNames[Math.floor(random() * eventNames.length)]!,
      path: "/learn",
      actorId: created[Math.floor(random() * created.length)] ?? null,
      meta: null,
    });
  }

  for (let index = 0; index < 40; index += 1) {
    await db.insert(searchQueries).values({
      id: uid("sq"),
      query: ["water", "taberu", "kanji", "keigo", "zzzq"][Math.floor(random() * 5)]!,
      normalized: ["water", "taberu", "kanji", "keigo", "zzzq"][Math.floor(random() * 5)]!,
      hits: random() > 0.85 ? 0 : 1 + Math.floor(random() * 20),
      tookMs: 5 + Math.floor(random() * 40),
      filters: "{}",
    });
  }

  for (let index = 0; index < 18; index += 1) {
    await db.insert(tutorSessions).values({
      id: uid("tut"),
      learnerId: created[Math.floor(random() * created.length)] ?? null,
      persona: "Mochi Sensei",
      scenario: "cafe",
      level: "N5",
      provider: "local",
      score: 40 + Math.floor(random() * 55),
      turns: 1 + Math.floor(random() * 8),
    });
  }

  // Paid conversions: subscriptions plus matching invoices.
  const identities = await db.execute<{ id: string }>(sql`SELECT id FROM identity_users LIMIT 4`);
  const plans = await db.execute<{ id: string; amount: string; currency: string; interval: string }>(
    sql`SELECT id, amount::text, currency, interval FROM billing_plans LIMIT 3`,
  );
  let conversions = 0;
  for (const [index, user] of identities.rows.entries()) {
    const plan = plans.rows[index % Math.max(1, plans.rows.length)];
    if (!plan) break;
    const checkoutId = `demo-chk-${index}`;
    await db
      .insert(billingCheckouts)
      .values({
        id: checkoutId,
        userId: user.id,
        planId: plan.id,
        provider: "sandbox",
        status: "paid",
        currency: plan.currency,
        subtotal: Number(plan.amount),
        discount: 0,
        tax: 0,
        total: Number(plan.amount),
      })
      .onConflictDoNothing();
    await db
      .insert(billingSubscriptions)
      .values({
        id: `demo-sub-${index}`,
        userId: user.id,
        planId: plan.id,
        // One churned account so churn and LTV are not divide-by-zero.
        status: index === 3 ? "canceled" : "active",
        provider: "sandbox",
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
      })
      .onConflictDoNothing();
    await db
      .insert(billingInvoices)
      .values({
        id: `demo-inv-${index}`,
        userId: user.id,
        checkoutId,
        number: `NB-DEMO-${index}`,
        currency: plan.currency,
        subtotal: Number(plan.amount),
        tax: 0,
        total: Number(plan.amount),
        status: "paid",
      })
      .onConflictDoNothing();
    conversions += 1;
  }

  await db
    .insert(systemSettings)
    .values({ key: "phase14_demo", value: String(learnerCount) })
    .onConflictDoNothing();

  return { skipped: false as const, learners: learnerCount, conversions };
}
