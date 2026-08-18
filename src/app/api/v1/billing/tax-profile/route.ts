import { eq } from "drizzle-orm";
import { db } from "@/db";
import { billingTaxProfiles } from "@/db/schema";
import { upsertBillingTaxProfile } from "@/lib/billing/service";
import { requireIdentity } from "@/lib/auth/guard";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const taxProfileSchema = z.object({
  legalName: z.string().trim().min(2).max(160),
  gstin: z.string().trim().toUpperCase().max(32).optional(),
  stateCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2,3}$/),
  billingAddress: z.record(z.string(), z.string().trim().max(160)).default({}),
});

export async function GET(request: Request) {
  const identity = await requireIdentity(request);
  if (!identity.ok) return identity.response;

  const [profile] = await db
    .select()
    .from(billingTaxProfiles)
    .where(eq(billingTaxProfiles.userId, identity.identity.user.id))
    .limit(1);
  return Response.json({ ok: true, profile: profile ?? null }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const identity = await requireIdentity(request);
  if (!identity.ok) return identity.response;

  const payload = taxProfileSchema.safeParse(await request.json());
  if (!payload.success) {
    return Response.json({ error: "The tax profile is invalid.", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const profile = await upsertBillingTaxProfile({
    userId: identity.identity.user.id,
    ...payload.data,
  });
  return Response.json({ ok: true, profile }, { headers: { "Cache-Control": "no-store" } });
}
