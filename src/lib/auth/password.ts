import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";

function scrypt(password: string, salt: Buffer, keyLength: number, options: { N: number; r: number; p: number; maxmem: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}
const KEY_LENGTH = 64;
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;

export type PasswordPolicyIssue =
  | "too_short"
  | "missing_lowercase"
  | "missing_uppercase"
  | "missing_number"
  | "missing_symbol";

export function validatePassword(password: string): PasswordPolicyIssue[] {
  const issues: PasswordPolicyIssue[] = [];
  if (password.length < 12) issues.push("too_short");
  if (!/[a-z]/.test(password)) issues.push("missing_lowercase");
  if (!/[A-Z]/.test(password)) issues.push("missing_uppercase");
  if (!/\d/.test(password)) issues.push("missing_number");
  if (!/[^A-Za-z0-9]/.test(password)) issues.push("missing_symbol");
  return issues;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
    maxmem: 64 * 1024 * 1024,
  });

  return [
    "scrypt",
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const [algorithm, rawCost, rawBlockSize, rawParallelization, rawSalt, rawHash] = encodedHash.split("$");
  if (
    algorithm !== "scrypt" ||
    !rawCost ||
    !rawBlockSize ||
    !rawParallelization ||
    !rawSalt ||
    !rawHash
  ) {
    return false;
  }

  const cost = Number(rawCost);
  const blockSize = Number(rawBlockSize);
  const parallelization = Number(rawParallelization);
  if (!Number.isInteger(cost) || !Number.isInteger(blockSize) || !Number.isInteger(parallelization)) {
    return false;
  }

  try {
    const salt = Buffer.from(rawSalt, "base64url");
    const expectedHash = Buffer.from(rawHash, "base64url");
    const derivedKey = await scrypt(password, salt, expectedHash.length, {
      N: cost,
      r: blockSize,
      p: parallelization,
      maxmem: 64 * 1024 * 1024,
    });

    return expectedHash.length === derivedKey.length && timingSafeEqual(expectedHash, derivedKey);
  } catch {
    return false;
  }
}
