import { describe, expect, it } from "vitest";
import {
  normalizeRole,
  permissionsForRole,
  roleAtLeast,
  roleHasPermission,
} from "@/lib/auth/permissions";

describe("enterprise role permissions", () => {
  it("maps legacy learner records to the student role", () => {
    expect(normalizeRole("learner")).toBe("student");
    expect(normalizeRole("unknown")).toBe("student");
  });

  it("keeps CMS publishing outside student and teacher access", () => {
    expect(roleHasPermission("student", "cms:publish")).toBe(false);
    expect(roleHasPermission("teacher", "cms:publish")).toBe(false);
    expect(roleHasPermission("admin", "cms:publish")).toBe(true);
  });

  it("grants complete capability coverage to super administrators", () => {
    expect(permissionsForRole("super_admin")).toContain("system:manage");
    expect(roleAtLeast("super_admin", "admin")).toBe(true);
    expect(roleAtLeast("teacher", "admin")).toBe(false);
  });
});
