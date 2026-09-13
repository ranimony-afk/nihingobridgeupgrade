/**
 * Integration tests for the v2 public dictionary API.
 *
 * Setup goes through existing ETL/public enrichment interfaces, never direct
 * fixture SQL. Assertions invoke route handlers as web and Flutter clients do.
 *
 * Run: npx tsx --test src/app/api/v2/dictionary/dictionary-v2.integration.test.ts
 */

import "dotenv/config";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { GET as getEntry } from "./entries/[id]/route";
import { GET as search } from "./search/route";
import { applySupplementalFeed } from "@/../etl/enrichment/supplemental-feed";
import { runJmdictPipeline } from "@/../etl/pipelines/jmdict-pipeline";
import { pool } from "@/db";
import type {
  DictionaryV2ApiError,
  DictionaryV2Entry,
  DictionaryV2SearchResponse,
} from "@/types/dictionary-v2";

const TEST_CHECKSUM = "e".repeat(64);

before(async () => {
  await runJmdictPipeline({ maxEntries: 505, batchSize: 100, resume: false });

  // Current JLPT publishes no fixed official item list. This test source is
  // explicitly synthetic/test-only and the v2 service exposes the labels as
  // source-curated, never official exam requirements.
  const result = await applySupplementalFeed(
    {
      manifest: {
        source: "jlpt",
        sourceUrl: "file://etl/fixtures/v2-jlpt-search-fixture.json",
        sourceVersion: "v2-fixture-1",
        license: "Synthetic test data — not for publication",
        attribution: "NihongoBridge v2 dictionary API test fixture",
        checksumSha256: TEST_CHECKSUM,
        checksumVerified: true,
        isFixture: true,
      },
      records: [
        { kind: "jlpt", dictionarySourceId: "1000000", level: "N5" }, // 水
        { kind: "jlpt", dictionarySourceId: "1000001", level: "N5" }, // 食べる
      ],
    },
    { allowFixtureProvenance: true },
  );
  assert.equal(result.accepted, true);
});

async function v2Search(query: string) {
  return search(new Request(`http://localhost/api/v2/dictionary/search?${query}`));
}

test("v2 search supports Japanese kanji headword queries", async () => {
  const response = await v2Search("q=%E9%A3%9F");
  assert.equal(response.status, 200);
  const body = (await response.json()) as DictionaryV2SearchResponse;
  const taberu = body.results.find((item) => item.headword === "食べる");
  assert.ok(taberu);
  assert.ok(taberu.matchedFields.includes("japanese"));
  assert.equal(body.apiVersion, "v2");
});

test("v2 search supports kana readings", async () => {
  const response = await v2Search("q=%E3%81%BF%E3%81%9A");
  assert.equal(response.status, 200);
  const body = (await response.json()) as DictionaryV2SearchResponse;
  assert.equal(body.results[0].headword, "水");
  assert.ok(body.results[0].matchedFields.includes("kana"));
  assert.equal(body.results[0].match, "exact");
});

test("v2 search converts complete romaji to kana while retaining literal search", async () => {
  const response = await v2Search("q=mizu");
  assert.equal(response.status, 200);
  const body = (await response.json()) as DictionaryV2SearchResponse;
  assert.equal(body.results[0].headword, "水");
  assert.ok(body.results[0].matchedFields.includes("romaji"));
});

test("v2 search supports English sense-gloss queries", async () => {
  const response = await v2Search("q=water");
  assert.equal(response.status, 200);
  const body = (await response.json()) as DictionaryV2SearchResponse;
  assert.equal(body.results[0].headword, "水");
  assert.equal(body.results[0].firstGloss, "water");
  assert.ok(body.results[0].matchedFields.includes("english"));
  assert.equal(body.results[0].match, "exact");
});

test("v2 search supports source-curated JLPT filter by itself and with a query", async () => {
  const response = await v2Search("jlpt=N5&limit=10");
  assert.equal(response.status, 200);
  const body = (await response.json()) as DictionaryV2SearchResponse;
  assert.equal(body.query, null);
  assert.equal(body.filters.jlpt, "N5");
  assert.ok(body.results.some((item) => item.headword === "水"));
  assert.ok(body.results.every((item) => item.jlptLevels.includes("N5")));

  const combined = await v2Search("q=water&jlpt=N5");
  assert.equal(combined.status, 200);
  const combinedBody = (await combined.json()) as DictionaryV2SearchResponse;
  assert.equal(combinedBody.total, 1);
  assert.equal(combinedBody.results[0].headword, "水");
});

test("v2 entry detail returns canonical aggregate with explicit v2 version", async () => {
  const lookup = await v2Search("q=water");
  const searchBody = (await lookup.json()) as DictionaryV2SearchResponse;
  const id = searchBody.results[0].id;

  const response = await getEntry(
    new Request(`http://localhost/api/v2/dictionary/entries/${id}`),
    { params: Promise.resolve({ id: String(id) }) },
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as DictionaryV2Entry;
  assert.equal(body.apiVersion, "v2");
  assert.equal(body.headword, "水");
  assert.ok(body.senses.some((sense) => sense.glosses.includes("water")));
  assert.equal(body.provenance?.source, "jmdict");
});

test("v2 search and entry reject invalid requests with stable errors", async () => {
  const missing = await v2Search("");
  assert.equal(missing.status, 400);
  assert.equal(((await missing.json()) as DictionaryV2ApiError).error.code, "INVALID_QUERY");

  const invalidJlpt = await v2Search("q=water&jlpt=N6");
  assert.equal(invalidJlpt.status, 400);
  assert.equal(((await invalidJlpt.json()) as DictionaryV2ApiError).error.code, "INVALID_QUERY");

  const invalidId = await getEntry(new Request("http://localhost/api/v2/dictionary/entries/a"), {
    params: Promise.resolve({ id: "a" }),
  });
  assert.equal(invalidId.status, 400);
  assert.equal(((await invalidId.json()) as DictionaryV2ApiError).error.code, "INVALID_ID");
});

after(async () => {
  await pool.end();
});
