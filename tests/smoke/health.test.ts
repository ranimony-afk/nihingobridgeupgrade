import assert from "node:assert/strict";
import { test } from "node:test";
import "dotenv/config";
import { getInfraStatus, pingDatabase } from "../../src/lib/infra/health.ts";

test("compatibility health primitive still succeeds", async () => {
  await pingDatabase();
  const status = await getInfraStatus();
  assert.equal(status.ok, true);
  assert.ok(status.services.nextauth.status);
});
