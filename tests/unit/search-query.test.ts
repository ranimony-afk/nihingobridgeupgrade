import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bestSuggestion,
  combineScore,
  isJapanese,
  normalizeQuery,
  parseQuery,
  similarityThreshold,
  toTsQuery,
} from "../../src/lib/search/query.ts";

test("normalizeQuery folds width, case, and punctuation", () => {
  assert.equal(normalizeQuery("  Ｔｏｋｙｏ!  "), "tokyo");
  assert.equal(normalizeQuery("EAT, please"), "eat please");
});

test("detects Japanese text", () => {
  assert.equal(isJapanese("たべる"), true);
  assert.equal(isJapanese("水"), true);
  assert.equal(isJapanese("water"), false);
});

test("parses field operators into filters", () => {
  const parsed = parseQuery("water type:kanji jlpt:n5 pos:Noun difficulty:<=4");
  assert.equal(parsed.text, "water");
  assert.deepEqual(parsed.filters.kinds, ["kanji"]);
  assert.equal(parsed.filters.jlpt, "N5");
  assert.equal(parsed.filters.pos, "noun");
  assert.equal(parsed.filters.maxDifficulty, 4);
});

test("parses plural type aliases and negations", () => {
  const parsed = parseQuery("verb types:lexemes -casual");
  assert.deepEqual(parsed.filters.kinds, ["lexeme"]);
  assert.deepEqual(parsed.negations, ["casual"]);
  assert.equal(parsed.text, "verb");
});

test("ignores unknown operators as plain text", () => {
  const parsed = parseQuery("type:banana hello");
  assert.deepEqual(parsed.filters.kinds, []);
  assert.equal(parsed.text, "hello");
});

test("toTsQuery ANDs terms and supports prefix mode", () => {
  assert.equal(toTsQuery("to eat"), "to & eat");
  assert.equal(toTsQuery("to ea", { prefix: true }), "to & ea:*");
  assert.equal(toTsQuery("   "), "");
});

test("toTsQuery strips tsquery control characters", () => {
  assert.equal(toTsQuery("eat & drink!"), "eat & drink");
});

test("fuzzy threshold loosens for short queries", () => {
  assert.ok(similarityThreshold("ab") > similarityThreshold("abcdefghij"));
});

test("combineScore ranks exact matches above fuzzy ones", () => {
  const exact = combineScore({ rank: 0.1, similarity: 0.5, exact: true, prefix: true, boost: 0.2 });
  const fuzzy = combineScore({ rank: 0.1, similarity: 0.5, exact: false, prefix: false, boost: 0.2 });
  assert.ok(exact > fuzzy);
});

test("bestSuggestion skips the identical term", () => {
  const suggestion = bestSuggestion("tabemasu", [
    { title: "tabemasu", similarity: 1 },
    { title: "tabemono", similarity: 0.6 },
  ]);
  assert.equal(suggestion, "tabemono");
  assert.equal(bestSuggestion("zzz", [{ title: "aaa", similarity: 0.05 }]), null);
});

test("word similarity threshold stays strict enough to reject gibberish", async () => {
  const { wordSimilarityThreshold } = await import("../../src/lib/search/query.ts");
  // Measured against the live index: "watre"→"water" scores 0.50,
  // while pure gibberish peaks at 0.235.
  assert.ok(wordSimilarityThreshold("watre") <= 0.5);
  assert.ok(wordSimilarityThreshold("watre") > 0.235);
  assert.ok(wordSimilarityThreshold("zzzzqqqxnotathing") > 0.235);
});
