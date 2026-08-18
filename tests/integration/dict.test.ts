import assert from "node:assert/strict";
import { test } from "node:test";
import "dotenv/config";
import { dictionaryCard, enrichDictionary, offlinePack } from "../../src/lib/dict/enrich.ts";
import { searchGraph } from "../../src/lib/kg/search.ts";
import { seedReady } from "../../src/lib/seed.ts";

test("dictionary card exposes multilingual glosses and conjugations", async () => {
  assert.equal(await seedReady(), true);
  await enrichDictionary();
  const eat = await searchGraph("食べる");
  const id = eat.lexemes[0]?.id;
  assert.ok(id);
  const card = await dictionaryCard(id);
  assert.ok(card);
  assert.ok(card.glosses.some((row) => row.lang === "ta" || row.lang === "hi" || row.lang === "ja"));
  assert.ok(card.conjugations.length > 0);
});

test("offline pack includes lexemes for Flutter cache", async () => {
  assert.equal(await seedReady(), true);
  const pack = await offlinePack();
  assert.ok(pack.lexemes.length > 10);
  assert.ok(pack.kanji.some((row) => row.rare || row.character === "日"));
});
