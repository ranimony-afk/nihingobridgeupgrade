import assert from "node:assert/strict";
import { test } from "node:test";
import "dotenv/config";
import { seedReady } from "../../src/lib/seed.ts";
import {
  loginUser,
  refreshSession,
  registerUser,
  requestMagicLink,
  setupTotp,
  enableTotp,
  verifyEmail,
} from "../../src/lib/identity/service.ts";
import { totpCode } from "../../src/lib/identity/totp.ts";
import { getUserById } from "../../src/lib/identity/service.ts";

test("demo student can login and refresh", async () => {
  assert.equal(await seedReady(), true);
  const login = await loginUser({ email: "student@nihongobridge.local", password: "bridge-audit" });
  assert.equal(login.ok, true);
  if (!login.ok || login.requires2fa) throw new Error("expected tokens");
  const refreshed = await refreshSession(login.refreshToken);
  assert.equal(refreshed.ok, true);
});

test("register verify and 2fa flow", async () => {
  assert.equal(await seedReady(), true);
  const email = `flow.${Date.now()}@nihongobridge.local`;
  const created = await registerUser({ email, name: "Flow", password: "password1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const token = created.verifyLink.split("token=")[1];
  assert.ok(token);
  const verified = await verifyEmail(token);
  assert.equal(verified.ok, true);
  const setup = await setupTotp(created.user.id);
  assert.equal(setup.ok, true);
  if (!setup.ok) return;
  const enabled = await enableTotp(created.user.id, totpCode(setup.secret));
  assert.equal(enabled.ok, true);
  const user = await getUserById(created.user.id);
  assert.equal(user?.totpEnabled, true);
  const challenged = await loginUser({ email, password: "password1" });
  assert.equal(challenged.ok, true);
  if (challenged.ok) assert.equal(challenged.requires2fa, true);
});

test("magic link enqueues mail", async () => {
  assert.equal(await seedReady(), true);
  const result = await requestMagicLink("teacher@nihongobridge.local");
  assert.equal(result.ok, true);
  assert.ok(result.devLink.includes("magic="));
});
