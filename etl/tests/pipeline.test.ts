/**
 * ETL pipeline tests — validates the transform and validation logic
 * without requiring actual source data files or database access.
 */

import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { validate, requireString, validateJlptLevel, optionalIntRange } from "../validators/common.js";

describe("ETL Validators", () => {
  it("requireString rejects empty strings", () => {
    const err = requireString("test-1", "headword", "");
    assert.ok(err !== null);
    assert.ok(err!.message.includes("non-empty string"));
  });

  it("requireString accepts valid strings", () => {
    const err = requireString("test-1", "headword", "食べる");
    assert.strictEqual(err, null);
  });

  it("validateJlptLevel accepts 1-5", () => {
    for (let i = 1; i <= 5; i++) {
      assert.strictEqual(validateJlptLevel("test", i), null);
    }
  });

  it("validateJlptLevel rejects 0 and 6", () => {
    assert.ok(validateJlptLevel("test", 0) !== null);
    assert.ok(validateJlptLevel("test", 6) !== null);
  });

  it("validateJlptLevel accepts null", () => {
    assert.strictEqual(validateJlptLevel("test", null), null);
  });

  it("optionalIntRange works correctly", () => {
    assert.strictEqual(optionalIntRange("t", "f", null, 1, 10), null);
    assert.strictEqual(optionalIntRange("t", "f", 5, 1, 10), null);
    assert.ok(optionalIntRange("t", "f", 0, 1, 10) !== null);
    assert.ok(optionalIntRange("t", "f", 11, 1, 10) !== null);
  });

  it("validate collects errors", () => {
    const errors = validate([
      requireString("t", "a", ""),
      requireString("t", "b", "ok"),
      validateJlptLevel("t", 99),
    ]);
    assert.strictEqual(errors.length, 2);
  });
});
