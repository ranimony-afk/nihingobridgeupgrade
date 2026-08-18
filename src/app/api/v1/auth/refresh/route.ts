import { readRefreshToken, setIdentityCookies } from "@/lib/identity/cookies";
import { refreshSession } from "@/lib/identity/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const token = await readRefreshToken(request);
  const result = await refreshSession(token ?? "", request.headers.get("user-agent") ?? undefined);
  if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: result.status });
  await setIdentityCookies({
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    learnerId: result.user.learnerId,
  });
  return Response.json({ ok: true, data: result });
}
