import { db } from "@/db";
import {
  srsSyncDevices as devicesTable,
  srsSyncLog as syncLogTable,
  srsReviews as reviewsTable,
  srsCards as cardsTable,
  srsDecks as decksTable,
} from "@/db/schema";
import { and, asc, desc, eq, gt, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import {
  SyncCardDelta,
  SyncDevice,
  SyncLogEntry,
  SyncPerCardOutcome,
  SyncPlatform,
  SyncPullResult,
  SyncPushPayload,
  SyncPushResult,
  SyncRegistryStatus,
  SyncReviewDelta,
  SyncReviewEvent,
  SyncStatusResponse,
  SrsCardState,
  SrsDeck,
  SrsPhase,
  SrsRating,
  SRS_RATINGS,
  SchedulerParams,
} from "@/types/srs";
import { SrsService } from "./srsService";
import { getScheduler, listSchedulers, resolveParams } from "./scheduler";
import { describeInterval } from "./strategies/shared";

type CardRow = typeof cardsTable.$inferSelect;
type DeckRow = typeof decksTable.$inferSelect;

const SYNC_PAGE_LIMIT = 500;

/** Fields compared when deciding whether a device's view has diverged. */
const COMPARED_STATE_KEYS: Array<keyof SrsCardState> = [
  "repetitions",
  "easeFactor",
  "intervalDays",
  "lapses",
  "box",
  "stabilityDays",
  "difficulty",
  "stepIndex",
  "isLearning",
];

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/* ============================================================
 * REGISTRY FINGERPRINT
 * A cheap, stable hash of which algorithms exist and at which
 * versions. Devices compare this to know whether their local
 * scheduler code is out of date.
 * ============================================================ */
export function computeRegistryFingerprint(): string {
  const schedulers = listSchedulers();
  const canonical = schedulers
    .map((s) => `${s.key}@${s.version}:${Object.keys(s.defaultParams).sort().join(",")}`)
    .sort()
    .join("|");

  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < canonical.length; i += 1) {
    const c = canonical.charCodeAt(i);
    h1 = (h1 ^ c) * 16777619;
    h2 = (h2 + c * (i + 1)) >>> 0;
  }
  const a = (h1 >>> 0).toString(36);
  const b = (h2 >>> 0).toString(36);
  return `reg-${a}${b}-${schedulers.length}`;
}

export function getRegistryStatus(acknowledged?: string | null): SyncRegistryStatus {
  const schedulers = listSchedulers();
  const fingerprint = computeRegistryFingerprint();
  const versions: Record<string, string> = {};
  for (const s of schedulers) versions[s.key] = s.version;

  return {
    fingerprint,
    schedulerKeys: schedulers.map((s) => s.key),
    versions,
    pluginCount: schedulers.length,
    deviceIsStale: Boolean(acknowledged) && acknowledged !== fingerprint,
  };
}

function rowToDevice(row: typeof devicesTable.$inferSelect): SyncDevice {
  return {
    id: row.id,
    userId: row.userId,
    deviceId: row.deviceId,
    name: row.name,
    platform: row.platform as SyncPlatform,
    appVersion: row.appVersion,
    lastPulledAt: row.lastPulledAt ? row.lastPulledAt.toISOString() : null,
    lastPushedAt: row.lastPushedAt ? row.lastPushedAt.toISOString() : null,
    lastRegistryFingerprint: row.lastRegistryFingerprint,
    isRevoked: row.isRevoked,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
  };
}

export class SyncService {
  /* ============================================================
   * DEVICE REGISTRATION
   * Idempotent on (userId, deviceId).
   * ============================================================ */
  static async registerDevice(input: {
    userId?: string;
    deviceId: string;
    name?: string;
    platform?: SyncPlatform;
    appVersion?: string;
  }): Promise<{ device: SyncDevice; created: boolean }> {
    const userId = input.userId || "anonymous-user";

    const [existing] = await db
      .select()
      .from(devicesTable)
      .where(and(eq(devicesTable.userId, userId), eq(devicesTable.deviceId, input.deviceId)))
      .limit(1);

    if (existing) {
      const [row] = await db
        .update(devicesTable)
        .set({
          name: input.name || existing.name,
          platform: input.platform || existing.platform,
          appVersion: input.appVersion || existing.appVersion,
          isRevoked: false,
          lastSeenAt: new Date(),
        })
        .where(eq(devicesTable.id, existing.id))
        .returning();

      await this.writeLog({
        deviceId: input.deviceId,
        userId,
        operation: "register",
        status: "ok",
        message: `Device re-registered (${row?.platform})`,
      });

      return { device: rowToDevice(row!), created: false };
    }

    const [row] = await db
      .insert(devicesTable)
      .values({
        id: `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userId,
        deviceId: input.deviceId,
        name: input.name || "Unnamed device",
        platform: input.platform || "web",
        appVersion: input.appVersion || "unknown",
      })
      .returning();

    await this.writeLog({
      deviceId: input.deviceId,
      userId,
      operation: "register",
      status: "ok",
      message: `Device registered (${row.platform})`,
    });

    return { device: rowToDevice(row), created: true };
  }

  private static async requireDevice(userId: string, deviceId: string) {
    const [row] = await db
      .select()
      .from(devicesTable)
      .where(and(eq(devicesTable.userId, userId), eq(devicesTable.deviceId, deviceId)))
      .limit(1);

    if (!row) {
      // Auto-register on first contact so a fresh install can sync immediately.
      const { device } = await this.registerDevice({ userId, deviceId });
      return device;
    }
    if (row.isRevoked) {
      throw new Error("Device has been revoked and can no longer synchronize");
    }
    return rowToDevice(row);
  }

  private static async writeLog(input: {
    deviceId: string;
    userId: string;
    operation: string;
    status?: string;
    accepted?: number;
    duplicatesSkipped?: number;
    conflictsResolved?: number;
    cardsTouched?: number;
    payloadCount?: number;
    cursorBefore?: string | null;
    cursorAfter?: string | null;
    registryFingerprint?: string | null;
    detail?: Record<string, unknown>;
    message?: string;
  }): Promise<string> {
    const id = `slog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await db.insert(syncLogTable).values({
      id,
      deviceId: input.deviceId,
      userId: input.userId,
      operation: input.operation,
      status: input.status || "ok",
      accepted: input.accepted ?? 0,
      duplicatesSkipped: input.duplicatesSkipped ?? 0,
      conflictsResolved: input.conflictsResolved ?? 0,
      cardsTouched: input.cardsTouched ?? 0,
      payloadCount: input.payloadCount ?? 0,
      cursorBefore: input.cursorBefore ?? null,
      cursorAfter: input.cursorAfter ?? null,
      registryFingerprint: input.registryFingerprint ?? null,
      detail: input.detail ?? {},
      message: input.message ?? "",
    });
    return id;
  }

  /* ============================================================
   * PUSH — idempotent replay of device review events
   *
   * Synchronization is EVENT-BASED REPLAY, never state overwrite.
   * Overwriting card state would clobber server truth and silently
   * bypass the registered scheduler. Instead each event is passed
   * through the card's own algorithm, and the card is written once.
   * ============================================================ */
  static async push(payload: SyncPushPayload): Promise<SyncPushResult> {
    await SrsService.ensureSeeded();

    const userId = "anonymous-user";
    const device = await this.requireDevice(userId, payload.deviceId);

    if (payload.deviceName || payload.platform || payload.appVersion) {
      await db
        .update(devicesTable)
        .set({
          name: payload.deviceName || device.name,
          platform: payload.platform || device.platform,
          appVersion: payload.appVersion || device.appVersion,
          lastSeenAt: new Date(),
        })
        .where(eq(devicesTable.id, device.id));
    }

    const events = Array.isArray(payload.events) ? payload.events : [];
    const registry = getRegistryStatus(device.lastRegistryFingerprint);

    if (events.length === 0) {
      const logId = await this.writeLog({
        deviceId: device.deviceId,
        userId,
        operation: "push",
        status: "ok",
        registryFingerprint: registry.fingerprint,
        message: "Empty push — nothing to apply",
      });
      return {
        logId,
        deviceId: device.deviceId,
        accepted: 0,
        duplicatesSkipped: 0,
        conflictsResolved: 0,
        cardsTouched: 0,
        perCard: [],
        cursor: new Date().toISOString(),
        serverTime: new Date().toISOString(),
      };
    }

    /* ---- Group events per card, preserving device order ---- */
    const byCard = new Map<string, SyncReviewEvent[]>();
    for (const ev of events) {
      if (!ev?.cardId || !SRS_RATINGS.includes(ev.rating)) continue;
      const list = byCard.get(ev.cardId) ?? [];
      list.push(ev);
      byCard.set(ev.cardId, list);
    }

    const cardIds = Array.from(byCard.keys());
    const cardRows = cardIds.length
      ? await db.select().from(cardsTable).where(inArray(cardsTable.id, cardIds))
      : [];
    const cardMap = new Map(cardRows.map((c) => [c.id, c]));

    const deckRows = await db.select().from(decksTable);
    const deckMap = new Map(deckRows.map((d) => [d.id, d]));

    /* ---- Idempotency: which clientIds already exist? ---- */
    const clientIds = events.map((e) => e.clientId).filter(Boolean);
    const existingClientIds = new Set<string>();
    if (clientIds.length > 0) {
      const found = await db
        .select({ clientId: reviewsTable.clientId })
        .from(reviewsTable)
        .where(inArray(reviewsTable.clientId, clientIds));
      for (const f of found) if (f.clientId) existingClientIds.add(f.clientId);
    }

    let acceptedTotal = 0;
    let duplicatesTotal = 0;
    let conflictsTotal = 0;
    const perCard: SyncPerCardOutcome[] = [];

    for (const cardId of cardIds) {
      const cardRow = cardMap.get(cardId);
      if (!cardRow) {
        perCard.push({
          cardId,
          front: "(unknown card)",
          accepted: 0,
          duplicatesSkipped: byCard.get(cardId)!.length,
          conflict: false,
          schedulerKey: "n/a",
          schedulerVersion: "-",
          finalIntervalDays: 0,
          finalIntervalLabel: "n/a",
          dueAt: new Date().toISOString(),
          explanation: "Card not found on server; event dropped.",
        });
        duplicatesTotal += byCard.get(cardId)!.length;
        continue;
      }

      const deck = deckMap.get(cardRow.deckId);
      const scheduler = getScheduler(deck?.schedulerKey || cardRow.schedulerKey);
      const params = resolveParams(scheduler, (deck?.schedulerParams ?? {}) as SchedulerParams);

      /* Sort the card's events chronologically (device timestamps win). */
      const cardEvents = [...byCard.get(cardId)!].sort((a, b) => {
        const ta = new Date(a.reviewedAt).getTime() || 0;
        const tb = new Date(b.reviewedAt).getTime() || 0;
        if (ta !== tb) return ta - tb;
        return a.clientId < b.clientId ? -1 : 1;
      });

      const fresh = cardEvents.filter((e) => !existingClientIds.has(e.clientId));
      const skipped = cardEvents.length - fresh.length;
      duplicatesTotal += skipped;

      if (fresh.length === 0) {
        perCard.push({
          cardId,
          front: cardRow.front,
          accepted: 0,
          duplicatesSkipped: skipped,
          conflict: false,
          schedulerKey: scheduler.key,
          schedulerVersion: scheduler.version,
          finalIntervalDays: cardRow.intervalDays,
          finalIntervalLabel: describeInterval(cardRow.intervalDays),
          dueAt: cardRow.dueAt.toISOString(),
          explanation: "All events already applied (idempotent replay).",
        });
        continue;
      }

      /* ---- Conflict detection ----
       * If the device recorded what it believed state_before to be and that
       * differs from the server's CURRENT state, the two histories diverged
       * (e.g. the card was graded on two devices offline).
       *
       * Resolution rule (deterministic): rewind the card to the EARLIEST
       * device-recorded state_before in this batch, then replay every event in
       * order. The device event stream wins for that card; no state is blindly
       * overwritten because every step still passes through the scheduler.
       */
      let replayFrom: CardRow = cardRow;
      let hadConflict = false;

      const firstWithSnapshot = fresh.find((e) => e.stateBefore);
      if (firstWithSnapshot?.stateBefore) {
        const sb = firstWithSnapshot.stateBefore as Partial<SrsCardState>;
        const differs = COMPARED_STATE_KEYS.some((k) => {
          const incoming = sb[k];
          if (incoming === undefined) return false;
          const current = cardRow[k as keyof CardRow];
          if (typeof incoming === "boolean") return Boolean(current) !== incoming;
          return Number(incoming) !== Number(current);
        });

        if (differs) {
          hadConflict = true;
          conflictsTotal += 1;
          replayFrom = {
            ...cardRow,
            repetitions: clampInt(sb.repetitions, 0, 100000, cardRow.repetitions),
            easeFactor: Number.isFinite(Number(sb.easeFactor)) ? Number(sb.easeFactor) : cardRow.easeFactor,
            intervalDays: Number.isFinite(Number(sb.intervalDays)) ? Number(sb.intervalDays) : cardRow.intervalDays,
            lapses: clampInt(sb.lapses, 0, 100000, cardRow.lapses),
            box: clampInt(sb.box, 0, 1000, cardRow.box),
            stabilityDays: Number.isFinite(Number(sb.stabilityDays)) ? Number(sb.stabilityDays) : cardRow.stabilityDays,
            difficulty: Number.isFinite(Number(sb.difficulty)) ? Number(sb.difficulty) : cardRow.difficulty,
            stepIndex: clampInt(sb.stepIndex, 0, 100, cardRow.stepIndex),
            isLearning: typeof sb.isLearning === "boolean" ? sb.isLearning : cardRow.isLearning,
            phase: (sb.phase as SrsPhase) || cardRow.phase,
            totalReviews: clampInt(sb.totalReviews, 0, 1000000, cardRow.totalReviews),
            correctReviews: clampInt(sb.correctReviews, 0, 1000000, cardRow.correctReviews),
          };
        }
      }

      /* ---- Replay through the registered scheduler ---- */
      let state: SrsCardState = {
        repetitions: replayFrom.repetitions,
        easeFactor: replayFrom.easeFactor,
        intervalDays: replayFrom.intervalDays,
        lapses: replayFrom.lapses,
        box: replayFrom.box,
        stabilityDays: replayFrom.stabilityDays,
        difficulty: replayFrom.difficulty,
        stepIndex: replayFrom.stepIndex,
        isLearning: replayFrom.isLearning,
        phase: replayFrom.phase as SrsPhase,
        lastReviewedAt: replayFrom.lastReviewedAt,
        dueAt: replayFrom.dueAt,
        totalReviews: replayFrom.totalReviews,
        correctReviews: replayFrom.correctReviews,
      };

      let firstExplanation = "";
      let lastOutcome = state;

      for (const ev of fresh) {
        const now = new Date(ev.reviewedAt);
        const outcome = scheduler.review({
          state,
          rating: ev.rating,
          now,
          params,
          historyCount: state.totalReviews,
        });

        if (!firstExplanation) firstExplanation = outcome.explanation;

        /* Audit row per applied event, attributed to the device. */
        await db.insert(reviewsTable).values({
          id: `rev-sync-${ev.clientId}`,
          cardId,
          deckId: cardRow.deckId,
          userId: cardRow.userId,
          rating: ev.rating,
          wasCorrect: outcome.wasCorrect,
          timeSpentMs: clampInt(ev.timeSpentMs, 0, 3600000, 0),
          intervalDays: outcome.intervalDays,
          previousIntervalDays: state.intervalDays,
          dueAt: outcome.dueAt,
          schedulerKey: scheduler.key,
          schedulerVersion: scheduler.version,
          paramsSnapshot: params as Record<string, unknown>,
          stateBefore: state as unknown as Record<string, unknown>,
          stateAfter: outcome as unknown as Record<string, unknown>,
          explanation: outcome.explanation,
          sessionId: ev.sessionId ?? null,
          clientId: ev.clientId,
          deviceId: device.deviceId,
          reviewedAt: now,
        });

        state = {
          ...state,
          repetitions: outcome.repetitions,
          easeFactor: outcome.easeFactor,
          intervalDays: outcome.intervalDays,
          lapses: outcome.lapses,
          box: outcome.box,
          stabilityDays: outcome.stabilityDays,
          difficulty: outcome.difficulty,
          stepIndex: outcome.stepIndex,
          isLearning: outcome.isLearning,
          phase: outcome.phase,
          dueAt: outcome.dueAt,
          lastReviewedAt: now,
          totalReviews: state.totalReviews + 1,
          correctReviews: state.correctReviews + (outcome.wasCorrect ? 1 : 0),
        };
        lastOutcome = state;
      }

      /* ---- Single write per card ---- */
      await db
        .update(cardsTable)
        .set({
          repetitions: state.repetitions,
          easeFactor: state.easeFactor,
          intervalDays: state.intervalDays,
          lapses: state.lapses,
          box: state.box,
          stabilityDays: state.stabilityDays,
          difficulty: state.difficulty,
          stepIndex: state.stepIndex,
          isLearning: state.isLearning,
          phase: state.phase,
          dueAt: new Date(state.dueAt),
          lastReviewedAt: state.lastReviewedAt ? new Date(state.lastReviewedAt) : null,
          totalReviews: state.totalReviews,
          correctReviews: state.correctReviews,
          schedulerKey: scheduler.key,
          updatedAt: new Date(),
        })
        .where(eq(cardsTable.id, cardId));

      acceptedTotal += fresh.length;

      perCard.push({
        cardId,
        front: cardRow.front,
        accepted: fresh.length,
        duplicatesSkipped: skipped,
        conflict: hadConflict,
        schedulerKey: scheduler.key,
        schedulerVersion: scheduler.version,
        finalIntervalDays: lastOutcome.intervalDays,
        finalIntervalLabel: describeInterval(lastOutcome.intervalDays),
        dueAt: new Date(lastOutcome.dueAt).toISOString(),
        explanation:
          (hadConflict ? `[conflict resolved] ` : "") +
          (firstExplanation || "Events replayed through scheduler."),
      });
    }

    const nowIso = new Date();
    await db
      .update(devicesTable)
      .set({ lastPushedAt: nowIso, lastSeenAt: nowIso, lastRegistryFingerprint: registry.fingerprint })
      .where(eq(devicesTable.id, device.id));

    const cursor = nowIso.toISOString();
    const logId = await this.writeLog({
      deviceId: device.deviceId,
      userId,
      operation: "push",
      status: conflictsTotal > 0 ? "partial" : "ok",
      accepted: acceptedTotal,
      duplicatesSkipped: duplicatesTotal,
      conflictsResolved: conflictsTotal,
      cardsTouched: perCard.filter((p) => p.accepted > 0).length,
      payloadCount: events.length,
      cursorAfter: cursor,
      registryFingerprint: registry.fingerprint,
      detail: { cards: perCard.map((p) => ({ cardId: p.cardId, accepted: p.accepted, conflict: p.conflict })) },
      message: `Pushed ${acceptedTotal} event(s) across ${perCard.length} card(s); ${duplicatesTotal} duplicate(s) blocked, ${conflictsTotal} conflict(s) resolved.`,
    });

    return {
      logId,
      deviceId: device.deviceId,
      accepted: acceptedTotal,
      duplicatesSkipped: duplicatesTotal,
      conflictsResolved: conflictsTotal,
      cardsTouched: perCard.filter((p) => p.accepted > 0).length,
      perCard,
      cursor,
      serverTime: nowIso.toISOString(),
    };
  }

  /* ============================================================
   * PULL — delta since a cursor
   * ============================================================ */
  static async pull(params: {
    deviceId: string;
    cursor?: string | null;
    limit?: number;
    userId?: string;
    includeReviews?: boolean;
  }): Promise<SyncPullResult> {
    await SrsService.ensureSeeded();

    const userId = params.userId || "anonymous-user";
    const device = await this.requireDevice(userId, params.deviceId);
    const limit = clampInt(params.limit, 1, 2000, SYNC_PAGE_LIMIT);
    const registry = getRegistryStatus(device.lastRegistryFingerprint);

    const cursorDate = params.cursor ? new Date(params.cursor) : null;
    const validCursor = cursorDate && !Number.isNaN(cursorDate.getTime()) ? cursorDate : null;

    const deckRows = (
      await db.select().from(decksTable).where(eq(decksTable.ownerId, userId))
    ).filter((d) => !d.isArchived);
    const deckIds = deckRows.map((d) => d.id);

    let cardDeltas: SyncCardDelta[] = [];
    let reviewDeltas: SyncReviewDelta[] = [];
    let hasMore = false;

    if (deckIds.length > 0) {
      const base = [
        inArray(cardsTable.deckId, deckIds),
        ...(validCursor ? [gt(cardsTable.updatedAt, validCursor)] : []),
      ];

      const rows = await db
        .select()
        .from(cardsTable)
        .where(and(...base))
        .orderBy(asc(cardsTable.updatedAt))
        .limit(limit + 1);

      hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;

      cardDeltas = page.map((r) => ({
        id: r.id,
        deckId: r.deckId,
        cardType: r.cardType,
        front: r.front,
        back: r.back,
        reading: r.reading,
        meaning: r.meaning,
        hint: r.hint,
        sourceType: r.sourceType,
        sourceRef: r.sourceRef,
        state: {
          repetitions: r.repetitions,
          easeFactor: r.easeFactor,
          intervalDays: r.intervalDays,
          lapses: r.lapses,
          box: r.box,
          stabilityDays: r.stabilityDays,
          difficulty: r.difficulty,
          stepIndex: r.stepIndex,
          isLearning: r.isLearning,
          phase: r.phase as SrsPhase,
          lastReviewedAt: r.lastReviewedAt,
          dueAt: r.dueAt,
          totalReviews: r.totalReviews,
          correctReviews: r.correctReviews,
        },
        schedulerKey: r.schedulerKey,
        isSuspended: r.isSuspended,
        updatedAt: r.updatedAt.toISOString(),
      }));

      if (params.includeReviews !== false && deckIds.length > 0) {
        const rBase = [
          inArray(reviewsTable.deckId, deckIds),
          ...(validCursor ? [gt(reviewsTable.reviewedAt, validCursor)] : []),
        ];
        const rRows = await db
          .select({
            id: reviewsTable.id,
            clientId: reviewsTable.clientId,
            deviceId: reviewsTable.deviceId,
            cardId: reviewsTable.cardId,
            rating: reviewsTable.rating,
            wasCorrect: reviewsTable.wasCorrect,
            intervalDays: reviewsTable.intervalDays,
            schedulerKey: reviewsTable.schedulerKey,
            schedulerVersion: reviewsTable.schedulerVersion,
            explanation: reviewsTable.explanation,
            reviewedAt: reviewsTable.reviewedAt,
          })
          .from(reviewsTable)
          .where(and(...rBase))
          .orderBy(asc(reviewsTable.reviewedAt))
          .limit(limit + 1);

        const rHasMore = rRows.length > limit;
        hasMore = hasMore || rHasMore;
        const rPage = rHasMore ? rRows.slice(0, limit) : rRows;

        reviewDeltas = rPage.map((r) => ({
          id: r.id,
          clientId: r.clientId,
          deviceId: r.deviceId,
          cardId: r.cardId,
          rating: r.rating as SrsRating,
          wasCorrect: r.wasCorrect,
          intervalDays: r.intervalDays,
          schedulerKey: r.schedulerKey,
          schedulerVersion: r.schedulerVersion,
          explanation: r.explanation,
          reviewedAt: r.reviewedAt.toISOString(),
        }));
      }
    }

    const nextCursor = new Date().toISOString();

    await db
      .update(devicesTable)
      .set({ lastPulledAt: new Date(), lastSeenAt: new Date(), lastRegistryFingerprint: registry.fingerprint })
      .where(eq(devicesTable.id, device.id));

    await this.writeLog({
      deviceId: device.deviceId,
      userId,
      operation: "pull",
      status: "ok",
      payloadCount: cardDeltas.length + reviewDeltas.length,
      cursorBefore: validCursor ? validCursor.toISOString() : null,
      cursorAfter: nextCursor,
      registryFingerprint: registry.fingerprint,
      message: `Pulled ${cardDeltas.length} card(s), ${reviewDeltas.length} review(s)${validCursor ? " since cursor" : " (initial)"}.`,
    });

    return {
      deviceId: device.deviceId,
      cursorRequested: validCursor ? validCursor.toISOString() : null,
      nextCursor,
      serverTime: new Date().toISOString(),
      registry,
      decks: deckRows.map((d) => ({
        id: d.id,
        name: d.name,
        description: d.description,
        jlptLevel: d.jlptLevel,
        ownerId: d.ownerId,
        schedulerKey: d.schedulerKey as SrsDeck["schedulerKey"],
        schedulerParams: (d.schedulerParams ?? {}) as SrsDeck["schedulerParams"],
        isArchived: d.isArchived,
        createdAt: d.createdAt,
      })),
      cards: cardDeltas,
      reviews: reviewDeltas,
      counts: { cards: cardDeltas.length, reviews: reviewDeltas.length, decks: deckRows.length },
      hasMore,
    };
  }

  /* ============================================================
   * SNAPSHOT — full state for a fresh device or a wipe/restore
   * ============================================================ */
  static async snapshot(params: { deviceId: string; userId?: string }): Promise<SyncPullResult> {
    return this.pull({ ...params, cursor: null, limit: 2000 });
  }

  /* ============================================================
   * STATUS — devices, log, totals
   * ============================================================ */
  static async getStatus(userId = "anonymous-user"): Promise<SyncStatusResponse> {
    await SrsService.ensureSeeded();

    const registry = getRegistryStatus();

    const deviceRows = await db
      .select()
      .from(devicesTable)
      .where(eq(devicesTable.userId, userId))
      .orderBy(desc(devicesTable.lastSeenAt));

    const logRows = await db
      .select()
      .from(syncLogTable)
      .where(eq(syncLogTable.userId, userId))
      .orderBy(desc(syncLogTable.createdAt))
      .limit(20);

    const [totalsRow] = await db
      .select({
        synced: sql<number>`cast(count(*) filter (where ${reviewsTable.deviceId} is not null) as int)`,
        conflicts: sql<number>`cast(count(*) filter (where ${reviewsTable.explanation} like '[conflict resolved]%') as int)`,
      })
      .from(reviewsTable)
      .where(eq(reviewsTable.userId, userId));

    const [dupRow] = await db
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(syncLogTable)
      .where(and(eq(syncLogTable.userId, userId), eq(syncLogTable.operation, "push")));

    const pushes = await db
      .select({ duplicates: syncLogTable.duplicatesSkipped })
      .from(syncLogTable)
      .where(and(eq(syncLogTable.userId, userId), eq(syncLogTable.operation, "push")));

    return {
      registry,
      devices: deviceRows.map(rowToDevice),
      recentLog: logRows.map((r) => ({
        id: r.id,
        deviceId: r.deviceId,
        operation: r.operation,
        status: r.status,
        accepted: r.accepted,
        duplicatesSkipped: r.duplicatesSkipped,
        conflictsResolved: r.conflictsResolved,
        cardsTouched: r.cardsTouched,
        payloadCount: r.payloadCount,
        cursorBefore: r.cursorBefore,
        cursorAfter: r.cursorAfter,
        registryFingerprint: r.registryFingerprint,
        message: r.message,
        createdAt: r.createdAt,
      })),
      totals: {
        devices: deviceRows.length,
        activeDevices: deviceRows.filter((d) => !d.isRevoked).length,
        reviewsSynced: totalsRow?.synced ?? 0,
        conflictsResolved: totalsRow?.conflicts ?? 0,
        duplicatesBlocked: pushes.reduce((s, p) => s + (p.duplicates ?? 0), 0),
      },
      serverTime: new Date().toISOString(),
    };
  }

  static async revokeDevice(userId: string, deviceId: string): Promise<SyncDevice | null> {
    const [row] = await db
      .update(devicesTable)
      .set({ isRevoked: true, lastSeenAt: new Date() })
      .where(and(eq(devicesTable.userId, userId), eq(devicesTable.deviceId, deviceId)))
      .returning();

    if (row) {
      await this.writeLog({
        deviceId,
        userId,
        operation: "register",
        status: "ok",
        message: "Device revoked",
      });
      return rowToDevice(row);
    }
    return null;
  }
}
