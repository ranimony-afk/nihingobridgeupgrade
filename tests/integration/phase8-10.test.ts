import assert from "node:assert/strict";
import { test } from "node:test";
import "dotenv/config";
import { grammarDetail, grammarStats, importGrammarCore } from "../../src/lib/grammar/engine.ts";
import { analyzeTurn, startSession, recordTurn, getSession } from "../../src/lib/tutor/service.ts";
import { cmsOverview, ensureCmsSeed, listPosts } from "../../src/lib/cms/service.ts";
import { seedReady } from "../../src/lib/seed.ts";

test("grammar engine seeds points with graph edges", async () => {
  assert.equal(await seedReady(), true);
  await importGrammarCore();
  const stats = await grammarStats();
  assert.ok(stats.total >= 20);
  const detail = await grammarDetail("tai");
  assert.ok(detail);
  assert.ok(detail.meta?.timeline.length === 4);
  assert.ok(detail.related.length >= 1);
});

test("tutor records a scored turn", async () => {
  assert.equal(await seedReady(), true);
  const session = await startSession({ scenario: "cafe", level: "N5" });
  const analysis = await analyzeTurn("水を飲みます。");
  await recordTurn({ sessionId: session.id, role: "user", content: "水を飲みます。", analysis });
  const bundle = await getSession(session.id);
  assert.equal(bundle?.messages.length, 1);
  assert.ok((bundle?.session.turns ?? 0) >= 1);
});

test("cms seeds blogs, courses, media, and seo", async () => {
  assert.equal(await seedReady(), true);
  await ensureCmsSeed();
  const overview = await cmsOverview();
  assert.ok(overview.posts.length >= 2);
  assert.ok(overview.courses.length >= 2);
  assert.ok(overview.media.length >= 3);
  assert.ok(overview.seo.length >= 3);
  assert.ok((await listPosts(true)).length >= 2);
});
