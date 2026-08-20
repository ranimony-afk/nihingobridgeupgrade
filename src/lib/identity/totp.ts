import { createHmac, randomBytes } from "crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buffer: Buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string) {
  const clean = input.replace(/=+$/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function hotp(secret: Buffer, counter: number) {
  const data = Buffer.alloc(8);
  data.writeUInt32BE(0, 0);
  data.writeUInt32BE(counter, 4);
  const hmac = createHmac("sha1", secret).update(data).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return (code % 1_000_000).toString().padStart(6, "0");
}

export function totpCode(secretBase32: string, at = new Date()) {
  const counter = Math.floor(at.getTime() / 30_000);
  return hotp(base32Decode(secretBase32), counter);
}

export function verifyTotp(secretBase32: string, code: string, window = 1) {
  const expected = code.replace(/\s/g, "");
  const now = Math.floor(Date.now() / 30_000);
  const secret = base32Decode(secretBase32);
  for (let offset = -window; offset <= window; offset += 1) {
    if (hotp(secret, now + offset) === expected) return true;
  }
  return false;
}

export function otpauthUrl(email: string, secret: string) {
  return `otpauth://totp/NihongoBridge:${encodeURIComponent(email)}?secret=${secret}&issuer=NihongoBridge`;
}
