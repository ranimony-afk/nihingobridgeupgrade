import { createHmac, createHash, timingSafeEqual } from "crypto";

export type AccessClaims = {
  sub: string;
  role: string;
  plan: string;
  learnerId: string | null;
  typ: "access" | "refresh";
  jti: string;
  iat: number;
  exp: number;
};

export function jwtSecret() {
  return process.env.AUTH_SECRET || process.env.ADMIN_SESSION_SECRET || process.env.DATABASE_URL || "nihongo-bridge-dev";
}

function encode(value: object | string) {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  return Buffer.from(raw).toString("base64url");
}

function signPart(input: string, secret: string) {
  return createHmac("sha256", secret).update(input).digest("base64url");
}

export function signJwt(claims: Omit<AccessClaims, "iat" | "exp">, ttlSec: number, secret = jwtSecret()) {
  const iat = Math.floor(Date.now() / 1000);
  const payload: AccessClaims = { ...claims, iat, exp: iat + ttlSec };
  const header = encode({ alg: "HS256", typ: "JWT" });
  const body = encode(payload);
  const sig = signPart(`${header}.${body}`, secret);
  return `${header}.${body}.${sig}`;
}

export function verifyJwt(token: string | undefined | null, secret = jwtSecret()): AccessClaims | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = signPart(`${header}.${body}`, secret);
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AccessClaims;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (payload.typ !== "access" && payload.typ !== "refresh") return null;
    return payload;
  } catch {
    return null;
  }
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export const ACCESS_TTL_SEC = 60 * 15;
export const REFRESH_TTL_SEC = 60 * 60 * 24 * 30;
