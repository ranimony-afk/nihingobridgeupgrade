import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { kgSrs } from "@/db/schema";
import { uid } from "@/lib/utils";

export async function pinToSrs(learnerId: string, targetType: string, targetId: string) {
  await db
    .insert(kgSrs)
    .values({
      id: uid("ksrs"),
      learnerId,
      targetType,
      targetId,
    })
    .onConflictDoNothing();
}

export async function listSrs(learnerId: string) {
  return db.select().from(kgSrs).where(eq(kgSrs.learnerId, learnerId));
}

export async function reviewSrs(id: string, learnerId: string, remembered: boolean) {
  const [card] = await db.select().from(kgSrs).where(and(eq(kgSrs.id, id), eq(kgSrs.learnerId, learnerId)));
  if (!card) return null;
  const interval = remembered ? Math.max(1, card.intervalDays) * 2 : 0;
  await db
    .update(kgSrs)
    .set({
      intervalDays: interval,
      dueAt: new Date(Date.now() + interval * 86400000),
      ease: remembered ? card.ease + 15 : Math.max(130, card.ease - 20),
    })
    .where(eq(kgSrs.id, id));
  return { interval };
}
