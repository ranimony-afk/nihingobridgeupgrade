import test from "node:test";
import assert from "node:assert/strict";

import {
  checksum,
  deterministicChildId,
  deterministicId,
  newId,
} from "../../../src/lib/ids.ts";

test("deterministicId is stable for the same source pair", () => {
  const a = deterministicId("jmdict", "1358280");
  const b = deterministicId("jmdict", "1358280");
  assert.equal(a, b);
});

test("deterministicId normalises source casing and whitespace", () => {
  assert.equal(deterministicId("JMdict", "1358280"), deterministicId("  jmdict ", "1358280"));
});

test("deterministicId is prefixed with its source", () => {
  assert.match(deterministicId("kanjidic2", "98DF"), /^kanjidic2_[0-9a-f]{24}$/);
});

test("deterministicId separates different records", () => {
  assert.notEqual(deterministicId("jmdict", "1"), deterministicId("jmdict", "2"));
  assert.notEqual(deterministicId("jmdict", "1"), deterministicId("tatoeba", "1"));
});

test("deterministicId rejects empty input", () => {
  assert.throws(() => deterministicId("", "1"));
  assert.throws(() => deterministicId("jmdict", "   "));
});

test("deterministicChildId is stable and position-sensitive", () => {
  const parent = deterministicId("jmdict", "1358280");
  assert.equal(deterministicChildId(parent, "sense", 0), deterministicChildId(parent, "sense", 0));
  assert.notEqual(deterministicChildId(parent, "sense", 0), deterministicChildId(parent, "sense", 1));
  assert.notEqual(deterministicChildId(parent, "sense", 0), deterministicChildId(parent, "reading", 0));
});

test("deterministicChildId rejects invalid positions", () => {
  assert.throws(() => deterministicChildId("p", "sense", -1));
  assert.throws(() => deterministicChildId("p", "sense", 1.5));
});

test("newId is unique and optionally prefixed", () => {
  assert.notEqual(newId(), newId());
  assert.match(newId("srs"), /^srs_[0-9a-f]{32}$/);
  assert.match(newId(), /^[0-9a-f]{32}$/);
});

test("checksum is deterministic and change-sensitive", () => {
  assert.equal(checksum("食べる"), checksum("食べる"));
  assert.notEqual(checksum("食べる"), checksum("食べた"));
  assert.equal(checksum("x").length, 64);
});
