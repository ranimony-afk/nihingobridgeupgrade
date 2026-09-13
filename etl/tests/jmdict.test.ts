/**
 * ETL unit tests — parse / normalize / validate / deduplicate stages.
 * Run: npx tsx --test etl/tests/jmdict.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";

import {
  decodeXmlEntities,
  parseEntryBlock,
  streamEntriesFrom,
} from "../parsers/jmdict-parser";
import {
  computeContentHash,
  isCommonPriority,
  normalizeEntry,
  normalizeText,
} from "../transforms/jmdict-transform";
import { Deduplicator, validateEntry } from "../validators/jmdict-validator";
import { buildFixture } from "../fixtures/generate-fixture";

/* ------------------------------- parser -------------------------------- */

test("decodeXmlEntities handles escapes, numeric refs and JMdict tag entities", () => {
  assert.equal(decodeXmlEntities("a &amp; b"), "a & b");
  assert.equal(decodeXmlEntities("&lt;tag&gt;"), "<tag>");
  assert.equal(decodeXmlEntities("&#x6C34;"), "水");
  assert.equal(decodeXmlEntities("&#27700;"), "水");
  // JMdict POS entity unwraps to its bare tag name
  assert.equal(decodeXmlEntities("&adj-na;"), "adj-na");
});

test("parseEntryBlock extracts kanji, readings and senses", () => {
  const block = `
    <ent_seq>1000220</ent_seq>
    <k_ele><keb>明白</keb><ke_pri>ichi1</ke_pri></k_ele>
    <r_ele><reb>めいはく</reb><re_pri>ichi1</re_pri></r_ele>
    <sense><pos>&adj-na;</pos><gloss>obvious</gloss><gloss>clear</gloss></sense>`;
  const entry = parseEntryBlock(block);
  assert.ok(entry);
  assert.equal(entry.entSeq, "1000220");
  assert.equal(entry.kanji[0].keb, "明白");
  assert.deepEqual(entry.kanji[0].kePri, ["ichi1"]);
  assert.equal(entry.readings[0].reb, "めいはく");
  assert.deepEqual(entry.senses[0].glosses, ["obvious", "clear"]);
  assert.deepEqual(entry.senses[0].pos, ["adj-na"]);
});

test("parseEntryBlock returns null without ent_seq", () => {
  assert.equal(parseEntryBlock("<k_ele><keb>水</keb></k_ele>"), null);
});

test("parser detects re_nokanji", () => {
  const entry = parseEntryBlock(
    "<ent_seq>1</ent_seq><r_ele><reb>ありがとう</reb><re_nokanji/></r_ele>",
  );
  assert.equal(entry?.readings[0].noKanji, true);
});

test("streamEntriesFrom yields entries split across chunk boundaries", async () => {
  const xml =
    "<JMdict><entry><ent_seq>1</ent_seq><r_ele><reb>あ</reb></r_ele>" +
    "<sense><gloss>a</gloss></sense></entry>" +
    "<entry><ent_seq>2</ent_seq><r_ele><reb>い</reb></r_ele>" +
    "<sense><gloss>i</gloss></sense></entry></JMdict>";

  // 7-byte chunks force entries to straddle boundaries.
  const chunks: string[] = [];
  for (let i = 0; i < xml.length; i += 7) chunks.push(xml.slice(i, i + 7));

  const got: string[] = [];
  for await (const e of streamEntriesFrom(Readable.from(chunks))) {
    got.push(e.entSeq);
  }
  assert.deepEqual(got, ["1", "2"]);
});

test("streamEntriesFrom honours the limit option", async () => {
  const xml = buildFixture(50);
  let n = 0;
  for await (const _e of streamEntriesFrom(Readable.from([xml]), { limit: 10 })) {
    void _e;
    n += 1;
  }
  assert.equal(n, 10);
});

/* ----------------------------- normalize -------------------------------- */

test("normalizeText collapses whitespace", () => {
  assert.equal(normalizeText("  a\n\t b  "), "a b");
});

test("isCommonPriority recognises tiers and nf bands", () => {
  assert.equal(isCommonPriority(["ichi1"]), true);
  assert.equal(isCommonPriority(["nf05"]), true);
  assert.equal(isCommonPriority(["nf48"]), false);
  assert.equal(isCommonPriority(["ichi2"]), false);
  assert.equal(isCommonPriority([]), false);
});

test("normalizeEntry dedupes tags/glosses and marks common", () => {
  const entry = normalizeEntry({
    entSeq: "123",
    kanji: [{ keb: "水", kePri: ["ichi1", "ichi1"], keInf: [] }],
    readings: [{ reb: "みず", rePri: ["nf05"], reInf: [], noKanji: false }],
    senses: [
      {
        glosses: ["water", "Water", "cold water"],
        pos: ["n", "n"],
        field: [],
        misc: [],
        dial: [],
        info: [],
      },
    ],
  });

  assert.equal(entry.headword, "水");
  assert.equal(entry.primaryReading, "みず");
  assert.equal(entry.isCommon, true);
  assert.deepEqual(entry.kanji[0].priorityTags, ["ichi1"]);
  assert.deepEqual(entry.senses[0].partsOfSpeech, ["n"]);
  // case-insensitive gloss dedupe
  assert.deepEqual(entry.senses[0].glosses, ["water", "cold water"]);
});

test("kana-only entry uses its reading as the headword", () => {
  const entry = normalizeEntry({
    entSeq: "9",
    kanji: [],
    readings: [{ reb: "ありがとう", rePri: [], reInf: [], noKanji: true }],
    senses: [{ glosses: ["thanks"], pos: ["int"], field: [], misc: [], dial: [], info: [] }],
  });
  assert.equal(entry.headword, "ありがとう");
});

test("contentHash is stable and content-sensitive", () => {
  const base = {
    sourceId: "1",
    kanji: [{ text: "水" }],
    readings: [{ text: "みず" }],
    senses: [{ glosses: ["water"] }],
  };
  const changed = { ...base, senses: [{ glosses: ["fire"] }] };
  assert.equal(computeContentHash(base), computeContentHash(base));
  assert.notEqual(computeContentHash(base), computeContentHash(changed));
});

/* ------------------------------ validate -------------------------------- */

test("validateEntry accepts a well-formed entry", () => {
  const ok = normalizeEntry({
    entSeq: "1",
    kanji: [{ keb: "水", kePri: [], keInf: [] }],
    readings: [{ reb: "みず", rePri: [], reInf: [], noKanji: false }],
    senses: [{ glosses: ["water"], pos: ["n"], field: [], misc: [], dial: [], info: [] }],
  });
  assert.equal(validateEntry(ok), null);
});

test("validateEntry rejects missing reading and missing gloss", () => {
  const noReading = normalizeEntry({
    entSeq: "2",
    kanji: [{ keb: "欠落", kePri: [], keInf: [] }],
    readings: [],
    senses: [{ glosses: ["x"], pos: [], field: [], misc: [], dial: [], info: [] }],
  });
  assert.match(validateEntry(noReading)?.reason ?? "", /no reading/);

  const noGloss = normalizeEntry({
    entSeq: "3",
    kanji: [{ keb: "無効", kePri: [], keInf: [] }],
    readings: [{ reb: "むこう", rePri: [], reInf: [], noKanji: false }],
    senses: [{ glosses: [], pos: ["n"], field: [], misc: [], dial: [], info: [] }],
  });
  assert.match(validateEntry(noGloss)?.reason ?? "", /no sense with a gloss/);
});

/* ----------------------------- deduplicate ------------------------------ */

test("Deduplicator accepts first occurrence only", () => {
  const d = new Deduplicator();
  assert.equal(d.accept("1"), true);
  assert.equal(d.accept("2"), true);
  assert.equal(d.accept("1"), false);
  assert.equal(d.uniqueCount, 2);
  assert.equal(d.duplicateCount, 1);
});

/* --------------------- end-to-end (no database) ------------------------- */

test("fixture end-to-end: 500 valid, 2 invalid, 2 duplicates", async () => {
  const xml = buildFixture(500);
  const dedupe = new Deduplicator();
  let parsed = 0;
  let valid = 0;
  let invalid = 0;

  for await (const raw of streamEntriesFrom(Readable.from([xml]))) {
    parsed += 1;
    const entry = normalizeEntry(raw);
    if (validateEntry(entry)) {
      invalid += 1;
      continue;
    }
    if (!dedupe.accept(entry.sourceId)) continue;
    valid += 1;
  }

  // 500 base + kana-only + 2 invalid + 2 duplicates
  assert.equal(parsed, 505);
  assert.equal(invalid, 2);
  assert.equal(dedupe.duplicateCount, 2);
  assert.equal(valid, 501); // 500 base + 1 kana-only
});
