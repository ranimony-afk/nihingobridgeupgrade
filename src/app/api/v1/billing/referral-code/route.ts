import { getOrCreateReferralCode } from "@/lib/billing/service";
import { requireIdentity } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const identity = await requireIdentity(request);
  if (!identity.ok) return identity.response;
  const referralCode = await getOrCreateReferralCode(identity.identity.user.id);
  return Response.json(
    {
      ok: true,
      referralCode: {
        code: referralCode.code,
        percentOffBps: referralCode.percentOffBps,
        active: referralCode.active,
        expiresAt: referralCode.expiresAt?.toISOString() ?? null,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
