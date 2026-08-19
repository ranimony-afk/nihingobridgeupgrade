import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canTransition,
  domainCoverage,
  ENTERPRISE_DOMAINS,
  nextStatus,
  readinessScore,
} from "../../src/lib/audit/score.ts";
import { hashPassword, readStaffToken, signStaffToken, verifyPassword } from "../../src/lib/audit/crypto.ts";

test("readiness score subtracts open critical findings", () => {
  const score = readinessScore([
    { severity: "critical", status: "open" },
    { severity: "low", status: "resolved" },
  ]);
  assert.equal(score, 80);
});

test("resolved findings do not penalize readiness", () => {
  const score = readinessScore([
    { severity: "critical", status: "resolved" },
    { severity: "high", status: "accepted_risk" },
  ]);
  assert.equal(score, 100);
});

test("domain coverage uses the enterprise map", () => {
  assert.ok(ENTERPRISE_DOMAINS.includes("dictionary"));
  assert.equal(domainCoverage(["dictionary", "security"]), Math.round((2 / ENTERPRISE_DOMAINS.length) * 100));
});

test("status machine only allows legal transitions", () => {
  assert.equal(nextStatus("open", "start"), "in_progress");
  assert.equal(canTransition("open", "resolved"), false);
  assert.equal(canTransition("in_progress", "resolved"), true);
  assert.equal(canTransition("resolved", "open"), true);
});

test("password hashes verify and reject mismatches", () => {
  const stored = hashPassword("bridge-audit");
  assert.equal(verifyPassword("bridge-audit", stored), true);
  assert.equal(verifyPassword("wrong", stored), false);
});

test("staff tokens are HMAC bound", () => {
  const token = signStaffToken("staff-sensei", "unit-secret");
  assert.equal(readStaffToken(token, "unit-secret"), "staff-sensei");
  assert.equal(readStaffToken(token, "other-secret"), null);
  assert.equal(readStaffToken("nope", "unit-secret"), null);
});
