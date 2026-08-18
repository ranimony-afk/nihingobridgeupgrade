import { generate } from "otplib";
import { describe, expect, it } from "vitest";
import {
  createRecoveryCodes,
  createTotpEnrollment,
  normalizeRecoveryCode,
  verifyTotpCode,
} from "@/lib/auth/totp";

describe("two-factor primitives", () => {
  it("creates a TOTP enrollment compatible with authenticator applications", async () => {
    const enrollment = await createTotpEnrollment("akira@example.com");
    const code = await generate({ secret: enrollment.secret, digits: 6, period: 30 });

    expect(enrollment.uri).toContain("otpauth://totp/");
    expect(enrollment.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    await expect(verifyTotpCode(enrollment.secret, code)).resolves.toBe(true);
  });

  it("generates unique recovery codes and normalizes their presentation", () => {
    const recovery = createRecoveryCodes();
    expect(recovery.plainCodes).toHaveLength(10);
    expect(new Set(recovery.plainCodes).size).toBe(10);
    expect(recovery.hashes).toHaveLength(10);
    expect(normalizeRecoveryCode(recovery.plainCodes[0]!)).not.toContain("-");
  });
});
