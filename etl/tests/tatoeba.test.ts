/**
 * Tatoeba ETL unit tests — TSV parse / normalize / licensing / validate / dedup.
 * Run: npx tsx --test etl/tests/tatoeba.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";

import { isNullField, streamTsvRows } from "../parsers/tsv-stream";
import {
  parseLinkRow,
  parseSentenceRow,
  streamSentencesFrom,
} from "../parsers/tatoeba-parser";
import {
  buildAttribution,
  computeSentenceContentHash,
  normalizeSentence,
  normalizeSentenceText,
} from "../transforms/tatoeba-transform";
import {
  containsJapaneseScript,
  validateSentence,
} from "../validators/tatoeba-validator";
import { Deduplicator } from "../validators/jmdict-validator";
import { buildTatoebaFixture } from "../fixtures/generate-tatoeba-fixture";

/* ------------------------------ TSV reader ------------------------------ */

test("streamTsvRows splits on tab and handles CRLF", async () => {
  const rows: string[][] = [];
  for await (const r of streamTsvRows(Readable.from(["a\tb\tc\r\nd\te\tf\n"]))) {
    rows.push(r);
  }
  assert.deepEqual(rows, [
    ["a", "b", "c"],
    ["d", "e", "f"],
  ]);
});

test("streamTsvRows emits a final line with no trailing newline", async () => {
  const rows: string[][] = [];
  for await (const r of streamTsvRows(Readable.from(["x\ty"]))) rows.push(r);
  assert.deepEqual(rows, [["x", "y"]]);
});

test("streamTsvRows survives chunk boundaries", async () => {
  const text = "1\tjpn\t水\tck\n2\teng\twater\tck\n";
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += 3) chunks.push(text.slice(i, i + 3));
  const rows: string[][] = [];
  for await (const r of streamTsvRows(Readable.from(chunks))) rows.push(r);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], ["1", "jpn", "水", "ck"]);
});

test("isNullField recognises Tatoeba's \\N sentinel", () => {
  assert.equal(isNullField("\\N"), true);
  assert.equal(isNullField(""), true);
  assert.equal(isNullField("ck"), false);
});

/* -------------------------------- parser -------------------------------- */

test("parseSentenceRow reads the detailed export shape", () => {
  const s = parseSentenceRow([
    "123",
    "jpn",
    "水を飲む。",
    "tanaka",
    "2023-01-01",
    "2023-06-01",
  ]);
  assert.ok(s);
  assert.equal(s.sourceId, "123");
  assert.equal(s.lang, "jpn");
  assert.equal(s.text, "水を飲む。");
  assert.equal(s.username, "tanaka");
});

test("parseSentenceRow maps \\N owner to null", () => {
  const s = parseSentenceRow(["1", "jpn", "文。", "\\N", "d", "d"]);
  assert.equal(s?.username, null);
});

test("parseSentenceRow rejects short rows", () => {
  assert.equal(parseSentenceRow(["1", "jpn"]), null);
});

test("parseLinkRow validates and rejects self-links", () => {
  assert.deepEqual(parseLinkRow(["1", "2"]), {
    sourceId: "1",
    translationSourceId: "2",
  });
  assert.equal(parseLinkRow(["1", "1"]), null, "self-link");
  assert.equal(parseLinkRow(["a", "2"]), null, "non-numeric");
  assert.equal(parseLinkRow(["1"]), null, "short row");
});

test("streamSentencesFrom honours limit", async () => {
  const { sentences } = buildTatoebaFixture(20);
  let n = 0;
  for await (const _s of streamSentencesFrom(Readable.from([sentences]), { limit: 7 })) {
    void _s;
    n += 1;
  }
  assert.equal(n, 7);
});

/* ---------------------- normalization & licensing ----------------------- */

test("normalizeSentenceText collapses spaces but keeps the sentence", () => {
  assert.equal(normalizeSentenceText("  水を   飲む。 "), "水を 飲む。");
});

test("buildAttribution cites the contributor", () => {
  assert.equal(
    buildAttribution("tanaka", "42", "CC BY 2.0 FR"),
    "tanaka — Tatoeba sentence #42 (CC BY 2.0 FR)",
  );
});

test("buildAttribution falls back to the project when the owner is unknown", () => {
  assert.equal(
    buildAttribution(null, "42", "CC BY 2.0 FR"),
    "Tatoeba — Tatoeba sentence #42 (CC BY 2.0 FR)",
  );
});

test("every normalized sentence carries a non-empty attribution and license", () => {
  const withOwner = normalizeSentence({
    sourceId: "1",
    lang: "JPN",
    text: "水を飲む。",
    username: "ck",
    dateAdded: null,
    dateModified: null,
  });
  assert.equal(withOwner.lang, "jpn", "language is lowercased");
  assert.equal(withOwner.ownerUsername, "ck");
  assert.equal(withOwner.ownerUnknown, false);
  assert.ok(withOwner.attribution.includes("ck"));
  assert.equal(withOwner.license, "CC BY 2.0 FR");

  const orphan = normalizeSentence({
    sourceId: "2",
    lang: "jpn",
    text: "文。",
    username: null,
    dateAdded: null,
    dateModified: null,
  });
  assert.equal(orphan.ownerUnknown, true);
  assert.ok(orphan.attribution.length > 0, "orphan still attributed");
});

test("charLength counts codepoints, not UTF-16 units", () => {
  const s = normalizeSentence({
    sourceId: "1",
    lang: "jpn",
    text: "水を飲む。",
    username: "ck",
    dateAdded: null,
    dateModified: null,
  });
  assert.equal(s.charLength, 5);
});

test("sentence contentHash is stable and content-sensitive", () => {
  const base = { sourceId: "1", lang: "jpn", text: "水。" };
  assert.equal(computeSentenceContentHash(base), computeSentenceContentHash(base));
  assert.notEqual(
    computeSentenceContentHash(base),
    computeSentenceContentHash({ ...base, text: "火。" }),
  );
});

/* ------------------------------- validate ------------------------------- */

test("containsJapaneseScript detects kana and kanji only", () => {
  assert.equal(containsJapaneseScript("水を飲む"), true);
  assert.equal(containsJapaneseScript("ひらがな"), true);
  assert.equal(containsJapaneseScript("カタカナ"), true);
  assert.equal(containsJapaneseScript("plain english"), false);
});

test("validateSentence accepts a good Japanese sentence", () => {
  const s = normalizeSentence({
    sourceId: "1",
    lang: "jpn",
    text: "水を飲みます。",
    username: "ck",
    dateAdded: null,
    dateModified: null,
  });
  assert.equal(validateSentence(s, { requireLangs: ["jpn"], enforceScript: true }), null);
});

test("validateSentence rejects each malformed shape", () => {
  const make = (over: Partial<Parameters<typeof normalizeSentence>[0]>) =>
    normalizeSentence({
      sourceId: "1",
      lang: "jpn",
      text: "水を飲みます。",
      username: "ck",
      dateAdded: null,
      dateModified: null,
      ...over,
    });

  assert.match(
    validateSentence(make({ sourceId: "abc" }))?.reason ?? "",
    /must be numeric/,
  );
  assert.match(validateSentence(make({ text: "" }))?.reason ?? "", /no text/);
  assert.match(
    validateSentence(make({ text: "壊れた\u0007文。" }))?.reason ?? "",
    /control characters/,
  );
  assert.match(
    validateSentence(make({ lang: "japanese" }))?.reason ?? "",
    /invalid ISO 639-3/,
  );
  assert.match(
    validateSentence(make({ text: "あ".repeat(400) }))?.reason ?? "",
    /outside 1-300/,
  );
  assert.match(
    validateSentence(make({ lang: "eng", text: "hello" }), { requireLangs: ["jpn"] })
      ?.reason ?? "",
    /unexpected language/,
  );
  assert.match(
    validateSentence(make({ text: "This is not Japanese" }), { enforceScript: true })
      ?.reason ?? "",
    /no Japanese script/,
  );
});

/* --------------------- end-to-end (no database) ------------------------- */

test("fixture end-to-end: jpn filter, 4 invalid, 2 duplicates", async () => {
  const { sentences } = buildTatoebaFixture(250);
  const dedupe = new Deduplicator();
  let parsed = 0;
  let filtered = 0;
  let valid = 0;
  let invalid = 0;
  let orphans = 0;

  for await (const raw of streamSentencesFrom(Readable.from([sentences]))) {
    parsed += 1;
    const s = normalizeSentence(raw);
    if (s.lang !== "jpn") {
      filtered += 1;
      continue;
    }
    if (validateSentence(s, { requireLangs: ["jpn"], enforceScript: true })) {
      invalid += 1;
      continue;
    }
    if (!dedupe.accept(s.sourceId)) continue;
    if (s.ownerUnknown) orphans += 1;
    valid += 1;
  }

  // Fixture composition:
  //   250 jpn + 250 eng + 1 orphan(jpn) + 4 malformed jpn
  //   + 1 bad-language row + 2 duplicate jpn = 508 rows
  assert.equal(parsed, 508);

  // 250 English + 1 row tagged "japanese". The bad-language row is FILTERED,
  // not rejected, because language filtering runs before validation — an
  // other-language row is out of scope, not bad data.
  assert.equal(filtered, 251, "English + out-of-scope language rows");

  // no-Japanese-script, control characters, over-length, empty text
  assert.equal(invalid, 4);
  assert.equal(dedupe.duplicateCount, 2);
  assert.equal(valid, 251, "250 seeded + 1 orphan");
  assert.equal(orphans, 1, "orphan is kept, attributed to the project");
});

test("multi-language ingest keeps both sides so links can resolve", async () => {
  const { sentences } = buildTatoebaFixture(50);
  const langs = ["jpn", "eng"];
  const ingested = new Set<string>();
  let filtered = 0;

  for await (const raw of streamSentencesFrom(Readable.from([sentences]))) {
    const s = normalizeSentence(raw);
    if (!langs.includes(s.lang)) {
      filtered += 1;
      continue;
    }
    if (validateSentence(s, { requireLangs: langs, enforceScript: true })) continue;
    ingested.add(s.sourceId);
  }

  // Only the bad-language row is filtered now; English is retained.
  assert.equal(filtered, 1, "only the invalid-language row is out of scope");

  // Every seeded jp/en pair must now have BOTH endpoints available.
  const { links } = buildTatoebaFixture(50);
  const pairs = links
    .trimEnd()
    .split("\n")
    .map((l) => l.split("\t"))
    .map((r) => parseLinkRow(r))
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const resolvable = pairs.filter(
    (p) => ingested.has(p.sourceId) && ingested.has(p.translationSourceId),
  );
  // 50 pairs x 2 directions resolve; the 2 dangling ones do not.
  assert.equal(resolvable.length, 100);
});

test("links fixture contains bidirectional pairs and danglers", () => {
  const { links } = buildTatoebaFixture(5);
  const rows = links
    .trimEnd()
    .split("\n")
    .map((l) => l.split("\t"));
  // 5 pairs x2 directions + 2 dangling + 1 self-link
  assert.equal(rows.length, 13);
  const parsed = rows.map((r) => parseLinkRow(r)).filter(Boolean);
  assert.equal(parsed.length, 12, "self-link dropped by parser");
});
