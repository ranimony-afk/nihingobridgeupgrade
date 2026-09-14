import { db } from "@/db";
import {
  srsDecks as srsDecksTable,
  srsCards as srsCardsTable,
  srsReviews as srsReviewsTable,
  srsSchedulers as srsSchedulersTable,
} from "@/db/schema";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  DEFAULT_SCHEDULER_KEY,
  assertNoHardcodedAlgorithms,
  getScheduler,
  hasScheduler,
  listSchedulers,
  resolveParams,
  SCHEDULER_PLUGIN_COUNT,
} from "./scheduler";
import { ALL_SEED_QUESTIONS } from "@/services/quiz/seedData";
import {
  GradedCardPayload,
  SrsCard,
  SrsCardState,
  SrsDeck,
  SrsPhase,
  SrsRating,
  SrsStats,
  SchedulerKey,
  SchedulerParams,
} from "@/types/srs";
import { describeInterval } from "./strategies/shared";

type DeckRow = typeof srsDecksTable.$inferSelect;
type CardRow = typeof srsCardsTable.$inferSelect;
type ReviewRow = typeof srsReviewsTable.$inferSelect;

function mapState(row: CardRow): SrsCardState {
  return {
    repetitions: row.repetitions,
    easeFactor: row.easeFactor,
    intervalDays: row.intervalDays,
    lapses: row.lapses,
    box: row.box,
    stabilityDays: row.stabilityDays,
    difficulty: row.difficulty,
    stepIndex: row.stepIndex,
    isLearning: row.isLearning,
    phase: (row.phase as SrsPhase) || "learning",
    lastReviewedAt: row.lastReviewedAt,
    dueAt: row.dueAt,
    totalReviews: row.totalReviews,
    correctReviews: row.correctReviews,
  };
}

function mapCard(row: CardRow, deck?: DeckRow): SrsCard {
  return {
    id: row.id,
    deckId: row.deckId,
    userId: row.userId,
    cardType: row.cardType,
    front: row.front,
    back: row.back,
    reading: row.reading,
    meaning: row.meaning,
    hint: row.hint,
    sourceType: row.sourceType,
    sourceRef: row.sourceRef,
    sourceQuestionId: row.sourceQuestionId,
    state: mapState(row),
    schedulerKey: (row.schedulerKey as SchedulerKey) || DEFAULT_SCHEDULER_KEY,
    isSuspended: row.isSuspended,
    createdAt: row.createdAt,
    deckName: deck?.name,
    jlptLevel: deck?.jlptLevel,
  };
}

function mapDeck(row: DeckRow, counts?: { total: number; due: number; fresh: number }): SrsDeck {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    jlptLevel: row.jlptLevel,
    ownerId: row.ownerId,
    schedulerKey: (row.schedulerKey as SchedulerKey) || DEFAULT_SCHEDULER_KEY,
    schedulerParams: (row.schedulerParams as unknown as SchedulerParams) || {},
    isArchived: row.isArchived,
    cardCount: counts?.total ?? 0,
    dueCount: counts?.due ?? 0,
    newCount: counts?.fresh ?? 0,
    createdAt: row.createdAt,
  };
}

export class SrsService {
  /* ============================================================
   * REGISTRY SYNC — the DB mirrors code metadata for audit only.
   * Algorithm logic never enters the database.
   * ============================================================ */
  static async syncSchedulerRegistry(): Promise<number> {
    assertNoHardcodedAlgorithms();
    const descriptors = listSchedulers();

    for (const d of descriptors) {
      await db
        .insert(srsSchedulersTable)
        .values({
          key: d.key,
          name: d.name,
          shortName: d.shortName,
          version: d.version,
          description: d.description,
          strengths: d.strengths,
          defaultParams: d.defaultParams as Record<string, unknown>,
          isBuiltIn: true,
          isActive: true,
          syncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: srsSchedulersTable.key,
          set: {
            name: d.name,
            shortName: d.shortName,
            version: d.version,
            description: d.description,
            strengths: d.strengths,
            defaultParams: d.defaultParams as Record<string, unknown>,
            syncedAt: new Date(),
          },
        });
    }

    return SCHEDULER_PLUGIN_COUNT;
  }

  /* ============================================================
   * SEEDING — builds knowledge cards out of the Phase 10 question
   * bank so SRS is grounded in platform knowledge, not invented.
   * ============================================================ */
  static async ensureSeeded(): Promise<void> {
    await this.syncSchedulerRegistry();

    const [deckCountRow] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(srsDecksTable);

    if ((deckCountRow?.count ?? 0) > 0) return;

    const demoDecks: Array<{
      id: string;
      name: string;
      description: string;
      jlptLevel: string;
      schedulerKey: SchedulerKey;
      schedulerParams: Record<string, unknown>;
    }> = [
      {
        id: "deck-n5-core-sm2",
        name: "N5 Core Vocabulary — SM-2",
        description:
          "Foundational N5 vocabulary drawn from the NihongoBridge question bank, scheduled with the classic SM-2 easiness algorithm.",
        jlptLevel: "N5",
        schedulerKey: "sm2",
        schedulerParams: {},
      },
      {
        id: "deck-n5-grammar-fsrs",
        name: "N5 Grammar Points — FSRS-Lite",
        description:
          "Grammar knowledge cards scheduled with the 3-component FSRS memory model for long-term retention targeting 90% recall.",
        jlptLevel: "N5",
        schedulerKey: "fsrs-lite",
        schedulerParams: { requestRetention: 0.9 },
      },
      {
        id: "deck-n5-kanji-leitner",
        name: "N5 Kanji Reading — Leitner Boxes",
        description:
          "Kanji readings in transparent Leitner boxes. Intervals are declared per box so progress is always predictable.",
        jlptLevel: "N5",
        schedulerKey: "leitner-box",
        schedulerParams: {},
      },
      {
        id: "deck-n5-curriculum-ladder",
        name: "N5 Curriculum Sprint — Fixed Ladder",
        description:
          "Curriculum-locked pacing using a declared interval ladder (1 → 3 → 7 → 14 → 30 → 60 → 120 days).",
        jlptLevel: "N5",
        schedulerKey: "fixed-ladder",
        schedulerParams: {},
      },
    ];

    for (const deck of demoDecks) {
      await db.insert(srsDecksTable).values({ ...deck, ownerId: "anonymous-user" }).onConflictDoNothing();
    }

    /* ---- Derive cards from structured knowledge in the question bank ---- */
    const vocabSeen = new Set<string>();
    const grammarSeen = new Set<string>();
    const kanjiSeen = new Set<string>();
    let vocabIdx = 0;
    let grammarIdx = 0;
    let kanjiIdx = 0;

    for (const q of ALL_SEED_QUESTIONS) {
      const notes = q.explanationBreakdown?.vocabNotes ?? [];
      for (const note of notes) {
        if (!note.word || vocabSeen.has(note.word)) continue;
        vocabSeen.add(note.word);
        if (vocabIdx >= 24) continue;
        vocabIdx += 1;
        await this.insertCard({
          id: `card-n5-vocab-${String(vocabIdx).padStart(3, "0")}`,
          deckId: "deck-n5-core-sm2",
          cardType: "vocabulary",
          front: note.word,
          back: `${note.reading} — ${note.meaning}`,
          reading: note.reading,
          meaning: note.meaning,
          sourceType: "question_bank.vocab_note",
          sourceQuestionId: q.id,
          sourceRef: `jlpt:${q.jlptLevel}:${q.category}`,
          schedulerKey: "sm2",
        });
      }

      const grammarPoints = q.explanationBreakdown?.grammarPoints ?? [];
      for (const gp of grammarPoints) {
        if (!gp.title || grammarSeen.has(gp.title)) continue;
        grammarSeen.add(gp.title);
        if (grammarIdx >= 10) continue;
        grammarIdx += 1;
        await this.insertCard({
          id: `card-n5-grammar-${String(grammarIdx).padStart(3, "0")}`,
          deckId: "deck-n5-grammar-fsrs",
          cardType: "grammar",
          front: gp.title,
          back: gp.explanation,
          meaning: gp.example ? `例: ${gp.example}` : null,
          sourceType: "question_bank.grammar_point",
          sourceQuestionId: q.id,
          sourceRef: `jlpt:${q.jlptLevel}:${q.category}`,
          schedulerKey: "fsrs-lite",
        });
      }

      const kanjiLike = note0Kanji(q.explanationBreakdown?.vocabNotes ?? []);
      for (const k of kanjiLike) {
        if (kanjiSeen.has(k.word)) continue;
        kanjiSeen.add(k.word);
        if (kanjiIdx >= 8) continue;
        kanjiIdx += 1;
        await this.insertCard({
          id: `card-n5-kanji-${String(kanjiIdx).padStart(3, "0")}`,
          deckId: "deck-n5-kanji-leitner",
          cardType: "kanji",
          front: k.word,
          back: k.reading,
          reading: k.reading,
          meaning: k.meaning,
          sourceType: "question_bank.kanji_reading",
          sourceQuestionId: q.id,
          sourceRef: `jlpt:${q.jlptLevel}:kanji_reading`,
          schedulerKey: "leitner-box",
        });
      }
    }

    await this.insertCard({
      id: "card-n5-ladder-001",
      deckId: "deck-n5-curriculum-ladder",
      cardType: "vocabulary",
      front: "勉強する",
      back: "べんきょうする — to study",
      reading: "べんきょうする",
      meaning: "to study",
      sourceType: "curriculum.manual",
      schedulerKey: "fixed-ladder",
    });
  }

  private static async insertCard(input: {
    id: string;
    deckId: string;
    cardType: string;
    front: string;
    back: string;
    reading?: string | null;
    meaning?: string | null;
    sourceType: string;
    sourceRef?: string;
    sourceQuestionId?: string;
    schedulerKey: SchedulerKey;
  }): Promise<void> {
    await db
      .insert(srsCardsTable)
      .values({
        id: input.id,
        deckId: input.deckId,
        userId: "anonymous-user",
        cardType: input.cardType,
        front: input.front,
        back: input.back,
        reading: input.reading ?? null,
        meaning: input.meaning ?? null,
        sourceType: input.sourceType,
        sourceRef: input.sourceRef ?? null,
        sourceQuestionId: input.sourceQuestionId ?? null,
        schedulerKey: input.schedulerKey,
        dueAt: new Date(),
        phase: "learning",
        isLearning: true,
      })
      .onConflictDoNothing();
  }

  /* ============================================================
   * SCHEDULER DISCOVERY
   * ============================================================ */
  static listAvailableSchedulers() {
    return listSchedulers();
  }

  /* ============================================================
   * DECKS
   * ============================================================ */
  static async listDecks(userId = "anonymous-user"): Promise<SrsDeck[]> {
    await this.ensureSeeded();

    const rows = await db
      .select()
      .from(srsDecksTable)
      .where(eq(srsDecksTable.ownerId, userId))
      .orderBy(asc(srsDecksTable.createdAt));

    const counts = await db
      .select({
        deckId: srsCardsTable.deckId,
        total: sql<number>`cast(count(*) as int)`,
        due: sql<number>`cast(count(*) filter (where ${srsCardsTable.dueAt} <= now() and ${srsCardsTable.isSuspended} = false) as int)`,
        fresh: sql<number>`cast(count(*) filter (where ${srsCardsTable.totalReviews} = 0) as int)`,
      })
      .from(srsCardsTable)
      .groupBy(srsCardsTable.deckId);

    const countMap = new Map(counts.map((c) => [c.deckId, c]));

    return rows
      .filter((r) => !r.isArchived)
      .map((r) => {
        const c = countMap.get(r.id);
        return mapDeck(
          r,
          c ? { total: c.total, due: c.due, fresh: c.fresh } : { total: 0, due: 0, fresh: 0 }
        );
      });
  }

  static async createDeck(input: {
    name: string;
    description?: string;
    jlptLevel?: string;
    schedulerKey?: string;
    schedulerParams?: Record<string, unknown>;
    ownerId?: string;
  }): Promise<SrsDeck> {
    await this.ensureSeeded();

    const scheduler = getScheduler(input.schedulerKey);
    const params = resolveParams(scheduler, input.schedulerParams);
    const id = `deck-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const [row] = await db
      .insert(srsDecksTable)
      .values({
        id,
        name: input.name,
        description: input.description || "",
        jlptLevel: input.jlptLevel || "N5",
        ownerId: input.ownerId || "anonymous-user",
        schedulerKey: scheduler.key,
        schedulerParams: params as Record<string, unknown>,
      })
      .returning();

    return mapDeck(row, { total: 0, due: 0, fresh: 0 });
  }

  /**
   * Re-bind a deck to a different algorithm at runtime.
   * Card state is preserved because state columns are a generic superset.
   */
  static async updateDeck(
    deckId: string,
    patch: {
      name?: string;
      description?: string;
      schedulerKey?: string;
      schedulerParams?: Record<string, unknown>;
    }
  ): Promise<SrsDeck | null> {
    const [existing] = await db
      .select()
      .from(srsDecksTable)
      .where(eq(srsDecksTable.id, deckId))
      .limit(1);

    if (!existing) return null;

    const set: Partial<DeckRow> = { updatedAt: new Date() };

    if (patch.name !== undefined) set.name = patch.name;
    if (patch.description !== undefined) set.description = patch.description;

    if (patch.schedulerKey !== undefined) {
      if (!hasScheduler(patch.schedulerKey)) {
        throw new Error(`Unknown scheduler key: ${patch.schedulerKey}`);
      }
      const scheduler = getScheduler(patch.schedulerKey);
      set.schedulerKey = scheduler.key;
    }

    if (patch.schedulerParams !== undefined) {
      const scheduler = getScheduler(patch.schedulerKey ?? existing.schedulerKey);
      const merged = { ...(existing.schedulerParams as Record<string, unknown>), ...patch.schedulerParams };
      set.schedulerParams = resolveParams(scheduler, merged) as Record<string, unknown>;
    }

    const [row] = await db
      .update(srsDecksTable)
      .set(set)
      .where(eq(srsDecksTable.id, deckId))
      .returning();

    return row ? mapDeck(row) : null;
  }

  /* ============================================================
   * CARDS
   * ============================================================ */
  static async createCard(input: {
    deckId: string;
    front: string;
    back: string;
    reading?: string;
    meaning?: string;
    hint?: string;
    cardType?: string;
    sourceType?: string;
  }): Promise<SrsCard | null> {
    await this.ensureSeeded();

    const [deck] = await db
      .select()
      .from(srsDecksTable)
      .where(eq(srsDecksTable.id, input.deckId))
      .limit(1);

    if (!deck) return null;

    const id = `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const [row] = await db
      .insert(srsCardsTable)
      .values({
        id,
        deckId: deck.id,
        userId: deck.ownerId,
        cardType: input.cardType || "vocabulary",
        front: input.front,
        back: input.back,
        reading: input.reading || null,
        meaning: input.meaning || null,
        hint: input.hint || null,
        sourceType: input.sourceType || "manual",
        schedulerKey: deck.schedulerKey,
        dueAt: new Date(),
        phase: "learning",
        isLearning: true,
      })
      .returning();

    return mapCard(row, deck);
  }

  static async queryCards(params: {
    deckId?: string;
    userId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ cards: SrsCard[]; total: number }> {
    await this.ensureSeeded();

    const deckIds = params.deckId
      ? [params.deckId]
      : (await db.select({ id: srsDecksTable.id }).from(srsDecksTable).where(eq(srsDecksTable.ownerId, params.userId || "anonymous-user"))).map((d) => d.id);

    if (deckIds.length === 0) return { cards: [], total: 0 };

    const where = inArray(srsCardsTable.deckId, deckIds);

    const [countRow] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(srsCardsTable)
      .where(where);

    const rows = await db
      .select()
      .from(srsCardsTable)
      .where(where)
      .orderBy(asc(srsCardsTable.dueAt))
      .limit(params.limit ?? 50)
      .offset(params.offset ?? 0);

    const deckRows = await db.select().from(srsDecksTable);
    const deckMap = new Map(deckRows.map((d) => [d.id, d]));

    return {
      cards: rows.map((r) => mapCard(r, deckMap.get(r.deckId))),
      total: countRow?.count ?? 0,
    };
  }

  /* ============================================================
   * DUE QUEUE
   * ============================================================ */
  static async getDueQueue(params: {
    userId?: string;
    deckId?: string;
    limit?: number;
  }): Promise<{ queue: SrsCard[]; totalDue: number }> {
    await this.ensureSeeded();

    const userId = params.userId || "anonymous-user";

    const deckIds = params.deckId
      ? [params.deckId]
      : (await db.select({ id: srsDecksTable.id }).from(srsDecksTable).where(eq(srsDecksTable.ownerId, userId))).map((d) => d.id);

    if (deckIds.length === 0) return { queue: [], totalDue: 0 };

    const baseWhere = and(
      inArray(srsCardsTable.deckId, deckIds),
      eq(srsCardsTable.isSuspended, false),
      lte(srsCardsTable.dueAt, new Date())
    );

    const [countRow] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(srsCardsTable)
      .where(baseWhere);

    const rows = await db
      .select()
      .from(srsCardsTable)
      .where(baseWhere)
      .orderBy(asc(srsCardsTable.dueAt))
      .limit(params.limit ?? 20);

    const deckRows = await db.select().from(srsDecksTable);
    const deckMap = new Map(deckRows.map((d) => [d.id, d]));

    return {
      queue: rows.map((r) => mapCard(r, deckMap.get(r.deckId))),
      totalDue: countRow?.count ?? 0,
    };
  }

  /* ============================================================
   * GRADING — resolves the algorithm at runtime via the registry.
   * ============================================================ */
  static async gradeCard(input: {
    cardId: string;
    rating: SrsRating;
    timeSpentMs?: number;
    userId?: string;
    /** Prompt 11.2 — optional owning review session. */
    sessionId?: string;
  }): Promise<GradedCardPayload | null> {
    await this.ensureSeeded();

    const [cardRow] = await db
      .select()
      .from(srsCardsTable)
      .where(eq(srsCardsTable.id, input.cardId))
      .limit(1);

    if (!cardRow) return null;

    const [deckRow] = await db
      .select()
      .from(srsDecksTable)
      .where(eq(srsDecksTable.id, cardRow.deckId))
      .limit(1);

    if (!deckRow) return null;

    /* Resolve the algorithm + params AT RUNTIME from the registry. */
    const scheduler = getScheduler(deckRow.schedulerKey);
    const params = resolveParams(scheduler, deckRow.schedulerParams as Record<string, unknown>);
    const stateBefore = mapState(cardRow);
    const now = new Date();

    const outcome = scheduler.review({
      state: stateBefore,
      rating: input.rating,
      now,
      params,
      historyCount: cardRow.totalReviews,
    });

    /* Persist generic state — no algorithm-specific columns exist. */
    await db
      .update(srsCardsTable)
      .set({
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
        totalReviews: cardRow.totalReviews + 1,
        correctReviews: cardRow.correctReviews + (outcome.wasCorrect ? 1 : 0),
        schedulerKey: scheduler.key,
        updatedAt: now,
      })
      .where(eq(srsCardsTable.id, cardRow.id));

    const reviewId = `rev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await db.insert(srsReviewsTable).values({
      id: reviewId,
      cardId: cardRow.id,
      deckId: cardRow.deckId,
      userId: cardRow.userId,
      rating: input.rating,
      wasCorrect: outcome.wasCorrect,
      timeSpentMs: input.timeSpentMs ?? 0,
      intervalDays: outcome.intervalDays,
      previousIntervalDays: stateBefore.intervalDays,
      dueAt: outcome.dueAt,
      schedulerKey: scheduler.key,
      schedulerVersion: scheduler.version,
      paramsSnapshot: params as Record<string, unknown>,
      stateBefore: stateBefore as unknown as Record<string, unknown>,
      stateAfter: outcome as unknown as Record<string, unknown>,
      explanation: outcome.explanation,
      sessionId: input.sessionId ?? null,
      reviewedAt: now,
    });

    const [freshRow] = await db
      .select()
      .from(srsCardsTable)
      .where(eq(srsCardsTable.id, cardRow.id))
      .limit(1);

    return {
      reviewId,
      card: mapCard(freshRow ?? cardRow, deckRow),
      rating: input.rating,
      schedulerKey: scheduler.key,
      schedulerVersion: scheduler.version,
      paramsApplied: params,
      intervalDays: outcome.intervalDays,
      dueAt: outcome.dueAt.toISOString(),
      explanation: outcome.explanation,
      phase: outcome.phase,
      stateBefore,
    };
  }

  /* ============================================================
   * ANALYTICS
   * ============================================================ */
  static async getStats(userId = "anonymous-user"): Promise<SrsStats> {
    await this.ensureSeeded();

    const deckIds = (
      await db.select({ id: srsDecksTable.id }).from(srsDecksTable).where(eq(srsDecksTable.ownerId, userId))
    ).map((d) => d.id);

    const empty: SrsStats = {
      totalCards: 0,
      newCards: 0,
      learning: 0,
      review: 0,
      mature: 0,
      dueNow: 0,
      dueToday: 0,
      suspended: 0,
      retentionPercent: 0,
      reviewsToday: 0,
      totalReviews: 0,
      forecast: [],
      recentReviews: [],
      schedulerUsage: [],
    };

    if (deckIds.length === 0) return empty;

    const where = inArray(srsCardsTable.deckId, deckIds);

    const [bucketRow] = await db
      .select({
        total: sql<number>`cast(count(*) as int)`,
        fresh: sql<number>`cast(count(*) filter (where ${srsCardsTable.totalReviews} = 0) as int)`,
        learning: sql<number>`cast(count(*) filter (where ${srsCardsTable.isLearning} = true and ${srsCardsTable.totalReviews} > 0) as int)`,
        review: sql<number>`cast(count(*) filter (where ${srsCardsTable.isLearning} = false and ${srsCardsTable.intervalDays} < 21) as int)`,
        mature: sql<number>`cast(count(*) filter (where ${srsCardsTable.isLearning} = false and ${srsCardsTable.intervalDays} >= 21) as int)`,
        dueNow: sql<number>`cast(count(*) filter (where ${srsCardsTable.dueAt} <= now() and ${srsCardsTable.isSuspended} = false) as int)`,
        dueToday: sql<number>`cast(count(*) filter (where ${srsCardsTable.dueAt} <= now() + interval '1 day' and ${srsCardsTable.isSuspended} = false) as int)`,
        suspended: sql<number>`cast(count(*) filter (where ${srsCardsTable.isSuspended} = true) as int)`,
      })
      .from(srsCardsTable)
      .where(where);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [reviewRow] = await db
      .select({
        total: sql<number>`cast(count(*) as int)`,
        today: sql<number>`cast(count(*) filter (where ${srsReviewsTable.reviewedAt} >= ${startOfToday.toISOString()}) as int)`,
        correct: sql<number>`cast(count(*) filter (where ${srsReviewsTable.wasCorrect} = true) as int)`,
      })
      .from(srsReviewsTable)
      .where(eq(srsReviewsTable.userId, userId));

    const forecastStart = startOfToday;
    const forecastEnd = new Date(startOfToday.getTime() + 7 * 86_400_000);

    const forecast = await db
      .select({
        day: sql<string>`to_char(${srsCardsTable.dueAt}::date, 'Mon DD')`,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(srsCardsTable)
      .where(and(where, gte(srsCardsTable.dueAt, forecastStart), lte(srsCardsTable.dueAt, forecastEnd)))
      .groupBy(sql`to_char(${srsCardsTable.dueAt}::date, 'Mon DD')`, sql`${srsCardsTable.dueAt}::date`)
      .orderBy(sql`${srsCardsTable.dueAt}::date`);

    const recentRows = await db
      .select({
        id: srsReviewsTable.id,
        front: srsCardsTable.front,
        rating: srsReviewsTable.rating,
        intervalDays: srsReviewsTable.intervalDays,
        schedulerKey: srsReviewsTable.schedulerKey,
        schedulerVersion: srsReviewsTable.schedulerVersion,
        explanation: srsReviewsTable.explanation,
        reviewedAt: srsReviewsTable.reviewedAt,
      })
      .from(srsReviewsTable)
      .innerJoin(srsCardsTable, eq(srsCardsTable.id, srsReviewsTable.cardId))
      .where(eq(srsReviewsTable.userId, userId))
      .orderBy(desc(srsReviewsTable.reviewedAt))
      .limit(12);

    const schedulerUsage = await db
      .select({
        schedulerKey: srsReviewsTable.schedulerKey,
        reviews: sql<number>`cast(count(*) as int)`,
        cards: sql<number>`cast(count(distinct ${srsReviewsTable.cardId}) as int)`,
      })
      .from(srsReviewsTable)
      .where(eq(srsReviewsTable.userId, userId))
      .groupBy(srsReviewsTable.schedulerKey);

    return {
      totalCards: bucketRow?.total ?? 0,
      newCards: bucketRow?.fresh ?? 0,
      learning: bucketRow?.learning ?? 0,
      review: bucketRow?.review ?? 0,
      mature: bucketRow?.mature ?? 0,
      dueNow: bucketRow?.dueNow ?? 0,
      dueToday: bucketRow?.dueToday ?? 0,
      suspended: bucketRow?.suspended ?? 0,
      retentionPercent:
        (reviewRow?.total ?? 0) > 0
          ? Math.round(((reviewRow?.correct ?? 0) / (reviewRow?.total ?? 1)) * 1000) / 10
          : 0,
      reviewsToday: reviewRow?.today ?? 0,
      totalReviews: reviewRow?.total ?? 0,
      forecast,
      recentReviews: recentRows.map((r) => ({
        id: r.id,
        front: r.front,
        rating: r.rating as SrsRating,
        intervalDays: r.intervalDays,
        schedulerKey: r.schedulerKey,
        schedulerVersion: r.schedulerVersion,
        explanation: r.explanation,
        reviewedAt: r.reviewedAt,
      })),
      schedulerUsage,
    };
  }

  /* ============================================================
   * PREVIEW — hypothetical grade, no persistence (used by UI labs)
   * ============================================================ */
  static async previewDeckScheduler(deckId: string, rating: SrsRating = "good") {
    const [deck] = await db.select().from(srsDecksTable).where(eq(srsDecksTable.id, deckId)).limit(1);
    if (!deck) return null;

    const scheduler = getScheduler(deck.schedulerKey);
    const params = resolveParams(scheduler, deck.schedulerParams as Record<string, unknown>);

    return {
      deckId,
      scheduler: { key: scheduler.key, name: scheduler.name, version: scheduler.version },
      paramsApplied: params,
      ladder: Array.from({ length: 8 }, (_, i) => {
        let state = {
          repetitions: 0,
          easeFactor: 2.5,
          intervalDays: 0,
          lapses: 0,
          box: 0,
          stabilityDays: 0,
          difficulty: 5,
          stepIndex: 0,
          isLearning: true,
          phase: "learning" as SrsPhase,
          lastReviewedAt: null,
          dueAt: new Date(),
          totalReviews: 0,
          correctReviews: 0,
        };
        let last: { intervalDays: number; label: string } = { intervalDays: 0, label: "now" };
        for (let step = 0; step <= i; step += 1) {
          const out = scheduler.review({ state, rating, now: new Date(), params, historyCount: step });
          state = {
            ...state,
            repetitions: out.repetitions,
            easeFactor: out.easeFactor,
            intervalDays: out.intervalDays,
            lapses: out.lapses,
            box: out.box,
            stabilityDays: out.stabilityDays,
            difficulty: out.difficulty,
            stepIndex: out.stepIndex,
            isLearning: out.isLearning,
            phase: out.phase,
          };
          last = { intervalDays: out.intervalDays, label: describeInterval(out.intervalDays) };
        }
        return { step: i + 1, intervalDays: last.intervalDays, label: last.label };
      }),
    };
  }
}

/** Extract single-kanji vocabulary entries for the kanji deck. */
function note0Kanji(notes: Array<{ word: string; reading: string; meaning: string }>) {
  return notes.filter((n) => n.word && Array.from(n.word).every((ch) => /[\u4e00-\u9faf\u3005\u3006\u30fc]/.test(ch)));
}
