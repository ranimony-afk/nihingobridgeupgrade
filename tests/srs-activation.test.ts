import { describe, it, expect, beforeAll } from "vitest";
import { SrsService } from "@/services/srs/srsService";
import { SessionService } from "@/services/srs/sessionService";
import { DailyQueueService } from "@/services/srs/dailyQueueService";
import { PersonalizationService } from "@/services/srs/personalizationService";
import { SyncService } from "@/services/srs/syncService";
import { SrsCardGenerator } from "@/services/srs/generators";
import { db } from "@/db";
import {
  srsCards,
  srsReviews,
  srsDecks,
  srsReviewSessions,
  srsSyncDevices,
} from "@/db/schema";
import { eq } from "drizzle-orm";

describe("Phase 10: NihongoBridge SRS Activation & Lifecycle", () => {
  const userId = `test-user-srs-${Date.now()}`;
  let deckId: string;
  let testCardId: string;

  beforeAll(async () => {
    await SrsService.ensureSeeded();

    // Create a dedicated test deck
    const deck = await SrsService.createDeck({
      ownerId: userId,
      name: "Phase 10 Comprehensive SRS Deck",
      description: "Testing end-to-end SM2 / FSRS lifecycle",
      schedulerKey: "sm2",
    });
    deckId = deck.id;
  });

  describe("Card Generation from Multiple Knowledge Sources", () => {
    it("should generate vocabulary cards from dictionary entries", async () => {
      const res = await SrsCardGenerator.fromDictionary({
        userId,
        limit: 3,
      });
      expect(res.cardsCreated).toBeGreaterThan(0);
      expect(res.sourceType).toBe("dictionary");
      const card = res.cards[0];
      expect(card.cardType).toBe("vocabulary");
      expect(card.front).toBeTruthy();
      expect(card.back).toBeTruthy();
      expect(card.sourceRef).toBeTruthy();
    });

    it("should generate kanji cards from kanji entries", async () => {
      const res = await SrsCardGenerator.fromKanji({
        userId,
        limit: 3,
      });
      expect(res.cardsCreated).toBeGreaterThan(0);
      expect(res.sourceType).toBe("kanji");
      const card = res.cards[0];
      expect(card.cardType).toBe("kanji");
      expect(card.front).toBeTruthy();
    });

    it("should generate grammar cards from grammar patterns", async () => {
      const res = await SrsCardGenerator.fromGrammar({
        userId,
        limit: 3,
      });
      expect(res.cardsCreated).toBeGreaterThan(0);
      expect(res.sourceType).toBe("grammar");
      const card = res.cards[0];
      expect(card.cardType).toBe("grammar");
      expect(card.front).toBeTruthy();
    });

    it("should generate cards from example sentences", async () => {
      const res = await SrsCardGenerator.fromSentences({
        userId,
        limit: 3,
      });
      expect(res.cardsCreated).toBeGreaterThan(0);
      expect(res.sourceType).toBe("sentence");
    });
  });

  describe("SRS Learning Lifecycle: New -> Learning -> Review -> Interval Update", () => {
    it("should create a new card in the initial learning phase", async () => {
      const card = await SrsService.createCard({
        deckId,
        front: "日本語",
        back: "にほんご — Japanese language",
        reading: "にほんご",
        meaning: "Japanese language",
        sourceType: "manual",
      });

      expect(card).not.toBeNull();
      expect(card?.id).toBeDefined();
      expect(card?.state.phase).toBe("learning");
      expect(card?.state.repetitions).toBe(0);
      expect(card?.state.intervalDays).toBe(0);
      expect(card?.state.isLearning).toBe(true);

      testCardId = card!.id;
    });

    it("should grade card with 'again' (failure) keeping it in learning phase", async () => {
      const gradeResult = await SrsService.gradeCard({
        cardId: testCardId,
        rating: "again",
        timeSpentMs: 4000,
      });

      expect(gradeResult).not.toBeNull();
      expect(gradeResult?.rating).toBe("again");
      expect(gradeResult?.card.state.phase).toBe("learning");
      expect(gradeResult?.card.state.isLearning).toBe(true);
    });

    it("should grade card with 'good' progressing learning steps", async () => {
      const gradeResult = await SrsService.gradeCard({
        cardId: testCardId,
        rating: "good",
        timeSpentMs: 3500,
      });

      expect(gradeResult).not.toBeNull();
      expect(gradeResult?.rating).toBe("good");
      expect(gradeResult?.card.state.stepIndex).toBeGreaterThanOrEqual(1);
    });

    it("should graduate card into review phase with positive interval on subsequent 'good' ratings", async () => {
      // Advance step 2 -> graduation
      const gradeResult = await SrsService.gradeCard({
        cardId: testCardId,
        rating: "good",
        timeSpentMs: 2000,
      });

      expect(gradeResult).not.toBeNull();
      expect(gradeResult?.card.state.repetitions).toBeGreaterThanOrEqual(1);
      expect(gradeResult?.card.state.intervalDays).toBeGreaterThan(0);
      expect(gradeResult?.card.state.phase).toBe("review");
      expect(gradeResult?.card.state.isLearning).toBe(false);

      // Verify immutable review audit row in srs_reviews
      const reviews = await db
        .select()
        .from(srsReviews)
        .where(eq(srsReviews.cardId, testCardId));
      expect(reviews.length).toBe(3);
    });
  });

  describe("Session Tracking, Due Queue, Personalization, & Synchronization", () => {
    it("should query daily due queue and forecast", async () => {
      const queue = await DailyQueueService.getDailyQueue({
        userId,
      });
      expect(queue).toBeDefined();
      expect(typeof queue.progress.reviewsDone).toBe("number");
      expect(queue.forecast.length).toBeGreaterThan(0);
    });

    it("should plan, execute, and complete a persisted review session", async () => {
      // 1. Create a fresh card to ensure a review is present in queue
      const sessionCard = await SrsService.createCard({
        deckId,
        front: "勉強",
        back: "べんきょう — Study",
        meaning: "Study",
      });
      expect(sessionCard).not.toBeNull();

      // 2. Plan session with dueHorizon 'day'
      const planned = await SessionService.planSession({
        userId,
        deckId,
        maxCards: 5,
        dueHorizon: "day",
      });
      expect(planned.session).toBeDefined();
      expect(planned.session.id).toBeDefined();
      expect(planned.session.queueSize).toBeGreaterThan(0);

      const sessionId = planned.session.id;

      // 3. Inspect session state to get the current due card
      const state = await SessionService.getSessionState(sessionId);
      expect(state).not.toBeNull();
      expect(state?.currentCard).not.toBeNull();

      const targetCardId = state!.currentCard!.card.id;

      // 4. Answer the card within the session
      await SessionService.answer({
        sessionId,
        cardId: targetCardId,
        rating: "good",
        timeSpentMs: 2500,
      });

      // 5. Complete session
      const completed = await SessionService.completeSession(sessionId);
      expect(completed).not.toBeNull();
      expect(completed?.status).toBe("completed");
    });

    it("should support personalization profile preferences", async () => {
      const pref = await PersonalizationService.getPrefs(userId);
      expect(pref).toBeDefined();
      expect(typeof pref.weaknessWeight).toBe("number");

      const updated = await PersonalizationService.updatePrefs(userId, {
        weakFirst: false,
        preferWeakAreas: true,
      });
      expect(updated.weakFirst).toBe(false);
      expect(updated.preferWeakAreas).toBe(true);
    });

    it("should register sync device and perform delta pull / push", async () => {
      const deviceId = `device-${Date.now()}`;

      // Register device for anonymous-user to match syncService push default
      const reg = await SyncService.registerDevice({
        userId: "anonymous-user",
        deviceId,
        name: "Test Mobile Device",
        platform: "android",
        appVersion: "1.0.0",
      });
      expect(reg.device).toBeDefined();
      expect(reg.device.deviceId).toBe(deviceId);

      // Pull delta
      const pull = await SyncService.pull({
        userId: "anonymous-user",
        deviceId,
      });
      expect(pull.cards.length).toBeGreaterThanOrEqual(1);
      expect(pull.nextCursor).toBeDefined();

      // Push review event idempotently
      const pushClientId = `client-rev-${Date.now()}`;
      const pushResult = await SyncService.push({
        deviceId,
        events: [
          {
            clientId: pushClientId,
            cardId: testCardId,
            rating: "easy",
            timeSpentMs: 1200,
            reviewedAt: new Date().toISOString(),
          },
        ],
      });
      expect(pushResult.accepted).toBe(1);
      expect(pushResult.duplicatesSkipped).toBe(0);

      // Repeated push with same clientId should be skipped safely
      const dupeResult = await SyncService.push({
        deviceId,
        events: [
          {
            clientId: pushClientId,
            cardId: testCardId,
            rating: "easy",
            timeSpentMs: 1200,
            reviewedAt: new Date().toISOString(),
          },
        ],
      });
      expect(dupeResult.duplicatesSkipped).toBe(1);
      expect(dupeResult.accepted).toBe(0);
    });
  });
});
