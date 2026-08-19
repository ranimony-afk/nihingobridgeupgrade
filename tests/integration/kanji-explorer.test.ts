import assert from "node:assert/strict";
import { test } from "node:test";
import "dotenv/config";
import { enrichKanjiExplorer, explorerCard, explorerTree } from "../../src/lib/kanji/enrich.ts";
import { seedReady } from "../../src/lib/seed.ts";

test("explorer tree and mountain card after enrich", async () => {
  assert.equal(await seedReady(), true);
  await enrichKanjiExplorer();
  const tree = await explorerTree();
  assert.ok((tree.children?.length ?? 0) >= 1);
  const card = await explorerCard("山");
  assert.ok(card);
  assert.ok(card.meta?.branch === "Nature" || card.kanji.character === "山");
  assert.ok(card.readings.some((row) => row.kind === "on" || row.kind === "kun"));
});
