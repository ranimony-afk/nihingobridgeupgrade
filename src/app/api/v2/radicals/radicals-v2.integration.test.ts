/**
 * Integration tests for the v2 radical / component-relationship API.
 *
 * Setup runs the public ETL pipelines; assertions invoke route handlers
 * exactly as a client would.
 *
 * Run: npx tsx --test src/app/api/v2/radicals/radicals-v2.integration.test.ts
 */

import "dotenv/config";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { GET as getRadical } from "./[number]/route";
import { GET as getIndex } from "./route";
import { GET as kanjiSearch } from "../kanji/search/route";
import { runKanjidicPipeline } from "@/../etl/pipelines/kanjidic-pipeline";
import { runKradfilePipeline } from "@/../etl/pipelines/kradfile-pipeline";
import { runRadicalPipeline } from "@/../etl/pipelines/radical-pipeline";
import { pool } from "@/db";
import type { KanjiSearchResponse } from "@/types/kanji-v2";
import type {
  ComponentIndexResponse,
  RadicalApiError,
  RadicalDetail,
  RadicalIndexResponse,
} from "@/types/radical-v2";

before(async () => {
  await runKanjidicPipeline({ maxEntries: 306, batchSize: 100, resume: false });
  await runKradfilePipeline({ allowFixtureProvenance: true, batchSize: 50 });
  await runRadicalPipeline({ allowFixtureProvenance: true });
});

async function search(query: string) {
  return kanjiSearch(new Request(`http://localhost/api/v2/kanji/search?${query}`));
}

async function radicalDetail(number: string) {
  return getRadical(new Request(`http://localhost/api/v2/radicals/${number}`), {
    params: Promise.resolve({ number }),
  });
}

/* ------------------------------ radical index ----------------------------- */

test("radical index returns all 214 Kangxi radicals grouped by stroke count", async () => {
  const response = await getIndex(new Request("http://localhost/api/v2/radicals"));
  assert.equal(response.status, 200);
  const body = (await response.json()) as RadicalIndexResponse;

  assert.equal(body.apiVersion, "v2");
  assert.equal(body.total, 214);

  // Groups ascend by stroke count and collectively contain every radical.
  const strokeCounts = body.groups.map((group) => group.strokeCount);
  assert.deepEqual(strokeCounts, [...strokeCounts].sort((a, b) => a - b));
  const all = body.groups.flatMap((group) => group.radicals);
  assert.equal(all.length, 214);

  const numbers = all.map((radical) => radical.number).sort((a, b) => a - b);
  assert.equal(numbers[0], 1);
  assert.equal(numbers[213], 214);
});

test("radicals carry identity, not just a number", async () => {
  const response = await getIndex(new Request("http://localhost/api/v2/radicals"));
  const body = (await response.json()) as RadicalIndexResponse;
  const water = body.groups
    .flatMap((group) => group.radicals)
    .find((radical) => radical.number === 85);

  assert.ok(water, "radical 85 must exist");
  assert.equal(water.character, "水");
  assert.equal(water.meaning, "water");
  assert.equal(water.strokeCount, 4);
  // Positional variants are what make 氵 recognisable as radical 85.
  assert.ok(water.variants.includes("氵"));
});

test("component index only offers components present in the corpus", async () => {
  const response = await getIndex(
    new Request("http://localhost/api/v2/radicals?view=components"),
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as ComponentIndexResponse;

  assert.ok(body.total > 0);
  const speech = body.components.find((option) => option.component === "言");
  assert.ok(speech, "言 is a component of 語 and 話 in the fixture");
  assert.equal(speech.radicalNumber, 149);
  assert.equal(speech.kanjiCount, 2);

  // Every listed component must actually be used by at least one kanji.
  assert.ok(body.components.every((option) => option.kanjiCount > 0));
});

test("index rejects an unknown view", async () => {
  const response = await getIndex(
    new Request("http://localhost/api/v2/radicals?view=bogus"),
  );
  assert.equal(response.status, 400);
  assert.equal(((await response.json()) as RadicalApiError).error.code, "INVALID_QUERY");
});

/* ----------------------------- radical detail ----------------------------- */

test("radical detail separates classification from component usage", async () => {
  const response = await radicalDetail("149"); // 言
  assert.equal(response.status, 200);
  const body = (await response.json()) as RadicalDetail;

  assert.equal(body.character, "言");
  assert.equal(body.meaning, "speech");
  assert.equal(body.strokeCount, 7);

  // Classified under radical 149 (KANJIDIC2 radical_classical).
  assert.ok(body.kanjiByRadical.some((item) => item.literal === "語"));

  // Contains 言 as a component (KRADFILE decomposition) — a distinct relation.
  const componentLiterals = body.kanjiByComponent.map((item) => item.literal);
  assert.ok(componentLiterals.includes("語"));
  assert.ok(componentLiterals.includes("話"));

  assert.ok(body.provenance?.license.includes("public domain"));
});

test("radical detail rejects out-of-range and non-numeric numbers", async () => {
  for (const bad of ["0", "215", "abc"]) {
    const response = await radicalDetail(bad);
    assert.equal(response.status, 400, `expected 400 for ${bad}`);
    assert.equal(
      ((await response.json()) as RadicalApiError).error.code,
      "INVALID_NUMBER",
    );
  }
});

/* ------------------------ multi-component AND search ---------------------- */

test("single component search finds every kanji containing it", async () => {
  const response = await search("components=%E8%A8%80"); // 言
  assert.equal(response.status, 200);
  const body = (await response.json()) as KanjiSearchResponse;

  assert.deepEqual(body.filters.components, ["言"]);
  assert.equal(body.total, 2);
  const literals = body.results.map((item) => item.literal).sort();
  assert.deepEqual(literals, ["語", "話"].sort());
});

test("multi-component search requires ALL components (AND, not OR)", async () => {
  // 語 = 言 五 口 ; 話 = 言 舌. Only 語 has both 言 and 口.
  const response = await search("components=%E8%A8%80,%E5%8F%A3"); // 言,口
  assert.equal(response.status, 200);
  const body = (await response.json()) as KanjiSearchResponse;

  assert.deepEqual(body.filters.components, ["言", "口"]);
  assert.equal(body.total, 1, "AND semantics must exclude 話");
  assert.equal(body.results[0].literal, "語");
});

test("multi-component search accepts a bare concatenated list", async () => {
  const response = await search("components=%E6%97%A5"); // 日
  const body = (await response.json()) as KanjiSearchResponse;
  const literals = body.results.map((item) => item.literal).sort();
  // 日 itself, 時 (日 土 寸) and 間 (門 日)
  assert.deepEqual(literals, ["日", "時", "間"].sort());
});

test("an impossible component combination returns zero, not an error", async () => {
  // 舌 (in 話) and 口 (in 語) never co-occur in the fixture.
  const response = await search("components=%E8%88%8C,%E5%8F%A3");
  assert.equal(response.status, 200);
  const body = (await response.json()) as KanjiSearchResponse;
  assert.equal(body.total, 0);
  assert.deepEqual(body.results, []);
});

test("component search composes with other filters", async () => {
  const response = await search("components=%E6%97%A5&strokes=4");
  assert.equal(response.status, 200);
  const body = (await response.json()) as KanjiSearchResponse;
  assert.ok(body.results.every((item) => item.strokeCount === 4));
  assert.ok(body.results.some((item) => item.literal === "日"));
});

test("components filter rejects non-kanji input", async () => {
  const kana = await search("components=%E3%81%82"); // あ
  assert.equal(kana.status, 400);

  const tooMany = await search(
    `components=${encodeURIComponent("一二三四五六七八九十日月水")}`,
  );
  assert.equal(tooMany.status, 400);
});

after(async () => {
  await pool.end();
});
