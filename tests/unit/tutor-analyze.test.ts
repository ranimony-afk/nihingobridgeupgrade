import assert from "node:assert/strict";
import { test } from "node:test";
import {
  detectCorrections,
  detectGrammar,
  detectVocabulary,
  nextDifficulty,
  pronunciationScore,
  scoreTurn,
} from "../../src/lib/tutor/analyze.ts";

test("detects classic learner mistakes", () => {
  const found = detectCorrections("食べるたいです");
  assert.ok(found.some((row) => row.right === "食べたい"));
  assert.equal(detectCorrections("水を飲みます。").length, 0);
});

test("detects grammar and vocabulary hits", () => {
  assert.equal(detectGrammar("これは本です", [{ id: "g1", title: "です" }]).length, 1);
  assert.equal(detectVocabulary("水を飲む", [{ id: "l1", lemma: "水", reading: "みず" }]).length, 1);
});

test("adaptive ladder moves with score", () => {
  assert.equal(nextDifficulty("N5", 90), "N4");
  assert.equal(nextDifficulty("N4", 20), "N5");
  assert.equal(nextDifficulty("N3", 60), "N3");
});

test("scoring and pronunciation stay bounded", () => {
  const score = scoreTurn("水を飲みます。", [], 2);
  assert.ok(score > 0 && score <= 100);
  assert.equal(pronunciationScore("こんにちは", "こんにちは"), 100);
  assert.ok(pronunciationScore("こんにちは", "こん") < 100);
});
