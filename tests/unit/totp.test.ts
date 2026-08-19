import assert from "node:assert/strict";
import { test } from "node:test";
import { generateTotpSecret, totpCode, verifyTotp } from "../../src/lib/identity/totp.ts";

test("totp accepts the current window", () => {
  const secret = generateTotpSecret();
  const code = totpCode(secret);
  assert.equal(verifyTotp(secret, code), true);
  assert.equal(verifyTotp(secret, "000000"), false);
});
