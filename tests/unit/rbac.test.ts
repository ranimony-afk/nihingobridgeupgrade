import assert from "node:assert/strict";
import { test } from "node:test";
import { canAccessTeacher, hasPermission, planAllows } from "../../src/lib/identity/rbac.ts";

test("students cannot manage users", () => {
  assert.equal(hasPermission("student", "identity.users.write"), false);
  assert.equal(hasPermission("super_admin", "identity.users.write"), true);
});

test("subscription and teacher gates", () => {
  assert.equal(planAllows("free", "plus"), false);
  assert.equal(planAllows("plus", "plus"), true);
  assert.equal(canAccessTeacher("student"), false);
  assert.equal(canAccessTeacher("teacher"), true);
});
