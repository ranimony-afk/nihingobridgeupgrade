import assert from "node:assert/strict";
import { test } from "node:test";
import { checkBuilder, timelineFor, aiExplanation } from "../../src/lib/grammar/pure.ts";
import { GRAMMAR_POINTS, generateFiller } from "../../src/lib/grammar/corpus.ts";

test("builder accepts the exact tile order", () => {
  assert.equal(checkBuilder("わたしは学生です", ["わたし", "は", "学生", "です"]), true);
  assert.equal(checkBuilder("わたしは学生です", ["学生", "わたし", "は", "です"]), false);
});

test("timeline has four coaching steps", () => {
  const seed = GRAMMAR_POINTS[0]!;
  assert.equal(timelineFor(seed).length, 4);
  assert.ok(aiExplanation(seed).includes(seed.title));
});

test("filler generator scales toward capacity", () => {
  const rows = generateFiller(5, 100);
  assert.equal(rows.length, 5);
  assert.equal(rows[0]?.slug, "pattern-101");
});
