import { requireActiveSubscription } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const identity = await requireActiveSubscription(request);
  if (!identity.ok) return identity.response;
  return Response.json({
    ok: true,
    premium: true,
    userId: identity.identity.user.id,
  });
}
