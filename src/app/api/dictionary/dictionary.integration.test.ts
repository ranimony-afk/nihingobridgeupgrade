/**
 * API integration tests for the canonical dictionary HTTP contract.
 *
 * The setup uses the ETL public pipeline, never direct fixture SQL; assertions
 * exercise the route handlers exactly as a web/mobile client would.
 *
 * Run: npx tsx --test src/app/api/dictionary/dictionary.integration.test.ts
 */

import "dotenv/config";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { GET as getEntry } from "./[id]/route";
import { GET as search } from "./route";
import { runJmdictPipeline } from "@/../etl/pipelines/jmdict-pipeline";
import { pool } from "@/db";
import type {
  ApiError,
  DictionaryEntry,
  DictionarySearchResponse,
} from "@/types/dictionary";

before(async () => {
  // Fixture setup remains idempotent; existing rows are unchanged.
  await runJmdictPipeline({ maxEntries: 505, batchSize: 100, resume: false });
});

test("GET /api/dictionary returns ranked canonical search results", async () => {
  const response = await search(
    new Request("http://localhost/api/dictionary?q=%E6%B0%B4&limit=5"),
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /s-maxage=300/);

  const body = (await response.json()) as DictionarySearchResponse;
  assert.equal(body.query, "水");
  assert.ok(body.total >= 1);
  assert.equal(body.results[0].headword, "水");
  assert.equal(body.results[0].primaryReading, "みず");
  assert.equal(body.results[0].firstGloss, "water");
  assert.equal(body.results[0].match, "exact");
});

test("GET /api/dictionary normalizes full-width input and caps result contract", async () => {
  const response = await search(
    new Request("http://localhost/api/dictionary?q=%EF%BC%B3%EF%BC%B5%EF%BC%B9&limit=1"),
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as DictionarySearchResponse;
  assert.equal(body.query, "SUY");
  assert.equal(body.results.length, 0);

  const invalidLimit = await search(
    new Request("http://localhost/api/dictionary?q=%E6%B0%B4&limit=26"),
  );
  assert.equal(invalidLimit.status, 400);
  const error = (await invalidLimit.json()) as ApiError;
  assert.equal(error.error.code, "INVALID_QUERY");
});

test("GET /api/dictionary rejects missing queries", async () => {
  const response = await search(new Request("http://localhost/api/dictionary"));
  assert.equal(response.status, 400);
  const body = (await response.json()) as ApiError;
  assert.equal(body.error.code, "INVALID_QUERY");
});

test("GET /api/dictionary/:id returns forms, senses, enrichment and provenance", async () => {
  const searchResponse = await search(new Request("http://localhost/api/dictionary?q=%E9%A3%9F%E3%81%B9%E3%82%8B"));
  const searchBody = (await searchResponse.json()) as DictionarySearchResponse;
  const item = searchBody.results.find((result) => result.headword === "食べる");
  assert.ok(item, "fixture entry must be discoverable through search API");

  const response = await getEntry(
    new Request(`http://localhost/api/dictionary/${item.id}`),
    { params: Promise.resolve({ id: String(item.id) }) },
  );
  assert.equal(response.status, 200);

  const body = (await response.json()) as DictionaryEntry;
  assert.equal(body.headword, "食べる");
  assert.equal(body.primaryReading, "たべる");
  assert.ok(body.kanji.some((form) => form.text === "食べる"));
  assert.ok(body.readings.some((form) => form.text === "たべる"));
  assert.ok(body.senses.some((sense) => sense.glosses.includes("to eat")));
  assert.ok(body.enrichments.some((enrichment) => enrichment.kind === "furigana"));
  assert.ok(body.enrichments.some((enrichment) => enrichment.kind === "conjugation"));
  assert.equal(body.provenance?.source, "jmdict");
  assert.match(body.provenance?.checksumSha256 ?? "", /^[0-9a-f]{64}$/);
});

test("GET /api/dictionary/:id returns stable invalid and not-found errors", async () => {
  const invalid = await getEntry(new Request("http://localhost/api/dictionary/nope"), {
    params: Promise.resolve({ id: "nope" }),
  });
  assert.equal(invalid.status, 400);
  assert.equal(((await invalid.json()) as ApiError).error.code, "INVALID_ID");

  const missing = await getEntry(new Request("http://localhost/api/dictionary/999999999"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(missing.status, 404);
  assert.equal(((await missing.json()) as ApiError).error.code, "NOT_FOUND");
});

after(async () => {
  await pool.end();
});
