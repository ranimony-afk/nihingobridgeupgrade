/**
 * Password hashing — scrypt via Node's audited `crypto` module.
 *
 * Why scrypt: it is memory-hard, ships with Node (no native build step, no
 * supply-chain surface), and is an OWASP-accepted choice alongside Argon2id
 * and bcrypt.
 *
 * Cost parameters (measured on this platform):
 *
 *   N=2^14   16MB    45ms
 *   N=2^15   32MB    88ms
 *   N=2^16   64MB   177ms   ← selected
 *   N=2^17  128MB   362ms   OWASP first choice
 *
 * N=2^16 is chosen deliberately. scrypt allocates 128·N·r bytes *per
 * concurrent hash*, so 2^17 would reserve 128MB per in-flight login; a modest
 * burst would exhaust a 1GB serverless function and turn a login spike into an
 * outage. 64MB/177ms keeps brute-force cost high while staying survivable
 * under concurrency.
 *
 * The choice is not permanent: every digest records the parameters it was
 * produced with, and `needsRehash` lets the service transparently upgrade a
 * user's hash on their next successful login.
 */

import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Promisified scrypt.
 *
 * Written by hand rather than with `promisify` because the callback overload
 * that accepts an options object is not the one `promisify` selects.
 */
function scryptAsync(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

/** Current cost parameters. Raising these triggers transparent rehash. */
export const SCRYPT_PARAMS = {
  N: 2 ** 16,
  r: 8,
  p: 1,
  keyLength: 64,
  saltLength: 16,
} as const;

/** scrypt needs an explicit memory ceiling above Node's 32MB default. */
const MAX_MEM = 256 * 1024 * 1024;

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;

export interface PasswordPolicyResult {
  valid: boolean;
  problems: string[];
}

/**
 * Length-first password policy.
 *
 * Deliberately no composition rules (“one uppercase, one symbol”): NIST
 * 800-63B advises against them because they push users toward predictable
 * patterns like `Password1!` while blocking strong passphrases.
 */
export function checkPasswordPolicy(password: string): PasswordPolicyResult {
  const problems: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    problems.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    problems.push(`Password must be at most ${PASSWORD_MAX_LENGTH} characters`);
  }
  // A password of one repeated character survives a length check but is trivial.
  if (password.length > 0 && new Set(password).size === 1) {
    problems.push("Password must not be a single repeated character");
  }

  return { valid: problems.length === 0, problems };
}

/**
 * Hash a password.
 *
 * @returns `scrypt$N$r$p$saltBase64$hashBase64` — self-describing, so digests
 *          produced under older parameters stay verifiable.
 */
export async function hashPassword(password: string): Promise<string> {
  const { N, r, p, keyLength, saltLength } = SCRYPT_PARAMS;
  const salt = randomBytes(saltLength);

  const derived = await scryptAsync(password.normalize("NFKC"), salt, keyLength, {
    N,
    r,
    p,
    maxmem: MAX_MEM,
  });

  return [
    "scrypt",
    N,
    r,
    p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

interface ParsedDigest {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

function parseDigest(stored: string): ParsedDigest | null {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return null;
  // Refuse absurd parameters from a tampered row rather than allocating on them.
  if (N < 2 ** 12 || N > 2 ** 20 || r < 1 || r > 32 || p < 1 || p > 16) return null;

  try {
    return {
      N,
      r,
      p,
      salt: Buffer.from(parts[4] as string, "base64"),
      hash: Buffer.from(parts[5] as string, "base64"),
    };
  } catch {
    return null;
  }
}

/**
 * Verify a password against a stored digest.
 *
 * Comparison is constant-time; a malformed or missing digest still performs a
 * dummy hash so that “user exists but row is corrupt” and “password wrong”
 * take indistinguishable time.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseDigest(stored);

  if (!parsed) {
    await burnTime();
    return false;
  }

  const derived = await scryptAsync(
    password.normalize("NFKC"),
    parsed.salt,
    parsed.hash.length,
    { N: parsed.N, r: parsed.r, p: parsed.p, maxmem: MAX_MEM },
  );

  if (derived.length !== parsed.hash.length) return false;
  return timingSafeEqual(derived, parsed.hash);
}

/** True when a digest was produced with weaker parameters than current policy. */
export function needsRehash(stored: string): boolean {
  const parsed = parseDigest(stored);
  if (!parsed) return true;
  return parsed.N < SCRYPT_PARAMS.N || parsed.r < SCRYPT_PARAMS.r || parsed.p < SCRYPT_PARAMS.p;
}

/**
 * Spend hashing time without a stored digest.
 *
 * Used when an email does not exist, so that probing for registered accounts
 * cannot be done by measuring response time.
 */
export async function burnTime(): Promise<void> {
  const { N, r, p, keyLength } = SCRYPT_PARAMS;
  await scryptAsync("timing-equalisation", randomBytes(16), keyLength, {
    N,
    r,
    p,
    maxmem: MAX_MEM,
  });
}
