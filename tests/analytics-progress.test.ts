import { describe, it, expect, beforeAll } from "vitest";
import { AnalyticsService } from "@/services/analytics";
import { XpService } from "@/services/gamification/xpService";
import { db } from "@/db";
import { xpEvents, xpRules } from "@/db/schema";
import { eq } from "drizzle-orm";

describe("Phase 11: Progress, XP & Analytics Engine", () => {
  const userId = `test-analytics-user-${Date.now()}`;

  beforeAll(async () => {
    await AnalyticsService.ensureInitialized();
  });

  describe("XP Rules & Event Idempotency", () => {
    it("should ensure XP rules are registered and synced in xp_rules table", async () => {
      const rules = await db.select().from(xpRules);
      expect(rules.length).toBeGreaterThan(0);
      const contentRule = rules.find((r) => r.eventType === "content.read");
      expect(contentRule).toBeDefined();
      expect(contentRule?.basePoints).toBeGreaterThan(0);
    });

    it("should award XP on study event and record in xp_events ledger", async () => {
      const res = await AnalyticsService.trackStudyEvent({
        userId,
        itemType: "vocabulary",
        itemId: "de-mizu",
        jlptLevel: "N5",
      });

      expect(res.awarded).toBe(true);
      expect(res.points).toBeGreaterThan(0);

      // Verify row in database
      const userEvents = await db
        .select()
        .from(xpEvents)
        .where(eq(xpEvents.userId, userId));
      expect(userEvents.length).toBe(1);
      expect(userEvents[0].points).toBe(res.points);
      expect(userEvents[0].dedupeKey).toBe(`study:vocabulary:${userId}:de-mizu`);
    });

    it("should strictly ignore duplicate events and not duplicate XP (idempotency via dedupeKey)", async () => {
      const initialTotal = await XpService.getTotalXp(userId);

      // Replay the exact same study event
      const dupeRes = await AnalyticsService.trackStudyEvent({
        userId,
        itemType: "vocabulary",
        itemId: "de-mizu",
        jlptLevel: "N5",
      });

      expect(dupeRes.awarded).toBe(false);
      expect(dupeRes.points).toBe(0);

      const afterTotal = await XpService.getTotalXp(userId);
      expect(afterTotal).toBe(initialTotal);

      // Verify no extra row was inserted
      const userEvents = await db
        .select()
        .from(xpEvents)
        .where(eq(xpEvents.userId, userId));
      expect(userEvents.length).toBe(1);
    });
  });

  describe("Multi-Domain Study Metrics Tracking & Analytics Summary", () => {
    it("should track distinct entities across kanji, grammar, and sentences", async () => {
      await AnalyticsService.trackStudyEvent({
        userId,
        itemType: "kanji",
        itemId: "kj-mizu",
        jlptLevel: "N5",
      });

      await AnalyticsService.trackStudyEvent({
        userId,
        itemType: "grammar",
        itemId: "gp-te-kara",
        jlptLevel: "N5",
      });

      await AnalyticsService.trackStudyEvent({
        userId,
        itemType: "example",
        itemId: "es-001",
        jlptLevel: "N5",
      });

      const summary = await AnalyticsService.getUserProgressSummary(userId);
      expect(summary.userId).toBe(userId);
      expect(summary.xp.totalPoints).toBeGreaterThan(0);
      expect(summary.xp.level).toBeGreaterThanOrEqual(1);
      expect(summary.xp.title).toBeDefined();

      // Check studied metrics
      expect(summary.studyMetrics.vocabularyStudied).toBeGreaterThanOrEqual(1);
      expect(summary.studyMetrics.kanjiStudied).toBeGreaterThanOrEqual(1);
      expect(summary.studyMetrics.grammarStudied).toBeGreaterThanOrEqual(1);
      expect(summary.studyMetrics.examplesStudied).toBeGreaterThanOrEqual(1);

      // Clean recent activity records
      expect(summary.recentActivity.length).toBeGreaterThanOrEqual(4);
      for (const act of summary.recentActivity) {
        expect(act.points).toBeGreaterThan(0);
        expect(act.type).toBe("content.read");
      }
    });

    it("should not expose internal secrets or unescaped SQL details in summary output", async () => {
      const summary = await AnalyticsService.getUserProgressSummary(userId);
      const json = JSON.stringify(summary);

      expect(json).not.toContain("password");
      expect(json).not.toContain("databaseUrl");
      expect(json).not.toContain("secret");
      expect(json).not.toContain("token");
    });
  });
});
