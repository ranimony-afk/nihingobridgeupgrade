import { referralStats } from "@/lib/billing/affiliate";
import { ensureBillingProfile } from "@/lib/billing/service";
import { getIdentity } from "@/lib/identity/request";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await seedReady();
  const identity = await getIdentity(request);
  if (!identity) return Response.json({ ok: false, error: "Sign in required" }, { status: 401 });
  const [profile, stats] = await Promise.all([
    ensureBillingProfile(identity.id),
    referralStats(identity.id),
  ]);
  return Response.json({
    ok: true,
    data: { referralCode: profile.referralCode, credit: profile.creditPaise, ...stats },
  });
}
