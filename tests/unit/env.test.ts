import assert from "node:assert/strict";
import { test } from "node:test";
import { authSecret, hasOptionalService, parseEnv } from "../../src/lib/infra/env.ts";

test("parseEnv requires DATABASE_URL and defaults log level", () => {
  const env = parseEnv({ DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/app_db" });
  assert.equal(env.LOG_LEVEL, "info");
  assert.equal(env.BACKUP_DIR, "backups");
});

test("parseEnv rejects empty database url", () => {
  assert.throws(() => parseEnv({ DATABASE_URL: "" }), /Invalid environment/);
});

test("optional services stay off until configured", () => {
  const env = parseEnv({ DATABASE_URL: "postgresql://localhost/db" });
  assert.equal(hasOptionalService(env, "redis"), false);
  assert.equal(hasOptionalService(env, "supabase"), false);
});

test("authSecret derives a local fallback when AUTH_SECRET is absent", () => {
  const env = parseEnv({ DATABASE_URL: "postgresql://localhost/db" });
  assert.ok(authSecret(env).length >= 16);
});
