import { NextResponse } from "next/server";
import { getRequestMetadata, verifyEmailToken } from "@/lib/auth/identity";
import { applyRateLimit } from "@/lib/auth/route";
import { authRateLimitPolicy, rateLimitHeaders } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const rateLimit = await applyRateLimit(request, authRateLimitPolicy);
  if (rateLimit instanceof Response) return rateLimit;

  const token = new URL(request.url).searchParams.get("token");
  const verified = token ? await verifyEmailToken(token, getRequestMetadata(request)) : false;
  const destination = new URL("/auth/sign-in", request.url);
  destination.searchParams.set("verified", verified ? "1" : "0");

  const response = NextResponse.redirect(destination);
  for (const [key, value] of Object.entries(rateLimitHeaders(rateLimit))) {
    response.headers.set(key, value);
  }
  return response;
}
