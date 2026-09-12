import test from "node:test";
import assert from "node:assert/strict";

import {
  PASSWORD_MIN_LENGTH,
  SCRYPT_PARAMS,
  checkPasswordPolicy,
  hashPassword,
  needsRehash,
  verifyPassword,
} from "../../../src/services/auth/password.ts";

const GOOD = "correct horse battery staple";

test("a correct password verifies", async () => {
  const digest = await hashPassword(GOOD);
  assert.equal(await verifyPassword(GOOD, digest), true);
});

test("an incorrect password fails", async () => {
  const digest = await hashPassword(GOOD);
  assert.equal(await verifyPassword("wrong password entirely", digest), false);
});

test("a one-character difference fails", async () => {
  const digest = await hashPassword(GOOD);
  assert.equal(await verifyPassword(`${GOOD}x`, digest), false);
});

test("the same password produces different digests", async () => {
  // Distinct salts, so identical passwords are not identifiable in a dump.
  assert.notEqual(await hashPassword(GOOD), await hashPassword(GOOD));
});

test("the digest never contains the plaintext", async () => {
  const digest = await hashPassword(GOOD);
  assert.equal(digest.includes(GOOD), false);
  assert.equal(digest.includes("horse"), false);
});

test("the digest records its own parameters", async () => {
  const digest = await hashPassword(GOOD);
  const [algorithm, n, r, p] = digest.split("$");
  assert.equal(algorithm, "scrypt");
  assert.equal(Number(n), SCRYPT_PARAMS.N);
  assert.equal(Number(r), SCRYPT_PARAMS.r);
  assert.equal(Number(p), SCRYPT_PARAMS.p);
});

test("verification is unicode-normalisation stable", async () => {
  // "é" composed vs decomposed must not lock a user out of their account.
  const composed = "café-passphrase-2026";
  const decomposed = "cafe\u0301-passphrase-2026";
  const digest = await hashPassword(composed);
  assert.equal(await verifyPassword(decomposed, digest), true);
});

test("malformed digests fail closed rather than throwing", async () => {
  for (const bad of ["", "not-a-digest", "scrypt$1$2$3", "bcrypt$x$y$z$a$b", "scrypt$$$$$"]) {
    assert.equal(await verifyPassword(GOOD, bad), false, `digest: ${bad}`);
  }
});

test("absurd cost parameters are rejected instead of allocated", async () => {
  // A tampered row must not be able to trigger a huge allocation.
  const hostile = `scrypt$${2 ** 30}$8$1$c2FsdA==$aGFzaA==`;
  assert.equal(await verifyPassword(GOOD, hostile), false);
});

test("current digests do not need rehashing", async () => {
  assert.equal(needsRehash(await hashPassword(GOOD)), false);
});

test("weaker digests are flagged for rehash", () => {
  assert.equal(needsRehash("scrypt$16384$8$1$c2FsdA==$aGFzaA=="), true);
  assert.equal(needsRehash("garbage"), true);
});

test("policy rejects short passwords", () => {
  assert.equal(checkPasswordPolicy("short").valid, false);
  assert.equal(checkPasswordPolicy("a".repeat(PASSWORD_MIN_LENGTH - 1)).valid, false);
});

test("policy rejects a single repeated character", () => {
  assert.equal(checkPasswordPolicy("aaaaaaaaaaaaaaa").valid, false);
});

test("policy accepts a long passphrase without symbol rules", () => {
  // NIST 800-63B: length over composition.
  assert.equal(checkPasswordPolicy("the quiet library at dawn").valid, true);
});

test("policy rejects absurdly long input", () => {
  assert.equal(checkPasswordPolicy("a".repeat(5000)).valid, false);
});
