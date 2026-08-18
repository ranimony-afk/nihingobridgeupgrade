import { registerPasswordUser, getRequestMetadata } from "@/lib/auth/identity";
import { applyRateLimit, rateLimitedJson } from "@/lib/auth/route";
import { authRateLimitPolicy } from "@/lib/rate-limit";
import { reportException } from "@/lib/observability";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const registrationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(256),
});

export async function POST(request: Request) {
  const rateLimit = await applyRateLimit(request, authRateLimitPolicy);
  if (rateLimit instanceof Response) return rateLimit;

  try {
    const payload = registrationSchema.safeParse(await request.json());
    if (!payload.success) {
      return rateLimitedJson(
        { error: "Please provide a valid name, email address, and password.", code: "VALIDATION_ERROR" },
        rateLimit,
        { status: 400 },
      );
    }

    const result = await registerPasswordUser({
      ...payload.data,
      metadata: getRequestMetadata(request),
    });

    if (result.passwordIssues.length > 0) {
      return rateLimitedJson(
        {
          error: "Password does not meet the required security policy.",
          code: "WEAK_PASSWORD",
          issues: result.passwordIssues,
        },
        rateLimit,
        { status: 400 },
      );
    }

    return rateLimitedJson(
      {
        ok: true,
        message: "If the address can be registered, a verification email has been sent.",
        verificationRequired: true,
      },
      rateLimit,
      { status: 202 },
    );
  } catch (error) {
    reportException(error, { route: "/api/v1/auth/register", method: "POST" }, "Registration request failed");
    return rateLimitedJson(
      { error: "We could not process registration right now.", code: "REGISTRATION_UNAVAILABLE" },
      rateLimit,
      { status: 503 },
    );
  }
}
