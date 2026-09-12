import test from "node:test";
import assert from "node:assert/strict";

import {
  bearerFromHeader,
  generateSessionToken,
  hashSessionToken,
  looksLikeToken,
} from "../../../src/services/auth/tokens.ts";
import { ROLE_RANK, hasAtLeast, hasRole, isAdmin } from "../../../src/services/auth/rbac.ts";
import type { PublicUser } from "../../../src/services/auth/service.ts";

function user(roles: PublicUser["roles"]): PublicUser {
  return {
    id: "usr_1",
    email: "a@b.com",
    displayName: "A",
    roles,
    createdAt: new Date().toISOString(),
  };
}

// ── tokens ────────────────────────────────────

test("tokens are unique across many draws", () => {
  const seen = new Set(Array.from({ length: 500 }, () => generateSessionToken()));
  assert.equal(seen.size, 500);
});

test("tokens carry 256 bits of entropy and are URL-safe", () => {
  const token = generateSessionToken();
  assert.equal(Buffer.from(token, "base64url").length, 32);
  assert.match(token, /^[A-Za-z0-9_-]+$/);
});

test("hashing is deterministic and one-way", () => {
  const token = generateSessionToken();
  const digest = hashSessionToken(token);
  assert.equal(digest, hashSessionToken(token));
  assert.equal(digest.length, 64);
  assert.equal(digest.includes(token), false);
});

test("different tokens hash differently", () => {
  assert.notEqual(hashSessionToken(generateSessionToken()), hashSessionToken(generateSessionToken()));
});

test("generated tokens pass the shape check", () => {
  assert.equal(looksLikeToken(generateSessionToken()), true);
});

test("junk is rejected before reaching the database", () => {
  for (const bad of ["", "short", "has spaces in it and is long enough", "a".repeat(200), "'; drop table--"]) {
    assert.equal(looksLikeToken(bad), false, `value: ${bad}`);
  }
});

test("bearer tokens are parsed case-insensitively", () => {
  assert.equal(bearerFromHeader("Bearer abc123"), "abc123");
  assert.equal(bearerFromHeader("bearer abc123"), "abc123");
  assert.equal(bearerFromHeader("  Bearer   abc123  "), "abc123");
});

test("non-bearer authorization schemes are ignored", () => {
  assert.equal(bearerFromHeader("Basic dXNlcjpwYXNz"), null);
  assert.equal(bearerFromHeader("Bearer"), null);
  assert.equal(bearerFromHeader(""), null);
  assert.equal(bearerFromHeader(null), null);
});

// ── RBAC ──────────────────────────────────────

test("roles are ordered least to most privileged", () => {
  assert.ok(ROLE_RANK.learner < ROLE_RANK.reviewer);
  assert.ok(ROLE_RANK.reviewer < ROLE_RANK.content_editor);
  assert.ok(ROLE_RANK.content_editor < ROLE_RANK.admin);
  assert.ok(ROLE_RANK.admin < ROLE_RANK.super_admin);
});

test("exact role membership is reported", () => {
  assert.equal(hasRole(user(["learner"]), "learner"), true);
  assert.equal(hasRole(user(["learner"]), "admin"), false);
});

test("higher roles satisfy lower requirements", () => {
  assert.equal(hasAtLeast(user(["admin"]), "reviewer"), true);
  assert.equal(hasAtLeast(user(["super_admin"]), "content_editor"), true);
});

test("lower roles do not satisfy higher requirements", () => {
  assert.equal(hasAtLeast(user(["learner"]), "admin"), false);
  assert.equal(hasAtLeast(user(["reviewer"]), "admin"), false);
});

test("admin detection covers super_admin but not editors", () => {
  assert.equal(isAdmin(user(["admin"])), true);
  assert.equal(isAdmin(user(["super_admin"])), true);
  assert.equal(isAdmin(user(["content_editor"])), false);
  assert.equal(isAdmin(user([])), false);
});
