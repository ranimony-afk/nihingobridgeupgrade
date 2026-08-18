import { getRequestMetadata, rotateMobileRefreshToken } from "@/lib/auth/identity";
import { applyRateLimit, rateLimitedJson } from "@/lib/auth/route";
import { authRateLimitPolicy } from "@/lib/rate-limit";
import { reportException } from "@/lib/observability";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const refreshSchema = z.object({
  refreshToken: z.string().min(32).max(512),
});

export async function POST(request: Request) {
  const rateLimit = await applyRateLimit(request, authRateLimitPolicy);
  if (rateLimit instanceof Response) return rateLimit;

  try {
    const payload = refreshSchema.safeParse(await request.json());
    if (!payload.success) {
      return rateLimitedJson(
        { error: "Invalid refresh token.", code: "INVALID_REFRESH_TOKEN" },
        rateLimit,
        { status: 400 },
      );
    }

    const tokens = await rotateMobileRefreshToken(payload.data.refreshToken, getRequestMetadata(request));
    if (!tokens) {
      return rateLimitedJson(
        { error: "Invalid or expired refresh token.", code: "INVALID_REFRESH_TOKEN" },
        rateLimit,
        { status: 401 },
      );
    }

    return rateLimitedJson(
      {
        ok: true,
        tokenType: "Bearer",
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        refreshExpiresAt: tokens.refreshExpiresAt.toISOString(),
      },
      rateLimit,
    );
  } catch (error) {
    reportException(error, { route: "/api/v1/auth/token/refresh", method: "POST" }, "Token refresh failed");
    return rateLimitedJson(
      { error: "Token refresh is temporarily unavailable.", code: "AUTH_UNAVAILABLE" },
      rateLimit,
      { status: 503 },
    );
  }
}
