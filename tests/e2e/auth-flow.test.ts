import assert from "node:assert/strict";
import { test } from "node:test";
import "dotenv/config";
import { consumeMagicLink, loginUser, logoutSession, registerUser, requestMagicLink } from "../../src/lib/identity/service.ts";
import { seedReady } from "../../src/lib/seed.ts";
import { verifyJwt } from "../../src/lib/identity/jwt.ts";

test("e2e identity: register, magic, login, logout", async () => {
  assert.equal(await seedReady(), true);
  const email = `e2e.${Date.now()}@nihongobridge.local`;
  const created = await registerUser({ email, name: "E2E", password: "password1" });
  assert.equal(created.ok, true);
  const magic = await requestMagicLink(email);
  const token = magic.devLink.split("magic=")[1];
  assert.ok(token);
  const session = await consumeMagicLink(token);
  assert.equal(session.ok, true);
  if (!session.ok) return;
  const access = verifyJwt(session.accessToken);
  assert.equal(access?.sub, created.ok ? created.user.id : "");
  const passwordLogin = await loginUser({ email, password: "password1" });
  assert.equal(passwordLogin.ok, true);
  if (passwordLogin.ok && !passwordLogin.requires2fa) {
    await logoutSession(passwordLogin.refreshToken);
  }
});
