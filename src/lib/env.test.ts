import { describe, expect, it } from "vitest";
import { env, isFeatureConfigured, productionReadinessIssues } from "@/lib/env";

describe("environment infrastructure contract", () => {
  it("loads a valid database connection string for the current runtime", () => {
    expect(env.DATABASE_URL).toMatch(/^postgres(ql)?:\/\//);
  });

  it("does not report production-only readiness requirements in test mode", () => {
    expect(env.NODE_ENV).toBe("test");
    expect(productionReadinessIssues()).toEqual([]);
  });

  it("recognizes test-only cryptographic configuration without enabling external providers", () => {
    expect(isFeatureConfigured("auth")).toBe(true);
    expect(isFeatureConfigured("mobileJwt")).toBe(true);
    expect(isFeatureConfigured("supabase")).toBe(false);
    expect(isFeatureConfigured("redis")).toBe(false);
    expect(isFeatureConfigured("email")).toBe(false);
  });
});
