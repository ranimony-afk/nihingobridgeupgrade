import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  billingAffiliates,
  billingCommissions,
  billingPayouts,
  billingProfiles,
  billingReferrals,
  identityUsers,
} from "@/db/schema";
import { uid } from "@/lib/utils";
import { clampPercent, commissionFor, maskEmail, normalizeAffiliateCode } from "./commission";

export { commissionFor, maskEmail, normalizeAffiliateCode };

/** Looks up an affiliate by code. Unknown or paused codes return null. */
export async function findAffiliate(codeRaw: string) {
  const code = normalizeAffiliateCode(codeRaw);
  const [row] = await db.select().from(billingAffiliates).where(eq(billingAffiliates.code, code));
  if (!row || row.status !== "active") return null;
  return row;
}

export async function createAffiliate(input: {
  code: string;
  name: string;
  email: string;
  discountPercent?: number;
  commissionPercent?: number;
}) {
  const code = normalizeAffiliateCode(input.code);
  if (!code.startsWith("AFFILIATE-")) {
    return { ok: false as const, error: "Code must start with AFFILIATE-", status: 400 };
  }
  const existing = await db.select().from(billingAffiliates).where(eq(billingAffiliates.code, code));
  if (existing.length > 0) return { ok: false as const, error: "Code already exists", status: 409 };

  const id = uid("aff");
  await db.insert(billingAffiliates).values({
    id,
    code,
    name: input.name,
    email: input.email.toLowerCase(),
    discountPercent: clampPercent(input.discountPercent, 15),
    commissionPercent: clampPercent(input.commissionPercent, 20),
  });
  const [row] = await db.select().from(billingAffiliates).where(eq(billingAffiliates.id, id));
  return { ok: true as const, affiliate: row };
}

export async function setAffiliateStatus(id: string, status: "active" | "paused") {
  await db.update(billingAffiliates).set({ status }).where(eq(billingAffiliates.id, id));
  const [row] = await db.select().from(billingAffiliates).where(eq(billingAffiliates.id, id));
  return row ?? null;
}

/** Records a commission when an affiliate-attributed checkout is paid. */
export async function accrueCommission(input: {
  code: string;
  checkoutId: string;
  invoiceId?: string;
  currency: string;
  netAmount: number;
}) {
  const affiliate = await findAffiliate(input.code);
  if (!affiliate) return null;

  const existing = await db
    .select()
    .from(billingCommissions)
    .where(eq(billingCommissions.checkoutId, input.checkoutId));
  if (existing.length > 0) return existing[0]!;

  const amount = commissionFor(input.netAmount, affiliate.commissionPercent);
  const id = uid("cms");
  await db.insert(billingCommissions).values({
    id,
    affiliateId: affiliate.id,
    checkoutId: input.checkoutId,
    invoiceId: input.invoiceId ?? null,
    currency: input.currency,
    netAmount: input.netAmount,
    commissionAmount: amount,
    status: "pending",
  });
  const [row] = await db.select().from(billingCommissions).where(eq(billingCommissions.id, id));
  return row ?? null;
}

/** Reverses a commission when the underlying invoice is refunded. */
export async function reverseCommission(invoiceId: string) {
  const rows = await db.select().from(billingCommissions).where(eq(billingCommissions.invoiceId, invoiceId));
  for (const row of rows) {
    if (row.status === "paid") continue;
    await db.update(billingCommissions).set({ status: "reversed" }).where(eq(billingCommissions.id, row.id));
  }
  return rows.length;
}

/** Pays out every approved-but-unpaid commission for one affiliate. */
export async function payoutAffiliate(affiliateId: string, reference: string) {
  const pending = await db
    .select()
    .from(billingCommissions)
    .where(
      and(
        eq(billingCommissions.affiliateId, affiliateId),
        eq(billingCommissions.status, "pending"),
        isNull(billingCommissions.payoutId),
      ),
    );
  if (pending.length === 0) return { ok: false as const, error: "Nothing to pay out", status: 400 };

  const currency = pending[0]!.currency;
  const sameCurrency = pending.filter((row) => row.currency === currency);
  const amount = sameCurrency.reduce((sum, row) => sum + row.commissionAmount, 0);

  const payoutId = uid("pay");
  await db.insert(billingPayouts).values({
    id: payoutId,
    affiliateId,
    currency,
    amount,
    reference,
    status: "paid",
  });
  for (const row of sameCurrency) {
    await db
      .update(billingCommissions)
      .set({ status: "paid", payoutId })
      .where(eq(billingCommissions.id, row.id));
  }
  return { ok: true as const, payoutId, amount, currency, count: sameCurrency.length };
}

export async function affiliateStats(affiliateId: string) {
  const commissions = await db
    .select()
    .from(billingCommissions)
    .where(eq(billingCommissions.affiliateId, affiliateId))
    .orderBy(desc(billingCommissions.createdAt));
  const payouts = await db
    .select()
    .from(billingPayouts)
    .where(eq(billingPayouts.affiliateId, affiliateId))
    .orderBy(desc(billingPayouts.createdAt));

  const pending = commissions
    .filter((row) => row.status === "pending")
    .reduce((sum, row) => sum + row.commissionAmount, 0);
  const paid = commissions
    .filter((row) => row.status === "paid")
    .reduce((sum, row) => sum + row.commissionAmount, 0);

  return { commissions, payouts, pending, paid, conversions: commissions.length };
}

export async function listAffiliates() {
  const rows = await db.select().from(billingAffiliates).orderBy(desc(billingAffiliates.createdAt));
  const totals = await db.execute<{ affiliate_id: string; pending: string; paid: string; n: string }>(sql`
    SELECT affiliate_id,
      COALESCE(SUM(CASE WHEN status = 'pending' THEN commission_amount END), 0)::text AS pending,
      COALESCE(SUM(CASE WHEN status = 'paid' THEN commission_amount END), 0)::text AS paid,
      count(*)::text AS n
    FROM billing_commissions GROUP BY affiliate_id
  `);
  const byId = new Map(totals.rows.map((row) => [row.affiliate_id, row]));
  return rows.map((row) => ({
    ...row,
    pending: Number(byId.get(row.id)?.pending ?? 0),
    paid: Number(byId.get(row.id)?.paid ?? 0),
    conversions: Number(byId.get(row.id)?.n ?? 0),
  }));
}

/**
 * Attribution for a referral sale. Writes the `referred_by` column that
 * Phase 4 declared but never populated, so referrals are now auditable.
 */
export async function recordReferral(input: {
  referrerId: string;
  referredId: string;
  checkoutId: string;
  rewardAmount: number;
  currency: string;
}) {
  if (input.referrerId === input.referredId) return null;
  const id = uid("ref");
  await db
    .insert(billingReferrals)
    .values({
      id,
      referrerId: input.referrerId,
      referredId: input.referredId,
      checkoutId: input.checkoutId,
      rewardAmount: input.rewardAmount,
      currency: input.currency,
      status: "converted",
    })
    .onConflictDoNothing();

  await db
    .update(billingProfiles)
    .set({ referredBy: input.referrerId })
    .where(and(eq(billingProfiles.userId, input.referredId), isNull(billingProfiles.referredBy)));

  return id;
}

export async function referralStats(userId: string) {
  const rows = await db
    .select()
    .from(billingReferrals)
    .where(eq(billingReferrals.referrerId, userId))
    .orderBy(desc(billingReferrals.createdAt));

  const invited = [];
  for (const row of rows) {
    const [user] = await db
      .select({ email: identityUsers.email, name: identityUsers.name })
      .from(identityUsers)
      .where(eq(identityUsers.id, row.referredId));
    invited.push({
      id: row.id,
      name: user?.name ?? "Learner",
      email: user?.email ? maskEmail(user.email) : "",
      reward: row.rewardAmount,
      currency: row.currency,
      createdAt: row.createdAt,
    });
  }
  return {
    invited,
    total: rows.length,
    earned: rows.reduce((sum, row) => sum + row.rewardAmount, 0),
  };
}

