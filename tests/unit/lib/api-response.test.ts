import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFailure,
  buildMeta,
  buildSuccess,
  jsonFailure,
  jsonFromError,
  jsonSuccess,
} from "../../../src/lib/api-response.ts";
import { NotFoundError, ValidationError, httpStatusForCode } from "../../../src/lib/errors.ts";

test("success envelope matches the frozen contract", () => {
  assert.deepEqual(buildSuccess({ id: "x" }), { success: true, data: { id: "x" } });
});

test("meta is omitted unless requested", () => {
  assert.equal("meta" in buildSuccess("value"), false);
});

test("meta is normalised and totalPages derived", () => {
  const meta = buildMeta({ page: 2, pageSize: 20, total: 45 });
  assert.equal(meta.totalPages, 3);
  assert.equal(meta.page, 2);
});

test("meta tolerates missing fields and extra keys", () => {
  const meta = buildMeta({ total: 0, searchMode: "fuzzy" });
  assert.equal(meta.page, 1);
  assert.equal(meta.totalPages, 0);
  assert.equal(meta.searchMode, "fuzzy");
});

test("failure envelope carries a machine-readable code", () => {
  const body = buildFailure("NOT_FOUND", "Entry not found");
  assert.equal(body.success, false);
  assert.equal(body.error.code, "NOT_FOUND");
  assert.equal("details" in body.error, false);
});

test("failure details are preserved when supplied", () => {
  const body = buildFailure("VALIDATION_ERROR", "Invalid", [{ path: "q", message: "required" }]);
  assert.deepEqual(body.error.details, [{ path: "q", message: "required" }]);
});

test("error codes map to the frozen status codes", () => {
  assert.equal(httpStatusForCode("VALIDATION_ERROR"), 400);
  assert.equal(httpStatusForCode("UNAUTHENTICATED"), 401);
  assert.equal(httpStatusForCode("FORBIDDEN"), 403);
  assert.equal(httpStatusForCode("NOT_FOUND"), 404);
  assert.equal(httpStatusForCode("CONFLICT"), 409);
  assert.equal(httpStatusForCode("RATE_LIMITED"), 429);
  assert.equal(httpStatusForCode("INTERNAL_ERROR"), 500);
});

test("jsonSuccess returns a 200 JSON response", async () => {
  const response = jsonSuccess([1, 2], { total: 2 });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.deepEqual(await response.json(), {
    success: true,
    data: [1, 2],
    meta: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
  });
});

test("jsonFailure uses the status implied by the code", () => {
  assert.equal(jsonFailure("FORBIDDEN", "nope").status, 403);
});

test("known application errors keep their code and message", async () => {
  const response = jsonFromError(new NotFoundError("Dictionary entry"));
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.error.code, "NOT_FOUND");
  assert.equal(body.error.message, "Dictionary entry not found");
});

test("validation errors surface their details", async () => {
  const response = jsonFromError(new ValidationError("Bad query", [{ message: "q required" }]));
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.deepEqual(body.error.details, [{ message: "q required" }]);
});

test("unknown failures never leak internals", async () => {
  const response = jsonFromError(new Error("connection string postgres://user:pw@host"));
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.error.code, "INTERNAL_ERROR");
  assert.equal(body.error.message, "An unexpected error occurred");
  assert.equal(JSON.stringify(body).includes("postgres://"), false);
});
