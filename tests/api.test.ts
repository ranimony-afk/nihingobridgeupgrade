/**
 * Automated Unit Tests
 * Comprehensive tests covering all 10 Phases & Full Japanese Educational Platform
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { ok, fail, isEditorialStatus, EDITORIAL_STATUSES } from "../src/lib/api";
import { getBrand, listBrands, BRANDS, PLATFORM_LOCALES, getLocale } from "../src/lib/brands";
import { canTransition, computeVisualDiff, extractMentions } from "../src/shared/workflow";
import {
  formatFileSize,
  isAssetKind,
  defaultStorage,
  generateResponsiveVariants,
  buildTranscodeManifest,
} from "../src/shared/media";
import { calculateCourseDuration } from "../src/shared/lms";
import {
  calculateSrs,
  extractVocabularyFromText,
  generateMatchingGame,
  awardXp,
} from "../src/shared/tools";
import {
  signMobileJwt,
  verifyMobileJwt,
  extractAuthToken,
  buildPaginatedEnvelope,
  checkRateLimit,
  OPENAPI_SPEC,
  GRAPHQL_SCHEMA_DEF,
} from "../src/shared/mobile";
import { SECTION_TYPES, sectionKindFor, isCmsStatus } from "../src/shared/cms";
import { DEFAULT_MEGA_MENU } from "../src/shared/components/BrandHeader";

test("ok() returns a JSON envelope with data", async () => {
  const res = ok({ hello: "world" });
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.data, { hello: "world" });
});

test("fail() returns a JSON envelope with error and status", async () => {
  const res = fail("boom", 418, "TEAPOT");
  assert.equal(res.status, 418);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "boom");
  assert.equal(body.code, "TEAPOT");
});

test("editorial statuses support all 10 publishing lifecycle states", () => {
  const expected = [
    "draft",
    "needs_review",
    "in_review",
    "changes_requested",
    "approved",
    "scheduled",
    "published",
    "expired",
    "archived",
    "deleted",
  ];
  for (const s of expected) {
    assert.ok(isEditorialStatus(s), `${s} should be a valid status`);
  }
  assert.equal(isEditorialStatus("invalid_state"), false);
});

test("brand registry contains ascend + nihongo", () => {
  const keys = listBrands().map((b) => b.key).sort();
  assert.deepEqual(keys, ["ascend", "nihongo"]);
  assert.equal(getBrand("ascend")?.name, "Ascend Academy");
  assert.equal(getBrand("nihongo")?.name, "Nihongo Bridge");
  assert.equal(getBrand("missing"), null);
});

test("every brand declares theme + supported locales", () => {
  for (const b of Object.values(BRANDS)) {
    assert.ok(b.theme.primary);
    assert.ok(b.theme.accent);
    assert.ok(b.supportedLocales.length > 0);
    assert.ok(b.supportedLocales.includes(b.defaultLocale));
  }
});

test("multilingual platform supports English, Tamil, Malayalam, Japanese and future locales", () => {
  const activeCodes = PLATFORM_LOCALES.filter((l) => l.status === "active").map((l) => l.code);
  assert.deepEqual(activeCodes.sort(), ["en", "ja", "ml", "ta"]);

  assert.equal(getLocale("ta").nativeName, "தமிழ்");
  assert.equal(getLocale("ml").nativeName, "മലയാളം");
  assert.equal(getLocale("ja").nativeName, "日本語");
  assert.equal(getLocale("hi").status, "future");
});

test("workflow transitions enforce enterprise state machine rules", () => {
  assert.equal(canTransition("draft", "needs_review"), true);
  assert.equal(canTransition("needs_review", "approved"), true);
  assert.equal(canTransition("approved", "scheduled"), true);
  assert.equal(canTransition("scheduled", "published"), true);
  assert.equal(canTransition("published", "expired"), true);
});

test("workflow visual diff computes field changes accurately", () => {
  const before = { title: "Draft Title", views: 10 };
  const after = { title: "Final Published Title", views: 10 };
  const diff = computeVisualDiff(before, after);
  const titleDiff = diff.find((d) => d.field === "title");
  const viewsDiff = diff.find((d) => d.field === "views");
  assert.equal(titleDiff?.isChanged, true);
  assert.equal(viewsDiff?.isChanged, false);
});

test("workflow mention parser extracts @usernames", () => {
  const text = "Please review this @sarah and @alex_dev before release.";
  const mentions = extractMentions(text);
  assert.deepEqual(mentions.sort(), ["alex_dev", "sarah"]);
});

test("mobile platform generates, verifies, and extracts Bearer JWT tokens", () => {
  const token = signMobileJwt({
    userId: 42,
    email: "learner@nihongobridge.com",
    role: "learner",
    brandSlug: "nihongo",
  });
  const decoded = verifyMobileJwt(token);
  assert.ok(decoded);
  assert.equal(decoded.userId, 42);
  assert.equal(decoded.brandSlug, "nihongo");

  const req = new Request("https://api.nihongobridge.com/api/v1/mobile/profile", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const extracted = extractAuthToken(req);
  assert.equal(extracted, token);
});

test("mobile pagination generates metadata envelope", () => {
  const envelope = buildPaginatedEnvelope(["item1", "item2"], 10, 1, 2);
  assert.equal(envelope.ok, true);
  assert.equal(envelope.meta.totalPages, 5);
  assert.equal(envelope.meta.hasMore, true);
});

test("mobile rate limiter enforces sliding window request budget", () => {
  const r1 = checkRateLimit("client-test-ip", 2, 60000);
  assert.equal(r1.allowed, true);
  const r2 = checkRateLimit("client-test-ip", 2, 60000);
  assert.equal(r2.allowed, true);
  const r3 = checkRateLimit("client-test-ip", 2, 60000);
  assert.equal(r3.allowed, false);
});

test("mobile platform exposes valid OpenAPI and GraphQL compatibility schema", () => {
  assert.equal(OPENAPI_SPEC.openapi, "3.0.0");
  assert.ok(GRAPHQL_SCHEMA_DEF.includes("type Query"));
});

test("spaced repetition SM-2 algorithm calculates intervals correctly", () => {
  const result = calculateSrs({
    quality: 5,
    repetitions: 0,
    easeFactor: 250,
    intervalDays: 1,
  });
  assert.equal(result.repetitions, 1);
  assert.equal(result.intervalDays, 1);
  assert.ok(result.easeFactor >= 250);
});

test("vocabulary extraction parser parses bracketed japanese text", () => {
  const passage = "Today I learned [日本|にほん|Japan] and [食べる|たべる|to eat].";
  const vocabs = extractVocabularyFromText(passage);
  assert.equal(vocabs.length, 2);
  assert.equal(vocabs[0].japanese, "日本");
  assert.equal(vocabs[0].meaning, "Japan");
});

test("matching game shuffler produces paired cards", () => {
  const cards = generateMatchingGame([
    { id: 1, japanese: "日本", meaning: "Japan" },
    { id: 2, japanese: "食べる", meaning: "To eat" },
  ]);
  assert.equal(cards.length, 4);
});

test("gamification awards XP and unlocks achievements", () => {
  const updated = awardXp({ xp: 80, streakDays: 5, achievements: [] }, 30);
  assert.equal(updated.xp, 110);
  assert.ok(updated.achievements.includes("First 100 XP"));
});

test("cms section registry includes all 22 full homepage sections", () => {
  const keys = SECTION_TYPES.map((s) => s.key);
  const requiredList = [
    "announcement_bar",
    "hero",
    "jlpt_countdown",
    "featured_courses",
    "learning_paths",
    "daily_vocab",
    "daily_kanji",
    "news",
    "popular_articles",
    "practice_tests",
    "downloads",
    "study_japan",
    "success_stories",
    "testimonials",
    "upcoming_events",
    "teacher_spotlight",
    "recent_blog",
    "latest_resources",
    "newsletter",
    "partner_logos",
    "faqs",
    "footer",
  ];
  for (const req of requiredList) {
    assert.ok(keys.includes(req), `missing reusable section type: ${req}`);
  }
  assert.equal(sectionKindFor("announcement_bar"), "announcement");
  assert.equal(sectionKindFor("jlpt_countdown"), "countdown");
  assert.equal(sectionKindFor("downloads"), "download");
});

test("mega menu covers core learning, practice, and career sections", () => {
  assert.ok(DEFAULT_MEGA_MENU.length >= 3);
  const allLabels = DEFAULT_MEGA_MENU.flatMap((cat) => cat.items.map((i) => i.label));
  for (const label of ["Learn Japanese", "JLPT", "Vocabulary", "Kanji", "Flashcards", "News", "Study in Japan", "Jobs"]) {
    assert.ok(allLabels.includes(label), `mega menu missing: ${label}`);
  }
});
