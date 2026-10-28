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
import { requireOwner } from "@/lib/auth/serviceIdentity";

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

/* ============================================================
 * PHASE 26A — deduplication is per user
 *
 * `dedupe_key` alone is no longer unique (see schema.ts): keys such as
 * `content.read:<sourceId>` and `knowledge:<cardId>` are identical for every
 * learner studying the same item, so a global unique key let the first writer
 * suppress — and disclose — everyone else's award.
 *
 * The UNIQUE index is now `(user_id, dedupe_key)`, and this helper recognizes
 * ONLY that rule as a dedupe collision. Matching the driver's message text is
 * not enough (Drizzle wraps it: the wrapper reads "Failed query: …"), and
 * matching every 23505 is too much (a primary-key or unrelated unique
 * violation must surface as a failure, never as a harmless duplicate).
 * ============================================================ */

/** Bounded walk of the `cause` chain Drizzle adds around driver errors. */
const MAX_CAUSE_DEPTH = 3;

interface ViolationFacts {
  /** SQLSTATE 23505 seen anywhere in the chain. */
  unique: boolean;
  /** Constraint / index names reported by the driver. */
  constraints: string[];
  /** Innermost driver message (never the Drizzle wrapper, which embeds SQL). */
  innermostMessage: string;
}

function violationFacts(error: unknown): ViolationFacts {
  const facts: ViolationFacts = { unique: false, constraints: [], innermostMessage: "" };
  let current: unknown = error;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== "object" || current === null) break;
    const candidate = current as {
      code?: unknown;
      constraint?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (candidate.code === "23505") facts.unique = true;
    if (typeof candidate.constraint === "string" && candidate.constraint !== "") {
      facts.constraints.push(candidate.constraint);
    }
    if (typeof candidate.message === "string") facts.innermostMessage = candidate.message;
    current = candidate.cause;
  }
  return facts;
}

/** Does this name identify the per-user dedupe rule? */
const DEDUPE_RULE_NAME = /dedupe/i;

/** `(dedupe_key)` scope, or `(user_id, dedupe_key)` when a user is supplied. */
function scopeToKey(dedupeKey: string, userId?: string) {
  return userId === undefined
    ? eq(eventsTable.dedupeKey, dedupeKey)
    : and(eq(eventsTable.dedupeKey, dedupeKey), eq(eventsTable.userId, userId));
}

/**
 * True only for a violation of the per-user dedupe index. Exported for
 * focused classification tests; the award path uses it directly.
 */
export function isDedupeCollision(error: unknown): boolean {
  const facts = violationFacts(error);
  if (!facts.unique) return false;

  // Constraint/index metadata is authoritative when the driver provides it.
  // Deliberately NOT the message: Drizzle's wrapper embeds the whole statement,
  // so every insert on this table mentions "dedupe_key" and message matching
  // would swallow unrelated violations as duplicates.
  if (facts.constraints.length > 0) {
    return facts.constraints.some((name) => DEDUPE_RULE_NAME.test(name));
  }

  // Fallback for drivers that expose no constraint name: judge the innermost
  // driver message only, never the wrapper.
  return DEDUPE_RULE_NAME.test(facts.innermostMessage);
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
    /*
     * Phase 26F-E3 — the owner is required and must not be the shared sentinel.
     *
     * This read `payload.userId || "anonymous-user"`, so a call with a missing,
     * empty or sentinel-valued id booked the award against the shared legacy
     * account. `awardSafe` converts this throw into `null`, which its callers
     * already treat as "no award this time" — so a misattributed award is now a
     * *missing* award (fail closed) instead of a cross-learner write.
     */
    const userId = requireOwner(payload.userId, "XpService.award");

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

    /* ---- Fast-path duplicate check (the UNIQUE index is the real guard) ----
     * Scoped to THIS user (Phase 26A): another learner's event with the same
     * key is not a duplicate, and its id must never reach this caller. */
    if (dedupeKey) {
      const [existing] = await db
        .select({ id: eventsTable.id, points: eventsTable.points })
        .from(eventsTable)
        .where(and(eq(eventsTable.dedupeKey, dedupeKey), eq(eventsTable.userId, userId)))
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
      // The UNIQUE (user_id, dedupe_key) index is the authoritative guard — a
      // race that loses here is a duplicate OF THIS USER, not a failure. The
      // classification is structural (SQLSTATE 23505 + the dedupe rule's name),
      // never a substring of the driver's prose, so an unrelated unique
      // violation is re-thrown instead of being reported as a duplicate.
      if (isDedupeCollision(error)) {
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
   * Owner (`xp_events.user_id`) of the caller's own event carrying `dedupeKey`,
   * or null when the caller holds no such event. Read-only, single column.
   *
   * Phase 26F-E3: the owner is REQUIRED. Previously `userId` was optional and
   * omitting it silently produced a cross-learner scan, so a caller that forgot
   * the argument got somebody else's row back. The two modes are now two
   * methods with different names, because they answer different questions:
   *
   *   - `findEventOwner(key, actorUserId)` — "does the CALLER own this key?"
   *     This is the only variant an authorization decision may use.
   *   - `findEventOwnerUnscoped(key)` — "does ANYONE own this key?" Used solely
   *     to tell "nobody has it" from "somebody else has it", and it must never
   *     be rendered to a client: returning the id would name another learner.
   */
  static async findEventOwner(
    dedupeKey: string,
    actorUserId: string
  ): Promise<string | null> {
    const owner = requireOwner(actorUserId, "XpService.findEventOwner");
    const [row] = await db
      .select({ userId: eventsTable.userId })
      .from(eventsTable)
      .where(scopeToKey(dedupeKey, owner))
      .limit(1);
    return row?.userId ?? null;
  }

  /**
   * Existence probe across every learner's ledger.
   *
   * Phase 26F-E3: this is the old unscoped behaviour, kept under a name that
   * says out loud that it is not an ownership check. It exists for one caller —
   * `DELETE /api/xp`, which must answer 403 (not 200 `revoked:false`) when a
   * key belongs to another learner — and its result is compared to `null`, never
   * returned, logged, or put in a response body.
   */
  static async findEventOwnerUnscoped(dedupeKey: string): Promise<string | null> {
    const [row] = await db
      .select({ userId: eventsTable.userId })
      .from(eventsTable)
      .where(scopeToKey(dedupeKey, undefined))
      .limit(1);
    return row?.userId ?? null;
  }

  /**
   * Mark an award revoked, scoped to one learner.
   *
   * Phase 26F-E3: `ownerUserId` is REQUIRED and passed by name, so it cannot be
   * omitted or swapped positionally (three adjacent string parameters would
   * compile whatever the caller meant). It used to be a trailing optional third
   * argument; omitting it revoked the key across every learner holding it —
   * the in-domain caller (`sessionService`, undoing a review) relied on that
   * "the key embeds a unique review id" argument rather than on a predicate.
   * A revoke is now always narrowed to a named owner, and that owner is
   * validated before the UPDATE is issued.
   */
  static async revokeByDedupeKey(input: {
    dedupeKey: string;
    ownerUserId: string;
    reason?: string;
  }): Promise<{ revoked: boolean; points: number }> {
    const { dedupeKey } = input;
    const reason = input.reason ?? "source-action-undone";
    const owner = requireOwner(input.ownerUserId, "XpService.revokeByDedupeKey");
    const [row] = await db
      .update(eventsTable)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where(and(scopeToKey(dedupeKey, owner), isNull(eventsTable.revokedAt)))
      .returning();

    return { revoked: Boolean(row), points: row?.points ?? 0 };
  }

  /* ============================================================
   * DERIVED TOTALS — always summed from the ledger
   * ============================================================ */
  /**
   * Phase 26F-E3: the owner is REQUIRED. The previous `= "anonymous-user"`
   * default answered an omitted id with the shared legacy account's total — a
   * wrong answer that looked like a right one.
   */
  static async getTotalXp(userId: string): Promise<number> {
    const owner = requireOwner(userId, "XpService.getTotalXp");
    const [row] = await db
      .select({ total: sql<number>`cast(coalesce(sum(${eventsTable.points}), 0) as int)` })
      .from(eventsTable)
      .where(and(eq(eventsTable.userId, owner), isNull(eventsTable.revokedAt)));
    return row?.total ?? 0;
  }

  static async getLevel(userId: string): Promise<LevelInfo> {
    return levelForXp(await this.getTotalXp(requireOwner(userId, "XpService.getLevel")));
  }

  /* ============================================================
   * SUMMARY — everything the dashboard needs, all derived
   * ============================================================ */
  /**
   * Phase 26F-E3: the owner is REQUIRED and validated before `syncRegistry()`
   * or any read runs. The old `= "anonymous-user"` default summarised the
   * shared legacy account for a caller that passed no id.
   */
  static async getSummary(userId: string, historyDays = 14): Promise<XpSummary> {
    const owner = requireOwner(userId, "XpService.getSummary");
    await this.syncRegistry();

    const day = await this.dayWindow(owner);
    const offset = Math.round(day.offsetMinutes);
    const shift = sql.raw(`interval '${offset} minutes'`);

    const [totalRow] = await db
      .select({
        total: sql<number>`cast(coalesce(sum(${eventsTable.points}), 0) as int)`,
        events: sql<number>`cast(count(*) as int)`,
      })
      .from(eventsTable)
      .where(and(eq(eventsTable.userId, owner), isNull(eventsTable.revokedAt)));

    const [revokedRow] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(eventsTable)
      .where(and(eq(eventsTable.userId, owner), sql`${eventsTable.revokedAt} is not null`));

    const [todayRow] = await db
      .select({ total: sql<number>`cast(coalesce(sum(${eventsTable.points}), 0) as int)` })
      .from(eventsTable)
      .where(
        and(
          eq(eventsTable.userId, owner),
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
          eq(eventsTable.userId, owner),
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
      .where(and(eq(eventsTable.userId, owner), isNull(eventsTable.revokedAt)))
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
          eq(eventsTable.userId, owner),
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
      .where(eq(eventsTable.userId, owner))
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
      const used = await this.awardedTodayByRule(owner, d.key);
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
      userId: owner,
      totalXp,
      level: levelForXp(totalXp),
      todayXp: todayRow?.total ?? 0,
      weekXp: weekRow?.total ?? 0,
      totalEvents: totalRow?.events ?? 0,
      revokedEvents: revokedRow?.count ?? 0,
      currentStreakDays: await this.currentStreak(owner),
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
    /* Phase 26F-E3: required — the ledger is one learner's, never a shared one. */
    userId: string;
    limit?: number;
    offset?: number;
    eventType?: string;
  }): Promise<{ entries: XpLedgerEntry[]; total: number }> {
    const userId = requireOwner(params.userId, "XpService.getLedger");
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
  static async awardDailyStreak(userId: string): Promise<XpAwardResult | null> {
    const owner = requireOwner(userId, "XpService.awardDailyStreak");
    const day = await this.dayWindow(owner);
    const streak = await this.currentStreak(owner);
    if (streak <= 0) return null;

    return this.awardSafe({
      payload: {
        eventType: "streak.day_completed",
        userId: owner,
        sourceType: "streak",
        sourceId: day.localDate,
        streakDays: streak,
      },
      dedupeKey: `streak:${owner}:${day.localDate}`,
    });
  }
}
