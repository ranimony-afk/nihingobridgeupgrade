import assert from "node:assert/strict";
import { test } from "node:test";
import "dotenv/config";
import { reindexSearch, searchIndexSize } from "../../src/lib/search/indexer.ts";
import { autocomplete, search, suggest } from "../../src/lib/search/service.ts";
import { seedReady } from "../../src/lib/seed.ts";

test("index covers every content type", async () => {
  assert.equal(await seedReady(), true);
  await reindexSearch();
  const size = await searchIndexSize();
  assert.ok(size.total > 50, `expected a populated index, got ${size.total}`);
  assert.ok(size.byKind.lexeme > 0);
  assert.ok(size.byKind.kanji > 0);
  assert.ok(size.byKind.grammar > 0);
});

test("full text search finds an English gloss", async () => {
  await seedReady();
  const result = await search("water", { log: false });
  assert.ok(result.total > 0);
  assert.ok(result.hits.some((hit) => hit.title === "水"));
});

test("Japanese substring search works without spaces", async () => {
  await seedReady();
  const result = await search("食べ", { log: false });
  assert.ok(result.hits.some((hit) => hit.title.includes("食べ")));
});

test("exact match outranks partial matches", async () => {
  await seedReady();
  const result = await search("水", { log: false });
  assert.equal(result.hits[0]?.title, "水");
});

test("fuzzy search tolerates a typo", async () => {
  await seedReady();
  const result = await search("watre", { log: false });
  assert.ok(result.total > 0 || (await suggest("watre")) !== null);
});

test("type filter narrows results to one kind", async () => {
  await seedReady();
  const result = await search("water type:kanji", { log: false });
  assert.ok(result.hits.every((hit) => hit.kind === "kanji"));
});

test("jlpt filter is applied", async () => {
  await seedReady();
  const result = await search("type:lexeme jlpt:n5", { log: false, limit: 5 });
  assert.ok(result.hits.every((hit) => hit.jlpt === "N5"));
});

test("autocomplete returns prefix matches", async () => {
  await seedReady();
  const rows = await autocomplete("wat");
  assert.ok(Array.isArray(rows));
  const kanji = await autocomplete("日");
  assert.ok(kanji.length > 0);
});

test("facets summarise the result set", async () => {
  await seedReady();
  const result = await search("water", { log: false });
  assert.ok(Object.keys(result.facets.kind).length > 0);
});

test("search logs analytics and reports zero-result queries", async () => {
  await seedReady();
  const result = await search("zzzzqqqxnotathing", { log: true });
  assert.equal(result.total, 0);
  const { zeroResultQueries } = await import("../../src/lib/search/service.ts");
  const rows = await zeroResultQueries(20);
  assert.ok(rows.some((row) => row.query.includes("zzzzqqqx")));
});
