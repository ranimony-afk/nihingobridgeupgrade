import { db } from "@/db";
import { srsUserSettings as settingsTable, srsCards as cardsTable, srsReviews as reviewsTable, srsDecks as decksTable } from "@/db/schema";
import { and, asc, eq, gte, inArray, lt, lte, ne, sql } from "drizzle-orm";
import {
  DailyBuckets,
  DailyForecastEntry,
  DailyHistoryEntry,
  DailyProgress,
  DailyQueueResponse,
  DailyRecommendation,
  DailySettings,
  DailyStreak,
  DailyTotals,
  DayWindow,
  SessionQueueOrder,
} from "@/types/srs";

export const DEFAULT_DAILY_SETTINGS: DailySettings = {
  timezone: "UTC",
  dayCutoffHour: 4,
  dailyNewTarget: 20,
  dailyReviewTarget: 200,
  maxDailyReviews: 0,
  maxDailyNew: 0,
  loadBalanceBacklog: true,
  forecastDays: 14,
};

const DAY_MS = 86_400_000;
/** Cap on card IDs embedded in a single response payload. */
const ID_SAMPLE_LIMIT = 300;

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/* ============================================================
 * TIMEZONE HELPERS
 * Resolve the learner's real local calendar day from an IANA zone,
 * then apply the "day rolls over at N o'clock" cutoff.
 * ============================================================ */
function tzOffsetMinutes(instant: Date, timeZone: string): number {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const map: Record<string, string> = {};
    for (const p of dtf.formatToParts(instant)) {
      if (p.type !== "literal") map[p.type] = p.value;
    }
    const asUTC = Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      Number(map.hour) % 24,
      Number(map.minute),
      Number(map.second)
    );
    return (asUTC - instant.getTime()) / 60_000;
  } catch {
    return 0;
  }
}

function localDateKey(shiftedUtcLabeled: Date): string {
  return shiftedUtcLabeled.toISOString().slice(0, 10);
}

/**
 * Compute the UTC instants bounding the learner's current study day.
 * A study day starts at `dayCutoffHour` local time, so a 2am session still
 * counts toward yesterday if the cutoff is 4am.
 */
export function resolveDayWindow(now: Date, timezone: string, cutoffHour: number): DayWindow {
  const offsetMinutes = tzOffsetMinutes(now, timezone || "UTC");
  // "Local wall clock" encoded in UTC getters — safe for calendar math.
  const shifted = new Date(now.getTime() + offsetMinutes * 60_000);

  let startShifted = new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
      cutoffHour,
      0,
      0,
      0
    )
  );

  // Cutoff hasn't happened yet today -> the study day began yesterday.
  if (startShifted.getTime() > shifted.getTime()) {
    startShifted = new Date(startShifted.getTime() - DAY_MS);
  }

  const endShifted = new Date(startShifted.getTime() + DAY_MS);

  return {
    start: new Date(startShifted.getTime() - offsetMinutes * 60_000).toISOString(),
    end: new Date(endShifted.getTime() - offsetMinutes * 60_000).toISOString(),
    localDate: localDateKey(startShifted),
    cutoffHour,
    timezone: timezone || "UTC",
    offsetMinutes: Math.round(offsetMinutes),
  };
}

/** Convert a UTC instant to the learner's local date key. */
/**
 * Inline tz-shift fragment. The offset is a locally computed integer, so
 * inlining is injection-safe and avoids Postgres parameter type inference
 * failures in interval arithmetic.
 */
function tzShift(offsetMinutes: number) {
  return sql.raw(`interval '${Math.round(offsetMinutes)} minutes'`);
}

function toLocalKey(instant: Date, offsetMinutes: number): string {
  return new Date(instant.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function prettyLabel(localKey: string): string {
  const [y, m, d] = localKey.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${d}`;
}

export class DailyQueueService {
  /* ============================================================
   * SETTINGS
   * ============================================================ */
  static async getSettings(userId = "anonymous-user"): Promise<DailySettings> {
    const [row] = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.userId, userId))
      .limit(1);

    if (!row) return { ...DEFAULT_DAILY_SETTINGS };

    return {
      timezone: row.timezone,
      dayCutoffHour: row.dayCutoffHour,
      dailyNewTarget: row.dailyNewTarget,
      dailyReviewTarget: row.dailyReviewTarget,
      maxDailyReviews: row.maxDailyReviews,
      maxDailyNew: row.maxDailyNew,
      loadBalanceBacklog: row.loadBalanceBacklog,
      forecastDays: row.forecastDays,
    };
  }

  static async updateSettings(
    userId: string,
    patch: Partial<DailySettings>
  ): Promise<DailySettings> {
    const current = await this.getSettings(userId);

    const next: DailySettings = {
      timezone: patch.timezone ?? current.timezone,
      dayCutoffHour: clampInt(patch.dayCutoffHour ?? current.dayCutoffHour, 0, 23, current.dayCutoffHour),
      dailyNewTarget: clampInt(patch.dailyNewTarget ?? current.dailyNewTarget, 0, 500, current.dailyNewTarget),
      dailyReviewTarget: clampInt(
        patch.dailyReviewTarget ?? current.dailyReviewTarget,
        0,
        2000,
        current.dailyReviewTarget
      ),
      maxDailyReviews: clampInt(patch.maxDailyReviews ?? current.maxDailyReviews, 0, 2000, current.maxDailyReviews),
      maxDailyNew: clampInt(patch.maxDailyNew ?? current.maxDailyNew, 0, 500, current.maxDailyNew),
      loadBalanceBacklog:
        typeof patch.loadBalanceBacklog === "boolean" ? patch.loadBalanceBacklog : current.loadBalanceBacklog,
      forecastDays: clampInt(patch.forecastDays ?? current.forecastDays, 3, 60, current.forecastDays),
    };

    await db
      .insert(settingsTable)
      .values({ userId, ...next, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: settingsTable.userId,
        set: { ...next, updatedAt: new Date() },
      });

    return next;
  }

  /* ============================================================
   * DUE BUCKETS
   * ============================================================ */
  private static async loadDeckScope(userId: string, deckId?: string | null) {
    const rows = await db.select().from(decksTable).where(eq(decksTable.ownerId, userId));
    return rows.filter((d) => !d.isArchived && (!deckId || d.id === deckId));
  }

  private static async countBucket(where: ReturnType<typeof and>) {
    const [row] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(cardsTable)
      .where(where);
    return row?.count ?? 0;
  }

  private static async loadBucketCards(
    where: ReturnType<typeof and>,
    limit = ID_SAMPLE_LIMIT
  ) {
    return db
      .select({
        id: cardsTable.id,
        front: cardsTable.front,
        dueAt: cardsTable.dueAt,
        totalReviews: cardsTable.totalReviews,
      })
      .from(cardsTable)
      .where(where)
      .orderBy(asc(cardsTable.dueAt))
      .limit(limit);
  }

  private static async buildBuckets(
    deckIds: string[],
    day: DayWindow,
    now: Date
  ): Promise<DailyBuckets> {
    const inDecks = inArray(cardsTable.deckId, deckIds);

    const [overdueRows, todayRows, laterRows, newRows] = await Promise.all([
      // Overdue: due strictly before today's cutoff, excluding learning-phase cards
      // still inside their sub-day ladder (those are handled by laterToday).
      this.loadBucketCards(
        and(
          inDecks,
          eq(cardsTable.isSuspended, false),
          lt(cardsTable.dueAt, new Date(day.start)),
          eq(cardsTable.isLearning, false)
        )
      ),
      // Due within today's window (non-learning).
      this.loadBucketCards(
        and(
          inDecks,
          eq(cardsTable.isSuspended, false),
          gte(cardsTable.dueAt, new Date(day.start)),
          lte(cardsTable.dueAt, new Date(day.end)),
          eq(cardsTable.isLearning, false)
        )
      ),
      // Learning cards maturing later today (minute-scale ladder steps).
      this.loadBucketCards(
        and(
          inDecks,
          eq(cardsTable.isSuspended, false),
          gte(cardsTable.dueAt, now),
          lte(cardsTable.dueAt, new Date(day.end)),
          eq(cardsTable.isLearning, true)
        )
      ),
      // New cards: never reviewed.
      this.loadBucketCards(
        and(inDecks, eq(cardsTable.isSuspended, false), eq(cardsTable.totalReviews, 0))
      ),
    ]);

    const oldestOverdueMs =
      overdueRows.length > 0 ? now.getTime() - new Date(overdueRows[0].dueAt).getTime() : 0;

    return {
      overdue: {
        count: overdueRows.length,
        cardIds: overdueRows.map((r) => r.id),
        oldestDays: Math.round((oldestOverdueMs / DAY_MS) * 10) / 10,
        sample: overdueRows.slice(0, 8).map((r) => r.front),
      },
      dueToday: {
        count: todayRows.length,
        cardIds: todayRows.map((r) => r.id),
        sample: todayRows.slice(0, 8).map((r) => r.front),
      },
      laterToday: {
        count: laterRows.length,
        cardIds: laterRows.map((r) => r.id),
        sample: laterRows.slice(0, 8).map((r) => r.front),
      },
      newAvailable: {
        count: newRows.length,
        cardIds: newRows.map((r) => r.id),
        sample: newRows.slice(0, 8).map((r) => r.front),
      },
      suspended: await this.countBucket(and(inDecks, eq(cardsTable.isSuspended, true))),
    };
  }

  /* ============================================================
   * PROGRESS TODAY — derived from the review log
   * ============================================================ */
  private static async buildProgress(
    userId: string,
    day: DayWindow,
    settings: DailySettings
  ): Promise<DailyProgress> {
    const [row] = await db
      .select({
        total: sql<number>`cast(count(*) as int)`,
        correct: sql<number>`cast(count(*) filter (where ${reviewsTable.wasCorrect} = true) as int)`,
        again: sql<number>`cast(count(*) filter (where ${reviewsTable.rating} = 'again') as int)`,
        timeMs: sql<number>`cast(coalesce(sum(${reviewsTable.timeSpentMs}), 0) as int)`,
        newIntroduced: sql<number>`cast(count(*) filter (where ${reviewsTable.stateBefore} ->> 'repetitions' = '0') as int)`,
      })
      .from(reviewsTable)
      .where(
        and(
          eq(reviewsTable.userId, userId),
          gte(reviewsTable.reviewedAt, new Date(day.start)),
          lt(reviewsTable.reviewedAt, new Date(day.end))
        )
      );

    const reviewsDone = row?.total ?? 0;
    const reviewsTarget = settings.dailyReviewTarget;
    const newDone = row?.newIntroduced ?? 0;

    return {
      reviewsDone,
      reviewsTarget,
      newDone,
      newTarget: settings.dailyNewTarget,
      percentComplete:
        reviewsTarget > 0 ? Math.min(100, Math.round((reviewsDone / reviewsTarget) * 100)) : 0,
      timeSpentMs: row?.timeMs ?? 0,
      accuracy: reviewsDone > 0 ? Math.round(((row?.correct ?? 0) / reviewsDone) * 1000) / 10 : 0,
      againCount: row?.again ?? 0,
      remainingToday: Math.max(0, reviewsTarget - reviewsDone),
    };
  }

  /* ============================================================
   * STREAK — fully derived, Anki-style day-cutoff aware
   * ============================================================ */
  private static async buildStreak(
    userId: string,
    day: DayWindow,
    settings: DailySettings
  ): Promise<DailyStreak> {
    const rows = await db
      .select({
        localDate: sql<string>`to_char((${reviewsTable.reviewedAt} + ${tzShift(day.offsetMinutes)})::date, 'YYYY-MM-DD')`,
        reviews: sql<number>`cast(count(*) as int)`,
      })
      .from(reviewsTable)
      .where(eq(reviewsTable.userId, userId))
      .groupBy(sql`(${reviewsTable.reviewedAt} + ${tzShift(day.offsetMinutes)})::date`);

    const activeMap = new Map(rows.map((r) => [r.localDate, r.reviews]));
    const todayKey = toLocalKey(new Date(day.start), day.offsetMinutes);

    // Walk backwards from today. If today has no activity yet, start from
    // yesterday so an unfinished day does not appear as a broken streak.
    let cursorKey = todayKey;
    if (!activeMap.has(todayKey)) {
      cursorKey = new Date(new Date(todayKey + "T00:00:00Z").getTime() - DAY_MS)
        .toISOString()
        .slice(0, 10);
    }

    let current = 0;
    let guard = 0;
    while (activeMap.has(cursorKey) && guard < 3650) {
      current += 1;
      cursorKey = new Date(new Date(cursorKey + "T00:00:00Z").getTime() - DAY_MS)
        .toISOString()
        .slice(0, 10);
      guard += 1;
    }

    // Longest streak across all recorded days.
    const sortedKeys = Array.from(activeMap.keys()).sort();
    let longest = 0;
    let run = 0;
    let prev: string | null = null;
    for (const key of sortedKeys) {
      if (prev && new Date(key + "T00:00:00Z").getTime() - new Date(prev + "T00:00:00Z").getTime() === DAY_MS) {
        run += 1;
      } else {
        run = 1;
      }
      longest = Math.max(longest, run);
      prev = key;
    }

    const lastActive = sortedKeys.length > 0 ? sortedKeys[sortedKeys.length - 1] : null;

    return {
      current,
      longest: Math.max(longest, current),
      daysActive: sortedKeys.length,
      lastActiveLocalDate: lastActive,
      isActiveToday: activeMap.has(todayKey),
    };
  }

  /* ============================================================
   * FORECAST + LOAD BALANCING
   * ============================================================ */
  private static async buildForecast(
    deckIds: string[],
    day: DayWindow,
    settings: DailySettings,
    now: Date
  ): Promise<DailyForecastEntry[]> {
    if (deckIds.length === 0) return [];

    const horizonStart = new Date(day.start);
    const horizonEnd = new Date(new Date(day.start).getTime() + settings.forecastDays * DAY_MS);

    const rows = await db
      .select({
        localDate: sql<string>`to_char((${cardsTable.dueAt} + ${tzShift(day.offsetMinutes)})::date, 'YYYY-MM-DD')`,
        count: sql<number>`cast(count(*) as int)`,
        newCount: sql<number>`cast(count(*) filter (where ${cardsTable.totalReviews} = 0) as int)`,
      })
      .from(cardsTable)
      .where(
        and(
          inArray(cardsTable.deckId, deckIds),
          eq(cardsTable.isSuspended, false),
          gte(cardsTable.dueAt, horizonStart),
          lt(cardsTable.dueAt, horizonEnd)
        )
      )
      .groupBy(sql`(${cardsTable.dueAt} + ${tzShift(day.offsetMinutes)})::date`);

    const map = new Map(rows.map((r) => [r.localDate, r]));
    const todayKey = toLocalKey(new Date(day.start), day.offsetMinutes);

    const out: DailyForecastEntry[] = [];
    for (let i = 0; i < settings.forecastDays; i += 1) {
      const key = new Date(new Date(todayKey + "T00:00:00Z").getTime() + i * DAY_MS)
        .toISOString()
        .slice(0, 10);
      const weekdayIndex = new Date(key + "T00:00:00Z").getUTCDay();
      const row = map.get(key);

      out.push({
        date: key,
        label: prettyLabel(key),
        weekday: WEEKDAYS[weekdayIndex],
        count: row?.count ?? 0,
        newCount: row?.newCount ?? 0,
        reviewCount: (row?.count ?? 0) - (row?.newCount ?? 0),
        isToday: key === todayKey,
        isOverdue: false,
        balancedCount: row?.count ?? 0,
      });
    }

    return this.applyLoadBalancing(out, settings);
  }

  /**
   * Load balancing: flatten spikes by moving surplus forward into the
   * nearest lower-load days. This is a *recommendation* that drives session
   * sizing — due dates themselves are never mutated here.
   */
  static applyLoadBalancing(
    forecast: DailyForecastEntry[],
    settings: DailySettings
  ): DailyForecastEntry[] {
    if (!settings.loadBalanceBacklog || forecast.length < 3) {
      return forecast.map((f) => ({ ...f, balancedCount: f.count }));
    }

    const out = forecast.map((f) => ({ ...f, balancedCount: f.count }));

    // Flatten toward the horizon mean. Using the raw daily target here would make
    // balancing a no-op whenever the target is generous (e.g. 200/day with 40 cards).
    const total = forecast.reduce((s, f) => s + f.count, 0);
    const mean = total / forecast.length;
    const ceiling = Math.max(1, Math.ceil(mean));

    // Noise guard: skip balancing when the worst day is not a genuine spike.
    const peak = Math.max(...out.map((f) => f.count));
    if (peak < Math.max(2, Math.ceil(mean * 1.5))) {
      return out;
    }

    // Pull surplus out of overloaded days (front to back).
    for (let i = 0; i < out.length; i += 1) {
      let surplus = out[i].balancedCount - ceiling;
      if (surplus <= 0) continue;

      for (let j = i + 1; j < out.length && surplus > 0; j += 1) {
        const capacity = Math.max(0, ceiling - out[j].balancedCount);
        if (capacity <= 0) continue;
        const moved = Math.min(capacity, surplus);
        out[j].balancedCount += moved;
        out[i].balancedCount -= moved;
        surplus -= moved;
      }

      if (surplus > 0) out[i].balancedCount -= surplus; // nothing to spill into
      out[i].balancedCount = Math.max(0, out[i].balancedCount);
    }

    return out;
  }

  /* ============================================================
   * RECOMMENDATION
   * ============================================================ */
  private static buildRecommendation(input: {
    settings: DailySettings;
    buckets: DailyBuckets;
    progress: DailyProgress;
    forecast: DailyForecastEntry[];
    streak: DailyStreak;
    now: Date;
  }): DailyRecommendation {
    const { settings, buckets, progress, forecast, streak } = input;

    const totalWorkload = buckets.overdue.count + buckets.dueToday.count;
    const backlogDays =
      settings.dailyReviewTarget > 0 && buckets.overdue.count > 0
        ? Math.ceil(buckets.overdue.count / settings.dailyReviewTarget * 10) / 10
        : 0;

    const ceiling = Math.max(
      settings.maxDailyReviews > 0 ? settings.maxDailyReviews : settings.dailyReviewTarget,
      0
    );

    const effectiveCeiling = ceiling > 0 ? ceiling : settings.dailyReviewTarget || 200;
    const suggestedReview = Math.min(totalWorkload, effectiveCeiling);
    const remainingNewBudget = Math.max(0, settings.dailyNewTarget - progress.newDone);
    const suggestedNew = Math.min(buckets.newAvailable.count, remainingNewBudget);

    let severity: DailyRecommendation["severity"] = "clear";
    let headline = "";
    let detail = "";

    if (buckets.overdue.count > 0 && buckets.overdue.count > effectiveCeiling) {
      severity = "backlog";
      headline = `Backlog of ${buckets.overdue.count} overdue cards`;
      detail =
        `That is roughly ${backlogDays} day(s) of work at your current target of ${settings.dailyReviewTarget} reviews/day. ` +
        (settings.loadBalanceBacklog
          ? `We suggest clearing ${suggestedReview} today and letting load balancing spread the rest forward.`
          : `Consider raising your daily review target or studying extra today.`);
    } else if (totalWorkload > effectiveCeiling) {
      severity = "heavy";
      headline = `Heavy day — ${totalWorkload} cards due`;
      detail =
        `Your daily limit is ${effectiveCeiling}, so ${totalWorkload - effectiveCeiling} card(s) can be spread forward to lighter days. ` +
        `We suggest ${suggestedReview} review(s) + ${suggestedNew} new card(s) now.`;
    } else if (progress.percentComplete >= 100) {
      severity = "clear";
      headline = "Daily target complete";
      detail = `You have finished ${progress.reviewsDone} reviews today (${progress.accuracy}% accuracy). Anything extra is bonus.`;
    } else if (totalWorkload === 0 && buckets.newAvailable.count === 0) {
      severity = "clear";
      headline = "Nothing due today";
      detail =
        streak.current > 0
          ? `Your ${streak.current}-day streak is safe. Next work arrives ${forecast.find((f) => f.count > 0)?.label ?? "later"}.`
          : "Review some cards to start a streak.";
    } else if (totalWorkload === 0) {
      severity = "clear";
      headline = "Only new cards available";
      detail = `${buckets.newAvailable.count} new card(s) are ready to introduce today.`;
    } else if (progress.percentComplete >= 60) {
      severity = "on-track";
      headline = `On track — ${progress.percentComplete}% of today's target`;
      detail = `${progress.remainingToday} review(s) left to hit ${settings.dailyReviewTarget}.`;
    } else {
      severity = "on-track";
      headline = `${totalWorkload} card(s) due today`;
      detail = `A session of ${suggestedReview} review(s) + ${suggestedNew} new card(s) will clear today's queue.`;
    }

    // Per-day redistribution proposal for the UI.
    const redistribution = forecast
      .filter((f) => f.balancedCount !== f.count)
      .slice(0, 8)
      .map((f) => ({ date: f.date, from: f.count, to: f.balancedCount }));

    return {
      severity,
      headline,
      detail,
      suggestedSessionSize: suggestedReview + suggestedNew,
      suggestedNew,
      suggestedReview,
      backlogDays,
      redistribution: redistribution.length > 0 ? redistribution : undefined,
    };
  }

  /* ============================================================
   * HISTORY — derived daily rollup from the review log
   * ============================================================ */
  private static async buildHistory(
    userId: string,
    day: DayWindow,
    settings: DailySettings,
    days: number
  ): Promise<DailyHistoryEntry[]> {
    const todayKey = toLocalKey(new Date(day.start), day.offsetMinutes);
    const windowStart = new Date(
      new Date(todayKey + "T00:00:00Z").getTime() - (days - 1) * DAY_MS
    );
    const windowStartUtc = new Date(windowStart.getTime() - day.offsetMinutes * 60_000);

    const rows = await db
      .select({
        localDate: sql<string>`to_char((${reviewsTable.reviewedAt} + ${tzShift(day.offsetMinutes)})::date, 'YYYY-MM-DD')`,
        reviews: sql<number>`cast(count(*) as int)`,
        correct: sql<number>`cast(count(*) filter (where ${reviewsTable.wasCorrect} = true) as int)`,
        newIntroduced: sql<number>`cast(count(*) filter (where ${reviewsTable.stateBefore} ->> 'repetitions' = '0') as int)`,
        timeMs: sql<number>`cast(coalesce(sum(${reviewsTable.timeSpentMs}), 0) as int)`,
      })
      .from(reviewsTable)
      .where(
        and(eq(reviewsTable.userId, userId), gte(reviewsTable.reviewedAt, windowStartUtc))
      )
      .groupBy(sql`(${reviewsTable.reviewedAt} + ${tzShift(day.offsetMinutes)})::date`);

    const map = new Map(rows.map((r) => [r.localDate, r]));

    const out: DailyHistoryEntry[] = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const key = new Date(new Date(todayKey + "T00:00:00Z").getTime() - i * DAY_MS)
        .toISOString()
        .slice(0, 10);
      const row = map.get(key);
      const reviews = row?.reviews ?? 0;
      const correct = row?.correct ?? 0;

      out.push({
        date: key,
        weekday: WEEKDAYS[new Date(key + "T00:00:00Z").getUTCDay()],
        reviews,
        correct,
        accuracy: reviews > 0 ? Math.round((correct / reviews) * 1000) / 10 : 0,
        newIntroduced: row?.newIntroduced ?? 0,
        timeSpentMs: row?.timeMs ?? 0,
        targetMet: settings.dailyReviewTarget > 0 && reviews >= settings.dailyReviewTarget,
      });
    }

    return out;
  }

  /* ============================================================
   * MAIN ENTRY — assemble the full daily queue view
   * ============================================================ */
  static async getDailyQueue(params: {
    userId?: string;
    deckId?: string | null;
    historyDays?: number;
  }): Promise<DailyQueueResponse> {
    const userId = params.userId || "anonymous-user";
    const settings = await this.getSettings(userId);
    const now = new Date();

    const day = resolveDayWindow(now, settings.timezone, settings.dayCutoffHour);
    const decks = await this.loadDeckScope(userId, params.deckId ?? null);
    const deckIds = decks.map((d) => d.id);

    if (deckIds.length === 0) {
      const emptyForecast: DailyForecastEntry[] = [];
      const emptyStreak: DailyStreak = {
        current: 0,
        longest: 0,
        daysActive: 0,
        lastActiveLocalDate: null,
        isActiveToday: false,
      };
      const emptyProgress: DailyProgress = {
        reviewsDone: 0,
        reviewsTarget: settings.dailyReviewTarget,
        newDone: 0,
        newTarget: settings.dailyNewTarget,
        percentComplete: 0,
        timeSpentMs: 0,
        accuracy: 0,
        againCount: 0,
        remainingToday: settings.dailyReviewTarget,
      };
      const emptyBuckets: DailyBuckets = {
        overdue: { count: 0, cardIds: [], oldestDays: 0, sample: [] },
        dueToday: { count: 0, cardIds: [], sample: [] },
        laterToday: { count: 0, cardIds: [], sample: [] },
        newAvailable: { count: 0, cardIds: [], sample: [] },
        suspended: 0,
      };
      const emptyTotals: DailyTotals = {
        totalDueToday: 0,
        totalAvailable: 0,
        learning: 0,
        review: 0,
        mature: 0,
      };

      return {
        day,
        settings,
        buckets: emptyBuckets,
        totals: emptyTotals,
        progress: emptyProgress,
        streak: emptyStreak,
        forecast: emptyForecast,
        recommendation: {
          severity: "clear",
          headline: "No decks yet",
          detail: "Create a deck to begin scheduling.",
          suggestedSessionSize: 0,
          suggestedNew: 0,
          suggestedReview: 0,
          backlogDays: 0,
        },
        history: [],
        suggestedSession: {
          deckId: null,
          newLimit: 0,
          reviewLimit: 0,
          order: "due",
          label: "Nothing to study",
          dueHorizon: "day" as const,
        },
        suggestedReview: 0,
      };
    }

    const [buckets, progress, streak, forecast] = await Promise.all([
      this.buildBuckets(deckIds, day, now),
      this.buildProgress(userId, day, settings),
      this.buildStreak(userId, day, settings),
      this.buildForecast(deckIds, day, settings, now),
    ]);

    /* ---- Portfolio maturity totals ---- */
    const [totalsRow] = await db
      .select({
        total: sql<number>`cast(count(*) as int)`,
        learning: sql<number>`cast(count(*) filter (where ${cardsTable.isLearning} = true and ${cardsTable.totalReviews} > 0) as int)`,
        review: sql<number>`cast(count(*) filter (where ${cardsTable.isLearning} = false and ${cardsTable.intervalDays} < 21) as int)`,
        mature: sql<number>`cast(count(*) filter (where ${cardsTable.isLearning} = false and ${cardsTable.intervalDays} >= 21) as int)`,
      })
      .from(cardsTable)
      .where(and(inArray(cardsTable.deckId, deckIds), eq(cardsTable.isSuspended, false)));

    const totals: DailyTotals = {
      totalDueToday: buckets.overdue.count + buckets.dueToday.count,
      totalAvailable:
        buckets.overdue.count + buckets.dueToday.count + buckets.laterToday.count + buckets.newAvailable.count,
      learning: totalsRow?.learning ?? 0,
      review: totalsRow?.review ?? 0,
      mature: totalsRow?.mature ?? 0,
    };

    const recommendation = this.buildRecommendation({
      settings,
      buckets,
      progress,
      forecast,
      streak,
      now,
    });

    const history = await this.buildHistory(
      userId,
      day,
      settings,
      params.historyDays ?? Math.max(14, settings.forecastDays)
    );

    /* ---- Ready-to-use session suggestion ---- */
    const suggestedReview = Math.max(
      0,
      Math.min(recommendation.suggestedReview, buckets.overdue.count + buckets.dueToday.count)
    );
    const suggestedNew = recommendation.suggestedNew;

    const suggestedSession = {
      deckId: params.deckId ?? null,
      newLimit: suggestedNew,
      reviewLimit: suggestedReview,
      order: (buckets.overdue.count > 0 ? "due" : "due") as SessionQueueOrder,
      /** Pull everything due within today so the session matches this count. */
      dueHorizon: "day" as const,
      label:
        buckets.overdue.count > 0
          ? `Clear backlog (${suggestedReview} review + ${suggestedNew} new)`
          : `Today's queue (${suggestedReview} review + ${suggestedNew} new)`,
    };

    return {
      day,
      settings,
      buckets,
      totals,
      progress,
      streak,
      forecast,
      recommendation,
      history,
      suggestedSession,
      suggestedReview,
    };
  }
}
