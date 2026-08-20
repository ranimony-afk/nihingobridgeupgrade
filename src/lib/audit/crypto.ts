import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";

export function sessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.DATABASE_URL || "nihongo-bridge-dev";
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 64);
  const prev = Buffer.from(hash, "hex");
  if (next.length !== prev.length) return false;
  return timingSafeEqual(next, prev);
}

export function signStaffToken(staffId: string, secret = sessionSecret()) {
  const sig = createHmac("sha256", secret).update(staffId).digest("hex");
  return `${staffId}.${sig}`;
}

export function readStaffToken(token: string | undefined | null, secret = sessionSecret()) {
  if (!token) return null;
  const split = token.lastIndexOf(".");
  if (split <= 0) return null;
  const staffId = token.slice(0, split);
  const sig = token.slice(split + 1);
  const expected = createHmac("sha256", secret).update(staffId).digest("hex");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  return staffId;
}
