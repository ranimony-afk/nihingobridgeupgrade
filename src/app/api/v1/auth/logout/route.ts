import { clearIdentityCookies, readRefreshToken } from "@/lib/identity/cookies";
import { logoutSession } from "@/lib/identity/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await logoutSession(await readRefreshToken(request));
  await clearIdentityCookies();
  return Response.json({ ok: true });
}
