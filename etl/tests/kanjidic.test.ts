/**
 * KANJIDIC2 ETL unit tests — parse / normalize / validate / deduplicate.
 * Run: npx tsx --test etl/tests/kanjidic.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";

import { tagNodes, streamBlocksFrom } from "../parsers/xml-stream";
import {
  parseCharacterBlock,
  streamCharactersFrom,
} from "../parsers/kanjidic-parser";
import {
  computeKanjiContentHash,
  isKanjiLiteral,
  normalizeCharacter,
} from "../transforms/kanjidic-transform";
import { validateCharacter } from "../validators/kanjidic-validator";
import { Deduplicator } from "../validators/jmdict-validator";
import { buildKanjiFixture } from "../fixtures/generate-kanji-fixture";

const SAMPLE = `
<literal>日</literal>
<codepoint><cp_value cp_type="ucs">65e5</cp_value><cp_value cp_type="jis208">38-92</cp_value></codepoint>
<radical><rad_value rad_type="classical">72</rad_value><rad_value rad_type="nelson_c">72</rad_value></radical>
<misc><grade>1</grade><stroke_count>4</stroke_count><stroke_count>5</stroke_count><variant var_type="jis208">48-19</variant><freq>1</freq><jlpt>4</jlpt></misc>
<dic_number><dic_ref dr_type="nelson_c">2097</dic_ref></dic_number>
<query_code><q_code qc_type="skip">3-3-1</q_code></query_code>
<reading_meaning><rmgroup>
<reading r_type="pinyin">ri4</reading>
<reading r_type="ja_on">ニチ</reading>
<reading r_type="ja_kun">ひ</reading>
<meaning>day</meaning>
<meaning m_lang="fr">jour</meaning>
</rmgroup><nanori>あ</nanori><nanori>あき</nanori></reading_meaning>`;

/* -------------------------- shared xml utilities ------------------------ */

test("tagNodes captures attributes and decoded text", () => {
  const nodes = tagNodes('<reading r_type="ja_on">ニチ</reading>', "reading");
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].attrs.r_type, "ja_on");
  assert.equal(nodes[0].text, "ニチ");
});

test("streamBlocksFrom ignores prefix-colliding tag names", async () => {
  const xml =
    "<root><characterset>nope</characterset>" +
    "<character><literal>日</literal></character></root>";
  const blocks: string[] = [];
  for await (const b of streamBlocksFrom(Readable.from([xml]), "character")) {
    blocks.push(b);
  }
  assert.equal(blocks.length, 1);
  assert.match(blocks[0], /<literal>日<\/literal>/);
});

test("streamBlocksFrom handles attributes on the opening tag", async () => {
  const xml = '<root><character id="1"><literal>水</literal></character></root>';
  const blocks: string[] = [];
  for await (const b of streamBlocksFrom(Readable.from([xml]), "character")) {
    blocks.push(b);
  }
  assert.equal(blocks.length, 1);
  assert.match(blocks[0], /水/);
});

/* -------------------------------- parser -------------------------------- */

test("parseCharacterBlock extracts every KANJIDIC2 facet", () => {
  const c = parseCharacterBlock(SAMPLE);
  assert.ok(c);
  assert.equal(c.literal, "日");
  assert.equal(c.codepoints.ucs, "65e5");
  assert.equal(c.radicals.classical, 72);
  assert.equal(c.radicals.nelson_c, 72);
  assert.equal(c.grade, 1);
  assert.equal(c.strokeCount, 4);
  assert.deepEqual(c.strokeMiscounts, [5]);
  assert.equal(c.frequency, 1);
  assert.equal(c.jlptOld, 4);
  assert.deepEqual(c.variants, [{ type: "jis208", value: "48-19" }]);
  assert.equal(c.dictionaryRefs.nelson_c, "2097");
  assert.equal(c.queryCodes.skip, "3-3-1");
  assert.deepEqual(c.nanori, ["あ", "あき"]);
});

test("parser preserves reading types and meaning languages", () => {
  const c = parseCharacterBlock(SAMPLE);
  assert.ok(c);
  assert.deepEqual(
    c.readings.map((r) => `${r.type}:${r.value}`),
    ["pinyin:ri4", "ja_on:ニチ", "ja_kun:ひ"],
  );
  // Meaning without m_lang defaults to English.
  assert.deepEqual(c.meanings, [
    { lang: "en", value: "day" },
    { lang: "fr", value: "jour" },
  ]);
});

test("parseCharacterBlock returns null without a literal", () => {
  assert.equal(parseCharacterBlock("<misc><stroke_count>4</stroke_count></misc>"), null);
});

test("streamCharactersFrom survives chunk boundaries and honours limit", async () => {
  const xml = buildKanjiFixture(30);
  const chunks: string[] = [];
  for (let i = 0; i < xml.length; i += 11) chunks.push(xml.slice(i, i + 11));

  let all = 0;
  for await (const _c of streamCharactersFrom(Readable.from(chunks))) {
    void _c;
    all += 1;
  }
  assert.equal(all, 36); // 30 base + 6 edge cases

  let limited = 0;
  for await (const _c of streamCharactersFrom(Readable.from([xml]), { limit: 5 })) {
    void _c;
    limited += 1;
  }
  assert.equal(limited, 5);
});

/* ------------------------------ normalize ------------------------------- */

test("isKanjiLiteral distinguishes ideographs from kana and multi-char", () => {
  assert.equal(isKanjiLiteral("日"), true);
  assert.equal(isKanjiLiteral("鬱"), true);
  assert.equal(isKanjiLiteral("あ"), false);
  assert.equal(isKanjiLiteral("ア"), false);
  assert.equal(isKanjiLiteral("日本"), false);
  assert.equal(isKanjiLiteral(""), false);
});

test("normalizeCharacter maps radicals, readings and meanings", () => {
  const c = normalizeCharacter(parseCharacterBlock(SAMPLE)!);
  assert.equal(c.literal, "日");
  assert.equal(c.radicalClassical, 72);
  assert.equal(c.radicalNelson, 72);
  assert.equal(c.codepointUcs, "65e5");
  assert.equal(c.strokeCount, 4);
  assert.equal(c.jlptOld, 4);
  // Modern JLPT is NOT inferred from the legacy scale.
  assert.deepEqual(
    c.readings.map((r) => r.type),
    ["pinyin", "ja_on", "ja_kun"],
  );
  assert.deepEqual(
    c.meanings.map((m) => m.language),
    ["en", "fr"],
  );
});

test("normalizeCharacter drops unknown reading types and dupes", () => {
  const c = normalizeCharacter({
    literal: "水",
    codepoints: { ucs: "6c34" },
    radicals: { classical: 85 },
    grade: 1,
    strokeCount: 4,
    strokeMiscounts: [],
    frequency: 300,
    jlptOld: 4,
    variants: [],
    dictionaryRefs: {},
    queryCodes: {},
    readings: [
      { type: "ja_on", value: "スイ" },
      { type: "ja_on", value: "スイ" },
      { type: "bogus_type", value: "zzz" },
    ],
    meanings: [
      { lang: "en", value: "water" },
      { lang: "en", value: "Water" },
    ],
    nanori: [],
  });
  assert.equal(c.readings.length, 1);
  assert.equal(c.meanings.length, 1);
});

test("codepoint is derived when absent", () => {
  const c = normalizeCharacter({
    literal: "水",
    codepoints: {},
    radicals: {},
    grade: null,
    strokeCount: 4,
    strokeMiscounts: [],
    frequency: null,
    jlptOld: null,
    variants: [],
    dictionaryRefs: {},
    queryCodes: {},
    readings: [{ type: "ja_on", value: "スイ" }],
    meanings: [],
    nanori: [],
  });
  assert.equal(c.codepointUcs, "6c34");
});

test("kanji contentHash is stable and content-sensitive", () => {
  const base = {
    literal: "日",
    strokeCount: 4,
    grade: 1,
    readings: [{ type: "ja_on", value: "ニチ" }],
    meanings: [{ language: "en", value: "day" }],
  };
  assert.equal(computeKanjiContentHash(base), computeKanjiContentHash(base));
  assert.notEqual(
    computeKanjiContentHash(base),
    computeKanjiContentHash({ ...base, strokeCount: 5 }),
  );
});

/* ------------------------------- validate ------------------------------- */

test("validateCharacter accepts a well-formed character", () => {
  assert.equal(validateCharacter(normalizeCharacter(parseCharacterBlock(SAMPLE)!)), null);
});

test("validateCharacter rejects each malformed shape", () => {
  const make = (over: Record<string, unknown>) =>
    normalizeCharacter({
      literal: "日",
      codepoints: { ucs: "65e5" },
      radicals: {},
      grade: 1,
      strokeCount: 4,
      strokeMiscounts: [],
      frequency: null,
      jlptOld: null,
      variants: [],
      dictionaryRefs: {},
      queryCodes: {},
      readings: [{ type: "ja_on", value: "ニチ" }],
      meanings: [{ lang: "en", value: "day" }],
      nanori: [],
      ...over,
    } as Parameters<typeof normalizeCharacter>[0]);

  assert.match(validateCharacter(make({ literal: "あ" }))?.reason ?? "", /not a single CJK/);
  assert.match(validateCharacter(make({ strokeCount: null }))?.reason ?? "", /no stroke_count/);
  assert.match(validateCharacter(make({ strokeCount: 99 }))?.reason ?? "", /implausible/);
  assert.match(validateCharacter(make({ grade: 42 }))?.reason ?? "", /grade out of range/);
  assert.match(validateCharacter(make({ jlptOld: 5 }))?.reason ?? "", /legacy jlpt/);
  assert.match(
    validateCharacter(make({ readings: [], meanings: [] }))?.reason ?? "",
    /neither readings nor meanings/,
  );
});

/* --------------------- end-to-end (no database) ------------------------- */

test("fixture end-to-end: 300 valid, 4 invalid, 2 duplicates", async () => {
  const xml = buildKanjiFixture(300);
  const dedupe = new Deduplicator();
  let parsed = 0;
  let valid = 0;
  let invalid = 0;

  for await (const raw of streamCharactersFrom(Readable.from([xml]))) {
    parsed += 1;
    const c = normalizeCharacter(raw);
    if (validateCharacter(c)) {
      invalid += 1;
      continue;
    }
    if (!dedupe.accept(c.literal)) continue;
    valid += 1;
  }

  assert.equal(parsed, 306); // 300 base + 6 edge cases
  assert.equal(invalid, 4);
  assert.equal(dedupe.duplicateCount, 2);
  assert.equal(valid, 300);
});
