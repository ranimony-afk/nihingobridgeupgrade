import {
  completeMfaChallenge,
  createWebSession,
  getRequestMetadata,
  sessionCookieValue,
} from "@/lib/auth/identity";
import { applyRateLimit, rateLimitedJson } from "@/lib/auth/route";
import { mfaRateLimitPolicy } from "@/lib/rate-limit";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const challengeSchema = z.object({
  challenge: z.string().min(32).max(512),
  code: z.string().trim().min(6).max(64),
});

export async function POST(request: Request) {
  const rateLimit = await applyRateLimit(request, mfaRateLimitPolicy);
  if (rateLimit instanceof Response) return rateLimit;

  const payload = challengeSchema.safeParse(await request.json());
  if (!payload.success) {
    return rateLimitedJson(
      { error: "The two-factor challenge is invalid.", code: "INVALID_MFA_CHALLENGE" },
      rateLimit,
      { status: 400 },
    );
  }

  const metadata = getRequestMetadata(request);
  const result = await completeMfaChallenge(payload.data.challenge, payload.data.code, metadata);
  if (!result) {
    return rateLimitedJson(
      { error: "The challenge is invalid, expired, or the code was incorrect.", code: "INVALID_MFA_CHALLENGE" },
      rateLimit,
      { status: 401 },
    );
  }

  const session = await createWebSession(result.userId, metadata);
  return rateLimitedJson(
    { ok: true, sessionType: "database" },
    rateLimit,
    { headers: { "Set-Cookie": sessionCookieValue(session.token, session.expires) } },
  );
}
