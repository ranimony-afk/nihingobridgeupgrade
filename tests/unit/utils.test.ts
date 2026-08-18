import assert from "node:assert/strict";
import { test } from "node:test";
import {
  answersMatch,
  leagueFromWeeklyXp,
  levelFromXp,
  normalizeAnswer,
  weekStartKey,
  xpIntoLevel,
} from "../../src/lib/utils.ts";

test("normalizeAnswer strips punctuation and case", () => {
  assert.equal(normalizeAnswer("  Arigatou! "), "arigatou");
});

test("answersMatch accepts romaji equivalents in a list", () => {
  assert.equal(answersMatch(["thank you", "arigatou"], "ARIGATOU"), true);
  assert.equal(answersMatch("sushi", "sashimi"), false);
});

test("level math stays on 100 XP bands", () => {
  assert.equal(levelFromXp(0), 1);
  assert.equal(levelFromXp(100), 2);
  assert.equal(xpIntoLevel(140), 40);
});

test("league thresholds match product copy", () => {
  assert.equal(leagueFromWeeklyXp(20).name, "Seedling");
  assert.equal(leagueFromWeeklyXp(50).name, "Bronze");
  assert.equal(leagueFromWeeklyXp(500).name, "Sakura");
});

test("weeks start on Monday UTC", () => {
  assert.equal(weekStartKey(new Date("2026-03-25T12:00:00.000Z")), "2026-03-23");
});
