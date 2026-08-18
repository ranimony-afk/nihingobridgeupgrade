import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { env } from "@/lib/env";

export type MobileAccessClaims = {
  userId: string;
  role: string;
  tokenVersion: number;
  institutionId?: string;
};

function signingKey(): Uint8Array {
  if (!env.MOBILE_JWT_SECRET) {
    throw new Error("MOBILE_JWT_SECRET is required for mobile token operations.");
  }

  return new TextEncoder().encode(env.MOBILE_JWT_SECRET);
}

export async function issueMobileAccessToken(claims: MobileAccessClaims): Promise<string> {
  return new SignJWT({
    role: claims.role,
    tokenVersion: claims.tokenVersion,
    ...(claims.institutionId ? { institutionId: claims.institutionId } : {}),
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.userId)
    .setIssuer(env.MOBILE_JWT_ISSUER)
    .setAudience(env.MOBILE_JWT_AUDIENCE)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(signingKey());
}

export async function verifyMobileAccessToken(token: string): Promise<MobileAccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      algorithms: ["HS256"],
      issuer: env.MOBILE_JWT_ISSUER,
      audience: env.MOBILE_JWT_AUDIENCE,
      requiredClaims: ["sub", "role", "tokenVersion", "exp", "iat", "jti"],
    });

    return parseAccessClaims(payload);
  } catch {
    return null;
  }
}

function parseAccessClaims(payload: JWTPayload): MobileAccessClaims | null {
  const userId = payload.sub;
  const role = payload.role;
  const tokenVersion = payload.tokenVersion;
  const institutionId = payload.institutionId;

  if (!userId || typeof role !== "string" || typeof tokenVersion !== "number") {
    return null;
  }

  return {
    userId,
    role,
    tokenVersion,
    ...(typeof institutionId === "string" ? { institutionId } : {}),
  };
}

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}
