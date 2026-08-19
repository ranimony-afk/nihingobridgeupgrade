import assert from "node:assert/strict";
import { test } from "node:test";
import { commissionFor, maskEmail, normalizeAffiliateCode } from "../../src/lib/billing/commission.ts";

test("commission is a percentage of the net amount", () => {
  assert.equal(commissionFor(10000, 20), 2000);
  assert.equal(commissionFor(999, 20), 200);
});

test("commission never goes negative or free-rides a full discount", () => {
  assert.equal(commissionFor(0, 20), 0);
  assert.equal(commissionFor(-500, 20), 0);
  assert.equal(commissionFor(10000, 0), 0);
});

test("affiliate codes normalize to upper case", () => {
  assert.equal(normalizeAffiliateCode("  affiliate-sakura "), "AFFILIATE-SAKURA");
});

test("referred emails are masked for the referrer", () => {
  assert.equal(maskEmail("student@nihongobridge.local"), "st*****@nihongobridge.local");
  assert.equal(maskEmail("notanemail"), "hidden");
});
