/**
 * Integration tests for the v2 kanji API.
 *
 * Setup goes through existing ETL pipeline interfaces — never direct fixture
 * SQL. Assertions invoke the route handlers exactly as a client would.
 *
 * Run: npx tsx --test src/app/api/v2/kanji/kanji-v2.integration.test.ts
 */

import "dotenv/config";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { GET as getDetail } from "./[literal]/route";
import { GET as search } from "./search/route";
import { runKanjidicPipeline } from "@/../etl/pipelines/kanjidic-pipeline";
import { runKradfilePipeline } from "@/../etl/pipelines/kradfile-pipeline";
import { pool } from "@/db";
import type {
  KanjiApiError,
  KanjiDetail,
  KanjiSearchResponse,
} from "@/types/kanji-v2";

before(async () => {
  // Idempotent: existing rows are unchanged on re-run.
  await runKanjidicPipeline({ maxEntries: 306, batchSize: 100, resume: false });
  await runKradfilePipeline({ allowFixtureProvenance: true, batchSize: 50 });
});

async function kanjiSearch(query: string) {
  return search(new Request(`http://localhost/api/v2/kanji/search?${query}`));
}

async function kanjiDetail(literal: string) {
  return getDetail(
    new Request(`http://localhost/api/v2/kanji/${encodeURIComponent(literal)}`),
    { params: Promise.resolve({ literal: encodeURIComponent(literal) }) },
  );
}

test("search by kanji literal", async () => {
  const response = await kanjiSearch("q=%E6%B0%B4"); // 水
  assert.equal(response.status, 200);
  const body = (await response.json()) as KanjiSearchResponse;

  assert.equal(body.apiVersion, "v2");
  assert.equal(body.total, 1);
  assert.equal(body.results[0].literal, "水");
  assert.ok(body.results[0].matchedFields.includes("literal"));
  assert.equal(body.results[0].strokeCount, 4);
  assert.ok(body.results[0].meanings.includes("water"));
});

test("search by English meaning and by kana reading", async () => {
  const byMeaning = await kanjiSearch("q=water");
  assert.equal(byMeaning.status, 200);
  const meaningBody = (await byMeaning.json()) as KanjiSearchResponse;
  assert.equal(meaningBody.results[0].literal, "水");
  assert.ok(meaningBody.results[0].matchedFields.includes("meaning"));

  const byKana = await kanjiSearch("q=%E3%81%BF%E3%81%9A"); // みず
  assert.equal(byKana.status, 200);
  const kanaBody = (await byKana.json()) as KanjiSearchResponse;
  assert.equal(kanaBody.results[0].literal, "水");
  assert.ok(kanaBody.results[0].matchedFields.includes("reading"));
});

test("search by romaji converts to a kana reading", async () => {
  const response = await kanjiSearch("q=mizu");
  assert.equal(response.status, 200);
  const body = (await response.json()) as KanjiSearchResponse;
  assert.equal(body.results[0].literal, "水");
  assert.ok(body.results[0].matchedFields.includes("reading"));
});

test("filter by stroke count and grade", async () => {
  const strokes = await kanjiSearch("strokes=4&limit=100");
  assert.equal(strokes.status, 200);
  const strokeBody = (await strokes.json()) as KanjiSearchResponse;
  assert.ok(strokeBody.total >= 1);
  assert.ok(strokeBody.results.every((item) => item.strokeCount === 4));

  const grade = await kanjiSearch("grade=1&limit=5");
  assert.equal(grade.status, 200);
  const gradeBody = (await grade.json()) as KanjiSearchResponse;
  assert.ok(gradeBody.total > 5, "enough grade-1 kanji to test pagination");
  assert.ok(gradeBody.results.every((item) => item.grade === 1));
});

test("filter by classical radical number", async () => {
  // 水's classical radical is 85.
  const response = await kanjiSearch("radical=85&limit=100");
  assert.equal(response.status, 200);
  const body = (await response.json()) as KanjiSearchResponse;
  assert.ok(body.total >= 1);
  assert.ok(body.results.some((item) => item.literal === "水"));
});

test("reverse component lookup finds kanji containing a component", async () => {
  // KRADFILE: 語 : 言 五 口   /   話 : 言 舌
  const response = await kanjiSearch("component=%E8%A8%80&limit=100"); // 言
  assert.equal(response.status, 200);
  const body = (await response.json()) as KanjiSearchResponse;
  assert.equal(body.filters.component, "言");
  assert.ok(body.total >= 2, "at least 語 and 話 share the 言 component");
  assert.ok(body.results.some((item) => item.literal === "語"));
  assert.ok(body.results.some((item) => item.literal === "話"));
});

test("pagination returns distinct pages and reports an accurate total", async () => {
  const first = await kanjiSearch("grade=1&limit=5&offset=0");
  const second = await kanjiSearch("grade=1&limit=5&offset=5");
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);

  const page1 = (await first.json()) as KanjiSearchResponse;
  const page2 = (await second.json()) as KanjiSearchResponse;

  assert.equal(page1.limit, 5);
  assert.equal(page1.offset, 0);
  assert.equal(page2.offset, 5);
  assert.equal(page1.total, page2.total);

  const page1Literals = page1.results.map((item) => item.literal);
  const page2Literals = page2.results.map((item) => item.literal);
  assert.equal(page1Literals.length, 5);
  assert.equal(
    page1Literals.filter((literal) => page2Literals.includes(literal)).length,
    0,
    "pages must not overlap",
  );
});

test("kanji detail returns readings, radicals, components and vocabulary", async () => {
  const response = await kanjiDetail("語");
  assert.equal(response.status, 200);
  const body = (await response.json()) as KanjiDetail;

  assert.equal(body.apiVersion, "v2");
  assert.equal(body.literal, "語");
  assert.equal(body.strokeCount, 14);
  assert.ok(body.meanings.includes("word"));

  // Readings are separated by type
  assert.ok(body.onReadings.includes("ゴ"));
  assert.ok(body.kunReadings.some((reading) => reading.startsWith("かた")));

  // Radicals from KANJIDIC2
  assert.ok(body.radicals.some((r) => r.system === "kangxi-classical" && r.number === 149));

  // KRADFILE component decomposition
  assert.deepEqual(body.components.sort(), ["五", "口", "言"].sort());

  // This fixture's dictionary corpus contains no word using 語, so vocabulary
  // is legitimately empty here (covered explicitly for 水 below).
  assert.equal(body.vocabulary.length, 0);

  // Provenance
  assert.equal(body.provenance?.source, "kanjidic2");
  assert.match(body.provenance?.checksumSha256 ?? "", /^[0-9a-f]{64}$/);
});

test("kanji detail keeps legacy JLPT strictly separate from modern N-levels", async () => {
  const response = await kanjiDetail("水");
  assert.equal(response.status, 200);
  const body = (await response.json()) as KanjiDetail;

  // Vocabulary: dictionary words whose headword contains 水
  assert.ok(body.vocabulary.length > 0);
  assert.ok(body.vocabulary.some((entry) => entry.headword === "水"));
  assert.ok(body.vocabulary.every((entry) => entry.headword.includes("水")));
  assert.ok(body.vocabulary.some((entry) => entry.firstGloss.length > 0));

  // KANJIDIC2's jlpt_old=4 is the LEGACY 4-level scale (≈ modern N5 in
  // difficulty, but a different scale). It must not be surfaced as an N-level.
  assert.equal(body.jlptLegacy, 4);
  assert.equal(body.jlptLevels.length, 0, "no approved modern N-level source exists yet");

  // Searching by N-level must therefore yield no results, not a false mapping.
  const byJlpt = await kanjiSearch("jlpt=N5&limit=100");
  assert.equal(byJlpt.status, 200);
  const jlptBody = (await byJlpt.json()) as KanjiSearchResponse;
  assert.equal(jlptBody.total, 0);
  assert.deepEqual(jlptBody.results, []);
});

test("search rejects requests with no criteria and invalid filters", async () => {
  const missing = await kanjiSearch("");
  assert.equal(missing.status, 400);
  assert.equal(((await missing.json()) as KanjiApiError).error.code, "INVALID_QUERY");

  const badJlpt = await kanjiSearch("jlpt=N6");
  assert.equal(badJlpt.status, 400);
  assert.equal(((await badJlpt.json()) as KanjiApiError).error.code, "INVALID_QUERY");

  const badComponent = await kanjiSearch("component=%E3%81%82"); // あ (kana)
  assert.equal(badComponent.status, 400);
  assert.equal(((await badComponent.json()) as KanjiApiError).error.code, "INVALID_QUERY");

  const badStrokes = await kanjiSearch("strokes=999");
  assert.equal(badStrokes.status, 400);
  assert.equal(((await badStrokes.json()) as KanjiApiError).error.code, "INVALID_QUERY");

  const badLimit = await kanjiSearch("q=%E6%B0%B4&limit=101");
  assert.equal(badLimit.status, 400);
  assert.equal(((await badLimit.json()) as KanjiApiError).error.code, "INVALID_QUERY");
});

test("kanji detail rejects non-kanji literals and reports unknown kanji", async () => {
  const kana = await kanjiDetail("あ");
  assert.equal(kana.status, 400);
  assert.equal(((await kana.json()) as KanjiApiError).error.code, "INVALID_LITERAL");

  const multi = await kanjiDetail("日本"); // two characters
  assert.equal(multi.status, 400);
  assert.equal(((await multi.json()) as KanjiApiError).error.code, "INVALID_LITERAL");

  // A valid ideograph that is absent from the corpus
  const missing = await kanjiDetail("鬱");
  assert.equal(missing.status, 404);
  assert.equal(((await missing.json()) as KanjiApiError).error.code, "NOT_FOUND");
});

after(async () => {
  await pool.end();
});
