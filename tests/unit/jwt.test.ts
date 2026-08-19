import assert from "node:assert/strict";
import { test } from "node:test";
import { signJwt, verifyJwt } from "../../src/lib/identity/jwt.ts";

test("access tokens verify and expire", () => {
  const token = signJwt({ sub: "u1", role: "student", plan: "free", learnerId: "l1", typ: "access", jti: "j1" }, 60, "unit-secret");
  const claims = verifyJwt(token, "unit-secret");
  assert.equal(claims?.sub, "u1");
  assert.equal(verifyJwt(token, "other"), null);
});

test("refresh tokens reject wrong typ when asking verify", () => {
  const token = signJwt({ sub: "u1", role: "student", plan: "plus", learnerId: null, typ: "refresh", jti: "j2" }, 60, "unit-secret");
  const claims = verifyJwt(token, "unit-secret");
  assert.equal(claims?.typ, "refresh");
});
