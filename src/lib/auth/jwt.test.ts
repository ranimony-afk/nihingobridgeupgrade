import { describe, expect, it } from "vitest";
import {
  extractBearerToken,
  issueMobileAccessToken,
  verifyMobileAccessToken,
} from "@/lib/auth/jwt";

describe("Flutter access JWTs", () => {
  it("issues and verifies a constrained mobile access token", async () => {
    const token = await issueMobileAccessToken({
      userId: "learner-42",
      role: "student",
      tokenVersion: 3,
      institutionId: "institution-7",
    });

    await expect(verifyMobileAccessToken(token)).resolves.toEqual({
      userId: "learner-42",
      role: "student",
      tokenVersion: 3,
      institutionId: "institution-7",
    });
  });

  it("rejects a modified token and safely extracts Bearer tokens", async () => {
    const token = await issueMobileAccessToken({ userId: "learner-42", role: "student", tokenVersion: 1 });
    const modified = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

    await expect(verifyMobileAccessToken(modified)).resolves.toBeNull();
    expect(extractBearerToken(new Request("https://example.test", { headers: { Authorization: `Bearer ${token}` } }))).toBe(token);
    expect(extractBearerToken(new Request("https://example.test"))).toBeNull();
  });
});
