import assert from "node:assert/strict";
import { test } from "node:test";
import "dotenv/config";
import { eventCounts, trackEvent } from "../../src/lib/infra/analytics.ts";
import { runLogicalBackup } from "../../src/lib/infra/backups.ts";
import { listErrors, reportError } from "../../src/lib/infra/errors.ts";
import { getInfraStatus, pingDatabase } from "../../src/lib/infra/health.ts";
import { seedReady } from "../../src/lib/seed.ts";

test("infra seed and health stay green without Redis", async () => {
  const ready = await seedReady();
  assert.equal(ready, true);
  await pingDatabase();
  const status = await getInfraStatus();
  assert.equal(status.ok, true);
  assert.equal(status.services.database.status, "up");
  assert.equal(status.services.redis.status === "not_configured" || status.services.redis.status === "up", true);
});

test("analytics and error tracking persist rows", async () => {
  await seedReady();
  await trackEvent({ name: "infra_test", path: "/admin/infra" });
  await reportError(new Error("synthetic infra error"), "test");
  const counts = await eventCounts();
  assert.ok(counts.total >= 1);
  const errors = await listErrors(5);
  assert.ok(errors.some((row) => row.source === "test"));
});

test("logical backup writes a catalog row", async () => {
  await seedReady();
  const result = await runLogicalBackup("integration");
  assert.equal(result.status, "ok");
  assert.ok(result.bytes > 0);
});
