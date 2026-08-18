import { describe, expect, it } from "vitest";
import { hashPassword, validatePassword, verifyPassword } from "@/lib/auth/password";

describe("password security", () => {
  it("enforces the enterprise password policy", () => {
    expect(validatePassword("weak")).toContain("too_short");
    expect(validatePassword("ValidPassword!42")).toEqual([]);
  });

  it("hashes and verifies passwords without accepting incorrect values", async () => {
    const hash = await hashPassword("ValidPassword!42");
    expect(hash).toMatch(/^scrypt\$/);
    await expect(verifyPassword("ValidPassword!42", hash)).resolves.toBe(true);
    await expect(verifyPassword("NotThePassword!42", hash)).resolves.toBe(false);
  });
});
