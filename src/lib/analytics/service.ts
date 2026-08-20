import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  arpu,
  arr,
  average,
  buildCohorts,
  buildFunnel,
  funnelAnomalies,
  churnRate,
  isoDay,
  lastNDays,
  ltv,
  median,
  monthlyValue,
  mrr,
  ratio,
  stickiness,
  trend,
  worstFunnelStep,
  type CohortInput,
} from "./metrics";

/** Everything aggregates in SQL — never pull whole tables into Node to count. */

export async function learningAnalytics(days = 30) {
  const window = lastNDays(days);
  const since = window[0]!;

  const daily = await db.execute<{
    date: string;
    learners: string;
    xp: string;
    lessons: string;
    reviews: string;
    stories: string;
  }>(sql`
    SELECT date,
      count(DISTINCT learner_id)::text AS learners,
      COALESCE(SUM(xp), 0)::text AS xp,
      COALESCE(SUM(lessons_completed), 0)::text AS lessons,
      COALESCE(SUM(reviews_completed), 0)::text AS reviews,
      COALESCE(SUM(stories_completed), 0)::text AS stories
    FROM daily_xp WHERE date >= ${since}
    GROUP BY date ORDER BY date
  `);

  const byDate = new Map(daily.rows.map((row) => [row.date, row]));
  const series = window.map((date) => {
    const row = byDate.get(date);
    return {
      date,
      learners: Number(row?.learners ?? 0),
      xp: Number(row?.xp ?? 0),
      lessons: Number(row?.lessons ?? 0),
      reviews: Number(row?.reviews ?? 0),
      stories: Number(row?.stories ?? 0),
    };
  });

  const today = isoDay(new Date());
  const [active] = (
    await db.execute<{ dau: string; wau: string; mau: string }>(sql`
      SELECT
        count(DISTINCT learner_id) FILTER (WHERE date = ${today})::text AS dau,
        count(DISTINCT learner_id) FILTER (WHERE date >= ${lastNDays(7)[0]})::text AS wau,
        count(DISTINCT learner_id) FILTER (WHERE date >= ${lastNDays(30)[0]})::text AS mau
      FROM daily_xp
    `)
  ).rows;

  const [streaks] = (
    await db.execute<{ avg_streak: string; max_streak: string; with_streak: string }>(sql`
      SELECT
        COALESCE(ROUND(AVG(streak)), 0)::text AS avg_streak,
        COALESCE(MAX(longest_streak), 0)::text AS max_streak,
        count(*) FILTER (WHERE streak > 0)::text AS with_streak
      FROM learners WHERE is_bot = false
    `)
  ).rows;

  const lessons = await db.execute<{ title: string; completions: string; accuracy: string }>(sql`
    SELECT l.title,
      count(*)::text AS completions,
      COALESCE(ROUND(AVG(p.last_accuracy)), 0)::text AS accuracy
    FROM lesson_progress p
    JOIN lessons l ON l.id = p.lesson_id
    GROUP BY l.title ORDER BY count(*) DESC LIMIT 10
  `);

  /** Low accuracy on a high-traffic lesson is a curriculum problem. */
  const struggling = await db.execute<{ title: string; accuracy: string; attempts: string }>(sql`
    SELECT l.title,
      ROUND(AVG(p.last_accuracy))::text AS accuracy,
      count(*)::text AS attempts
    FROM lesson_progress p
    JOIN lessons l ON l.id = p.lesson_id
    GROUP BY l.title HAVING count(*) >= 1 AND AVG(p.last_accuracy) < 70
    ORDER BY AVG(p.last_accuracy) ASC LIMIT 5
  `);

  const xpValues = series.map((row) => row.xp);
  return {
    series,
    dau: Number(active?.dau ?? 0),
    wau: Number(active?.wau ?? 0),
    mau: Number(active?.mau ?? 0),
    stickiness: stickiness(Number(active?.dau ?? 0), Number(active?.mau ?? 0)),
    avgStreak: Number(streaks?.avg_streak ?? 0),
    maxStreak: Number(streaks?.max_streak ?? 0),
    learnersWithStreak: Number(streaks?.with_streak ?? 0),
    xpTotal: xpValues.reduce((a, b) => a + b, 0),
    xpAverage: average(xpValues),
    xpMedian: median(xpValues),
    xpTrend: trend(xpValues),
    topLessons: lessons.rows.map((row) => ({
      title: row.title,
      completions: Number(row.completions),
      accuracy: Number(row.accuracy),
    })),
    strugglingLessons: struggling.rows.map((row) => ({
      title: row.title,
      accuracy: Number(row.accuracy),
      attempts: Number(row.attempts),
    })),
  };
}

export async function revenueAnalytics() {
  const subs = await db.execute<{ status: string; amount: string; interval: string }>(sql`
    SELECT s.status, p.amount::text, p.interval
    FROM billing_subscriptions s JOIN billing_plans p ON p.id = s.plan_id
  `);
  const rows = subs.rows.map((row) => ({
    status: row.status,
    amount: Number(row.amount),
    interval: row.interval,
  }));

  const monthly = mrr(rows);
  const activeCount = rows.filter((row) => row.status === "active" || row.status === "canceling").length;
  const churned = rows.filter((row) => row.status === "canceled" || row.status === "expired").length;
  const rate = churnRate(activeCount + churned, churned);
  const perUser = arpu(monthly, activeCount);

  const invoices = await db.execute<{
    day: string;
    gross: string;
    tax: string;
    n: string;
    currency: string;
  }>(sql`
    SELECT to_char(created_at, 'YYYY-MM-DD') AS day,
      COALESCE(SUM(total), 0)::text AS gross,
      COALESCE(SUM(tax), 0)::text AS tax,
      count(*)::text AS n,
      currency
    FROM billing_invoices
    WHERE created_at >= now() - interval '30 days'
    GROUP BY day, currency ORDER BY day
  `);

  const [totals] = (
    await db.execute<{ gross: string; refunded: string; paid: string }>(sql`
      SELECT
        COALESCE(SUM(total) FILTER (WHERE status = 'paid'), 0)::text AS gross,
        COALESCE(SUM(total) FILTER (WHERE status = 'refunded'), 0)::text AS refunded,
        count(*) FILTER (WHERE status = 'paid')::text AS paid
      FROM billing_invoices
    `)
  ).rows;

  const byPlan = await db.execute<{ name: string; n: string; amount: string; interval: string }>(sql`
    SELECT p.name, count(*)::text AS n, p.amount::text, p.interval
    FROM billing_subscriptions s JOIN billing_plans p ON p.id = s.plan_id
    WHERE s.status IN ('active', 'canceling')
    GROUP BY p.name, p.amount, p.interval ORDER BY count(*) DESC
  `);

  return {
    mrr: monthly,
    arr: arr(monthly),
    arpu: perUser,
    ltv: ltv(perUser, rate),
    churnRate: rate,
    activeSubscriptions: activeCount,
    churnedSubscriptions: churned,
    grossPaid: Number(totals?.gross ?? 0),
    refunded: Number(totals?.refunded ?? 0),
    netRevenue: Number(totals?.gross ?? 0) - Number(totals?.refunded ?? 0),
    paidInvoices: Number(totals?.paid ?? 0),
    daily: invoices.rows.map((row) => ({
      day: row.day,
      gross: Number(row.gross),
      tax: Number(row.tax),
      invoices: Number(row.n),
      currency: row.currency,
    })),
    byPlan: byPlan.rows.map((row) => ({
      name: row.name,
      subscribers: Number(row.n),
      mrr: monthlyValue(Number(row.amount), row.interval) * Number(row.n),
    })),
  };
}

/**
 * Acquisition funnel. Each stage is a strict subset of the one above, so the
 * numbers can be compared directly.
 */
export async function funnelAnalytics() {
  const [row] = (
    await db.execute<{
      visitors: string;
      learners: string;
      started: string;
      completed: string;
      registered: string;
      subscribed: string;
    }>(sql`
      SELECT
        (SELECT count(DISTINCT COALESCE(actor_id, id)) FROM analytics_events)::text AS visitors,
        -- Every stage must count the same population. Filtering bots here but
        -- not downstream made the funnel *increase*, which is impossible.
        (SELECT count(*) FROM learners)::text AS learners,
        (SELECT count(DISTINCT learner_id) FROM daily_xp)::text AS started,
        (SELECT count(DISTINCT learner_id) FROM lesson_progress)::text AS completed,
        (SELECT count(*) FROM identity_users)::text AS registered,
        (SELECT count(DISTINCT user_id) FROM billing_subscriptions
          WHERE status IN ('active','canceling'))::text AS subscribed
    `)
  ).rows;

  const visitors = Math.max(
    Number(row?.visitors ?? 0),
    Number(row?.learners ?? 0),
  );

  const steps = buildFunnel([
    { key: "visit", label: "Visited", count: visitors },
    { key: "learner", label: "Started onboarding", count: Number(row?.learners ?? 0) },
    { key: "active", label: "Earned XP", count: Number(row?.started ?? 0) },
    { key: "lesson", label: "Completed a lesson", count: Number(row?.completed ?? 0) },
    { key: "account", label: "Created an account", count: Number(row?.registered ?? 0) },
    { key: "paid", label: "Subscribed", count: Number(row?.subscribed ?? 0) },
  ]);

  return { steps, worst: worstFunnelStep(steps), anomalies: funnelAnomalies(steps) };
}

/**
 * Weekly cohort retention keyed on the learner's first active day.
 * Offsets are weeks since that first week.
 */
export async function retentionAnalytics(weeks = 6) {
  const rows = await db.execute<{ learner_id: string; first_day: string; active_day: string }>(sql`
    WITH firsts AS (
      SELECT learner_id, MIN(date) AS first_day FROM daily_xp GROUP BY learner_id
    )
    SELECT d.learner_id, f.first_day, d.date AS active_day
    FROM daily_xp d JOIN firsts f ON f.learner_id = d.learner_id
  `);

  const cohortMap = new Map<string, CohortInput>();
  const weekOf = (day: string) => {
    const date = new Date(`${day}T00:00:00.000Z`);
    const shift = (date.getUTCDay() + 6) % 7; // ISO weeks start Monday
    date.setUTCDate(date.getUTCDate() - shift);
    return isoDay(date);
  };

  for (const row of rows.rows) {
    const cohort = weekOf(row.first_day);
    if (!cohortMap.has(cohort)) {
      cohortMap.set(cohort, { cohort, members: [], activeByOffset: {} });
    }
    const entry = cohortMap.get(cohort)!;
    if (!entry.members.includes(row.learner_id)) entry.members.push(row.learner_id);

    const offset = Math.floor(
      (Date.parse(`${weekOf(row.active_day)}T00:00:00.000Z`) - Date.parse(`${cohort}T00:00:00.000Z`)) /
        (7 * 86400000),
    );
    if (offset < 0 || offset >= weeks) continue;
    entry.activeByOffset[offset] = [...(entry.activeByOffset[offset] ?? []), row.learner_id];
  }

  const offsets = Array.from({ length: weeks }, (_, index) => index);
  const cohorts = buildCohorts(
    [...cohortMap.values()].sort((a, b) => b.cohort.localeCompare(a.cohort)).slice(0, 8),
    offsets,
  );

  const week1 = cohorts.map((row) => row.retention[1]?.rate ?? 0).filter((value) => value > 0);
  return {
    cohorts,
    offsets,
    averageWeek1: week1.length ? week1.reduce((a, b) => a + b, 0) / week1.length : 0,
  };
}

/** Product usage counted in SQL rather than by loading every event row. */
export async function productAnalytics(limit = 12) {
  const events = await db.execute<{ name: string; n: string; actors: string }>(sql`
    SELECT name, count(*)::text AS n, count(DISTINCT actor_id)::text AS actors
    FROM analytics_events GROUP BY name ORDER BY count(*) DESC LIMIT ${limit}
  `);
  const [tutor] = (
    await db.execute<{ sessions: string; avg_score: string; turns: string }>(sql`
      SELECT count(*)::text AS sessions,
        COALESCE(ROUND(AVG(score)), 0)::text AS avg_score,
        COALESCE(SUM(turns), 0)::text AS turns
      FROM tutor_sessions
    `)
  ).rows;
  const [search] = (
    await db.execute<{ searches: string; zero: string; avg_ms: string }>(sql`
      SELECT count(*)::text AS searches,
        count(*) FILTER (WHERE hits = 0)::text AS zero,
        COALESCE(ROUND(AVG(took_ms)), 0)::text AS avg_ms
      FROM search_queries
    `)
  ).rows;

  return {
    events: events.rows.map((row) => ({
      name: row.name,
      count: Number(row.n),
      actors: Number(row.actors),
    })),
    tutor: {
      sessions: Number(tutor?.sessions ?? 0),
      avgScore: Number(tutor?.avg_score ?? 0),
      turns: Number(tutor?.turns ?? 0),
    },
    search: {
      searches: Number(search?.searches ?? 0),
      zeroResults: Number(search?.zero ?? 0),
      zeroRate: ratio(Number(search?.zero ?? 0), Number(search?.searches ?? 0)),
      avgMs: Number(search?.avg_ms ?? 0),
    },
  };
}

export async function analyticsOverview() {
  const [learning, revenue, funnel, retention, product] = await Promise.all([
    learningAnalytics(30),
    revenueAnalytics(),
    funnelAnalytics(),
    retentionAnalytics(6),
    productAnalytics(),
  ]);
  return { learning, revenue, funnel, retention, product, generatedAt: new Date().toISOString() };
}
