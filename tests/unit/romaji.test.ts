import assert from "node:assert/strict";
import { test } from "node:test";
import { romajiVariants, toRomaji } from "../../src/lib/search/romaji.ts";

test("transliterates basic hiragana", () => {
  assert.equal(toRomaji("たべる"), "taberu");
  assert.equal(toRomaji("みず"), "mizu");
  assert.equal(toRomaji("がくせい"), "gakusei");
});

test("handles digraphs and dakuten", () => {
  assert.equal(toRomaji("きょう"), "kyou");
  assert.equal(toRomaji("じゃ"), "ja");
  assert.equal(toRomaji("しゅくだい"), "shukudai");
});

test("doubles consonants after sokuon", () => {
  assert.equal(toRomaji("がっこう"), "gakkou");
  assert.equal(toRomaji("きって"), "kitte");
});

test("converts katakana and long vowels", () => {
  assert.equal(toRomaji("コーヒー"), "koohii");
  assert.equal(toRomaji("タクシー"), "takushii");
});

test("passes non-kana through untouched", () => {
  assert.equal(toRomaji("食べる"), "食beru");
  assert.equal(toRomaji(""), "");
});

test("collapses long vowels into a second variant", () => {
  assert.deepEqual(romajiVariants("とうきょう"), ["toukyou", "tokyo"]);
  assert.deepEqual(romajiVariants("みず"), ["mizu"]);
  assert.deepEqual(romajiVariants("コーヒー"), ["koohii", "kohi"]);
});
