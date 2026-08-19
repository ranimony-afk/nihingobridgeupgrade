import { consumeMagicLink, requestMagicLink } from "@/lib/identity/service";
import { setIdentityCookies } from "@/lib/identity/cookies";
import { clientKey, enforceRateLimit } from "@/lib/infra/rate-limit";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = await enforceRateLimit({ key: clientKey(request), bucket: "auth", limit: 20, windowSec: 60 });
  if (!limited.allowed) return Response.json({ ok: false, error: "Too many requests" }, { status: 429 });
  await seedReady();
  const body = (await request.json()) as { email?: string };
  const result = await requestMagicLink(body.email ?? "");
  return Response.json({ ok: true, data: result });
}

export async function PUT(request: Request) {
  await seedReady();
  const body = (await request.json()) as { token?: string };
  const result = await consumeMagicLink(body.token ?? "", request.headers.get("user-agent") ?? undefined);
  if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: result.status });
  await setIdentityCookies({
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    learnerId: result.user.learnerId,
  });
  return Response.json({ ok: true, data: result });
}
