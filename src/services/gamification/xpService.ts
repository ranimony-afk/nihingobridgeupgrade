import { db } from "@/db";
import {
  xpEvents as eventsTable,
  xpRules as rulesTable,
  srsReviews as reviewsTable,
} from "@/db/schema";
import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import {
  LevelInfo,
  XpAwardResult,
  XpBreakdownLine,
  XpDailyPoint,
  XpEventPayload,
  XpEventType,
  XpLedgerEntry,
  XpRuleDescriptor,
  XpSourceBreakdown,
  XpSummary,
} from "@/types/gamification";
import {
  assertRulesWellFormed,
  describeRule,
  getRule,
  getRuleForEvent,
  levelForXp,
  listRules,
  resolveParams,
  XP_RULE_COUNT,
} from "./xpRegistry";
import { DailyQueueService, resolveDayWindow } from "@/services/srs/dailyQueueService";
import { logOperationFailure } from "@/lib/logging/safeDiagnostics";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_MS = 86_400_000;

/** The subset of `xp_rules` that mirrors the code registry. */
type StoredRuleMirror = {
  version: string;
  eventType: string;
  name: string;
  description: string;
  basePoints: number;
  dailyCap: number;
  defaultParams: Record<string, unknown>;
};

/**
 * Order-insensitive JSON, so a `jsonb` round-trip is never mistaken for drift
 * and a drifted row is never mistaken for a match.
 */
function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`);
  return `{${entries.join(",")}}`;
}

/**
 * True when the stored mirror row already carries the registry's metadata.
 *
 * `isActive` is deliberately excluded: the insert path sets it to true, but the
 * conflict path has never reactivated a manually deactivated rule. Ignoring it
 * keeps that behaviour exactly as it was.
 */
function ruleMirrorMatches(stored: StoredRuleMirror | undefined, descriptor: XpRuleDescriptor): boolean {
  if (!stored) return false;
  return (
    stored.version === descriptor.version &&
    stored.eventType === descriptor.eventType &&
    stored.name === descriptor.name &&
    stored.description === descriptor.description &&
    Number(stored.basePoints) === Number(descriptor.basePoints) &&
    Number(stored.dailyCap) === Number(descriptor.dailyCap) &&
    stableJson(stored.defaultParams) === stableJson(descriptor.defaultParams)
  );
}

export class XpService {
  /* ============================================================
   * REGISTRY SYNC — DB mirrors code metadata for audit only.
   * ============================================================ */
  /**
   * Mirror the code rule registry into `xp_rules`.
   *
   * Maintenance work, but reached from read paths (`GET /api/xp` through
   * `getSummary`, `GET /api/analytics` through `ensureInitialized`). A blanket
   * upsert therefore made an unauthenticated GET rewrite every rule row and
   * refresh every `synced_at`. Compare first and write only the rows that are
   * missing or drifted: the mirror still self-heals, but a read on an
   * already-correct database issues no writes at all.
   */
  static async syncRegistry(): Promise<number> {
    assertRulesWellFormed();

    const descriptors = listRules();
    const stored = await db
      .select({
        key: rulesTable.key,
        version: rulesTable.version,
        eventType: rulesTable.eventType,
        name: rulesTable.name,
        description: rulesTable.description,
        basePoints: rulesTable.basePoints,
        dailyCap: rulesTable.dailyCap,
        defaultParams: rulesTable.defaultParams,
      })
      .from(rulesTable);
    const storedByKey = new Map(stored.map((row) => [row.key, row]));

    const stale = descriptors.filter(
      (descriptor) => !ruleMirrorMatches(storedByKey.get(descriptor.key), descriptor)
    );
    if (stale.length === 0) return XP_RULE_COUNT;

    for (const d of stale) {
      await db
        .insert(rulesTable)
        .values({
          key: d.key,
          version: d.version,
          eventType: d.eventType,
          name: d.name,
          description: d.description,
          basePoints: d.basePoints,
          dailyCap: d.dailyCap,
          defaultParams: d.defaultParams as Record<string, unknown>,
          isActive: true,
          syncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: rulesTable.key,
          set: {
            version: d.version,
            eventType: d.eventType,
            name: d.name,
            description: d.description,
            basePoints: d.basePoints,
            dailyCap: d.dailyCap,
            defaultParams: d.defaultParams as Record<string, unknown>,
            syncedAt: new Date(),
          },
        });
    }
    return XP_RULE_COUNT;
  }

  /* ============================================================
   * DAY WINDOW — reuse the learner's configured timezone + cutoff
   * so XP "today" matches the Phase 11.3 daily queue exactly.
   * ============================================================ */
  private static async dayWindow(userId: string) {
    const settings = await DailyQueueService.getSettings(userId);
    return resolveDayWindow(new Date(), settings.timezone, settings.dayCutoffHour);
  }

  /** XP already granted by one rule inside today's window (cap enforcement). */
  private static async awardedTodayByRule(userId: string, ruleKey: string): Promise<number> {
    const day = await this.dayWindow(userId);
    const [row] = await db
      .select({ total: sql<number>`cast(coalesce(sum(${eventsTable.points}), 0) as int)` })
      .from(eventsTable)
      .where(
        and(
          eq(eventsTable.userId, userId),
          eq(eventsTable.ruleKey, ruleKey),
          isNull(eventsTable.revokedAt),
          gte(eventsTable.occurredAt, new Date(day.start)),
          lt(eventsTable.occurredAt, new Date(day.end))
        )
      );
    return row?.total ?? 0;
  }

  /** Current streak, derived from the review log (matches Phase 11.3). */
  private static async currentStreak(userId: string): Promise<number> {
    const day = await this.dayWindow(userId);
    const offset = Math.round(day.offsetMinutes);

    const rows = await db
      .select({
        localDate: sql<string>`to_char((${reviewsTable.reviewedAt} + ${sql.raw(
          `interval '${offset} minutes'`
        )})::date, 'YYYY-MM-DD')`,
      })
      .from(reviewsTable)
      .where(eq(reviewsTable.userId, userId))
      .groupBy(
        sql`(${reviewsTable.reviewedAt} + ${sql.raw(`interval '${offset} minutes'`)})::date`
      );

    const active = new Set(rows.map((r) => r.localDate));
    const todayKey = new Date(new Date(day.start).getTime() + offset * 60_000)
      .toISOString()
      .slice(0, 10);

    let cursor = todayKey;
    if (!active.has(todayKey)) {
      cursor = new Date(new Date(todayKey + "T00:00:00Z").getTime() - DAY_MS)
        .toISOString()
        .slice(0, 10);
    }

    let streak = 0;
    let guard = 0;
    while (active.has(cursor) && guard < 3650) {
      streak += 1;
      cursor = new Date(new Date(cursor + "T00:00:00Z").getTime() - DAY_MS)
        .toISOString()
        .slice(0, 10);
      guard += 1;
    }
    return streak;
  }

  /* ============================================================
   * AWARD — the single entry point for granting XP
   *
   * Idempotent: `dedupeKey` is UNIQUE, so replaying the same domain
   * event (including a Phase 11.4 sync replay) is a no-op.
   * ============================================================ */
  static async award(input: {
    payload: XpEventPayload;
    dedupeKey?: string;
    params?: Record<string, unknown> | null;
  }): Promise<XpAwardResult> {
    const payload = input.payload;
    const userId = payload.userId || "anonymous-user";

    const rule = getRuleForEvent(payload.eventType);
    if (!rule) {
      return {
        awarded: false,
        duplicate: false,
        skipped: true,
        skipReason: `No XP rule registered for event "${payload.eventType}"`,
        points: 0,
        breakdown: [],
        cappedByDaily: false,
        totalXp: await this.getTotalXp(userId),
      };
    }

    const dedupeKey =
      input.dedupeKey ??
      (payload.sourceId ? `${payload.eventType}:${payload.sourceId}` : undefined);

    /* ---- Fast-path duplicate check (the UNIQUE index is the real guard) ---- */
    if (dedupeKey) {
      const [existing] = await db
        .select({ id: eventsTable.id, points: eventsTable.points })
        .from(eventsTable)
        .where(eq(eventsTable.dedupeKey, dedupeKey))
        .limit(1);

      if (existing) {
        return {
          awarded: false,
          duplicate: true,
          skipped: false,
          eventId: existing.id,
          points: 0,
          ruleKey: rule.key,
          ruleVersion: rule.version,
          breakdown: [],
          cappedByDaily: false,
          totalXp: await this.getTotalXp(userId),
        };
      }
    }

    const params = resolveParams(rule, input.params ?? null);
    const [awardedToday, streak] = await Promise.all([
      this.awardedTodayByRule(userId, rule.key),
      this.currentStreak(userId),
    ]);

    const outcome = rule.score({
      payload,
      params,
      awardedTodayByRule: awardedToday,
      currentStreakDays: streak,
    });

    const totalBefore = await this.getTotalXp(userId);

    if (outcome.skipped || outcome.points <= 0) {
      return {
        awarded: false,
        duplicate: false,
        skipped: true,
        skipReason: outcome.skipReason ?? "Rule awarded zero points",
        points: 0,
        ruleKey: rule.key,
        ruleVersion: rule.version,
        breakdown: outcome.breakdown,
        cappedByDaily: outcome.cappedByDaily,
        totalXp: totalBefore,
      };
    }

    const eventId = `xp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
      await db.insert(eventsTable).values({
        id: eventId,
        userId,
        eventType: payload.eventType,
        ruleKey: rule.key,
        ruleVersion: rule.version,
        points: outcome.points,
        basePoints: outcome.basePoints,
        multiplier: outcome.multiplier,
        dedupeKey: dedupeKey ?? null,
        sourceType: payload.sourceType ?? payload.eventType.split(".")[0],
        sourceId: payload.sourceId ?? null,
        breakdown: outcome.breakdown,
        detail: payload.detail ?? {},
        occurredAt: payload.occurredAt ? new Date(payload.occurredAt) : new Date(),
      });
    } catch (error) {
      // The UNIQUE index on dedupe_key is the authoritative guard — a race
      // that loses here is a duplicate, not a failure.
      const message = error instanceof Error ? error.message : "";
      if (message.includes("unique") || message.includes("duplicate")) {
        return {
          awarded: false,
          duplicate: true,
          skipped: false,
          points: 0,
          ruleKey: rule.key,
          ruleVersion: rule.version,
          breakdown: [],
          cappedByDaily: false,
          totalXp: totalBefore,
        };
      }
      throw error;
    }

    const totalAfter = totalBefore + outcome.points;
    const before = levelForXp(totalBefore);
    const after = levelForXp(totalAfter);

    return {
      awarded: true,
      duplicate: false,
      skipped: false,
      eventId,
      points: outcome.points,
      ruleKey: rule.key,
      ruleVersion: rule.version,
      breakdown: outcome.breakdown,
      cappedByDaily: outcome.cappedByDaily,
      levelUp:
        after.level > before.level
          ? { from: before.level, to: after.level, title: after.title }
          : null,
      totalXp: totalAfter,
    };
  }

  /**
   * Fire-and-forget award used by domain code (review grading, quiz
   * submission…). XP must never break a study action, so failures are
   * swallowed and logged.
   */
  static async awardSafe(input: {
    payload: XpEventPayload;
    dedupeKey?: string;
  }): Promise<XpAwardResult | null> {
    try {
      return await this.award(input);
    } catch (error) {
      // Non-fatal BY DESIGN: callers treat `null` as "no award this time".
      // The raw driver error must still not reach the log — it carries the
      // SQL, bound parameters and connection target.
      logOperationFailure("warn", "XpService.awardSafe", error);
      return null;
    }
  }

  /* ============================================================
   * REVOKE — used when the originating action is undone
   * ============================================================ */
  /**
   * Owner (`xp_events.user_id`) of the event carrying `dedupeKey`, or null when
   * no such event exists. Read-only, single column, single row.
   *
   * Used by `DELETE /api/xp` (Phase 25) to scope reversal to the caller's own
   * ledger rows: the route compares this value with the verified actor before
   * `revokeByDedupeKey` runs, so a foreign key is refused with zero writes.
   * `revokeByDedupeKey` itself keeps its signature and behavior, because its
   * in-domain caller (`sessionService`, undoing a review) is already acting for
   * the user that owns the row.
   */
  static async findEventOwner(dedupeKey: string): Promise<string | null> {
    const [row] = await db
      .select({ userId: eventsTable.userId })
      .from(eventsTable)
      .where(eq(eventsTable.dedupeKey, dedupeKey))
      .limit(1);
    return row?.userId ?? null;
  }

  static async revokeByDedupeKey(
    dedupeKey: string,
    reason = "source-action-undone"
  ): Promise<{ revoked: boolean; points: number }> {
    const [row] = await db
      .update(eventsTable)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where(and(eq(eventsTable.dedupeKey, dedupeKey), isNull(eventsTable.revokedAt)))
      .returning();

    return { revoked: Boolean(row), points: row?.points ?? 0 };
  }

  /* ============================================================
   * DERIVED TOTALS — always summed from the ledger
   * ============================================================ */
  static async getTotalXp(userId = "anonymous-user"): Promise<number> {
    const [row] = await db
      .select({ total: sql<number>`cast(coalesce(sum(${eventsTable.points}), 0) as int)` })
      .from(eventsTable)
      .where(and(eq(eventsTable.userId, userId), isNull(eventsTable.revokedAt)));
    return row?.total ?? 0;
  }

  static async getLevel(userId = "anonymous-user"): Promise<LevelInfo> {
    return levelForXp(await this.getTotalXp(userId));
  }

  /* ============================================================
   * SUMMARY — everything the dashboard needs, all derived
   * ============================================================ */
  static async getSummary(userId = "anonymous-user", historyDays = 14): Promise<XpSummary> {
    await this.syncRegistry();

    const day = await this.dayWindow(userId);
    const offset = Math.round(day.offsetMinutes);
    const shift = sql.raw(`interval '${offset} minutes'`);

    const [totalRow] = await db
      .select({
        total: sql<number>`cast(coalesce(sum(${eventsTable.points}), 0) as int)`,
        events: sql<number>`cast(count(*) as int)`,
      })
      .from(eventsTable)
      .where(and(eq(eventsTable.userId, userId), isNull(eventsTable.revokedAt)));

    const [revokedRow] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(eventsTable)
      .where(and(eq(eventsTable.userId, userId), sql`${eventsTable.revokedAt} is not null`));

    const [todayRow] = await db
      .select({ total: sql<number>`cast(coalesce(sum(${eventsTable.points}), 0) as int)` })
      .from(eventsTable)
      .where(
        and(
          eq(eventsTable.userId, userId),
          isNull(eventsTable.revokedAt),
          gte(eventsTable.occurredAt, new Date(day.start)),
          lt(eventsTable.occurredAt, new Date(day.end))
        )
      );

    const weekStart = new Date(new Date(day.start).getTime() - 6 * DAY_MS);
    const [weekRow] = await db
      .select({ total: sql<number>`cast(coalesce(sum(${eventsTable.points}), 0) as int)` })
      .from(eventsTable)
      .where(
        and(
          eq(eventsTable.userId, userId),
          isNull(eventsTable.revokedAt),
          gte(eventsTable.occurredAt, weekStart)
        )
      );

    const totalXp = totalRow?.total ?? 0;

    /* ---- Source breakdown ---- */
    const sourceRows = await db
      .select({
        eventType: eventsTable.eventType,
        ruleKey: eventsTable.ruleKey,
        points: sql<number>`cast(coalesce(sum(${eventsTable.points}), 0) as int)`,
        events: sql<number>`cast(count(*) as int)`,
      })
      .from(eventsTable)
      .where(and(eq(eventsTable.userId, userId), isNull(eventsTable.revokedAt)))
      .groupBy(eventsTable.eventType, eventsTable.ruleKey);

    const bySource: XpSourceBreakdown[] = sourceRows
      .map((r) => ({
        eventType: r.eventType,
        ruleKey: r.ruleKey,
        points: r.points,
        events: r.events,
        percentOfTotal: totalXp > 0 ? Math.round((r.points / totalXp) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.points - a.points);

    /* ---- Daily trend ---- */
    const trendStart = new Date(new Date(day.start).getTime() - (historyDays - 1) * DAY_MS);
    const dailyRows = await db
      .select({
        date: sql<string>`to_char((${eventsTable.occurredAt} + ${shift})::date, 'YYYY-MM-DD')`,
        points: sql<number>`cast(coalesce(sum(${eventsTable.points}), 0) as int)`,
        events: sql<number>`cast(count(*) as int)`,
      })
      .from(eventsTable)
      .where(
        and(
          eq(eventsTable.userId, userId),
          isNull(eventsTable.revokedAt),
          gte(eventsTable.occurredAt, trendStart)
        )
      )
      .groupBy(sql`(${eventsTable.occurredAt} + ${shift})::date`);

    const dailyMap = new Map(dailyRows.map((r) => [r.date, r]));
    const todayKey = new Date(new Date(day.start).getTime() + offset * 60_000)
      .toISOString()
      .slice(0, 10);

    const daily: XpDailyPoint[] = [];
    for (let i = historyDays - 1; i >= 0; i -= 1) {
      const key = new Date(new Date(todayKey + "T00:00:00Z").getTime() - i * DAY_MS)
        .toISOString()
        .slice(0, 10);
      const row = dailyMap.get(key);
      daily.push({
        date: key,
        weekday: WEEKDAYS[new Date(key + "T00:00:00Z").getUTCDay()],
        points: row?.points ?? 0,
        events: row?.events ?? 0,
      });
    }

    /* ---- Recent ledger ---- */
    const recentRows = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.userId, userId))
      .orderBy(desc(eventsTable.occurredAt))
      .limit(25);

    const recent: XpLedgerEntry[] = recentRows.map((r) => ({
      id: r.id,
      eventType: r.eventType,
      ruleKey: r.ruleKey,
      ruleVersion: r.ruleVersion,
      points: r.points,
      basePoints: r.basePoints,
      multiplier: r.multiplier,
      sourceType: r.sourceType,
      sourceId: r.sourceId,
      breakdown: r.breakdown as XpBreakdownLine[],
      revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
      revokedReason: r.revokedReason,
      occurredAt: r.occurredAt.toISOString(),
    }));

    /* ---- Daily cap usage ---- */
    const capUsage = [];
    for (const d of listRules()) {
      if (d.dailyCap <= 0) continue;
      const used = await this.awardedTodayByRule(userId, d.key);
      capUsage.push({
        ruleKey: d.key,
        name: d.name,
        dailyCap: d.dailyCap,
        usedToday: used,
        remaining: Math.max(0, d.dailyCap - used),
        isCapped: used >= d.dailyCap,
      });
    }

    return {
      userId,
      totalXp,
      level: levelForXp(totalXp),
      todayXp: todayRow?.total ?? 0,
      weekXp: weekRow?.total ?? 0,
      totalEvents: totalRow?.events ?? 0,
      revokedEvents: revokedRow?.count ?? 0,
      currentStreakDays: await this.currentStreak(userId),
      bySource,
      daily,
      recent,
      capUsage,
    };
  }

  /* ============================================================
   * LEDGER — paginated raw feed
   * ============================================================ */
  static async getLedger(params: {
    userId?: string;
    limit?: number;
    offset?: number;
    eventType?: string;
  }): Promise<{ entries: XpLedgerEntry[]; total: number }> {
    const userId = params.userId || "anonymous-user";
    const conditions = [eq(eventsTable.userId, userId)];
    if (params.eventType) conditions.push(eq(eventsTable.eventType, params.eventType));
    const where = and(...conditions);

    const [countRow] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(eventsTable)
      .where(where);

    const rows = await db
      .select()
      .from(eventsTable)
      .where(where)
      .orderBy(desc(eventsTable.occurredAt))
      .limit(params.limit ?? 50)
      .offset(params.offset ?? 0);

    return {
      entries: rows.map((r) => ({
        id: r.id,
        eventType: r.eventType,
        ruleKey: r.ruleKey,
        ruleVersion: r.ruleVersion,
        points: r.points,
        basePoints: r.basePoints,
        multiplier: r.multiplier,
        sourceType: r.sourceType,
        sourceId: r.sourceId,
        breakdown: r.breakdown as XpBreakdownLine[],
        revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
        revokedReason: r.revokedReason,
        occurredAt: r.occurredAt.toISOString(),
      })),
      total: countRow?.count ?? 0,
    };
  }

  /**
   * Award the once-per-day streak XP. Dedupe key is the local date, so
   * calling this repeatedly in a day is harmless.
   */
  static async awardDailyStreak(userId = "anonymous-user"): Promise<XpAwardResult | null> {
    const day = await this.dayWindow(userId);
    const streak = await this.currentStreak(userId);
    if (streak <= 0) return null;

    return this.awardSafe({
      payload: {
        eventType: "streak.day_completed",
        userId,
        sourceType: "streak",
        sourceId: day.localDate,
        streakDays: streak,
      },
      dedupeKey: `streak:${userId}:${day.localDate}`,
    });
  }
}
