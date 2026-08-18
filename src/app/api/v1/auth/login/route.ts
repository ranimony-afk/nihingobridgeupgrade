import {
  authenticatePassword,
  createWebSession,
  getRequestMetadata,
  issueMobileTokenPair,
  sessionCookieValue,
} from "@/lib/auth/identity";
import { applyRateLimit, rateLimitedJson } from "@/lib/auth/route";
import { authRateLimitPolicy } from "@/lib/rate-limit";
import { reportException } from "@/lib/observability";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(256),
  twoFactorCode: z.string().trim().min(6).max(64).optional(),
  client: z.enum(["web", "flutter"]).default("web"),
});

export async function POST(request: Request) {
  const rateLimit = await applyRateLimit(request, authRateLimitPolicy);
  if (rateLimit instanceof Response) return rateLimit;

  try {
    const payload = loginSchema.safeParse(await request.json());
    if (!payload.success) {
      return rateLimitedJson(
        { error: "Invalid credentials.", code: "INVALID_CREDENTIALS" },
        rateLimit,
        { status: 400 },
      );
    }

    const metadata = getRequestMetadata(request);
    const result = await authenticatePassword(
      payload.data.email,
      payload.data.password,
      payload.data.twoFactorCode,
      metadata,
    );

    if (result.status === "locked") {
      return rateLimitedJson(
        { error: "This account is temporarily locked. Please try again later.", code: "ACCOUNT_LOCKED" },
        rateLimit,
        { status: 423, headers: { "Retry-After": String(result.retryAfterSeconds) } },
      );
    }

    if (result.status === "mfa_required") {
      return rateLimitedJson(
        { error: "A two-factor code is required.", code: "MFA_REQUIRED" },
        rateLimit,
        { status: 401 },
      );
    }

    if (result.status === "invalid") {
      return rateLimitedJson(
        { error: "Invalid credentials.", code: "INVALID_CREDENTIALS" },
        rateLimit,
        { status: 401 },
      );
    }

    const user = {
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      role: result.user.role,
    };

    if (payload.data.client === "flutter") {
      const tokens = await issueMobileTokenPair(result.user, metadata);
      return rateLimitedJson(
        {
          ok: true,
          tokenType: "Bearer",
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn,
          refreshExpiresAt: tokens.refreshExpiresAt.toISOString(),
          user,
        },
        rateLimit,
      );
    }

    const session = await createWebSession(result.user.id, metadata);
    return rateLimitedJson(
      { ok: true, user, sessionType: "database" },
      rateLimit,
      { headers: { "Set-Cookie": sessionCookieValue(session.token, session.expires) } },
    );
  } catch (error) {
    reportException(error, { route: "/api/v1/auth/login", method: "POST" }, "Password login failed");
    return rateLimitedJson(
      { error: "Authentication is temporarily unavailable.", code: "AUTH_UNAVAILABLE" },
      rateLimit,
      { status: 503 },
    );
  }
}
