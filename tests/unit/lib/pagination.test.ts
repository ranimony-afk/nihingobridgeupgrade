import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  paginate,
  resolvePagination,
} from "../../../src/lib/pagination.ts";

test("defaults apply when nothing is supplied", () => {
  const page = resolvePagination();
  assert.equal(page.page, 1);
  assert.equal(page.pageSize, DEFAULT_PAGE_SIZE);
  assert.equal(page.offset, 0);
});

test("pageSize is clamped to the frozen maximum", () => {
  assert.equal(resolvePagination({ pageSize: 5000 }).pageSize, MAX_PAGE_SIZE);
});

test("string query parameters are accepted", () => {
  const page = resolvePagination({ page: "3", pageSize: "10" });
  assert.equal(page.page, 3);
  assert.equal(page.pageSize, 10);
  assert.equal(page.offset, 20);
});

test("invalid or hostile values fall back to defaults", () => {
  for (const bad of ["abc", "-4", "0", "", null, undefined, Number.NaN]) {
    const page = resolvePagination({ page: bad as never, pageSize: bad as never });
    assert.equal(page.page, 1);
    assert.equal(page.pageSize, DEFAULT_PAGE_SIZE);
  }
});

test("offset follows page and pageSize", () => {
  assert.equal(resolvePagination({ page: 1, pageSize: 20 }).offset, 0);
  assert.equal(resolvePagination({ page: 4, pageSize: 25 }).offset, 75);
});

test("paginate reports totals and page count", () => {
  const request = resolvePagination({ page: 2, pageSize: 10 });
  const result = paginate(["a", "b"], 34, request);
  assert.equal(result.total, 34);
  assert.equal(result.totalPages, 4);
  assert.equal(result.page, 2);
  assert.deepEqual(result.items, ["a", "b"]);
});

test("paginate handles an empty result set", () => {
  const result = paginate([], 0, resolvePagination());
  assert.equal(result.total, 0);
  assert.equal(result.totalPages, 0);
});
