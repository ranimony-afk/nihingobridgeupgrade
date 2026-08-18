import assert from "node:assert/strict";
import { test } from "node:test";
import "dotenv/config";
import { searchGraph, graphStats } from "../../src/lib/kg/search.ts";
import { seedReady } from "../../src/lib/seed.ts";

test("core corpus is searchable after seed", async () => {
  assert.equal(await seedReady(), true);
  const stats = await graphStats();
  assert.ok(stats.lexemes >= 20);
  assert.ok(stats.kanji >= 20);
  const water = await searchGraph("水");
  assert.ok(water.lexemes.some((row) => row.lemma === "水") || water.kanji.some((row) => row.character === "水"));
  const eat = await searchGraph("eat");
  assert.ok(eat.lexemes.length > 0);
});
