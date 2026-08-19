import assert from "node:assert/strict";
import { test } from "node:test";
import { checksum, validateKanji, validateLexeme } from "../../src/lib/kg/validate.ts";

test("lexeme validation requires kana reading and gloss", () => {
  assert.equal(validateLexeme({ lemma: "水", reading: "みず", glosses: ["water"] }).length, 0);
  assert.ok(validateLexeme({ lemma: "水", reading: "mizu", glosses: ["water"] }).length > 0);
});

test("kanji validation rejects latin", () => {
  assert.ok(validateKanji({ character: "A", strokes: 3 }).length > 0);
  assert.equal(validateKanji({ character: "山", strokes: 3 }).length, 0);
});

test("checksum is stable", () => {
  assert.equal(checksum(["a", "b"]), checksum(["a", "b"]));
});
